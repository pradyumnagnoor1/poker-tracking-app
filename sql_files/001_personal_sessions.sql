-- ============================================================
-- Migration 001: Personal Session Tracking System
-- Run in Supabase SQL Editor
--
-- This adds personal session tracking alongside the existing
-- group session system. It supports:
--   - Timer-based sessions (start/pause/resume/end)
--   - Manual session entry (with or without duration)
--   - Analytics eligibility gating
--   - Tagging (many-to-many)
--   - Bankroll tracking
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- TABLE: personal_sessions
-- One row per individual play session (timer or manual).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.personal_sessions (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Session classification
    session_type            TEXT            NOT NULL CHECK (session_type IN ('timer', 'manual')),
    status                  TEXT            NOT NULL DEFAULT 'active'
                                            CHECK (status IN ('active', 'paused', 'ended')),

    -- Financial fields
    stake_level             TEXT,           -- e.g. '1/2', '2/5', '5/10'
    buy_in                  NUMERIC(10,2)   NOT NULL DEFAULT 0 CHECK (buy_in >= 0),
    cash_out                NUMERIC(10,2)   CHECK (cash_out >= 0),

    -- Computed profit convenience column (NULL until session ends)
    -- Use: cash_out - buy_in
    -- Not stored — computed in queries to avoid stale data.

    -- Time tracking (timer sessions)
    started_at              TIMESTAMPTZ,    -- when user pressed "Start"
    ended_at                TIMESTAMPTZ,    -- when user pressed "End"

    -- Server-computed total play time (set at end_personal_session RPC call).
    -- Formula: (ended_at - started_at) - SUM(all pause durations)
    -- NEVER set by the frontend directly.
    total_play_time_seconds INTEGER         CHECK (total_play_time_seconds >= 0),

    -- Manual entry fields
    played_at               DATE,           -- date of play (manual sessions)
    manual_duration_minutes INTEGER         CHECK (manual_duration_minutes > 0),

    -- Optional enrichment
    notes                   TEXT,
    location                TEXT,
    hands_played            INTEGER         CHECK (hands_played > 0),  -- for BB/100

    -- Link to group session if this was part of an app-managed game
    group_session_id        UUID            REFERENCES public.sessions(id) ON DELETE SET NULL,

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Constraint: timer sessions must have started_at, manual sessions must have played_at
    CONSTRAINT timer_session_requires_start
        CHECK (session_type != 'timer' OR started_at IS NOT NULL),
    CONSTRAINT manual_session_requires_date
        CHECK (session_type != 'manual' OR played_at IS NOT NULL)
);

-- ─────────────────────────────────────────────────────────────
-- Analytics eligibility:
-- A session is eligible for time-based analytics (hourly rate,
-- BB/100) ONLY when valid play time is recorded.
--
-- We use a generated column so it's always consistent and
-- queryable without application logic.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.personal_sessions
    ADD COLUMN IF NOT EXISTS is_analytics_eligible BOOLEAN
    GENERATED ALWAYS AS (
        total_play_time_seconds IS NOT NULL
        AND total_play_time_seconds > 0
    ) STORED;

-- Note: For manual sessions WITHOUT a duration, is_analytics_eligible = FALSE.
-- They still appear in basic profit/loss stats but are excluded from
-- hourly rate, BB/100, and any per-hour calculations.


-- ─────────────────────────────────────────────────────────────
-- CONSTRAINT: Only one active-or-paused session per user at a time.
-- This is enforced at the DB level, not just the application.
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session_per_user
    ON public.personal_sessions (user_id)
    WHERE status IN ('active', 'paused');


-- ─────────────────────────────────────────────────────────────
-- TABLE: session_pauses
-- Tracks each individual pause interval for a timer session.
-- Total paused time = SUM(resume_at - paused_at) for all rows.
-- An open pause (resumed_at IS NULL) means the session is
-- currently paused.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_pauses (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    personal_session_id     UUID            NOT NULL
                                            REFERENCES public.personal_sessions(id)
                                            ON DELETE CASCADE,
    paused_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    resumed_at              TIMESTAMPTZ,    -- NULL = currently paused

    -- Sanity check
    CONSTRAINT resumed_after_paused
        CHECK (resumed_at IS NULL OR resumed_at > paused_at)
);

-- Only one open pause allowed per session at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_pause_per_session
    ON public.session_pauses (personal_session_id)
    WHERE resumed_at IS NULL;


-- ─────────────────────────────────────────────────────────────
-- TABLE: tags
-- User-defined labels for sessions.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tags (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    color       TEXT        NOT NULL DEFAULT '#6B7280',  -- hex color for UI
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, name)
);


-- ─────────────────────────────────────────────────────────────
-- TABLE: session_tags (many-to-many junction)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_tags (
    personal_session_id     UUID    NOT NULL
                                    REFERENCES public.personal_sessions(id)
                                    ON DELETE CASCADE,
    tag_id                  UUID    NOT NULL
                                    REFERENCES public.tags(id)
                                    ON DELETE CASCADE,
    PRIMARY KEY (personal_session_id, tag_id)
);


-- ─────────────────────────────────────────────────────────────
-- TABLE: user_analytics_settings
-- Stores per-user preferences that affect analytics calculations.
-- One row per user (upserted, not multi-row).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_analytics_settings (
    user_id                     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Initial bankroll seed (set once by user to anchor bankroll tracking)
    initial_bankroll            NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Estimated hands per hour by stake (for BB/100 estimation when
    -- hands_played is not recorded on the session)
    -- Stored as JSONB: { "1/2": 25, "2/5": 22, "5/10": 20 }
    hands_per_hour_by_stake     JSONB       NOT NULL DEFAULT '{}',

    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.personal_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_pauses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_analytics_settings ENABLE ROW LEVEL SECURITY;


-- personal_sessions: users can only see and modify their own sessions
DROP POLICY IF EXISTS "ps_select_own"  ON public.personal_sessions;
DROP POLICY IF EXISTS "ps_insert_own"  ON public.personal_sessions;
DROP POLICY IF EXISTS "ps_update_own"  ON public.personal_sessions;
DROP POLICY IF EXISTS "ps_delete_own"  ON public.personal_sessions;

CREATE POLICY "ps_select_own" ON public.personal_sessions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Insert is blocked for status/time columns — use RPCs for lifecycle operations.
-- But we allow INSERT so the start_personal_session RPC can work (it runs as
-- SECURITY DEFINER so it bypasses this anyway; this policy is a fallback guard).
CREATE POLICY "ps_insert_own" ON public.personal_sessions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Direct UPDATE is blocked — all updates must go through SECURITY DEFINER RPCs
-- to prevent clients from setting total_play_time_seconds or is_analytics_eligible.
-- We define no UPDATE policy here intentionally. RPCs use SECURITY DEFINER.

CREATE POLICY "ps_delete_own" ON public.personal_sessions
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND status = 'ended');


-- session_pauses: readable by owner of the parent session
DROP POLICY IF EXISTS "sp_select_own" ON public.session_pauses;

CREATE POLICY "sp_select_own" ON public.session_pauses
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.personal_sessions ps
            WHERE ps.id = session_pauses.personal_session_id
              AND ps.user_id = auth.uid()
        )
    );
-- Pauses are only written by SECURITY DEFINER RPCs, no direct INSERT policy.


-- tags: users own their tags
DROP POLICY IF EXISTS "tags_select_own" ON public.tags;
DROP POLICY IF EXISTS "tags_insert_own" ON public.tags;
DROP POLICY IF EXISTS "tags_update_own" ON public.tags;
DROP POLICY IF EXISTS "tags_delete_own" ON public.tags;

CREATE POLICY "tags_select_own" ON public.tags
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "tags_insert_own" ON public.tags
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "tags_update_own" ON public.tags
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "tags_delete_own" ON public.tags
    FOR DELETE TO authenticated USING (user_id = auth.uid());


-- session_tags: visible if you own the session
DROP POLICY IF EXISTS "st_select_own"  ON public.session_tags;
DROP POLICY IF EXISTS "st_insert_own"  ON public.session_tags;
DROP POLICY IF EXISTS "st_delete_own"  ON public.session_tags;

CREATE POLICY "st_select_own" ON public.session_tags
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.personal_sessions ps
            WHERE ps.id = session_tags.personal_session_id
              AND ps.user_id = auth.uid()
        )
    );

CREATE POLICY "st_insert_own" ON public.session_tags
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.personal_sessions ps
            WHERE ps.id = session_tags.personal_session_id
              AND ps.user_id = auth.uid()
        )
        AND
        EXISTS (
            SELECT 1 FROM public.tags t
            WHERE t.id = session_tags.tag_id
              AND t.user_id = auth.uid()
        )
    );

CREATE POLICY "st_delete_own" ON public.session_tags
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.personal_sessions ps
            WHERE ps.id = session_tags.personal_session_id
              AND ps.user_id = auth.uid()
        )
    );


-- user_analytics_settings: own row only
DROP POLICY IF EXISTS "uas_select_own" ON public.user_analytics_settings;
DROP POLICY IF EXISTS "uas_upsert_own" ON public.user_analytics_settings;

CREATE POLICY "uas_select_own" ON public.user_analytics_settings
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "uas_upsert_own" ON public.user_analytics_settings
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

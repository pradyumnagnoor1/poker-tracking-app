-- ============================================================
-- Migration 002: Session Lifecycle RPCs
-- All session state transitions must go through these
-- SECURITY DEFINER functions. The frontend never computes
-- durations — the server always owns time calculations.
--
-- Routes (map these 1:1 to Express/Next.js API handlers):
--   POST /api/sessions/start          → start_personal_session()
--   POST /api/sessions/:id/pause      → pause_personal_session()
--   POST /api/sessions/:id/resume     → resume_personal_session()
--   POST /api/sessions/:id/end        → end_personal_session()
--   POST /api/sessions/manual         → create_manual_session()
--   GET  /api/sessions/active         → get_active_personal_session()
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- HELPER: compute total paused seconds for a session
-- Used inside end_personal_session to calculate play time.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._compute_paused_seconds(p_session_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        SUM(
            EXTRACT(EPOCH FROM (
                COALESCE(resumed_at, NOW()) - paused_at
            ))::INTEGER
        ),
        0
    )
    FROM public.session_pauses
    WHERE personal_session_id = p_session_id;
$$;


-- ─────────────────────────────────────────────────────────────
-- RPC: start_personal_session
--
-- Starts a new timer-based session for the calling user.
-- Fails if the user already has an active or paused session.
--
-- Returns: UUID of the new session
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_personal_session(
    p_stake_level   TEXT        DEFAULT NULL,
    p_buy_in        NUMERIC     DEFAULT 0,
    p_notes         TEXT        DEFAULT NULL,
    p_location      TEXT        DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id    UUID;
    v_now           TIMESTAMPTZ := NOW();
BEGIN
    -- Enforce one active session per user (belt + suspenders on top of the
    -- unique partial index — gives a clean error message)
    IF EXISTS (
        SELECT 1 FROM personal_sessions
        WHERE user_id = auth.uid()
          AND status IN ('active', 'paused')
    ) THEN
        RAISE EXCEPTION 'You already have an active session. End or resume it before starting a new one.';
    END IF;

    INSERT INTO personal_sessions (
        user_id,
        session_type,
        status,
        stake_level,
        buy_in,
        notes,
        location,
        started_at
    ) VALUES (
        auth.uid(),
        'timer',
        'active',
        p_stake_level,
        COALESCE(p_buy_in, 0),
        p_notes,
        p_location,
        v_now
    )
    RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- RPC: pause_personal_session
--
-- Pauses a currently active session. Records the pause start
-- time in session_pauses. The session status becomes 'paused'.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pause_personal_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verify ownership and state
    IF NOT EXISTS (
        SELECT 1 FROM personal_sessions
        WHERE id = p_session_id
          AND user_id = auth.uid()
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Session % is not active or does not belong to you.', p_session_id;
    END IF;

    -- Open a new pause record (resumed_at is NULL = open pause)
    INSERT INTO session_pauses (personal_session_id, paused_at)
    VALUES (p_session_id, NOW());

    -- Update session status
    UPDATE personal_sessions
    SET status = 'paused'
    WHERE id = p_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- RPC: resume_personal_session
--
-- Closes the open pause record and sets status back to 'active'.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resume_personal_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Verify ownership and state
    IF NOT EXISTS (
        SELECT 1 FROM personal_sessions
        WHERE id = p_session_id
          AND user_id = auth.uid()
          AND status = 'paused'
    ) THEN
        RAISE EXCEPTION 'Session % is not paused or does not belong to you.', p_session_id;
    END IF;

    -- Close the open pause record
    UPDATE session_pauses
    SET resumed_at = v_now
    WHERE personal_session_id = p_session_id
      AND resumed_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No open pause record found for session %. Data may be inconsistent.', p_session_id;
    END IF;

    -- Restore active status
    UPDATE personal_sessions
    SET status = 'active'
    WHERE id = p_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- RPC: end_personal_session
--
-- Ends a timer session. Server computes total_play_time_seconds.
--
-- Formula:
--   total = (ended_at - started_at) - sum(all pause durations)
--
-- If the session is currently paused, the open pause is closed
-- first (the pause extends to the end time, not NOW()).
--
-- p_cash_out must be provided here (the user's final stack).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.end_personal_session(
    p_session_id    UUID,
    p_cash_out      NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now                   TIMESTAMPTZ := NOW();
    v_started_at            TIMESTAMPTZ;
    v_session_status        TEXT;
    v_gross_seconds         INTEGER;
    v_paused_seconds        INTEGER;
    v_total_play_seconds    INTEGER;
BEGIN
    -- Load session — verify ownership
    SELECT started_at, status
    INTO v_started_at, v_session_status
    FROM personal_sessions
    WHERE id = p_session_id
      AND user_id = auth.uid()
      AND session_type = 'timer'
      AND status IN ('active', 'paused');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session % not found, not a timer session, or already ended.', p_session_id;
    END IF;

    -- If currently paused, close the open pause at the end time
    IF v_session_status = 'paused' THEN
        UPDATE session_pauses
        SET resumed_at = v_now
        WHERE personal_session_id = p_session_id
          AND resumed_at IS NULL;
    END IF;

    -- Compute elapsed wall-clock time
    v_gross_seconds := EXTRACT(EPOCH FROM (v_now - v_started_at))::INTEGER;

    -- Subtract paused intervals (now all closed)
    v_paused_seconds := public._compute_paused_seconds(p_session_id);

    -- Play time = gross - paused (minimum 0)
    v_total_play_seconds := GREATEST(v_gross_seconds - v_paused_seconds, 0);

    -- Finalize the session
    UPDATE personal_sessions
    SET
        status                  = 'ended',
        ended_at                = v_now,
        cash_out                = p_cash_out,
        total_play_time_seconds = v_total_play_seconds
        -- is_analytics_eligible is auto-computed (generated column)
    WHERE id = p_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- RPC: create_manual_session
--
-- Logs a completed session that was not tracked with the timer.
--
-- Rules:
--   - duration_minutes is optional.
--   - If omitted, is_analytics_eligible = FALSE (no time data).
--   - Session is always saved regardless.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_manual_session(
    p_stake_level           TEXT,
    p_buy_in                NUMERIC,
    p_cash_out              NUMERIC,
    p_played_at             DATE,
    p_duration_minutes      INTEGER     DEFAULT NULL,   -- optional
    p_hands_played          INTEGER     DEFAULT NULL,   -- optional, for BB/100
    p_notes                 TEXT        DEFAULT NULL,
    p_location              TEXT        DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id            UUID;
    v_play_time_seconds     INTEGER;
BEGIN
    -- Convert minutes to seconds if provided
    IF p_duration_minutes IS NOT NULL AND p_duration_minutes > 0 THEN
        v_play_time_seconds := p_duration_minutes * 60;
    ELSE
        v_play_time_seconds := NULL;  -- no duration → not analytics eligible
    END IF;

    INSERT INTO personal_sessions (
        user_id,
        session_type,
        status,
        stake_level,
        buy_in,
        cash_out,
        played_at,
        manual_duration_minutes,
        total_play_time_seconds,
        hands_played,
        notes,
        location
    ) VALUES (
        auth.uid(),
        'manual',
        'ended',            -- manual sessions are always immediately ended
        p_stake_level,
        COALESCE(p_buy_in, 0),
        p_cash_out,
        p_played_at,
        p_duration_minutes,
        v_play_time_seconds,
        p_hands_played,
        p_notes,
        p_location
    )
    RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- RPC: get_active_personal_session
--
-- Returns the user's current active/paused session with
-- computed elapsed time. Called on page load / reconnect
-- so the frontend can resume displaying the correct time.
--
-- This is how the app handles browser close / reconnect:
--   1. On reconnect, call this RPC.
--   2. If a session is returned, resume the timer UI from
--      the server-authoritative elapsed_seconds value.
--   3. If the session is paused, show the paused state.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_active_personal_session()
RETURNS TABLE (
    id                      UUID,
    status                  TEXT,
    stake_level             TEXT,
    buy_in                  NUMERIC,
    started_at              TIMESTAMPTZ,
    elapsed_seconds         INTEGER,    -- total play time so far (excl. pauses)
    is_currently_paused     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id        UUID;
    v_status            TEXT;
    v_stake_level       TEXT;
    v_buy_in            NUMERIC;
    v_started_at        TIMESTAMPTZ;
    v_gross_seconds     INTEGER;
    v_paused_seconds    INTEGER;
    v_elapsed           INTEGER;
    v_is_paused         BOOLEAN;
BEGIN
    SELECT ps.id, ps.status, ps.stake_level, ps.buy_in, ps.started_at
    INTO v_session_id, v_status, v_stake_level, v_buy_in, v_started_at
    FROM personal_sessions ps
    WHERE ps.user_id = auth.uid()
      AND ps.status IN ('active', 'paused')
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;  -- empty result set = no active session
    END IF;

    -- Gross elapsed from start to now
    v_gross_seconds := EXTRACT(EPOCH FROM (NOW() - v_started_at))::INTEGER;

    -- Total paused (open pause counts up to NOW)
    v_paused_seconds := public._compute_paused_seconds(v_session_id);

    v_elapsed   := GREATEST(v_gross_seconds - v_paused_seconds, 0);
    v_is_paused := (v_status = 'paused');

    RETURN QUERY SELECT
        v_session_id,
        v_status,
        v_stake_level,
        v_buy_in,
        v_started_at,
        v_elapsed,
        v_is_paused;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- RPC: update_session_buyin
--
-- Allows updating buy-in on an active timer session
-- (user may rebuy mid-session).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_session_buyin(
    p_session_id    UUID,
    p_buy_in        NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE personal_sessions
    SET buy_in = p_buy_in
    WHERE id = p_session_id
      AND user_id = auth.uid()
      AND status IN ('active', 'paused');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session % not found or already ended.', p_session_id;
    END IF;
END;
$$;

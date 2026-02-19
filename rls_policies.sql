-- ============================================================
-- RLS Policies: State-Based Access Control
-- Run this in Supabase SQL Editor (Settings > SQL Editor)
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. BUYINS
--    Prevent UPDATE and DELETE when session.state != 'lobby'
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.buyins ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "buyins_select_members"        ON public.buyins;
DROP POLICY IF EXISTS "buyins_insert_lobby_only"     ON public.buyins;
DROP POLICY IF EXISTS "buyins_update_lobby_only"     ON public.buyins;
DROP POLICY IF EXISTS "buyins_delete_lobby_only"     ON public.buyins;

-- SELECT: any session member can read buy-ins
CREATE POLICY "buyins_select_members"
ON public.buyins
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = buyins.session_id
          AND sm.user_id = auth.uid()
    )
);

-- INSERT: only allowed while session is in 'lobby'
CREATE POLICY "buyins_insert_lobby_only"
ON public.buyins
FOR INSERT TO authenticated
WITH CHECK (
    (SELECT state FROM public.sessions WHERE id = buyins.session_id) = 'lobby'
);

-- UPDATE: only allowed while session is in 'lobby'
CREATE POLICY "buyins_update_lobby_only"
ON public.buyins
FOR UPDATE TO authenticated
USING (
    (SELECT state FROM public.sessions WHERE id = buyins.session_id) = 'lobby'
)
WITH CHECK (
    (SELECT state FROM public.sessions WHERE id = buyins.session_id) = 'lobby'
);

-- DELETE: only allowed while session is in 'lobby'
CREATE POLICY "buyins_delete_lobby_only"
ON public.buyins
FOR DELETE TO authenticated
USING (
    (SELECT state FROM public.sessions WHERE id = buyins.session_id) = 'lobby'
);


-- ─────────────────────────────────────────────────────────────
-- 2. CHIP_COUNTS
--    Prevent UPDATE when session.state != 'chip_count'
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.chip_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chip_counts_select_members"          ON public.chip_counts;
DROP POLICY IF EXISTS "chip_counts_insert_chip_count_only"  ON public.chip_counts;
DROP POLICY IF EXISTS "chip_counts_update_chip_count_only"  ON public.chip_counts;

-- SELECT: any session member can read chip counts
CREATE POLICY "chip_counts_select_members"
ON public.chip_counts
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = chip_counts.session_id
          AND sm.user_id = auth.uid()
    )
);

-- INSERT: only allowed during 'chip_count' state
CREATE POLICY "chip_counts_insert_chip_count_only"
ON public.chip_counts
FOR INSERT TO authenticated
WITH CHECK (
    (SELECT state FROM public.sessions WHERE id = chip_counts.session_id) = 'chip_count'
);

-- UPDATE: only allowed during 'chip_count' state
CREATE POLICY "chip_counts_update_chip_count_only"
ON public.chip_counts
FOR UPDATE TO authenticated
USING (
    (SELECT state FROM public.sessions WHERE id = chip_counts.session_id) = 'chip_count'
)
WITH CHECK (
    (SELECT state FROM public.sessions WHERE id = chip_counts.session_id) = 'chip_count'
);


-- ─────────────────────────────────────────────────────────────
-- 3. SESSIONS
--    Prevent sessions.state from being updated directly.
--    State transitions must go through SECURITY DEFINER RPCs
--    (start_game, end_game, proceed_to_payouts, close_session).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_members"           ON public.sessions;
DROP POLICY IF EXISTS "sessions_insert_host"              ON public.sessions;
DROP POLICY IF EXISTS "sessions_no_direct_state_update"   ON public.sessions;

-- SELECT: members can read their sessions
CREATE POLICY "sessions_select_members"
ON public.sessions
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = sessions.id
          AND sm.user_id = auth.uid()
    )
);

-- INSERT: authenticated users can create sessions
CREATE POLICY "sessions_insert_host"
ON public.sessions
FOR INSERT TO authenticated
WITH CHECK (true);

-- DELETE: only the host can delete a session
DROP POLICY IF EXISTS "sessions_delete_host" ON public.sessions;
CREATE POLICY "sessions_delete_host"
ON public.sessions
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = sessions.id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
);

-- UPDATE: allow updating metadata (title, buy_in_default, etc.)
--         but block direct changes to the `state` column.
--         SECURITY DEFINER RPCs bypass RLS (run as postgres) so they are unaffected.
CREATE POLICY "sessions_no_direct_state_update"
ON public.sessions
FOR UPDATE TO authenticated
USING (
    -- Only the host can update session metadata
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = sessions.id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
)
WITH CHECK (
    -- Reject any update that tries to change the state column
    state = (SELECT s.state FROM public.sessions s WHERE s.id = sessions.id)
);


-- ─────────────────────────────────────────────────────────────
-- SESSION MANAGEMENT RPCs
-- ─────────────────────────────────────────────────────────────

-- Host permanently deletes a session and all related data (CASCADE)
CREATE OR REPLACE FUNCTION public.delete_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = p_session_id
          AND user_id = auth.uid()
          AND role = 'host'
    ) THEN
        RAISE EXCEPTION 'Only the host can delete a session';
    END IF;

    DELETE FROM sessions WHERE id = p_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- STATE TRANSITION RPCs
-- All state changes must go through SECURITY DEFINER functions.
-- ─────────────────────────────────────────────────────────────

-- Ensure guest tables exist before compiling RPCs that reference them.
CREATE TABLE IF NOT EXISTS public.session_guests (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id      uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    display_name    text        NOT NULL,
    created_by      uuid        REFERENCES auth.users(id),
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_buyins (
    id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id      uuid          NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    guest_id        uuid          NOT NULL REFERENCES public.session_guests(id) ON DELETE CASCADE,
    amount          numeric(10,2) NOT NULL CHECK (amount > 0),
    type            text          NOT NULL CHECK (type IN ('initial', 'rebuy')),
    created_at      timestamptz   DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_chip_counts (
    id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id      uuid          NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    guest_id        uuid          NOT NULL REFERENCES public.session_guests(id) ON DELETE CASCADE,
    final_stack     numeric(10,2) NOT NULL CHECK (final_stack >= 0),
    created_at      timestamptz   DEFAULT now(),
    UNIQUE (session_id, guest_id)
);

-- lobby → active
CREATE OR REPLACE FUNCTION public.start_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = p_session_id
          AND user_id = auth.uid()
          AND role = 'host'
    ) THEN
        RAISE EXCEPTION 'Only the host can start the game';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM sessions
        WHERE id = p_session_id
          AND state = 'lobby'
    ) THEN
        RAISE EXCEPTION 'Session is not in lobby state';
    END IF;

    UPDATE sessions
    SET state = 'active', start_time = now()
    WHERE id = p_session_id
      AND state = 'lobby';
END;
$$;

-- active → chip_count
CREATE OR REPLACE FUNCTION public.end_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = p_session_id
          AND user_id = auth.uid()
          AND role = 'host'
    ) THEN
        RAISE EXCEPTION 'Only the host can end the game';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM sessions
        WHERE id = p_session_id
          AND state = 'active'
    ) THEN
        RAISE EXCEPTION 'Session is not active';
    END IF;

    IF (
        (SELECT COUNT(*) FROM session_members WHERE session_id = p_session_id)
        + (SELECT COUNT(*) FROM session_guests WHERE session_id = p_session_id)
    ) < 2 THEN
        RAISE EXCEPTION 'At least 2 players are required to end the game';
    END IF;

    IF (
        COALESCE((SELECT SUM(amount) FROM buyins WHERE session_id = p_session_id), 0)
        + COALESCE((SELECT SUM(amount) FROM guest_buyins WHERE session_id = p_session_id), 0)
    ) <= 0 THEN
        RAISE EXCEPTION 'At least one buy-in is required to end the game';
    END IF;

    UPDATE sessions
    SET state = 'chip_count'
    WHERE id = p_session_id
      AND state = 'active';
END;
$$;

-- chip_count → payouts (validates all stacks entered and balanced)
CREATE OR REPLACE FUNCTION public.proceed_to_payouts(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_in numeric(12,2);
    v_total_out numeric(12,2);
    v_diff numeric(12,2);
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = p_session_id
          AND user_id = auth.uid()
          AND role = 'host'
    ) THEN
        RAISE EXCEPTION 'Only the host can proceed to payouts';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM sessions
        WHERE id = p_session_id
          AND state = 'chip_count'
    ) THEN
        RAISE EXCEPTION 'Session is not in chip_count state';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM session_members sm
        WHERE sm.session_id = p_session_id
          AND NOT EXISTS (
              SELECT 1
              FROM chip_counts cc
              WHERE cc.session_id = sm.session_id
                AND cc.user_id = sm.user_id
          )
    ) THEN
        RAISE EXCEPTION 'All registered players must enter chip counts';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM session_guests sg
        WHERE sg.session_id = p_session_id
          AND NOT EXISTS (
              SELECT 1
              FROM guest_chip_counts gcc
              WHERE gcc.session_id = sg.session_id
                AND gcc.guest_id = sg.id
          )
    ) THEN
        RAISE EXCEPTION 'All guest players must enter chip counts';
    END IF;

    SELECT
        COALESCE((SELECT SUM(amount) FROM buyins WHERE session_id = p_session_id), 0)
        + COALESCE((SELECT SUM(amount) FROM guest_buyins WHERE session_id = p_session_id), 0)
    INTO v_total_in;

    SELECT
        COALESCE((SELECT SUM(final_stack) FROM chip_counts WHERE session_id = p_session_id), 0)
        + COALESCE((SELECT SUM(final_stack) FROM guest_chip_counts WHERE session_id = p_session_id), 0)
    INTO v_total_out;

    v_diff := ROUND((v_total_out - v_total_in)::numeric, 2);
    IF v_diff <> 0 THEN
        RAISE EXCEPTION 'Chip counts do not balance (difference: %)', v_diff;
    END IF;

    UPDATE sessions
    SET state = 'payouts'
    WHERE id = p_session_id
      AND state = 'chip_count';
END;
$$;

-- payouts → closed
CREATE OR REPLACE FUNCTION public.close_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = p_session_id
          AND user_id = auth.uid()
          AND role = 'host'
    ) THEN
        RAISE EXCEPTION 'Only the host can close a session';
    END IF;

    UPDATE sessions
    SET state = 'closed'
    WHERE id = p_session_id
      AND state = 'payouts';
END;
$$;


-- ============================================================
-- Guest Players RLS
-- ============================================================

ALTER TABLE public.session_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_buyins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_chip_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_guests_select_members" ON public.session_guests;
DROP POLICY IF EXISTS "session_guests_insert_host_active_only" ON public.session_guests;
DROP POLICY IF EXISTS "session_guests_delete_host_active_only" ON public.session_guests;
DROP POLICY IF EXISTS "guest_buyins_select_members" ON public.guest_buyins;
DROP POLICY IF EXISTS "guest_buyins_insert_host_active_only" ON public.guest_buyins;
DROP POLICY IF EXISTS "guest_buyins_update_host_active_only" ON public.guest_buyins;
DROP POLICY IF EXISTS "guest_buyins_delete_host_active_only" ON public.guest_buyins;
DROP POLICY IF EXISTS "guest_chip_counts_select_members" ON public.guest_chip_counts;
DROP POLICY IF EXISTS "guest_chip_counts_insert_host_chip_count_only" ON public.guest_chip_counts;
DROP POLICY IF EXISTS "guest_chip_counts_update_host_chip_count_only" ON public.guest_chip_counts;

CREATE POLICY "session_guests_select_members"
ON public.session_guests
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = session_guests.session_id
          AND sm.user_id = auth.uid()
    )
);

CREATE POLICY "session_guests_insert_host_active_only"
ON public.session_guests
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = session_guests.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
    AND (SELECT state FROM public.sessions WHERE id = session_guests.session_id) = 'active'
);

CREATE POLICY "session_guests_delete_host_active_only"
ON public.session_guests
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = session_guests.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
    AND (SELECT state FROM public.sessions WHERE id = session_guests.session_id) = 'active'
);

CREATE POLICY "guest_buyins_select_members"
ON public.guest_buyins
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = guest_buyins.session_id
          AND sm.user_id = auth.uid()
    )
);

CREATE POLICY "guest_buyins_insert_host_active_only"
ON public.guest_buyins
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = guest_buyins.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
    AND (SELECT state FROM public.sessions WHERE id = guest_buyins.session_id) = 'active'
);

CREATE POLICY "guest_buyins_update_host_active_only"
ON public.guest_buyins
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = guest_buyins.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
    AND (SELECT state FROM public.sessions WHERE id = guest_buyins.session_id) = 'active'
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = guest_buyins.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
    AND (SELECT state FROM public.sessions WHERE id = guest_buyins.session_id) = 'active'
);

CREATE POLICY "guest_buyins_delete_host_active_only"
ON public.guest_buyins
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = guest_buyins.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
    AND (SELECT state FROM public.sessions WHERE id = guest_buyins.session_id) = 'active'
);

CREATE POLICY "guest_chip_counts_select_members"
ON public.guest_chip_counts
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = guest_chip_counts.session_id
          AND sm.user_id = auth.uid()
    )
);

CREATE POLICY "guest_chip_counts_insert_host_chip_count_only"
ON public.guest_chip_counts
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = guest_chip_counts.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
    AND (SELECT state FROM public.sessions WHERE id = guest_chip_counts.session_id) = 'chip_count'
);

CREATE POLICY "guest_chip_counts_update_host_chip_count_only"
ON public.guest_chip_counts
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = guest_chip_counts.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
    AND (SELECT state FROM public.sessions WHERE id = guest_chip_counts.session_id) = 'chip_count'
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = guest_chip_counts.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
    AND (SELECT state FROM public.sessions WHERE id = guest_chip_counts.session_id) = 'chip_count'
);

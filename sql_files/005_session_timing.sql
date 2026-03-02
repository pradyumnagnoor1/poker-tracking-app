-- ============================================================
-- Migration 005: Per-Player Session Timing
--
-- Adds the two columns needed for per-player play time:
--   session_members.game_joined_at  — when this player's game clock started
--   sessions.game_ended_at          — when the host ended the game
--
-- Also re-defines start_game, end_game, and approve_join_request
-- to populate those columns automatically.
--
-- Play time formula:
--   early cashout  → chip_counts.created_at − game_joined_at
--   normal end     → game_ended_at          − game_joined_at
--   still active   → NOW()                  − game_joined_at
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Schema additions
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.session_members
    ADD COLUMN IF NOT EXISTS game_joined_at TIMESTAMPTZ;

ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS game_ended_at TIMESTAMPTZ;


-- ─────────────────────────────────────────────────────────────
-- 2. Backfill existing sessions
--    For sessions that already started, set game_joined_at
--    from sessions.start_time so old data still works.
-- ─────────────────────────────────────────────────────────────

UPDATE public.session_members sm
SET game_joined_at = s.start_time
FROM public.sessions s
WHERE s.id = sm.session_id
  AND s.state != 'lobby'
  AND s.start_time IS NOT NULL
  AND sm.game_joined_at IS NULL;


-- ─────────────────────────────────────────────────────────────
-- 3. Updated start_game
--    Sets game_joined_at = NOW() for every player in the lobby
--    at the moment the game starts.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
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
        WHERE id = p_session_id AND state = 'lobby'
    ) THEN
        RAISE EXCEPTION 'Session is not in lobby state';
    END IF;

    -- Advance state and record start time
    UPDATE sessions
    SET state = 'active', start_time = v_now
    WHERE id = p_session_id AND state = 'lobby';

    -- Stamp game_joined_at for every player currently in the lobby.
    -- Mid-game joiners get their own stamp in approve_join_request.
    UPDATE session_members
    SET game_joined_at = v_now
    WHERE session_id = p_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. Updated end_game
--    Records game_ended_at so play time can be calculated.
--    All downstream recap queries anchor to this timestamp.
-- ─────────────────────────────────────────────────────────────

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
        WHERE id = p_session_id AND state = 'active'
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

    -- Record when the game ended, then advance state
    UPDATE sessions
    SET state = 'chip_count',
        game_ended_at = NOW()
    WHERE id = p_session_id AND state = 'active';
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 5. Updated approve_join_request
--    Mid-game joiners get game_joined_at = NOW() at the moment
--    their request is approved — not the original session start.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_join_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id uuid;
    v_user_id    uuid;
BEGIN
    SELECT session_id, user_id INTO v_session_id, v_user_id
    FROM join_requests
    WHERE id = p_request_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found or already handled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = v_session_id AND user_id = auth.uid() AND role = 'host'
    ) THEN
        RAISE EXCEPTION 'Only the host can approve join requests';
    END IF;

    -- Mid-game joiner: their clock starts NOW, not at sessions.start_time
    INSERT INTO session_members (session_id, user_id, role, game_joined_at)
    VALUES (v_session_id, v_user_id, 'player', NOW())
    ON CONFLICT (session_id, user_id) DO UPDATE
        SET game_joined_at = EXCLUDED.game_joined_at;

    UPDATE join_requests SET status = 'approved' WHERE id = p_request_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 6. RPC: get_my_session_recap
--
-- Called from the payouts page. Returns the current user's
-- personal stats for a session: play time, profit, hourly rate.
--
-- Play-end logic:
--   • chip_count.created_at < game_ended_at → early cashout
--   • otherwise → use game_ended_at (or NOW() if still active)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_session_recap(p_session_id uuid)
RETURNS TABLE (
    total_buy_in        NUMERIC,
    cash_out            NUMERIC,
    profit              NUMERIC,
    game_joined_at      TIMESTAMPTZ,
    play_end_at         TIMESTAMPTZ,
    play_seconds        INTEGER,
    hourly_rate         NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_game_joined_at    TIMESTAMPTZ;
    v_game_ended_at     TIMESTAMPTZ;
    v_total_buy_in      NUMERIC;
    v_cash_out          NUMERIC;
    v_chip_count_at     TIMESTAMPTZ;
    v_play_end_at       TIMESTAMPTZ;
    v_play_seconds      INTEGER;
BEGIN
    -- Membership check
    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = p_session_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You are not a member of this session';
    END IF;

    -- Fetch anchor timestamps
    SELECT sm.game_joined_at, s.game_ended_at
    INTO v_game_joined_at, v_game_ended_at
    FROM session_members sm
    JOIN sessions s ON s.id = sm.session_id
    WHERE sm.session_id = p_session_id AND sm.user_id = auth.uid();

    -- Sum all buy-ins
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_buy_in
    FROM buyins
    WHERE session_id = p_session_id AND user_id = auth.uid();

    -- Final stack (NULL if not yet entered)
    SELECT final_stack, created_at
    INTO v_cash_out, v_chip_count_at
    FROM chip_counts
    WHERE session_id = p_session_id AND user_id = auth.uid();

    -- Determine play end:
    -- If chip count was entered BEFORE game_ended_at → early cashout
    v_play_end_at := CASE
        WHEN v_chip_count_at IS NOT NULL
             AND v_game_ended_at IS NOT NULL
             AND v_chip_count_at < v_game_ended_at
        THEN v_chip_count_at                    -- early cashout
        ELSE COALESCE(v_game_ended_at, NOW())   -- normal end or still active
    END;

    -- Play time in whole seconds (0 if game_joined_at not set yet)
    v_play_seconds := CASE
        WHEN v_game_joined_at IS NOT NULL
        THEN GREATEST(0, EXTRACT(EPOCH FROM (v_play_end_at - v_game_joined_at))::INTEGER)
        ELSE 0
    END;

    RETURN QUERY SELECT
        v_total_buy_in,
        v_cash_out,
        CASE WHEN v_cash_out IS NOT NULL THEN v_cash_out - v_total_buy_in ELSE NULL END,
        v_game_joined_at,
        v_play_end_at,
        v_play_seconds,
        CASE
            WHEN v_play_seconds > 0 AND v_cash_out IS NOT NULL
            THEN ROUND((v_cash_out - v_total_buy_in) / (v_play_seconds / 3600.0), 2)
            ELSE NULL
        END;
END;
$$;

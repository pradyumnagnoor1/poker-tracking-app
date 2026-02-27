-- ============================================================
-- RPC: join_by_code
-- Allows a user to join a lobby session by invite code.
-- Runs as SECURITY DEFINER to bypass RLS (needed because the
-- joining user is not yet a session member and can't SELECT it).
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id uuid;
    v_state      text;
BEGIN
    -- Look up session by invite code
    SELECT id, state INTO v_session_id, v_state
    FROM sessions
    WHERE invite_code = UPPER(p_code)
    LIMIT 1;

    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    IF v_state != 'lobby' THEN
        RAISE EXCEPTION 'Session has already started';
    END IF;

    -- Add user as a player if not already a member
    INSERT INTO session_members (session_id, user_id, role)
    VALUES (v_session_id, auth.uid(), 'player')
    ON CONFLICT (session_id, user_id) DO NOTHING;

    RETURN v_session_id;
END;
$$;

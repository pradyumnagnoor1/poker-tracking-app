-- ============================================================
-- Join Requests — Mid-game join flow
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.join_requests (
    id           uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id   uuid         NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    user_id      uuid         NOT NULL REFERENCES auth.users(id),
    display_name text         NOT NULL DEFAULT '',
    status       text         NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'denied')),
    created_at   timestamptz  DEFAULT now(),
    UNIQUE(session_id, user_id)
);

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- Requesters can see their own requests; session members (host) can see all for their session
DROP POLICY IF EXISTS "join_requests_select" ON public.join_requests;
CREATE POLICY "join_requests_select" ON public.join_requests FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.session_members
        WHERE session_id = join_requests.session_id AND user_id = auth.uid()
    )
);

-- Any authenticated user can insert their own request
DROP POLICY IF EXISTS "join_requests_insert" ON public.join_requests;
CREATE POLICY "join_requests_insert" ON public.join_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- RPC: Player requests to join an active session via invite code
-- Returns the session_id so the client can navigate there
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_to_join_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id uuid;
    v_display_name text;
BEGIN
    SELECT id INTO v_session_id
    FROM sessions
    WHERE UPPER(invite_code) = UPPER(p_code) AND state = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active session found with that code';
    END IF;

    IF EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = v_session_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You are already in this session';
    END IF;

    SELECT COALESCE(display_name, 'Player') INTO v_display_name
    FROM profiles WHERE id = auth.uid();

    INSERT INTO join_requests (session_id, user_id, display_name, status)
    VALUES (v_session_id, auth.uid(), v_display_name, 'pending')
    ON CONFLICT (session_id, user_id) DO UPDATE
        SET status = 'pending', created_at = now();

    RETURN v_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- RPC: Host approves a join request → adds user to session_members
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

    INSERT INTO session_members (session_id, user_id, role)
    VALUES (v_session_id, v_user_id, 'player')
    ON CONFLICT (session_id, user_id) DO NOTHING;

    UPDATE join_requests SET status = 'approved' WHERE id = p_request_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- RPC: Host denies a join request
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deny_join_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id uuid;
BEGIN
    SELECT session_id INTO v_session_id
    FROM join_requests
    WHERE id = p_request_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found or already handled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = v_session_id AND user_id = auth.uid() AND role = 'host'
    ) THEN
        RAISE EXCEPTION 'Only the host can deny join requests';
    END IF;

    UPDATE join_requests SET status = 'denied' WHERE id = p_request_id;
END;
$$;

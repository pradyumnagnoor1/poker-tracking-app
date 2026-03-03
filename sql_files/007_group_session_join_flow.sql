-- ============================================================
-- Migration 007: Group session join flow
--
-- Goals:
--   1) Starting from a group creates an ACTIVE session linked by group_id.
--   2) Only the host is inserted into session_members at creation time.
--   3) Group members explicitly join via RPC (idempotent + race-safe).
-- ============================================================

-- Hard DB guard: only one open session (lobby or active) per group.
-- Rebuild explicitly so rerunning this migration upgrades prior index predicates.
DROP INDEX IF EXISTS public.idx_one_active_group_session;
CREATE UNIQUE INDEX idx_one_active_group_session
ON public.sessions (group_id)
WHERE group_id IS NOT NULL
  AND state IN ('lobby', 'active');

CREATE OR REPLACE FUNCTION public.start_session_from_group(
    p_group_id       uuid,
    p_title          text,
    p_buy_in_default numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id  uuid;
    v_invite_code text := '';
    v_chars       text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_active_host uuid;
    i             integer;
BEGIN
    -- Group member check + row lock to serialize starts per group.
    IF NOT EXISTS (
        SELECT 1
        FROM groups g
        JOIN group_members gm
          ON gm.group_id = g.id
         AND gm.user_id = auth.uid()
        WHERE g.id = p_group_id
        FOR UPDATE
    ) THEN
        RAISE EXCEPTION 'Only group members can start a session from this group';
    END IF;

    -- Double-click safety: if caller already started the open session, return it.
    SELECT id, host_user_id
    INTO v_session_id, v_active_host
    FROM sessions
    WHERE group_id = p_group_id
      AND state IN ('lobby', 'active')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_session_id IS NOT NULL THEN
        IF v_active_host = auth.uid() THEN
            RETURN v_session_id;
        END IF;
        RAISE EXCEPTION 'This group already has an open session';
    END IF;

    -- Generate 6-char invite code
    FOR i IN 1..6 LOOP
        v_invite_code := v_invite_code ||
            SUBSTR(v_chars, (FLOOR(RANDOM() * LENGTH(v_chars))::integer + 1), 1);
    END LOOP;

    -- Create a LOBBY session linked to the group.
    BEGIN
        INSERT INTO sessions (host_user_id, title, buy_in_default, invite_code, group_id, state, start_time)
        VALUES (auth.uid(), p_title, p_buy_in_default, v_invite_code, p_group_id, 'lobby', NULL)
        RETURNING id INTO v_session_id;
    EXCEPTION
        WHEN unique_violation THEN
            -- Race safety with unique index: resolve to active row.
            SELECT id, host_user_id
            INTO v_session_id, v_active_host
            FROM sessions
            WHERE group_id = p_group_id
              AND state IN ('lobby', 'active')
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_session_id IS NOT NULL AND v_active_host = auth.uid() THEN
                RETURN v_session_id;
            END IF;
            RAISE EXCEPTION 'This group already has an open session';
    END;

    -- Insert host only.
    INSERT INTO session_members (session_id, user_id, role, game_joined_at)
    VALUES (v_session_id, auth.uid(), 'host', NOW())
    ON CONFLICT (session_id, user_id) DO NOTHING;

    RETURN v_session_id;
END;
$$;


-- Group member joins the currently open session for a group.
-- Idempotent under retries/refresh via ON CONFLICT.
CREATE OR REPLACE FUNCTION public.join_active_group_session(p_group_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id uuid;
BEGIN
    IF NOT public.is_group_member(p_group_id) THEN
        RAISE EXCEPTION 'You are not a member of this group';
    END IF;

    -- Lock chosen session row to keep checks/insert atomic.
    SELECT id
    INTO v_session_id
    FROM sessions
    WHERE group_id = p_group_id
      AND state IN ('lobby', 'active')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'No open session found for this group';
    END IF;

    INSERT INTO session_members (session_id, user_id, role, game_joined_at)
    VALUES (v_session_id, auth.uid(), 'player', NOW())
    ON CONFLICT (session_id, user_id) DO NOTHING;

    RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_session_from_group(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_session_from_group(uuid, text, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.join_active_group_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_active_group_session(uuid) TO authenticated;

-- Allow group members to see open group sessions before they join session_members.
-- Without this, dashboard/group pages cannot render "open session" indicators/buttons.
DROP POLICY IF EXISTS "sessions_select_group_open_member" ON public.sessions;
CREATE POLICY "sessions_select_group_open_member"
ON public.sessions
FOR SELECT TO authenticated
USING (
    group_id IS NOT NULL
    AND state IN ('lobby', 'active')
    AND public.is_group_member(group_id)
);

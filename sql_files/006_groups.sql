-- ============================================================
-- Migration 006: Groups Feature
--
-- Adds:
--   1. groups table
--   2. group_members table
--   3. Helper: is_group_member() — SECURITY DEFINER to avoid
--      recursive RLS on group_members (same pattern as
--      is_session_member() in fix_session_members_rls.sql)
--   4. RLS policies for both tables
--   5. group_id column on sessions (for future analytics)
--   6. RPC: start_session_from_group()
--   7. RPC: create_group_from_session()
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. groups table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.groups (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name       text        NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- 2. group_members table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_members (
    group_id  uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id   uuid        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);


-- ─────────────────────────────────────────────────────────────
-- 3. Add group_id to sessions for future analytics linkage.
--    ON DELETE SET NULL: deleting a group does not destroy
--    historical session records.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────
-- 4. SECURITY DEFINER helper: is_group_member
--
-- Used in group_members RLS SELECT policy to avoid the infinite
-- recursion that would occur if the policy checked group_members
-- from within itself (same problem solved by is_session_member).
--
-- Returns true if auth.uid() is in group_members for p_group_id.
-- Bypasses RLS for this internal lookup by running as definer.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = p_group_id
          AND user_id  = auth.uid()
    );
$$;


-- ─────────────────────────────────────────────────────────────
-- 5. RLS: groups
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_select_member"  ON public.groups;
DROP POLICY IF EXISTS "groups_insert_owner"   ON public.groups;
DROP POLICY IF EXISTS "groups_update_owner"   ON public.groups;
DROP POLICY IF EXISTS "groups_delete_owner"   ON public.groups;

-- Members and owners can view the group.
-- owner_id check short-circuits before is_group_member is called,
-- so the owner can always see their own group (including the brief
-- window between groups INSERT and group_members INSERT).
CREATE POLICY "groups_select_member"
ON public.groups FOR SELECT TO authenticated
USING (
    owner_id = auth.uid()
    OR public.is_group_member(id)
);

-- Any authenticated user can create a group (must own it).
CREATE POLICY "groups_insert_owner"
ON public.groups FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

-- Only the owner can rename the group.
CREATE POLICY "groups_update_owner"
ON public.groups FOR UPDATE TO authenticated
USING    (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Only the owner can delete the group.
CREATE POLICY "groups_delete_owner"
ON public.groups FOR DELETE TO authenticated
USING (owner_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- 6. RLS: group_members
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_members_select"       ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert_owner" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete_owner" ON public.group_members;

-- Any group member or the owner can see the member list.
-- is_group_member() is SECURITY DEFINER so this does NOT recurse.
CREATE POLICY "group_members_select"
ON public.group_members FOR SELECT TO authenticated
USING (
    public.is_group_member(group_id)
    OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = group_members.group_id
          AND g.owner_id = auth.uid()
    )
);

-- Only the group owner can add members.
-- Belt-and-suspenders: the RPCs also validate ownership.
CREATE POLICY "group_members_insert_owner"
ON public.group_members FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = group_members.group_id
          AND g.owner_id = auth.uid()
    )
);

-- Owner can remove anyone; a member can remove themselves.
CREATE POLICY "group_members_delete_owner"
ON public.group_members FOR DELETE TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = group_members.group_id
          AND g.owner_id = auth.uid()
    )
);


-- ─────────────────────────────────────────────────────────────
-- 7. RPC: start_session_from_group
--
-- Called by any group member to create a session for the group.
--
-- Steps:
--   a) Verify caller is a group member
--   b) Generate invite_code in SQL (same charset as utils.ts,
--      excluding I/O/0/1 to avoid confusion)
--   c) Ensure only one active session per group
--   d) INSERT into sessions (with group_id + state='active')
--   e) INSERT caller as 'host' into session_members
--   f) Return the new session UUID
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_group_session
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
    -- a) Caller must be a group member (lock group row to serialize starts).
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

    -- b) Idempotency: if this caller already started the open session, return it.
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

    -- c) Generate 6-char invite code
    FOR i IN 1..6 LOOP
        v_invite_code := v_invite_code ||
            SUBSTR(v_chars, (FLOOR(RANDOM() * LENGTH(v_chars))::integer + 1), 1);
    END LOOP;

    -- d) Create lobby session with group_id linked.
    BEGIN
        INSERT INTO sessions (host_user_id, title, buy_in_default, invite_code, group_id, state, start_time)
        VALUES (auth.uid(), p_title, p_buy_in_default, v_invite_code, p_group_id, 'lobby', NULL)
        RETURNING id INTO v_session_id;
    EXCEPTION
        WHEN unique_violation THEN
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

    -- e) Insert starter only as host.
    INSERT INTO session_members (session_id, user_id, role, game_joined_at)
    VALUES (v_session_id, auth.uid(), 'host', NOW())
    ON CONFLICT (session_id, user_id) DO NOTHING;

    RETURN v_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 7b. RPC: join_active_group_session
--
-- Group members explicitly join the current open session.
-- Idempotent for refresh/retry via ON CONFLICT DO NOTHING.
-- ─────────────────────────────────────────────────────────────

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

DROP POLICY IF EXISTS "sessions_select_group_open_member" ON public.sessions;
CREATE POLICY "sessions_select_group_open_member"
ON public.sessions
FOR SELECT TO authenticated
USING (
    group_id IS NOT NULL
    AND state IN ('lobby', 'active')
    AND public.is_group_member(group_id)
);


-- ─────────────────────────────────────────────────────────────
-- 8. RPC: create_group_from_session
--
-- Called by the session host to create a group from everyone
-- currently in the session. Works on any session state
-- (active, chip_count, payouts, or closed).
-- Guests (session_guests) are excluded — they have no user_id.
--
-- Steps:
--   a) Verify caller is session host (role = 'host')
--   b) INSERT into groups
--   c) Bulk-INSERT all session_members into group_members
--   d) Return the new group UUID
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_group_from_session(
    p_session_id uuid,
    p_name       text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id uuid;
BEGIN
    -- a) Caller must be the session host
    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = p_session_id
          AND user_id    = auth.uid()
          AND role       = 'host'
    ) THEN
        RAISE EXCEPTION 'Only the session host can create a group from this session';
    END IF;

    -- b) Create the group
    INSERT INTO groups (owner_id, name)
    VALUES (auth.uid(), TRIM(p_name))
    RETURNING id INTO v_group_id;

    -- c) Add all registered session members as group members.
    --    session_guests rows have no user_id column and are not
    --    in session_members, so they are naturally excluded.
    INSERT INTO group_members (group_id, user_id)
    SELECT v_group_id, sm.user_id
    FROM session_members sm
    WHERE sm.session_id = p_session_id
    ON CONFLICT (group_id, user_id) DO NOTHING;

    RETURN v_group_id;
END;
$$;

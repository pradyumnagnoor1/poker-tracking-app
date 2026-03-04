-- Migration 009: Group Invites
--
-- Run this in the Supabase SQL editor.
--
-- Adds an invite/approval flow for group membership.
-- Group owner sends an invite → invitee accepts or declines.

-- ─────────────────────────────────────────────────────────────
-- Step 1: Create group_invites table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_invites (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  group_id    uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  inviter_id  uuid        NOT NULL REFERENCES public.profiles(id),
  invitee_id  uuid        NOT NULL REFERENCES public.profiles(id),
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_invites_pkey PRIMARY KEY (id)
);

-- ─────────────────────────────────────────────────────────────
-- Step 2: RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

-- Group owner can send invites
CREATE POLICY "group_owner_can_invite" ON public.group_invites
  FOR INSERT WITH CHECK (
    auth.uid() = inviter_id AND
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_invites.group_id AND owner_id = auth.uid()
    )
  );

-- Inviter and invitee can read their invites
CREATE POLICY "parties_can_read_invite" ON public.group_invites
  FOR SELECT USING (
    auth.uid() = inviter_id OR auth.uid() = invitee_id
  );

-- Only invitee can update (accept/decline handled via RPC below)
CREATE POLICY "invitee_can_update" ON public.group_invites
  FOR UPDATE USING (auth.uid() = invitee_id);

-- ─────────────────────────────────────────────────────────────
-- Step 3: respond_group_invite RPC
--
-- Called by the invitee. On accept, also inserts into group_members
-- using SECURITY DEFINER to bypass the group_members owner-only RLS.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.respond_group_invite(
  p_invite_id UUID,
  p_accept    BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.group_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite
  FROM public.group_invites
  WHERE id = p_invite_id
    AND invitee_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;

  UPDATE public.group_invites
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END
  WHERE id = p_invite_id;

  IF p_accept THEN
    INSERT INTO public.group_members (group_id, user_id)
    VALUES (v_invite.group_id, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

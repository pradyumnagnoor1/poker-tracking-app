-- ============================================================
-- Fix: session_members RLS infinite recursion
-- The SELECT policy was referencing session_members from within
-- itself, causing infinite recursion. Fix using a SECURITY
-- DEFINER function that bypasses RLS for the membership check.
-- ============================================================

-- 1. Helper function that checks membership without triggering RLS
CREATE OR REPLACE FUNCTION public.is_session_member(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.session_members
        WHERE session_id = p_session_id
          AND user_id = auth.uid()
    );
$$;

-- 2. Drop the broken recursive policy
DROP POLICY IF EXISTS "session_members_select" ON public.session_members;

-- 3. Replace with a non-recursive version using the helper
CREATE POLICY "session_members_select"
ON public.session_members FOR SELECT TO authenticated
USING (public.is_session_member(session_id));

-- ============================================================
-- Fix: Enable Realtime + RLS for session_members
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add tables to the Supabase Realtime publication
--    (without this, postgres_changes subscriptions fire nothing)
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buyins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chip_counts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;

-- 2. Enable RLS on session_members (may already be on — safe to re-run)
ALTER TABLE public.session_members ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies for session_members
DROP POLICY IF EXISTS "session_members_select" ON public.session_members;
DROP POLICY IF EXISTS "session_members_insert" ON public.session_members;
DROP POLICY IF EXISTS "session_members_delete" ON public.session_members;

-- Any member of a session can see all members of that session
CREATE POLICY "session_members_select"
ON public.session_members FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = session_members.session_id
          AND sm.user_id = auth.uid()
    )
);

-- Users can insert themselves (handled by RPCs/actions, but needed for direct inserts)
CREATE POLICY "session_members_insert"
ON public.session_members FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Host can remove players; players can remove themselves
CREATE POLICY "session_members_delete"
ON public.session_members FOR DELETE TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.session_members sm
        WHERE sm.session_id = session_members.session_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'host'
    )
);

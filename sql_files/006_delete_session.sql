-- ============================================================
-- Migration 006: Robust delete_session RPC
--
-- Replaces the previous delete_session in rls_policies.sql.
-- Explicitly deletes all child rows in dependency order so
-- the function works regardless of whether the original schema
-- has ON DELETE CASCADE on session_members / buyins / chip_counts.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verify caller is the host
    IF NOT EXISTS (
        SELECT 1 FROM session_members
        WHERE session_id = p_session_id
          AND user_id    = auth.uid()
          AND role       = 'host'
    ) THEN
        RAISE EXCEPTION 'Only the host can delete a session.';
    END IF;

    -- Delete children in dependency order (deepest first)
    DELETE FROM guest_chip_counts  WHERE session_id = p_session_id;
    DELETE FROM chip_counts        WHERE session_id = p_session_id;
    DELETE FROM guest_buyins       WHERE session_id = p_session_id;
    DELETE FROM buyins             WHERE session_id = p_session_id;
    DELETE FROM session_guests     WHERE session_id = p_session_id;
    DELETE FROM join_requests      WHERE session_id = p_session_id;
    DELETE FROM session_members    WHERE session_id = p_session_id;

    -- Now safe to delete the session itself
    DELETE FROM sessions WHERE id = p_session_id;
END;
$$;

-- Migration 008: Manual Entry Privacy + get_friend_stats
--
-- Run this in the Supabase SQL editor.
--
-- 1. Adds is_public column to manual_game_entries (default true = visible to friends)
-- 2. Creates get_friend_stats RPC that includes public manual entries in aggregate P/L

-- ─────────────────────────────────────────────────────────────
-- Step 1: Add is_public column
-- Existing entries default to true so they are visible to friends immediately.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.manual_game_entries
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────
-- Step 2: get_friend_stats
--
-- Returns aggregate stats for a given user, combining:
--   - Group poker sessions (sessions + buyins + chip_counts)
--   - Personal timer/manual sessions (personal_sessions)
--   - Public manual game entries (manual_game_entries)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_friend_stats(p_friend_id UUID)
RETURNS TABLE (
  games_played   BIGINT,
  wins           BIGINT,
  losses         BIGINT,
  total_profit   NUMERIC,
  average_profit NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::BIGINT                               AS games_played,
    COUNT(*) FILTER (WHERE profit > 0)::BIGINT     AS wins,
    COUNT(*) FILTER (WHERE profit < 0)::BIGINT     AS losses,
    COALESCE(ROUND(SUM(profit), 2), 0)             AS total_profit,
    COALESCE(ROUND(AVG(profit), 2), 0)             AS average_profit
  FROM (
    -- Group poker sessions tracked via sessions/buyins/chip_counts
    SELECT ROUND(cc.final_stack - COALESCE(b.total_buyin, 0), 2) AS profit
    FROM public.chip_counts cc
    JOIN public.sessions s ON s.id = cc.session_id
    LEFT JOIN (
      SELECT session_id, SUM(amount) AS total_buyin
      FROM public.buyins
      WHERE user_id = p_friend_id
      GROUP BY session_id
    ) b ON b.session_id = cc.session_id
    WHERE cc.user_id = p_friend_id
      AND s.state IN ('payouts', 'closed')

    UNION ALL

    -- Personal timer/manual sessions
    SELECT ROUND(cash_out - buy_in, 2) AS profit
    FROM public.personal_sessions
    WHERE user_id = p_friend_id
      AND status = 'ended'
      AND cash_out IS NOT NULL

    UNION ALL

    -- Public manual entries
    SELECT profit
    FROM public.manual_game_entries
    WHERE user_id = p_friend_id
      AND is_public = true
  ) combined;
$$;

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
--   - Tracked personal sessions (status = 'ended')
--   - Manual game entries where is_public = true
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
    -- Tracked personal sessions
    SELECT ROUND(cash_out - buy_in, 2) AS profit
    FROM public.personal_sessions
    WHERE user_id = p_friend_id
      AND status = 'ended'
      AND cash_out IS NOT NULL

    UNION ALL

    -- Manual entries (public only)
    SELECT profit
    FROM public.manual_game_entries
    WHERE user_id = p_friend_id
      AND is_public = true
  ) combined;
$$;

-- ============================================================
-- Migration 004: Performance Indexes
--
-- Index strategy:
--   1. Every analytics query filters on (user_id, status)  → composite
--   2. Analytics eligibility filtering                      → partial index
--   3. Date-range queries for charts                        → include date col
--   4. Stake filtering                                      → composite
--   5. Tag lookups                                          → covered
--   6. Pause lookups                                        → session + open
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- personal_sessions — the hottest table
-- ─────────────────────────────────────────────────────────────

-- Primary analytics filter: user's completed sessions
CREATE INDEX IF NOT EXISTS idx_ps_user_ended
    ON public.personal_sessions (user_id, status)
    WHERE status = 'ended';

-- Analytics eligibility (time-based analytics)
-- Partial index keeps it small — only eligible sessions are indexed.
CREATE INDEX IF NOT EXISTS idx_ps_user_eligible
    ON public.personal_sessions (user_id)
    WHERE status = 'ended' AND is_analytics_eligible = TRUE;

-- Profit-over-time and bankroll charts: ordered by time.
-- Cannot use COALESCE(played_at, started_at::DATE) in an index expression
-- because timestamptz::DATE is STABLE (timezone-dependent), not IMMUTABLE.
-- Instead, index on started_at and INCLUDE played_at so the planner can
-- resolve COALESCE(played_at, started_at::DATE) via index-only scan.
CREATE INDEX IF NOT EXISTS idx_ps_user_date
    ON public.personal_sessions (user_id, started_at DESC)
    INCLUDE (played_at, cash_out, buy_in, stake_level)
    WHERE status = 'ended';

-- Stake-level filtering (analytics breakdowns and history filter)
CREATE INDEX IF NOT EXISTS idx_ps_user_stake
    ON public.personal_sessions (user_id, stake_level)
    WHERE status = 'ended' AND stake_level IS NOT NULL;

-- Active session lookup (get_active_personal_session)
-- Narrow index — only active/paused sessions, very few rows per user
CREATE INDEX IF NOT EXISTS idx_ps_user_active
    ON public.personal_sessions (user_id)
    WHERE status IN ('active', 'paused');


-- ─────────────────────────────────────────────────────────────
-- session_pauses
-- ─────────────────────────────────────────────────────────────

-- Lookup pauses for a session (compute_paused_seconds)
CREATE INDEX IF NOT EXISTS idx_pauses_session
    ON public.session_pauses (personal_session_id);

-- Open pause lookup (resume, end — must find the single open pause)
CREATE INDEX IF NOT EXISTS idx_pauses_open
    ON public.session_pauses (personal_session_id)
    WHERE resumed_at IS NULL;


-- ─────────────────────────────────────────────────────────────
-- session_tags + tags
-- ─────────────────────────────────────────────────────────────

-- Tag → session lookup (filter history by tag)
CREATE INDEX IF NOT EXISTS idx_st_tag
    ON public.session_tags (tag_id, personal_session_id);

-- Session → tags lookup (loading tags for a session card)
-- Primary key (personal_session_id, tag_id) already covers this direction.

-- User's tags (tag management page)
CREATE INDEX IF NOT EXISTS idx_tags_user
    ON public.tags (user_id);


-- ─────────────────────────────────────────────────────────────
-- user_analytics_settings
-- ─────────────────────────────────────────────────────────────

-- Primary key = user_id, so lookup is O(1). No extra index needed.


-- ─────────────────────────────────────────────────────────────
-- EXPLAIN ANALYZE targets (run these to validate index usage)
-- ─────────────────────────────────────────────────────────────

-- Uncomment and run in the SQL editor to verify index hits:
/*

-- Should use idx_ps_user_ended
EXPLAIN ANALYZE
SELECT SUM(cash_out - buy_in)
FROM personal_sessions
WHERE user_id = '<your-uid>'
  AND status = 'ended'
  AND cash_out IS NOT NULL;

-- Should use idx_ps_user_eligible
EXPLAIN ANALYZE
SELECT SUM(cash_out - buy_in), SUM(total_play_time_seconds)
FROM personal_sessions
WHERE user_id = '<your-uid>'
  AND status = 'ended'
  AND is_analytics_eligible = TRUE;

-- Should use idx_ps_user_date — orders by started_at, resolves
-- played_at via INCLUDE without a heap lookup
EXPLAIN ANALYZE
SELECT COALESCE(played_at, started_at::DATE), cash_out, buy_in
FROM personal_sessions
WHERE user_id = '<your-uid>'
  AND status = 'ended'
ORDER BY started_at DESC;

*/

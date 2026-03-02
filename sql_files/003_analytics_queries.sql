-- ============================================================
-- Migration 003: Analytics Query Reference
--
-- These are the analytics queries for v1.5.
-- In Supabase, wrap each block in a SECURITY DEFINER RPC.
-- In Express, run as parameterized prepared statements.
--
-- ELIGIBILITY RULE:
--   Basic analytics  → status = 'ended' (all completed sessions)
--   Time analytics   → status = 'ended' AND is_analytics_eligible = TRUE
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- ANALYTICS RPC 1: get_user_summary
--
-- Top-level stats card.
-- Returns: total_sessions, total_profit, win_rate,
--          avg_profit_per_session, current_bankroll
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_summary(
    p_stake_level TEXT DEFAULT NULL   -- NULL = all stakes
)
RETURNS TABLE (
    total_sessions          BIGINT,
    winning_sessions        BIGINT,
    losing_sessions         BIGINT,
    breakeven_sessions      BIGINT,
    total_profit            NUMERIC,
    avg_profit_per_session  NUMERIC,
    win_rate_pct            NUMERIC,
    current_bankroll        NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_initial_bankroll NUMERIC;
BEGIN
    SELECT COALESCE(initial_bankroll, 0)
    INTO v_initial_bankroll
    FROM user_analytics_settings
    WHERE user_id = auth.uid();

    RETURN QUERY
    WITH session_profits AS (
        SELECT
            (cash_out - buy_in) AS profit
        FROM personal_sessions
        WHERE user_id = auth.uid()
          AND status = 'ended'
          AND cash_out IS NOT NULL
          AND (p_stake_level IS NULL OR stake_level = p_stake_level)
    )
    SELECT
        COUNT(*)::BIGINT                                         AS total_sessions,
        COUNT(*) FILTER (WHERE profit > 0)::BIGINT              AS winning_sessions,
        COUNT(*) FILTER (WHERE profit < 0)::BIGINT              AS losing_sessions,
        COUNT(*) FILTER (WHERE profit = 0)::BIGINT              AS breakeven_sessions,
        COALESCE(SUM(profit), 0)                                AS total_profit,
        COALESCE(AVG(profit), 0)                                AS avg_profit_per_session,
        CASE WHEN COUNT(*) = 0 THEN 0
             ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE profit > 0) / COUNT(*), 1)
        END                                                      AS win_rate_pct,
        -- Bankroll = initial seed + all profit to date
        v_initial_bankroll + COALESCE(SUM(profit), 0)          AS current_bankroll
    FROM session_profits;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- ANALYTICS RPC 2: get_profit_over_time
--
-- Cumulative profit by date for a line chart.
-- Returns one row per session date, ordered ascending.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_profit_over_time(
    p_stake_level   TEXT        DEFAULT NULL,
    p_from_date     DATE        DEFAULT NULL,
    p_to_date       DATE        DEFAULT NULL
)
RETURNS TABLE (
    session_date        DATE,
    profit              NUMERIC,
    cumulative_profit   NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH ordered_sessions AS (
        SELECT
            COALESCE(played_at, started_at::DATE)   AS session_date,
            (cash_out - buy_in)                     AS profit
        FROM personal_sessions
        WHERE user_id = auth.uid()
          AND status = 'ended'
          AND cash_out IS NOT NULL
          AND (p_stake_level IS NULL OR stake_level = p_stake_level)
          AND (p_from_date   IS NULL OR COALESCE(played_at, started_at::DATE) >= p_from_date)
          AND (p_to_date     IS NULL OR COALESCE(played_at, started_at::DATE) <= p_to_date)
        ORDER BY session_date
    )
    SELECT
        session_date,
        profit,
        SUM(profit) OVER (ORDER BY session_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            AS cumulative_profit
    FROM ordered_sessions;
$$;


-- ─────────────────────────────────────────────────────────────
-- ANALYTICS RPC 3: get_hourly_rate
--
-- Only includes sessions where is_analytics_eligible = TRUE.
-- Returns overall and per-stake breakdown.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_hourly_rate(
    p_stake_level TEXT DEFAULT NULL
)
RETURNS TABLE (
    stake_level         TEXT,
    total_hours         NUMERIC,
    total_profit        NUMERIC,
    hourly_rate         NUMERIC,
    session_count       BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(stake_level, 'All Stakes')                             AS stake_level,
        ROUND(SUM(total_play_time_seconds) / 3600.0, 2)                AS total_hours,
        ROUND(SUM(cash_out - buy_in), 2)                               AS total_profit,
        ROUND(
            SUM(cash_out - buy_in) /
            NULLIF(SUM(total_play_time_seconds) / 3600.0, 0),
        2)                                                              AS hourly_rate,
        COUNT(*)::BIGINT                                                AS session_count
    FROM personal_sessions
    WHERE user_id = auth.uid()
      AND status = 'ended'
      AND is_analytics_eligible = TRUE   -- only sessions with valid duration
      AND cash_out IS NOT NULL
      AND (p_stake_level IS NULL OR stake_level = p_stake_level)
    GROUP BY GROUPING SETS (
        (stake_level),   -- per-stake row
        ()               -- aggregate row (stake_level = NULL → 'All Stakes')
    )
    ORDER BY stake_level NULLS LAST;
$$;


-- ─────────────────────────────────────────────────────────────
-- ANALYTICS RPC 4: get_bb_per_100
--
-- BB/100 = (profit / (big_blind × hands_played)) × 100
--
-- Requires hands_played to be set on the session.
-- For sessions without hands_played, estimates using
-- user_analytics_settings.hands_per_hour_by_stake if set.
--
-- Big blind is parsed from stake_level (e.g. '1/2' → 2).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_bb_per_100(
    p_stake_level TEXT DEFAULT NULL
)
RETURNS TABLE (
    stake_level             TEXT,
    total_hands             INTEGER,
    total_profit_in_bb      NUMERIC,
    bb_per_100              NUMERIC,
    session_count           BIGINT,
    used_estimated_hands    BOOLEAN   -- true if any session used estimation
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hands_per_hour JSONB;
BEGIN
    SELECT hands_per_hour_by_stake
    INTO v_hands_per_hour
    FROM user_analytics_settings
    WHERE user_id = auth.uid();

    RETURN QUERY
    WITH session_data AS (
        SELECT
            ps.stake_level,
            (ps.cash_out - ps.buy_in)                   AS profit,
            -- Parse big blind from stake_level string "X/Y" → Y
            NULLIF(
                SPLIT_PART(ps.stake_level, '/', 2)::NUMERIC,
                0
            )                                            AS big_blind,
            -- Use recorded hands, or estimate from hours × hands/hr rate
            COALESCE(
                ps.hands_played,
                CASE
                    WHEN ps.is_analytics_eligible
                         AND v_hands_per_hour IS NOT NULL
                         AND v_hands_per_hour ? ps.stake_level
                    THEN ROUND(
                        (ps.total_play_time_seconds / 3600.0) *
                        (v_hands_per_hour ->> ps.stake_level)::NUMERIC
                    )::INTEGER
                    ELSE NULL
                END
            )                                            AS effective_hands,
            (ps.hands_played IS NULL)                    AS is_estimated
        FROM personal_sessions ps
        WHERE ps.user_id = auth.uid()
          AND ps.status = 'ended'
          AND ps.cash_out IS NOT NULL
          AND ps.stake_level IS NOT NULL
          AND (p_stake_level IS NULL OR ps.stake_level = p_stake_level)
    )
    SELECT
        sd.stake_level,
        SUM(sd.effective_hands)::INTEGER                AS total_hands,
        ROUND(SUM(sd.profit / NULLIF(sd.big_blind, 0)), 2)
                                                        AS total_profit_in_bb,
        ROUND(
            100.0 * SUM(sd.profit / NULLIF(sd.big_blind, 0)) /
            NULLIF(SUM(sd.effective_hands), 0)::NUMERIC,
        2)                                              AS bb_per_100,
        COUNT(*)::BIGINT                                AS session_count,
        BOOL_OR(sd.is_estimated)                        AS used_estimated_hands
    FROM session_data sd
    WHERE sd.effective_hands IS NOT NULL    -- skip rows with no hand data at all
      AND sd.big_blind IS NOT NULL
    GROUP BY sd.stake_level
    ORDER BY sd.stake_level;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- ANALYTICS RPC 5: get_bankroll_over_time
--
-- Returns bankroll value at each session date.
-- bankroll = initial_bankroll + cumulative profit up to that date
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_bankroll_over_time(
    p_from_date DATE DEFAULT NULL,
    p_to_date   DATE DEFAULT NULL
)
RETURNS TABLE (
    session_date    DATE,
    bankroll        NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH initial AS (
        SELECT COALESCE(initial_bankroll, 0) AS seed
        FROM user_analytics_settings
        WHERE user_id = auth.uid()
    ),
    ordered AS (
        SELECT
            COALESCE(played_at, started_at::DATE) AS session_date,
            SUM(cash_out - buy_in) OVER (
                ORDER BY COALESCE(played_at, started_at::DATE)
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_profit
        FROM personal_sessions
        WHERE user_id = auth.uid()
          AND status = 'ended'
          AND cash_out IS NOT NULL
          AND (p_from_date IS NULL OR COALESCE(played_at, started_at::DATE) >= p_from_date)
          AND (p_to_date   IS NULL OR COALESCE(played_at, started_at::DATE) <= p_to_date)
        ORDER BY session_date
    )
    SELECT
        o.session_date,
        i.seed + o.running_profit AS bankroll
    FROM ordered o, initial i;
$$;


-- ─────────────────────────────────────────────────────────────
-- ANALYTICS RPC 6: get_stake_breakdown
--
-- Per-stake performance summary for the filter UI.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stake_breakdown()
RETURNS TABLE (
    stake_level         TEXT,
    session_count       BIGINT,
    total_profit        NUMERIC,
    avg_profit          NUMERIC,
    total_hours         NUMERIC,
    hourly_rate         NUMERIC,
    win_rate_pct        NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        stake_level,
        COUNT(*)::BIGINT                                                        AS session_count,
        ROUND(SUM(cash_out - buy_in), 2)                                        AS total_profit,
        ROUND(AVG(cash_out - buy_in), 2)                                        AS avg_profit,
        ROUND(SUM(total_play_time_seconds) FILTER (WHERE is_analytics_eligible) / 3600.0, 2)
                                                                                AS total_hours,
        ROUND(
            SUM(cash_out - buy_in) FILTER (WHERE is_analytics_eligible) /
            NULLIF(SUM(total_play_time_seconds) FILTER (WHERE is_analytics_eligible) / 3600.0, 0),
        2)                                                                      AS hourly_rate,
        ROUND(100.0 * COUNT(*) FILTER (WHERE cash_out > buy_in) / COUNT(*), 1) AS win_rate_pct
    FROM personal_sessions
    WHERE user_id = auth.uid()
      AND status = 'ended'
      AND cash_out IS NOT NULL
      AND stake_level IS NOT NULL
    GROUP BY stake_level
    ORDER BY total_profit DESC;
$$;


-- ─────────────────────────────────────────────────────────────
-- ANALYTICS RPC 7: get_session_history
--
-- Paginated session history for the history tab.
-- Includes tag names via JSON aggregation.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_session_history(
    p_stake_level   TEXT    DEFAULT NULL,
    p_tag_id        UUID    DEFAULT NULL,
    p_limit         INTEGER DEFAULT 20,
    p_offset        INTEGER DEFAULT 0
)
RETURNS TABLE (
    id                      UUID,
    session_type            TEXT,
    stake_level             TEXT,
    buy_in                  NUMERIC,
    cash_out                NUMERIC,
    profit                  NUMERIC,
    session_date            DATE,
    total_play_time_seconds INTEGER,
    is_analytics_eligible   BOOLEAN,
    notes                   TEXT,
    location                TEXT,
    tags                    JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        ps.id,
        ps.session_type,
        ps.stake_level,
        ps.buy_in,
        ps.cash_out,
        (ps.cash_out - ps.buy_in)                               AS profit,
        COALESCE(ps.played_at, ps.started_at::DATE)             AS session_date,
        ps.total_play_time_seconds,
        ps.is_analytics_eligible,
        ps.notes,
        ps.location,
        -- Aggregate tags as [{id, name, color}, ...]
        COALESCE(
            (
                SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color))
                FROM session_tags st
                JOIN tags t ON t.id = st.tag_id
                WHERE st.personal_session_id = ps.id
            ),
            '[]'::jsonb
        )                                                        AS tags
    FROM personal_sessions ps
    WHERE ps.user_id = auth.uid()
      AND ps.status = 'ended'
      AND ps.cash_out IS NOT NULL
      AND (p_stake_level IS NULL OR ps.stake_level = p_stake_level)
      AND (
          p_tag_id IS NULL
          OR EXISTS (
              SELECT 1 FROM session_tags st
              WHERE st.personal_session_id = ps.id
                AND st.tag_id = p_tag_id
          )
      )
    ORDER BY COALESCE(ps.played_at, ps.started_at::DATE) DESC
    LIMIT p_limit
    OFFSET p_offset;
$$;

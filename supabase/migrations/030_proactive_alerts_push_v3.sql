-- Phase 3 of tier-2 (server-side) proactive alerts: covers the rest of
-- the app's local-only notification vocabulary (see notifications.ts),
-- so every alert the app can raise -- not just the six highest-stakes
-- money ones from Phase 2 -- reaches the owner even with the app closed.
-- The point isn't just "protect the money" narrowly; it's that the app
-- is never silently blind to something going wrong just because nobody
-- happened to have it open. Same "opaque derived numbers only" rule as
-- every column before this: nothing here is a raw transaction, asset
-- name, staff name, or customer detail.

ALTER TABLE cash_position_summary
    ADD COLUMN IF NOT EXISTS overdue_transactions_count       INTEGER,
    ADD COLUMN IF NOT EXISTS overdue_transactions_total        NUMERIC,
    ADD COLUMN IF NOT EXISTS tax_deadline_status                TEXT,
    ADD COLUMN IF NOT EXISTS tax_deadline_days                  INTEGER,
    ADD COLUMN IF NOT EXISTS tax_deadline_date                  TEXT,
    ADD COLUMN IF NOT EXISTS goals_missed_count                 INTEGER,
    ADD COLUMN IF NOT EXISTS goals_off_track_count               INTEGER,
    ADD COLUMN IF NOT EXISTS recurring_overdue_count             INTEGER,
    ADD COLUMN IF NOT EXISTS recurring_due_soon_count             INTEGER,
    ADD COLUMN IF NOT EXISTS budget_period_lapsed                 BOOLEAN,
    ADD COLUMN IF NOT EXISTS budget_current_period                TEXT,
    ADD COLUMN IF NOT EXISTS assets_replacement_count             INTEGER,
    ADD COLUMN IF NOT EXISTS assets_replacement_value             NUMERIC,
    ADD COLUMN IF NOT EXISTS stockout_risk_count                  INTEGER,
    ADD COLUMN IF NOT EXISTS stockout_risk_value                  NUMERIC,
    ADD COLUMN IF NOT EXISTS slow_moving_stock_count              INTEGER,
    ADD COLUMN IF NOT EXISTS slow_moving_stock_value              NUMERIC,
    ADD COLUMN IF NOT EXISTS last_overdue_transactions_notified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_tax_deadline_notified_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_goal_alerts_notified_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_recurring_notified_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_budget_lapsed_notified_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_assets_replacement_notified_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_stockout_risk_notified_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_slow_moving_notified_at          TIMESTAMPTZ;

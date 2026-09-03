-- Phase 2 of tier-2 (server-side) proactive alerts: extends
-- cash_position_summary (see 028_proactive_alerts_push.sql for why this
-- table exists at all -- transactions/loans/invoices are field-encrypted
-- server-side, so only already-derived numbers can be synced) to cover
-- the four highest-stakes "protect the owner's money" alerts that
-- previously only fired locally (while the app was open): overdue invoice
-- reminders, an upcoming loan payment, payroll not yet run, and a tax
-- shortfall. Each gets its own last_*_notified_at throttle column, mirroring
-- the two from 028, so send-proactive-alerts never double-pushes the same
-- warning inside 24 hours.
--
-- loan_payment_due_days/_other_count are deliberately anonymous -- loans.
-- lenderName is itself field-encrypted (see ENCRYPTED_FIELDS.loans in
-- encryption.ts), so the server never learns which lender a payment is
-- due to, only that one is due and how many days away. Same reasoning
-- keeps payroll_period_label to a bare calendar label ("March 2025"),
-- never a staff name or amount.

ALTER TABLE cash_position_summary
    ADD COLUMN IF NOT EXISTS overdue_reminders_count            INTEGER,
    ADD COLUMN IF NOT EXISTS loan_payment_due_days               INTEGER,
    ADD COLUMN IF NOT EXISTS loan_payment_due_other_count         INTEGER,
    ADD COLUMN IF NOT EXISTS payroll_status                       TEXT,
    ADD COLUMN IF NOT EXISTS payroll_days_left                    INTEGER,
    ADD COLUMN IF NOT EXISTS payroll_period_label                 TEXT,
    ADD COLUMN IF NOT EXISTS tax_shortfall                        NUMERIC,
    ADD COLUMN IF NOT EXISTS last_overdue_reminders_notified_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_loan_payment_notified_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_payroll_notified_at             TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_tax_shortfall_notified_at       TIMESTAMPTZ;

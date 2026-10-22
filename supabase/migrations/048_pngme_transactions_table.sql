-- Pngme webhook-ingested transactions used to live only in an in-memory
-- Map inside backend/routes/pngme.js -- correct while that Express process
-- stayed up, but gone on every restart/redeploy, with no way to recover a
-- business's data afterward. Same storage pattern as the 002_payments_table
-- migration (service-role-only: RLS enabled, no public policies, since the
-- only reader today is the backend's own service-role client, not the
-- mobile app directly).
CREATE TABLE IF NOT EXISTS pngme_transactions (
    id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                TEXT NOT NULL,
    pngme_transaction_id   TEXT NOT NULL,
    date                   TIMESTAMP NOT NULL,
    description            TEXT,
    type                   TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category               TEXT,
    amount                 DECIMAL(14, 2) NOT NULL,
    reference              TEXT,
    vendor_customer        TEXT,
    raw_event              JSONB,
    created_at             TIMESTAMP DEFAULT NOW(),
    -- A webhook retry (Pngme resends on a timeout/5xx) must land on the
    -- same row, never a duplicate transaction.
    UNIQUE (user_id, pngme_transaction_id)
);

ALTER TABLE pngme_transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pngme_transactions_user_id ON pngme_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_pngme_transactions_date    ON pngme_transactions(date);

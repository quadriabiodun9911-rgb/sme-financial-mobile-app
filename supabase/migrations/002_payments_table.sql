-- Create payments table to record Paystack/Korapay webhook events
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS payments (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reference   TEXT UNIQUE NOT NULL,
    amount      DECIMAL(12, 2),
    currency    TEXT,
    status      TEXT DEFAULT 'pending',
    email       TEXT,
    paid_at     TIMESTAMP,
    provider    TEXT DEFAULT 'paystack',
    raw_event   JSONB,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Index for fast reference lookups (webhook de-duplication)
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_email     ON payments(email);
CREATE INDEX IF NOT EXISTS idx_payments_status    ON payments(status);

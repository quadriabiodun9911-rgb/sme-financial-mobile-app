-- Waitlist table for Quad360 landing page signups
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS waitlist (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    business    TEXT,
    source      TEXT DEFAULT 'landing',
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Allow public inserts (anyone can join waitlist)
CREATE POLICY "Allow public waitlist signups"
    ON waitlist FOR INSERT
    TO anon
    WITH CHECK (true);

-- Only service role can read waitlist
CREATE POLICY "Service role reads waitlist"
    ON waitlist FOR SELECT
    TO service_role
    USING (true);

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at DESC);

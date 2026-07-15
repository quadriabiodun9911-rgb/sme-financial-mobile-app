-- Cash Pockets table
-- Stores each cash pocket as a JSONB `data` blob keyed by id + user_id,
-- mirroring the loans/budgets tables. Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS cash_pockets (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cash_pockets_user_id_idx ON cash_pockets(user_id);

-- Row Level Security: users can only see and manage their own pockets.
ALTER TABLE cash_pockets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own cash pockets"
    ON cash_pockets FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only insert their own cash pockets"
    ON cash_pockets FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own cash pockets"
    ON cash_pockets FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own cash pockets"
    ON cash_pockets FOR DELETE
    USING (user_id = auth.uid());

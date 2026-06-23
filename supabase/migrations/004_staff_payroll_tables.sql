-- Staff table
CREATE TABLE IF NOT EXISTS staff (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    data        JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own staff"
    ON staff FOR ALL
    TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);

-- Payroll runs table
CREATE TABLE IF NOT EXISTS payroll_runs (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    data        JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own payroll runs"
    ON payroll_runs FOR ALL
    TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_user_id ON payroll_runs(user_id);

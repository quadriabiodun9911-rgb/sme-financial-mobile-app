-- Enable Row Level Security on all tables
-- Run these SQL commands in Supabase SQL editor

-- Enable RLS on existing tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create audit_logs table if not exists
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    details JSONB,
    severity VARCHAR(20) DEFAULT 'low',
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    quantity DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(50),
    cost_price DECIMAL(12, 2) NOT NULL,
    selling_price DECIMAL(12, 2) NOT NULL,
    low_stock_threshold DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS Policies for transactions
CREATE POLICY "Users can only access their workspace transactions"
    ON transactions FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only insert their own transactions"
    ON transactions FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own transactions"
    ON transactions FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own transactions"
    ON transactions FOR DELETE
    USING (user_id = auth.uid());

-- RLS Policies for goals
CREATE POLICY "Users can only access their workspace goals"
    ON goals FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only manage their own goals"
    ON goals FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own goals"
    ON goals FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own goals"
    ON goals FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for settings
CREATE POLICY "Users can only access their own settings"
    ON settings FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only manage their own settings"
    ON settings FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own settings"
    ON settings FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- RLS Policies for invoices
CREATE POLICY "Users can only access their workspace invoices"
    ON invoices FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only manage their own invoices"
    ON invoices FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own invoices"
    ON invoices FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own invoices"
    ON invoices FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for assets
CREATE POLICY "Users can only access their workspace assets"
    ON assets FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only manage their own assets"
    ON assets FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own assets"
    ON assets FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own assets"
    ON assets FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for audit_logs (read-only for users, auto-insert)
CREATE POLICY "Users can only view their own audit logs"
    ON audit_logs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "System can insert audit logs"
    ON audit_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- RLS Policies for inventory
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own inventory"
    ON inventory FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only insert their own inventory"
    ON inventory FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own inventory"
    ON inventory FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own inventory"
    ON inventory FOR DELETE
    USING (user_id = auth.uid());

-- Create indexes for performance and audit trails
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_settings_user_id ON settings(user_id);
CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_assets_user_id ON assets(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_inventory_user_id ON inventory(user_id);

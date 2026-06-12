-- ============================================================================
-- SUPABASE DATABASE MIGRATION FOR FINANCEBOOK
-- ============================================================================
-- This script sets up Row Level Security (RLS) and creates required tables
-- for the FinanceBook mobile app with security features.
--
-- INSTRUCTIONS:
-- 1. Go to https://app.supabase.com
-- 2. Select your "financebook" project
-- 3. Click "SQL Editor" in the left sidebar
-- 4. Click "New Query"
-- 5. Copy and paste ALL content from this file
-- 6. Click "Execute" button
-- 7. Wait for completion (~30 seconds)
-- 8. Verify in "Tables" sidebar - you should see new tables
-- ============================================================================

-- ============================================================================
-- PART 1: ENABLE RLS AND CREATE TABLES
-- ============================================================================

-- Enable RLS on existing tables (these should already exist)
ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS team_members ENABLE ROW LEVEL SECURITY;

-- Create audit_logs table (NEW)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    details JSONB,
    severity VARCHAR(20) DEFAULT 'low',
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Create inventory table (NEW)
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

-- ============================================================================
-- PART 2: RLS POLICIES FOR TRANSACTIONS
-- ============================================================================

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

-- ============================================================================
-- PART 3: RLS POLICIES FOR GOALS
-- ============================================================================

CREATE POLICY "Users can only access their workspace goals"
    ON goals FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only manage their own goals"
    ON goals FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own goals"
    ON goals FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own goals"
    ON goals FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- PART 4: RLS POLICIES FOR SETTINGS
-- ============================================================================

CREATE POLICY "Users can only access their own settings"
    ON settings FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only manage their own settings"
    ON settings FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own settings"
    ON settings FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 5: RLS POLICIES FOR INVOICES
-- ============================================================================

CREATE POLICY "Users can only access their workspace invoices"
    ON invoices FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only manage their own invoices"
    ON invoices FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own invoices"
    ON invoices FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own invoices"
    ON invoices FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- PART 6: RLS POLICIES FOR ASSETS
-- ============================================================================

CREATE POLICY "Users can only access their workspace assets"
    ON assets FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only manage their own assets"
    ON assets FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own assets"
    ON assets FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own assets"
    ON assets FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- PART 7: RLS POLICIES FOR AUDIT_LOGS
-- ============================================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view their own audit logs"
    ON audit_logs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "System can insert audit logs"
    ON audit_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 8: RLS POLICIES FOR INVENTORY
-- ============================================================================

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

-- ============================================================================
-- PART 9: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);

-- ============================================================================
-- PART 10: CREATE 2FA TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS two_factor_auth (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL DEFAULT 'totp',
    status VARCHAR(20) NOT NULL DEFAULT 'disabled',
    secret TEXT,
    phone_number TEXT,
    backup_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    verified_at TIMESTAMP,
    last_used_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS on 2FA table
ALTER TABLE two_factor_auth ENABLE ROW LEVEL SECURITY;

-- 2FA RLS Policies
CREATE POLICY "Users can only access their own 2FA config"
    ON two_factor_auth FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can only manage their own 2FA config"
    ON two_factor_auth FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update their own 2FA config"
    ON two_factor_auth FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete their own 2FA config"
    ON two_factor_auth FOR DELETE
    USING (user_id = auth.uid());

-- Create 2FA verification logs table
CREATE TABLE IF NOT EXISTS two_factor_verification_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Enable RLS on verification logs
ALTER TABLE two_factor_verification_logs ENABLE ROW LEVEL SECURITY;

-- Verification logs RLS Policies
CREATE POLICY "Users can only view their own verification logs"
    ON two_factor_verification_logs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "System can insert verification logs"
    ON two_factor_verification_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 11: CREATE INDEXES FOR 2FA TABLES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_two_factor_auth_user_id ON two_factor_auth(user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_auth_status ON two_factor_auth(status);
CREATE INDEX IF NOT EXISTS idx_two_factor_verification_logs_user_id ON two_factor_verification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_verification_logs_timestamp ON two_factor_verification_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_two_factor_verification_logs_success ON two_factor_verification_logs(success);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- If you see this message without errors, the migration was successful!
-- You should now see these new tables in your Supabase console:
-- - audit_logs
-- - inventory
-- - two_factor_auth
-- - two_factor_verification_logs
-- ============================================================================

-- Create two_factor_auth table for 2FA configurations
CREATE TABLE IF NOT EXISTS two_factor_auth (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL DEFAULT 'totp', -- 'totp' or 'sms'
    status VARCHAR(20) NOT NULL DEFAULT 'disabled', -- 'disabled', 'enabled', 'pending_verification'
    secret TEXT, -- TOTP secret (should be encrypted in app before storing)
    phone_number TEXT, -- SMS phone number (should be encrypted)
    backup_codes TEXT[] DEFAULT ARRAY[]::TEXT[], -- Backup codes for recovery
    created_at TIMESTAMP DEFAULT NOW(),
    verified_at TIMESTAMP,
    last_used_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE two_factor_auth ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own 2FA config
CREATE POLICY "Users can only access their own 2FA config"
    ON two_factor_auth FOR SELECT
    USING (user_id = auth.uid());

-- RLS Policy: Users can manage their own 2FA config
CREATE POLICY "Users can only manage their own 2FA config"
    ON two_factor_auth FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- RLS Policy: Users can update their own 2FA config
CREATE POLICY "Users can only update their own 2FA config"
    ON two_factor_auth FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- RLS Policy: Users can delete their own 2FA config
CREATE POLICY "Users can only delete their own 2FA config"
    ON two_factor_auth FOR DELETE
    USING (user_id = auth.uid());

-- Create index for performance
CREATE INDEX idx_two_factor_auth_user_id ON two_factor_auth(user_id);
CREATE INDEX idx_two_factor_auth_status ON two_factor_auth(status);

-- Create 2FA verification logs table for security auditing
CREATE TABLE IF NOT EXISTS two_factor_verification_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL, -- 'totp', 'sms', 'backup_code'
    success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Enable RLS on verification logs
ALTER TABLE two_factor_verification_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own verification logs
CREATE POLICY "Users can only view their own verification logs"
    ON two_factor_verification_logs FOR SELECT
    USING (user_id = auth.uid());

-- RLS Policy: System can insert verification logs
CREATE POLICY "System can insert verification logs"
    ON two_factor_verification_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Create indexes
CREATE INDEX idx_two_factor_verification_logs_user_id ON two_factor_verification_logs(user_id);
CREATE INDEX idx_two_factor_verification_logs_timestamp ON two_factor_verification_logs(timestamp DESC);
CREATE INDEX idx_two_factor_verification_logs_success ON two_factor_verification_logs(success);

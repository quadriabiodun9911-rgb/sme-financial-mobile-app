-- Row Level Security (RLS) policies for Quad360
--
-- HOW TO RUN:
-- 1. Open your Supabase project dashboard at https://app.supabase.com
-- 2. Navigate to "SQL Editor" in the left sidebar
-- 3. Paste this entire file into a new query
-- 4. Click "Run" (or press Ctrl+Enter / Cmd+Enter)
--
-- These policies ensure each user can only read and write their own data.
-- auth.uid() returns the ID of the currently authenticated Supabase user.
--
-- NOTE: Run this once per environment (dev, staging, production).
-- Re-running is safe — CREATE POLICY will fail if the policy already exists;
-- wrap in DROP POLICY IF EXISTS first if you need to reset.

-- ─── transactions ─────────────────────────────────────────────────────────────
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON transactions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── goals ────────────────────────────────────────────────────────────────────
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON goals
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── invoices ─────────────────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON invoices
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── assets ───────────────────────────────────────────────────────────────────
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON assets
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── loans ────────────────────────────────────────────────────────────────────
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON loans
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── budgets ──────────────────────────────────────────────────────────────────
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON budgets
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── inventory ────────────────────────────────────────────────────────────────
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON inventory
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── settings ─────────────────────────────────────────────────────────────────
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON settings
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── team_members ─────────────────────────────────────────────────────────────
-- Team members table uses owner_user_id (the workspace owner) rather than user_id.
-- Owners can see their team rows; active members can see the row that links them.
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_or_member" ON team_members
  USING (
    owner_user_id = auth.uid()
    OR member_user_id = auth.uid()
  )
  WITH CHECK (owner_user_id = auth.uid());

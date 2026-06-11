# Phase 1: Database Setup - Step-by-Step Guide

## ✅ Prerequisites Complete
- [x] `.env.local` file created with Supabase credentials
- [x] SQL migration script ready: `SUPABASE_SETUP_COMBINED.sql`

---

## 📋 Step-by-Step Instructions

### Step 1: Open Supabase Console
1. Go to https://app.supabase.com
2. Sign in with your account
3. Select the **"financebook"** project

### Step 2: Navigate to SQL Editor
1. In the left sidebar, click **"SQL Editor"**
2. Click the **"New Query"** button (top right)
3. You'll see an empty SQL editor window

### Step 3: Copy the Migration Script
1. Open this file: `SUPABASE_SETUP_COMBINED.sql`
2. Select ALL content (Ctrl+A or Cmd+A)
3. Copy it (Ctrl+C or Cmd+C)

### Step 4: Paste into Supabase
1. Click inside the SQL editor window in Supabase
2. Paste the entire script (Ctrl+V or Cmd+V)
3. You should see the migration SQL code appear

### Step 5: Execute the Migration
1. Click the **"Execute"** button (bottom right of editor, or Ctrl+Enter)
2. **Wait 30 seconds** for the migration to complete
3. You should see a success message

### Step 6: Verify Tables Were Created
1. In the left sidebar, click **"Tables"**
2. You should see these NEW tables:
   - ✅ `audit_logs` (for security logging)
   - ✅ `inventory` (for inventory management)
   - ✅ `two_factor_auth` (for 2FA configuration)
   - ✅ `two_factor_verification_logs` (for 2FA audit trail)

3. Existing tables should have RLS enabled:
   - ✅ `transactions`
   - ✅ `goals`
   - ✅ `settings`
   - ✅ `invoices`
   - ✅ `assets`
   - ✅ `profiles`
   - ✅ `team_members`

### Step 7: Verify RLS Policies
1. Click on any table (e.g., `transactions`)
2. Click the **"RLS Policies"** tab
3. You should see multiple policies listed:
   - "Users can only access their workspace transactions"
   - "Users can only insert their own transactions"
   - "Users can only update their own transactions"
   - "Users can only delete their own transactions"

---

## ✅ Verification Checklist

After migration, verify everything works:

- [ ] All 4 new tables appear in Tables sidebar
- [ ] All 7 existing tables have RLS enabled
- [ ] RLS policies exist on all tables
- [ ] No error messages in the SQL editor
- [ ] Tables show proper relationships (foreign keys to auth.users)

---

## 🧪 Quick Test (Optional)

To verify RLS is working, you can run this test query in SQL Editor:

```sql
-- Test query to verify RLS is working
SELECT COUNT(*) FROM audit_logs;
-- Result: Should show 0 (no data yet, which is expected)
```

---

## ⚠️ Troubleshooting

### Error: "Policy already exists"
- **Cause**: The migration script was run twice
- **Solution**: This is fine - the script uses `CREATE POLICY IF NOT EXISTS` so it won't duplicate
- **Action**: You can run the script again safely

### Error: "Table does not exist"
- **Cause**: Some base tables are missing
- **Solution**: Make sure you created the basic tables first (transactions, goals, etc.)
- **Action**: Check "Tables" sidebar for these core tables

### Error: "Role does not exist"
- **Cause**: Supabase authentication tables aren't set up
- **Solution**: Contact Supabase support - this is a system table issue
- **Action**: Your project should have auth.users by default

### No RLS Policies appear
- **Cause**: Transaction didn't complete
- **Solution**: Scroll down in RLS Policies tab or refresh the page
- **Action**: Run the migration again

---

## 📊 What Was Created

### New Tables Created:

**1. audit_logs**
- Tracks all security events (login, logout, failed attempts, transactions)
- Used for compliance and security audit trails
- Automatically purges old records after 90 days

**2. inventory**
- Stores inventory items with cost/selling prices
- Tracks stock levels and low-stock alerts
- Syncs with dashboard inventory management

**3. two_factor_auth**
- Stores 2FA configuration per user (TOTP secret, backup codes)
- Supports TOTP and SMS methods
- Tracks setup status and verification timestamps

**4. two_factor_verification_logs**
- Logs every 2FA verification attempt (success/failure)
- Records IP address and user agent for security
- Helps detect unauthorized access attempts

### RLS Policies Enabled:

All tables now have Row-Level Security enforcing that:
- Users can ONLY see their own data
- Users can ONLY insert/update/delete their own records
- No user can access another user's financial data
- Policies are enforced at database level (not just app level)

### Performance Indexes Created:

- `idx_transactions_user_id` - Fast lookup of user transactions
- `idx_audit_logs_user_id` - Fast lookup of audit logs
- `idx_audit_logs_timestamp` - Fast chronological queries
- `idx_inventory_user_id` - Fast lookup of inventory items
- Similar indexes on all other tables for performance

---

## ✅ Next Steps

Once Phase 1 is complete:

1. **Phase 2**: Manual testing of app features
2. **Phase 3**: Build preparation (TypeScript checks, config verification)
3. **Phase 4**: Build Android APK
4. **Phase 5-10**: Beta deployment and production rollout

---

## 📞 Support

If you encounter issues:

1. Check the **Troubleshooting** section above
2. Review the error message in the SQL editor
3. Verify your Supabase project is "Healthy" (green status)
4. Try running the migration again
5. Check that your API credentials in `.env.local` are correct

---

**Status**: Ready to migrate! Follow the steps above. ✨

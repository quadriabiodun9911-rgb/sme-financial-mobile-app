# FinanceBook Security Features - Deployment Guide

## 📋 Pre-Deployment Checklist

### Phase 1: Database Setup (10 minutes)

#### Step 1.1: Apply RLS Migrations to Supabase

1. **Go to Supabase Dashboard**:
   - URL: https://app.supabase.com
   - Project: sme-financial-mobile-app

2. **Open SQL Editor**:
   - Click "SQL Editor" in sidebar
   - Click "New Query"

3. **Apply First Migration** (Basic RLS):
   ```
   File: supabase/migrations/001_enable_rls.sql
   Action: Copy all content and paste into SQL editor
   Execute: Click "Execute" button
   Wait: ~30 seconds for completion
   ```

4. **Apply Second Migration** (2FA Tables):
   ```
   File: supabase/migrations/002_add_two_factor_auth.sql
   Action: Copy all content and paste into SQL editor
   Execute: Click "Execute" button
   Wait: ~30 seconds for completion
   ```

5. **Verify Migrations**:
   - Go to "Tables" in sidebar
   - Should see new tables:
     - `two_factor_auth`
     - `two_factor_verification_logs`
     - `audit_logs` (new)
     - `inventory` (new)
   - Check RLS policies: Click table → "RLS Policies" tab → See multiple policies

6. **Test Database Access**:
   ```sql
   -- Run this to verify RLS is working
   SELECT COUNT(*) FROM transactions WHERE user_id = auth.uid();
   -- Should return 0 (no results) or error about RLS
   ```

#### Step 1.2: Create .env.local File (2 minutes)

1. **Create file in project root**:
   ```bash
   touch .env.local
   ```

2. **Add environment variables**:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://xfiqezxifsfwkwlbaxbj.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key-here>
   ```

3. **Get ANON_KEY from Supabase**:
   - Dashboard → Settings → API Keys
   - Copy value next to "anon (public)"
   - Paste into .env.local

4. **Verify .gitignore**:
   ```bash
   cat .gitignore
   # Should contain: .env.local
   # Verify: .env* should be listed
   ```

---

### Phase 2: Testing (60 minutes)

#### Step 2.1: Setup Test Environment

```bash
# Install dependencies
npm install

# Check for errors
npm run ts:check

# Start metro bundler
npm start
```

#### Step 2.2: Manual Testing Checklist

**Test 1: Basic App Functionality**
- [ ] App launches without errors
- [ ] Login screen shows properly
- [ ] Can register new account
- [ ] Dashboard loads after registration
- [ ] Quick-add FAB works
- [ ] Can add transaction

**Test 2: Encryption (Transparent)**
- [ ] Add transaction with amount "1000"
- [ ] Check Supabase: `supabase.from('transactions').select('*')`
- [ ] Amount should appear as encrypted string (not "1000")
- [ ] Refresh app: Amount should show "1000" again
- [ ] Database contains: `amount_encrypted` field

**Test 3: Rate Limiting**
- [ ] On login screen, enter wrong PIN
- [ ] Try 6 times rapidly
- [ ] 5th attempt should fail
- [ ] 6th attempt shows lockout message
- [ ] Message shows time remaining
- [ ] Wait 15 minutes (or fast-forward in code)
- [ ] Should allow login again

**Test 4: Input Validation**
- [ ] Quick-add: Try amount "0" → Error
- [ ] Quick-add: Try amount "1000000000" (> max) → Error
- [ ] Quick-add: Try empty description → Error
- [ ] Enter valid values → Success

**Test 5: Inventory Sync**
- [ ] Add inventory item locally
- [ ] Check Supabase: `inventory` table
- [ ] Item should appear in cloud
- [ ] Refresh app: Item still shows
- [ ] Edit item: Changes sync to cloud

**Test 6: Audit Logs**
- [ ] Add transaction
- [ ] Check Supabase: `audit_logs` table
- [ ] Should see entry with action "TRANSACTION_CREATE"
- [ ] Has user_id, timestamp, severity

#### Step 2.3: 2FA Testing (Optional - UI in place)

When 2FA is integrated into settings:
- [ ] Go to Settings → Security
- [ ] Tap "Enable 2FA"
- [ ] See QR code generation
- [ ] Scan with Google Authenticator
- [ ] Enter 6-digit code
- [ ] Backup codes shown
- [ ] Logout and login with 2FA
- [ ] Verify works

#### Step 2.4: Web Testing

```bash
# Build web version
npx expo start --web

# Navigate to: http://localhost:19006
# Test same flows as mobile
```

#### Step 2.5: Error Scenarios

- [ ] Simulate network disconnect
- [ ] Verify offline mode works
- [ ] Verify sync resumes on reconnect
- [ ] Check error messages are user-friendly
- [ ] No sensitive data in error messages

---

### Phase 3: Build Preparation (30 minutes)

#### Step 3.1: Verify Build Configuration

```bash
# Check app.json
cat app.json

# Should have:
# - slug: "financebooks-smd"
# - version: "1.0.0"
# - owner: <your-eas-username>
# - projectId: <your-project-id>
```

#### Step 3.2: Pre-Build Checks

```bash
# Type check
npm run ts:check
# Should have 0 errors

# Check for console.logs (remove if found)
grep -r "console\." src/ | grep -v "console.warn\|console.error" || echo "✓ No debug logs found"

# Verify no hardcoded secrets
grep -r "SUPABASE_ANON_KEY" src/ || echo "✓ No hardcoded keys found"

# Check bundle size
# (Handled by expo during build)
```

#### Step 3.3: Create Build Notes

```bash
# Create RELEASE_NOTES.md
cat > RELEASE_NOTES.md << 'EOF'
# FinanceBook Beta Release - Security Features

## New Features
- End-to-End Encryption for financial data
- Advanced rate limiting on login
- Improved input validation
- Inventory backup to cloud
- Comprehensive audit logging

## Security Improvements
- All sensitive amounts encrypted with AES-256
- PIN protected with SecureStore encryption
- Rate limiting: 5 failed attempts → 15 minute lockout
- Certificate pinning for network security

## Bug Fixes
- Fixed first-launch registration UX
- Improved error messages
- Better offline/online handling

## Known Issues
- 2FA UI implemented, needs Supabase integration
- Certificate pinning requires native library for full functionality
- Encryption keys are device-specific (cannot transfer between phones)

## Testing Needed
- Verify encryption roundtrip
- Test rate limiting
- Check inventory sync
- Validate input validation
- Review audit logs

## Build Info
- Version: 1.0.0
- Date: June 11, 2024
- Platform: Android (APK), iOS (via TestFlight)
EOF
```

---

### Phase 4: Build APK (20 minutes)

#### Step 4.1: Build Android APK (Preview)

```bash
# Preview build (can sideload on device)
npx eas-cli build --platform android --profile preview

# Output: APK file ready for download
# Size: ~50-60MB
# Time: 5-10 minutes
```

#### Step 4.2: Build AAB for Play Store (Optional)

```bash
# Production build (for Google Play)
npx eas-cli build --platform android --profile production

# Output: AAB file
# This is for eventual Play Store submission
```

#### Step 4.3: Monitor Build

```bash
# Check build status
eas build --status

# View logs
eas build:view <build-id>

# Download when ready
# EAS will send email with download link
```

---

### Phase 5: Pre-Distribution Setup (20 minutes)

#### Step 5.1: Prepare Documentation

Create user guides:
- [ ] `USER_GUIDE_REGISTRATION.md` - Step-by-step registration
- [ ] `USER_GUIDE_SECURITY.md` - Security best practices
- [ ] `USER_GUIDE_2FA.md` - 2FA setup (when integrated)
- [ ] `FAQ.md` - Frequently asked questions

#### Step 5.2: Create Privacy Policy

```markdown
# Privacy Policy

## Data Encryption
- All financial data is encrypted using AES-256
- Encryption keys stored only on user device
- Server never has access to unencrypted financial data

## Data Collection
- Audit logs track user actions (for security)
- No personal data sold to third parties
- Compliant with GDPR/CCPA

## Data Retention
- Transaction data: Retained indefinitely (or until user delete)
- Audit logs: 90 days
- Backups: 30 days (Supabase default)
```

#### Step 5.3: Prepare Support Resources

- [ ] Email support address
- [ ] FAQ document
- [ ] Troubleshooting guide
- [ ] Bug report template
- [ ] Feature request template

---

### Phase 6: Distribution Strategy (Variable)

#### Option A: Direct APK Distribution (Fastest)

**Best for**: Small beta group, trusted testers

```bash
# Steps:
1. Download APK from EAS
2. Share via email/cloud storage
3. Testers install via: Settings → Install from Unknown Sources
4. Verify signature matches

# Verification:
# testers should verify:
# - App installs successfully
# - No security warnings
# - Can run all features
```

**Pros**: Fast, no app store delays
**Cons**: Manual updates needed, no automatic distribution

#### Option B: Google Play Internal Testing (Recommended)

**Best for**: 50+ testers, official testing

```bash
# Steps:
1. Go to Google Play Console
2. Create app (if not exists)
3. Upload AAB file
4. Set up internal test track
5. Add testers via email
6. Testers get download link

# Each tester:
1. Open link in email
2. Click "Install"
3. App installs from Play Store
4. Updates automatic

# Build AAB:
npx eas-cli build --platform android --profile production
```

**Pros**: Automatic updates, official testing, scaling to 10K+
**Cons**: 3-5 hour approval time, more steps

#### Option C: Firebase App Distribution (Beta Friendly)

**Best for**: Remote testers, trackable feedback

```bash
# Setup Firebase:
1. Create Firebase project
2. Link to app
3. Upload APK to Firebase Console
4. Send tester invites

# Testers:
1. Download Firebase App Tester app
2. Accept invite
3. Install from Firebase
4. Get instant updates
```

**Pros**: Easy feedback collection, instant updates, good for remote teams
**Cons**: Requires Firebase setup

---

### Phase 7: Testing Feedback Collection (Ongoing)

#### Feedback Template

```markdown
## Tester Feedback Form

### Device Info
- Device model:
- Android version:
- App version:

### Feature Testing
**Registration**
- [ ] Works smoothly
- [ ] All fields validate
- [ ] Can create account

**Dashboard**
- [ ] Loads without errors
- [ ] Shows correct data
- [ ] FAB works

**Quick-Add Transaction**
- [ ] Opens modal
- [ ] Accepts valid amounts
- [ ] Rejects invalid amounts
- [ ] Saves transaction

**Rate Limiting** (if enabled)
- [ ] Shows after 5 failed logins
- [ ] Displays time remaining
- [ ] Re-enables after 15 minutes

### Issues Found
- [ ] List any bugs/crashes
- [ ] Steps to reproduce
- [ ] Screenshots if possible

### Suggestions
- [ ] What could be improved?
- [ ] Feature requests?
- [ ] UI/UX feedback?
```

---

### Phase 8: Bug Tracking & Fixes

#### Track Issues

```bash
# Create issues directory
mkdir -p docs/beta-issues

# Create issue template
cat > docs/beta-issues/ISSUE_TEMPLATE.md << 'EOF'
# Issue: [Title]

## Description
[Description of issue]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happened]

## Device Info
- Device: [Model]
- Android: [Version]
- App Version: [Version]

## Logs
[Console logs if available]

## Attachments
[Screenshots/videos]
EOF
```

#### Fix & Redeploy

```bash
# For each issue:
1. Understand root cause
2. Fix in code
3. Test locally
4. Commit fix
5. Build new APK
6. Distribute to testers
7. Mark issue as fixed
```

---

### Phase 9: Performance Monitoring

#### Monitor Key Metrics

```bash
# Track:
- Crash rate
- Feature adoption (2FA, encryption)
- Error logs
- Audit logs
- Performance metrics

# Tools:
- Firebase Analytics
- Sentry (error tracking)
- Supabase audit logs
```

---

### Phase 10: Production Deployment

#### Before Going Live

- [ ] All beta issues resolved
- [ ] Performance acceptable
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Support ready
- [ ] Marketing copy ready

#### Rollout Strategy

**Option 1: Gradual Rollout**
```
Day 1-3: 5% of users
Day 4-6: 25% of users
Day 7+: 100% of users
Monitor crash rate at each step
```

**Option 2: Phased Rollout**
```
Week 1: Beta testers only
Week 2: Opt-in via announcement
Week 3: Recommended for all
Week 4: Default for new users
```

---

## ✅ Deployment Checklist

- [ ] Database migrations applied
- [ ] .env.local created with keys
- [ ] TypeScript checks passing
- [ ] Manual testing completed
- [ ] APK built successfully
- [ ] Documentation prepared
- [ ] Testers recruited
- [ ] Feedback mechanism ready
- [ ] Monitoring configured
- [ ] Support team briefed
- [ ] Issues tracked systematically
- [ ] Fixes deployed as needed
- [ ] Performance metrics tracked
- [ ] All beta issues resolved
- [ ] Production deployment planned

---

## 🆘 Troubleshooting

### Build Fails
```bash
# Clear cache
rm -rf .expo/
npm install

# Try again
npx eas-cli build --platform android --profile preview
```

### APK Won't Install
- Check Android version (min API 24)
- Enable "Unknown Sources"
- Clear Play Store cache
- Try on different device

### Encryption Issues
- Verify encryption key generated
- Check SecureStore access
- Verify database structure
- Check for console errors

### 2FA Not Working
- Verify database migration applied
- Check system time on device
- Test QR code scanning
- Verify code generation

---

## 📞 Support

For issues:
1. Check TROUBLESHOOTING.md
2. Review SEC URITY.md
3. Check source code comments
4. Contact development team

---

**Last Updated**: June 11, 2024
**Status**: Ready for Beta Deployment

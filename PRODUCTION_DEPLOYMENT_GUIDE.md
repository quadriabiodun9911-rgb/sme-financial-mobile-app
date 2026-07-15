# Quad360 SME Financial App - Production Deployment Guide

**App Name:** Quad360  
**Platforms:** iOS, Android, Web  
**Owner:** quadriabiodun9911  
**Status:** Ready for Production Deployment

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure:

- [ ] All code committed and pushed to `main` branch
- [ ] Supabase project created and configured
- [ ] Vercel account created and connected to GitHub
- [ ] Apple Developer account (for iOS)
- [ ] Google Play Developer account (for Android)
- [ ] Production environment variables prepared
- [ ] Expo EAS account configured

---

## 🔧 Part 1: Setup Production Environment Variables

### Step 1.1: Create `.env.local` for Production

```bash
cd /home/user/sme-financial-mobile-app
cp .env.example .env.local
```

### Step 1.2: Configure for Production

Edit `.env.local` with production values:

```env
# ============================================================================
# SUPABASE (REQUIRED - get from Supabase Dashboard)
# ============================================================================
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================================================
# PAYMENT GATEWAYS (REQUIRED for production features)
# ============================================================================
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxxxxxxxxxx
EXPO_PUBLIC_KORAPAY_PUBLIC_KEY=pk_live_xxxxxxxxxxxxxxxx

# ============================================================================
# PNGME MOBILE MONEY (Optional for Android payments)
# ============================================================================
EXPO_PUBLIC_PNGME_SDK_TOKEN_PROD=your-production-token
PNGME_API_KEY=your-production-api-key

# ============================================================================
# ANALYTICS & MONITORING (Optional but recommended)
# ============================================================================
EXPO_PUBLIC_POSTHOG_KEY=phc_your_posthog_project_api_key
EXPO_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# ============================================================================
# FEATURE FLAGS (Production settings)
# ============================================================================
EXPO_PUBLIC_USE_NEW_COMPONENTS=true
EXPO_PUBLIC_ENABLE_FINANCING=true
EXPO_PUBLIC_ENABLE_TEAM=true
EXPO_PUBLIC_ENABLE_REPORTS=true

# ============================================================================
# DEBUG (Disable in production)
# ============================================================================
EXPO_PUBLIC_DEBUG_LOGGING=false
EXPO_PUBLIC_MOCK_DATA=false
```

### Step 1.3: Verify Environment Setup

```bash
# Test that env vars are loaded
npm run ts:check

# Should see no errors
```

---

## 🔐 Part 2: Supabase Production Setup

### Step 2.1: Create Production Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Fill in:
   - **Project Name:** `quad360-prod`
   - **Database Password:** Strong password (save securely)
   - **Region:** Closest to your users
4. Click "Create new project"
5. Wait 2-3 minutes for project to initialize

### Step 2.2: Get Credentials

From Supabase Dashboard → Settings → API:

- Copy **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- Copy **anon public** key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Step 2.3: Configure Database Tables

Your app uses these tables. Supabase should auto-create them:

```sql
-- Users (managed by Supabase Auth)
auth.users

-- Business data
public.transactions
public.invoices
public.finances
public.budgets
public.goals
public.assets
public.loans
public.inventory

-- Financial analysis
public.financial_assessments
public.action_tactics
public.goal_milestones
public.outcome_tracking
```

### Step 2.4: Set Row Level Security (RLS)

Go to Supabase Dashboard → SQL Editor → Run:

```sql
-- Enable RLS on all tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE finances ENABLE ROW LEVEL SECURITY;

-- Example: Users can only see their own data
CREATE POLICY "Users can only see own transactions" 
ON transactions FOR SELECT 
USING (auth.uid() = user_id);

-- Repeat for other tables...
```

### Step 2.5: Configure Backups

Supabase → Settings → Backups:
- Enable automated daily backups
- Set retention to 30 days minimum

### Step 2.6: Enable Auth Providers (Optional)

Supabase → Authentication → Providers:
- [ ] Email/Password (already enabled)
- [ ] Google OAuth
- [ ] GitHub OAuth
- [ ] WhatsApp (via third-party)

---

## 📱 Part 3: Mobile Deployment (iOS & Android)

### Step 3.1: Install EAS CLI

```bash
npm install -g eas-cli
```

### Step 3.2: Authenticate with Expo

```bash
eas login
# Enter Expo credentials: quadriabiodun9911
```

### Step 3.3: Verify EAS Project Configuration

```bash
# Check if project is linked
eas project info

# Should show:
# Project ID: 5577b2eb-04eb-4a01-bfad-6412b3cf1e29
# Slug: financebooks-smd
```

### Step 3.4: Create EAS Config Files

Create `eas.json`:

```json
{
  "cli": {
    "version": ">= 7.0.0",
    "promptToConfigurePushNotifications": false
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "distribution": "store"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "GET_FROM_APPLE",
        "appleTeamId": "GET_FROM_APPLE"
      },
      "android": {
        "googleServiceAccountKeyPath": "./google-play-key.json"
      }
    }
  }
}
```

### Step 3.5: Setup iOS Deployment

#### Option A: Automatic (Easier)

```bash
# EAS handles provisioning profiles automatically
eas build --platform ios --auto-submit
```

#### Option B: Manual (Full Control)

1. **Create Apple App**
   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Create new app:
     - Bundle ID: `com.quad360.sme`
     - SKU: `quad360-sme-v1`
     - Name: `Quad360`
     - Category: Finance

2. **Get App Store Credentials**
   ```bash
   eas credentials
   # Follow prompts, select iOS
   # Provide Apple ID and password
   ```

3. **Build for iOS**
   ```bash
   eas build --platform ios --type release
   # Wait 10-15 minutes for build to complete
   ```

4. **Submit to App Store**
   ```bash
   eas submit --platform ios --latest
   # Review and submit from App Store Connect
   ```

### Step 3.6: Setup Android Deployment

#### Step 1: Create Google Play Project

1. Go to [Google Play Console](https://play.google.com/console)
2. Create new app:
   - Name: `Quad360`
   - Default language: English
   - App or game: App
   - Category: Finance

#### Step 2: Get Google Service Account Key

1. Google Play Console → Settings → App Access
2. Service accounts → Click service account
3. Download JSON key file
4. Save as `google-play-key.json` in project root

#### Step 3: Build for Android

```bash
eas build --platform android --type release
# Wait 10-15 minutes for build to complete
```

#### Step 4: Submit to Play Store

```bash
eas submit --platform android --latest
# Requires Google Play Store listing to be configured
```

### Step 3.7: Monitor Build Progress

```bash
# Watch build logs
eas build --platform ios --watch
eas build --platform android --watch

# Check build status
eas build:list
```

### Step 3.8: Test Before Submission

```bash
# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Test with production environment variables
npm run build:web
```

---

## 🌐 Part 4: Web Deployment (Vercel)

### Step 4.1: Export Web Build

```bash
# Create optimized web build
expo export --platform web

# Output in dist/ folder
```

### Step 4.2: Create Vercel Configuration

Create `vercel.json`:

```json
{
  "buildCommand": "expo export --platform web",
  "outputDirectory": "dist",
  "env": {
    "EXPO_PUBLIC_SUPABASE_URL": "@supabase_url_prod",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "@supabase_key_prod",
    "EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY": "@paystack_key_prod",
    "EXPO_PUBLIC_KORAPAY_PUBLIC_KEY": "@korapay_key_prod"
  },
  "redirects": [
    {
      "source": "/(.*)",
      "destination": "/index.html",
      "permanent": false
    }
  ]
}
```

### Step 4.3: Setup Vercel

1. **Connect to Vercel**
   ```bash
   npm i -g vercel
   vercel --prod
   ```

2. **Or via GitHub**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Select GitHub repo: `sme-financial-mobile-app`
   - Configure:
     - Framework: Other
     - Build command: `expo export --platform web`
     - Output directory: `dist`

3. **Add Environment Variables**
   - Vercel Dashboard → Settings → Environment Variables
   - Add all variables from `.env.local`:
     - `EXPO_PUBLIC_SUPABASE_URL`
     - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
     - `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`
     - etc.

### Step 4.4: Configure Domain

```bash
# Set custom domain (optional)
vercel domains add quad360.com
# Follow DNS configuration instructions
```

### Step 4.5: Deploy

```bash
# Automatic deployment on git push to main
# Or manual deploy:
vercel --prod

# URL: https://sme-financial-mobile-app.vercel.app
```

---

## 🧪 Part 5: Testing Before Going Live

### Step 5.1: Test on Real Devices

**iOS:**
```bash
# Build for TestFlight
eas build --platform ios --type simulator

# Share with testers on TestFlight
```

**Android:**
```bash
# Build for internal testing
eas build --platform android --type apk

# Share APK file for testing
```

**Web:**
```bash
# Test at https://sme-financial-mobile-app.vercel.app
# Test all features, especially:
# - Bank statement import
# - Transaction creation
# - Reports generation
# - Payment integrations
```

### Step 5.2: Checklist

- [ ] User authentication works
- [ ] Bank statement import working
- [ ] Transactions display correctly
- [ ] Reports generate accurately
- [ ] Payments process (Paystack/Korapay)
- [ ] Mobile app responsive
- [ ] Web version responsive
- [ ] No console errors
- [ ] Load times acceptable (<3s)
- [ ] Analytics tracking working (if configured)

---

## 🚀 Part 6: Production Launch Checklist

### Before Going Live

- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Environment variables set for production
- [ ] Supabase backups enabled
- [ ] App Store listing complete (iOS)
- [ ] Google Play listing complete (Android)
- [ ] Privacy Policy published
- [ ] Terms of Service published
- [ ] Support contact configured
- [ ] Monitoring/alerts configured (Sentry/PostHog)
- [ ] Rate limiting configured
- [ ] Security headers set on Vercel
- [ ] CORS configured properly
- [ ] Error handling tested
- [ ] Database backups configured
- [ ] SSL certificates validated

### Security Hardening

```bash
# Update all dependencies
npm update
npm audit

# Check for vulnerabilities
npm audit fix

# Run security scan
# npx snyk test
```

### Performance Optimization

```bash
# Check bundle size
npm run build:web
# Should be < 10MB

# Test with throttling in DevTools
# Simulate slow 3G
```

---

## 📊 Part 7: Post-Deployment Monitoring

### Enable Production Monitoring

#### Sentry (Error Tracking)
```bash
# Create account at sentry.io
# Get DSN and add to .env.local
EXPO_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/yyy
```

#### PostHog (Analytics)
```bash
# Create account at posthog.com
# Get API key and add to .env.local
EXPO_PUBLIC_POSTHOG_KEY=phc_xxx
```

### Monitor Metrics

**Daily Checks:**
- [ ] App crashes/errors from Sentry
- [ ] User analytics from PostHog
- [ ] Performance metrics (load time, API response)
- [ ] Supabase database usage
- [ ] Payment transaction volume

**Weekly:**
- [ ] Review user feedback
- [ ] Check error trends
- [ ] Review performance bottlenecks
- [ ] Update dependencies if needed

**Monthly:**
- [ ] Security audit
- [ ] Database optimization
- [ ] Backup verification
- [ ] User growth trends

---

## 📝 Part 8: Version Management & Updates

### Versioning Strategy

```json
{
  "version": "1.0.0",
  "expo": {
    "ios": { "buildNumber": "1" },
    "android": { "versionCode": 1 }
  }
}
```

### Update Procedure

1. **Bump Version**
   ```bash
   # Major.Minor.Patch
   # 1.0.0 → 1.0.1 (patch fix)
   # 1.0.0 → 1.1.0 (feature)
   # 1.0.0 → 2.0.0 (breaking change)
   ```

2. **Update app.json**
   ```json
   {
     "version": "1.0.1",
     "ios": { "buildNumber": "2" },
     "android": { "versionCode": 2 }
   }
   ```

3. **Commit and Tag**
   ```bash
   git add -A
   git commit -m "Release v1.0.1"
   git tag v1.0.1
   git push origin main
   git push origin v1.0.1
   ```

4. **Build and Submit**
   ```bash
   eas build --platform ios --type release
   eas build --platform android --type release
   eas submit --platform ios --latest
   eas submit --platform android --latest
   ```

---

## 🆘 Troubleshooting

### Build Failures

**iOS:**
```bash
# Clear cache and rebuild
rm -rf ~/Library/Developer/Xcode/DerivedData/*
eas build --platform ios --type release --clear-cache
```

**Android:**
```bash
# Clear gradle cache
./gradlew clean
eas build --platform android --type release --clear-cache
```

### Deployment Issues

| Issue | Solution |
|-------|----------|
| Auth not working | Verify Supabase credentials in .env.local |
| Transactions not syncing | Check Supabase database connection |
| Payments failing | Verify Paystack/Korapay keys are live keys |
| Web build too large | Run `npm run analyze` to check bundle |
| Build timeout | Increase timeout in eas.json or rebuild |

### Getting Help

- **Expo Issues:** [expo.dev/help](https://expo.dev/help)
- **Supabase Issues:** [supabase.com/support](https://supabase.com/support)
- **Vercel Issues:** [vercel.com/help](https://vercel.com/help)

---

## 📞 Support & Maintenance

### Emergency Contacts

- **Expo:** support@expo.dev
- **Supabase:** support@supabase.io
- **Vercel:** support@vercel.com
- **App Store:** developer.apple.com/support
- **Google Play:** support.google.com/googleplay

### Rollback Procedure

If production deployment has critical issues:

```bash
# Revert to previous version
git revert HEAD
git push origin main

# Rebuild from previous commit
git checkout v1.0.0
eas build --platform ios
eas build --platform android
eas submit --platform ios --latest
eas submit --platform android --latest
```

---

## ✅ Deployment Complete!

Once all steps are complete:

1. ✅ **Mobile App** - Available on App Store & Google Play
2. ✅ **Web App** - Available at Vercel URL
3. ✅ **Backend** - Running on Supabase Production
4. ✅ **Monitoring** - Sentry & PostHog tracking active
5. ✅ **Updates** - Automated via Expo Updates

---

## 📋 Post-Launch Maintenance

### Week 1
- Monitor app crashes
- Respond to user feedback
- Fix critical bugs immediately
- Check analytics dashboard

### Month 1
- Gather user feedback
- Optimize slow features
- Plan next release
- Monitor server usage

### Ongoing
- Regular security updates
- Performance monitoring
- User support
- Feature iterations

---

**Deployment Guide Created:** 2026-07-15  
**Next Review:** 2026-08-15  
**Status:** Ready for Production 🚀

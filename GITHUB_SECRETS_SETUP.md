# GitHub Secrets Setup Guide

Step-by-step guide to configure GitHub secrets for CI/CD pipeline.

## Overview

GitHub Secrets are encrypted environment variables used by GitHub Actions to deploy your app.

**Never commit secrets to git!** They should only exist in GitHub's secure storage.

## Required Secrets

| Secret | Value | Source |
|--------|-------|--------|
| VERCEL_TOKEN | Your Vercel API token | https://vercel.com/account/tokens |
| VERCEL_ORG_ID | Your Vercel team ID | https://vercel.com/account/settings |
| VERCEL_PROJECT_ID | Production project ID | Vercel project settings |
| VERCEL_PROJECT_ID_STAGING | Staging project ID | Vercel staging project settings |
| EXPO_PUBLIC_SUPABASE_URL | Supabase project URL | Supabase dashboard > Settings > API |
| EXPO_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key | Supabase dashboard > Settings > API |

## Step 1: Get Vercel Token

1. Go to https://vercel.com/account/tokens
2. Click "Create Token"
3. Name: `GitHub Actions`
4. Scope: Full access
5. Expiration: Never
6. Click "Create"
7. Copy the token (you won't see it again!)

## Step 2: Get Vercel IDs

**VERCEL_ORG_ID:**
1. Go to https://vercel.com/account/settings
2. Scroll to "Team ID"
3. Copy it

**VERCEL_PROJECT_ID (Production):**
1. Go to https://vercel.com/dashboard
2. Click on `quad360` project
3. Click "Settings" (top right)
4. Scroll to "Project ID"
5. Copy it

**VERCEL_PROJECT_ID_STAGING:**
1. Go to https://vercel.com/dashboard
2. Click on `quad360-staging` project
3. Click "Settings" (top right)
4. Scroll to "Project ID"
5. Copy it

## Step 3: Get Supabase Credentials

**EXPO_PUBLIC_SUPABASE_URL:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click "Settings" > "API"
4. Copy "Project URL"

**EXPO_PUBLIC_SUPABASE_ANON_KEY:**
1. Same page as above
2. Copy "Anon public key"

## Step 4: Add Secrets to GitHub

### Using GitHub CLI (Recommended)

```bash
# Clone your repository first
cd /path/to/sme-financial-mobile-app

# Add all secrets
gh secret set VERCEL_TOKEN --body "your-token"
gh secret set VERCEL_ORG_ID --body "your-org-id"
gh secret set VERCEL_PROJECT_ID --body "your-prod-id"
gh secret set VERCEL_PROJECT_ID_STAGING --body "your-staging-id"
gh secret set EXPO_PUBLIC_SUPABASE_URL --body "your-supabase-url"
gh secret set EXPO_PUBLIC_SUPABASE_ANON_KEY --body "your-anon-key"

# Verify secrets were added
gh secret list
```

### Using GitHub Web UI

1. Go to your GitHub repository
2. Click "Settings" tab
3. Click "Secrets and variables" > "Actions"
4. Click "New repository secret"
5. Enter secret name and value
6. Click "Add secret"
7. Repeat for each secret

## Step 5: Verify Secrets

**Using GitHub CLI:**
```bash
gh secret list
```

Should show:
```
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
VERCEL_PROJECT_ID_STAGING
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

**Using GitHub Web UI:**
1. Repository Settings > Secrets and variables > Actions
2. Should see all 6 secrets listed

## Step 6: Test Secrets

1. Push a change to your repository
2. Go to "Actions" tab
3. Watch the workflow run
4. Check if it successfully accesses secrets

If any secret is wrong:
1. Update it in GitHub
2. Push a new commit
3. GitHub Actions will retry

## Important Notes

### Secret Security

- ✅ Secrets are encrypted
- ✅ Only visible during workflow execution
- ✅ Never logged to console
- ✅ Safe to use for sensitive values

- ❌ Never commit secrets to git
- ❌ Never share secret values
- ❌ Never put secrets in code

### Updating Secrets

1. Go to Settings > Secrets and variables > Actions
2. Click on the secret
3. Click "Update"
4. Enter new value
5. Click "Update secret"

Next workflow run will use the updated secret.

### Rotating Secrets

**Best practice: Rotate secrets quarterly**

1. Generate new token in Vercel
2. Update VERCEL_TOKEN in GitHub
3. Delete old token in Vercel
4. Test deployment works

## Troubleshooting

### "Secret not found" Error

- Verify secret name matches exactly (case-sensitive)
- Check secret was added to correct repository
- Workflow uses: `${{ secrets.SECRET_NAME }}`

### Build Fails with Env Var Undefined

```
error: EXPO_PUBLIC_SUPABASE_URL is undefined
```

Solution:
1. Check secret is added to GitHub
2. Check variable name matches exactly
3. Verify Supabase URL is correct
4. Check it's in correct environment (Production)

### Deployment Fails After Secret Update

1. Secret was updated in GitHub
2. Next push to repository
3. GitHub Actions reruns workflow
4. Should work on next attempt

## Security Best Practices

1. **Rotate secrets** every 90 days
2. **Limit scope** of tokens (only what's needed)
3. **Monitor usage** in Vercel dashboard
4. **Revoke immediately** if compromised
5. **Never share** secret values with anyone
6. **Don't commit** .env files to git
7. **Use branch protection** to require reviews
8. **Enable 2FA** on GitHub and Vercel accounts

## What's Next

✅ Secrets configured in GitHub  
✅ CI/CD pipeline ready  
✅ Auto-deployment enabled

Next steps:
1. Push code to test deployment
2. Monitor GitHub Actions
3. Verify app deploys to Vercel
4. Check production URL works

---

**Status:** ✅ Complete  
**Last Updated:** June 28, 2026

🔐 **GitHub secrets securely configured!**

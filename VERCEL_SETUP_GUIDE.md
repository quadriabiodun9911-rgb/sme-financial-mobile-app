# Vercel Setup Guide

Step-by-step guide to set up Vercel for Quad360.

## Step 1: Create Vercel Account

1. Go to https://vercel.com
2. Sign up or log in
3. Verify email

## Step 2: Connect GitHub

1. Go to https://vercel.com/dashboard
2. Click "Add New Project"
3. Click "Import Git Repository"
4. Search for your repository
5. Click "Import"

## Step 3: Configure Project

### Build Settings

- **Project Name:** quad360 (or your preferred name)
- **Framework Preset:** Other
- **Build Command:** `bash build.sh`
- **Output Directory:** `dist`
- **Install Command:** `npm ci`

### Environment Variables

Click "Add Environment Variable" for each:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Select environments:
- ✅ Production
- ✅ Preview
- ✅ Development

### Click "Deploy"

Vercel will build and deploy your app!

## Step 4: Create Staging Project

**Create second project for staging:**

1. Go to https://vercel.com/dashboard
2. Click "Add New Project"
3. Select same repository
4. Name it: `quad360-staging`
5. Configure same build settings
6. Add same environment variables
7. **Connect to branch:** `claude/tender-ritchie-9y0iez`

## Step 5: Configure GitHub Secrets

**In your GitHub repository:**

Settings > Secrets and variables > Actions > New repository secret

Add each secret:

1. **VERCEL_TOKEN**
   - Get from: https://vercel.com/account/tokens
   - Click "Create"
   - Scope: Full access
   - Copy token

2. **VERCEL_ORG_ID**
   - Get from: https://vercel.com/account/settings
   - Copy "Team ID"

3. **VERCEL_PROJECT_ID** (Production)
   - Vercel Dashboard > quad360 > Settings > General
   - Copy "Project ID"

4. **VERCEL_PROJECT_ID_STAGING** (Staging)
   - Vercel Dashboard > quad360-staging > Settings > General
   - Copy "Project ID"

5. **EXPO_PUBLIC_SUPABASE_URL**
   - From Supabase dashboard

6. **EXPO_PUBLIC_SUPABASE_ANON_KEY**
   - From Supabase dashboard

## Step 6: Test Deployment

1. Push code to main branch
2. Go to GitHub > Actions
3. Watch deployment workflow
4. Check Vercel Dashboard
5. Visit https://quad360.vercel.app

## Step 7: Setup Complete! ✅

Your CI/CD pipeline is now active:

- **Production:** Push to `main` → Auto-deploy
- **Staging:** Push to `claude/tender-ritchie-9y0iez` → Auto-deploy
- **Preview:** PR to `main` → Auto-deploy preview

## Troubleshooting

### Deployment Status: Error

Check logs:
1. GitHub > Actions > [workflow] > See logs
2. Vercel Dashboard > Deployments > [deployment] > View logs

Common issues:
- Missing environment variables → Add to Vercel settings
- Build command failed → Check build.sh
- TypeScript errors → Run `npm run ts:check`

### Can't Find Project ID

1. Vercel Dashboard > Select project
2. Click "Settings" (top right)
3. General tab > Scroll to "Project ID"

### Build Passes but App Won't Load

1. Check browser console for errors
2. Check network requests
3. Verify Supabase credentials
4. Check Vercel function logs

## Next Steps

1. ✅ Vercel projects created
2. ✅ GitHub secrets configured
3. ✅ Environment variables set
4. ✅ CI/CD pipeline active
5. Deploy component library branch to staging
6. Monitor metrics
7. Set up alerts

---

**Status:** Ready to Deploy  
**Last Updated:** June 28, 2026

🚀 **Vercel setup complete!**

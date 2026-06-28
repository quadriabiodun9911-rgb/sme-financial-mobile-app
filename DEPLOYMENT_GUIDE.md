# Quad360 Deployment Guide

Complete guide to deploying Quad360 to Vercel with staging, production, and CI/CD pipeline.

## Quick Links

- **Production:** https://quad360.vercel.app
- **Staging:** https://quad360-staging.vercel.app (after setup)
- **Vercel Dashboard:** https://vercel.com/dashboard
- **Supabase Dashboard:** https://supabase.com/dashboard

---

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Vercel Configuration](#vercel-configuration)
3. [GitHub Secrets](#github-secrets)
4. [CI/CD Pipeline](#cicd-pipeline)
5. [Environment Variables](#environment-variables)
6. [Deployment Workflow](#deployment-workflow)
7. [Monitoring & Rollback](#monitoring--rollback)

---

## Environment Setup

### Prerequisites

- GitHub account (for CI/CD)
- Vercel account (https://vercel.com)
- Supabase account (https://supabase.com)
- Node.js 18+

### 1. Supabase Setup

**Create a Supabase project:**

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Fill in project details:
   - Name: `quad360` or `quad360-staging`
   - Database password: Generate secure password
   - Region: Choose closest to your users
4. Click "Create new project"
5. Wait for project to initialize (~2 minutes)

**Get your credentials:**

1. Click Settings > API
2. Copy:
   - **Project URL** → EXPO_PUBLIC_SUPABASE_URL
   - **Anon Public Key** → EXPO_PUBLIC_SUPABASE_ANON_KEY

### 2. Vercel Setup

**Connect to GitHub:**

1. Go to https://vercel.com/dashboard
2. Click "Add New" > "Project"
3. Click "Import Git Repository"
4. Authorize GitHub access
5. Select your repository

**Configure Project:**

1. Project Name: `quad360`
2. Framework Preset: Other
3. Build Command: `bash build.sh`
4. Output Directory: `dist`
5. Root Directory: `./`

**Add Environment Variables:**

Project Settings > Environment Variables

Add for all environments:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## GitHub Secrets

Go to GitHub Repository > Settings > Secrets and variables > Actions

**Add these secrets:**

```
VERCEL_TOKEN=your-vercel-token
VERCEL_ORG_ID=your-org-id
VERCEL_PROJECT_ID=your-prod-project-id
VERCEL_PROJECT_ID_STAGING=your-staging-project-id
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**To get Vercel credentials:**
- VERCEL_TOKEN: https://vercel.com/account/tokens
- VERCEL_ORG_ID: https://vercel.com/account/settings (Team ID)
- PROJECT_ID: Project Settings > Project ID

---

## CI/CD Pipeline

### Automatic Deployments

The pipeline is configured in `.github/workflows/deploy.yml`

**Triggers:**

- **main branch** → Deploy to production
- **claude/tender-ritchie-9y0iez** → Deploy to staging
- **Pull requests** → Deploy preview

**Pipeline Stages:**

1. Build & Test (TypeScript, Jest, Coverage)
2. Build Web (Expo export to dist/)
3. Deploy Staging (if component branch)
4. Deploy Production (if main branch)
5. Deploy Preview (if PR)
6. Notify (Slack, GitHub comments)

---

## Environment Variables

### Local Development

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

**Never commit .env.local** (in .gitignore)

### Vercel Environment Variables

Set in Vercel Dashboard > Project Settings > Environment Variables

**Required:**
- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY

**Optional:**
- EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY
- EXPO_PUBLIC_KORAPAY_PUBLIC_KEY
- EXPO_PUBLIC_DEBUG_LOGGING (true for dev, false for prod)

---

## Deployment Workflow

### Push to Main (Automatic Production Deploy)

```bash
git add .
git commit -m "feat: new feature"
git push origin main

# GitHub Actions:
# 1. Runs tests
# 2. Builds app
# 3. Deploys to production
# 4. Creates release
```

### Push to Staging Branch (Automatic Staging Deploy)

```bash
git push origin claude/tender-ritchie-9y0iez

# GitHub Actions:
# 1. Runs tests
# 2. Builds app
# 3. Deploys to staging
# 4. Posts URL in PR
```

### Pull Request (Automatic Preview Deploy)

```bash
git checkout -b feature/my-feature
git push origin feature/my-feature
# Create PR on GitHub

# GitHub Actions:
# 1. Runs tests
# 2. Builds app
# 3. Deploys preview
# 4. Comments with preview URL
```

---

## Monitoring & Rollback

### Monitor Deployment

1. **GitHub Actions:** Repo > Actions > View workflow logs
2. **Vercel Dashboard:** Deployments tab > See status
3. **Browser:** Visit https://quad360.vercel.app

### Instant Rollback

**If something goes wrong:**

```bash
# Revert the problematic commit
git revert <commit-hash>
git push origin main

# GitHub Actions automatically redeploys with previous version
```

**Or use Vercel UI:**
1. Vercel Dashboard > Deployments
2. Find previous working deployment
3. Click "Promote to Production"

---

## Quick Reference

### First-Time Setup

1. Create Supabase project → Get credentials
2. Create Vercel project → Connect to GitHub
3. Add environment variables to Vercel
4. Add GitHub secrets (VERCEL_TOKEN, etc.)
5. Push to main → Auto-deploys to production
6. Push to staging branch → Auto-deploys to staging

### Daily Workflow

```bash
# Development
git checkout claude/tender-ritchie-9y0iez
# ... make changes ...
git push origin claude/tender-ritchie-9y0iez
# GitHub Actions auto-deploys to staging

# Testing
Visit https://quad360-staging.vercel.app

# Production
git checkout main
git merge claude/tender-ritchie-9y0iez
git push origin main
# GitHub Actions auto-deploys to production
```

### Troubleshooting

| Issue | Check |
|-------|-------|
| Build fails | GitHub Actions logs |
| App won't load | Vercel build logs |
| Env vars undefined | Vercel dashboard settings |
| Supabase connection fails | API keys in Vercel env vars |
| Performance slow | Vercel Analytics > Web Vitals |

---

## Documentation Files

- **DEPLOYMENT_GUIDE.md** (this file) — Deployment overview
- **DEPLOYMENT_SECRETS.md** — Detailed secrets setup
- **CI_CD_PIPELINE.md** — GitHub Actions details
- **VERCEL_SETUP.md** — Vercel configuration
- **ENV_VARIABLES.md** — Environment variable reference

---

**Status:** ✅ Production Ready  
**Last Updated:** June 28, 2026

🚀 **Quad360 is ready to deploy with automatic CI/CD!**

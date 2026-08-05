# CashClear

**Turn your business data into bankable proof.**

CashClear is a mobile-first financial management + credit-readiness platform
for Nigerian SMEs. It separates business and personal finances, forecasts
cash flow, computes a "Credit Readiness Score," and generates lender-ready
reports SMEs can share with banks and fintechs in one tap.

This directory is a self-contained prototype - it does not touch the
existing `Quad360` app at the repo root. It has two parts:

- **`/` (this folder)** - the Expo/React Native mobile app
- **`/backend`** - the Node/Express API it talks to (see `backend/README.md`)

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the target cloud-native
architecture and how this scaffold maps to it.

## Features implemented in this prototype

| Product concept feature | Where it lives |
|---|---|
| Automated Transaction Categorization + commingling flags | `src/services/categorization.ts`, `src/screens/TransactionsScreen.tsx` |
| Cash Flow Health Dashboard (30/60/90-day projection, receivables aging, alerts) | `src/services/cashFlowForecast.ts`, `src/screens/DashboardScreen.tsx` |
| Credit Readiness Score (5 pillars) | `src/services/creditScore.ts`, `src/screens/CreditScoreScreen.tsx` |
| Lender-Facing Portal (share score, generate report) | `src/screens/LenderPortalScreen.tsx` |
| Project Account discipline (ring-fenced sub-accounts) | `src/screens/ProjectAccountsScreen.tsx` |

The mobile app currently runs on bundled mock data (`src/data/mockData.ts`)
and computes everything client-side, so it works standalone without the
backend. The backend (`/backend`) implements the same logic as real HTTP
endpoints, structured to mirror the target microservice boundaries - wiring
the app to call it instead of local mock data is the natural next step.

## Run the app

```bash
cd cashclear
npm install
npm run start      # or: npm run web / npm run ios / npm run android
```

## Run the API (optional, not yet wired into the app)

```bash
cd cashclear/backend
npm install
cp .env.example .env
npm run dev
```

## What's a placeholder vs. real

This is a UI/logic prototype, not a production system:

- **No real bank/mobile-money/POS connections** - transactions are mock data shaped like what those integrations would return.
- **No trained ML models** - categorization uses keyword rules and forecasting uses a trailing-average, both with the same input/output shape a real model would have (see code comments).
- **No persistence, encryption, or real auth** - login accepts any credentials; data lives in memory.
- **No real Open Banking / NIBSS OBCMS integration** - `backend/src/routes/auth.ts` has a `/consent` endpoint modeled on that flow, but doesn't call NIBSS.

See `ARCHITECTURE.md` for what production would add on top of this.

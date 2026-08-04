# CashClear API

Node/Express + TypeScript backend for CashClear. Structured as one deployable
process today, with route boundaries chosen to map 1:1 onto the microservices
in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (auth, accounts, transactions,
credit-score, cashflow, lender-portal, project-accounts) so each can be
split out behind a real API gateway later without changing its contract.

## Run locally

```bash
cd cashclear/backend
npm install
cp .env.example .env
npm run dev
```

Server starts on `http://localhost:4000`.

## Endpoints

| Method | Path | Maps to (architecture diagram) |
|---|---|---|
| POST | `/api/auth/login` | User Auth & Consent Management |
| POST | `/api/auth/consent` | Open Banking consent (OBCMS-modeled) |
| GET | `/api/accounts` | Integration Layer - Open Banking / Bank Partners |
| GET | `/api/transactions` | Core Services - Categorization |
| GET | `/api/cashflow/projection` | Core Services - Forecasting |
| GET | `/api/credit-score` | Core Services - Scoring Engine |
| PATCH | `/api/credit-score/documents` | Scoring Engine - document checklist |
| GET | `/api/lender-portal/report` | Core Services - Reporting |
| POST | `/api/lender-portal/share` | Integration Layer - Lender APIs |
| GET / POST | `/api/project-accounts` | Per-project sub-account discipline |
| GET | `/api/audit-log` | CBN Open Banking audit log requirement |

All data is in-memory mock data (`src/data/mockDb.ts`) - there is no real
database, encryption, or bank connectivity wired up. See `ARCHITECTURE.md`
for what a production deployment adds on top of this scaffold.

# CashClear Architecture

This describes the target production architecture for CashClear, and how the
prototype in this directory maps onto it. Where they differ, that's called
out explicitly - this scaffold is a UI/logic prototype, not a production
build-out of the items below.

## Target system diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      CashClear Platform                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐   ┌─────────────┐  │
│  │   Mobile App    │    │   Web Portal    │   │   Admin      │  │
│  │ (React Native)  │    │  (React.js)     │   │   Dashboard  │  │
│  └────────┬────────┘    └────────┬────────┘   └──────┬──────┘  │
│           │                      │                    │          │
│           └──────────────────────┼────────────────────┘          │
│                                  │                              │
│                     ┌────────────┴────────────┐                 │
│                     │    API Gateway (Kong)    │                 │
│                     └────────────┬────────────┘                 │
│                                  │                              │
│     ┌────────────────────────────┼──────────────────────────┐  │
│     │                            │                          │  │
│  ┌──▼───────────┐    ┌──────────▼──────────┐   ┌──────────▼─┤  │
│  │  User Auth   │    │  Core Services      │   │  Data Lake │  │
│  │  & Consent   │    │  - Categorization   │   │  (AWS S3)  │  │
│  │  Management  │    │  - Forecasting      │   │  + Redshift│  │
│  │              │    │  - Scoring Engine   │   └────────────┘  │
│  │  (OAuth2 +   │    │  - Reporting        │                    │
│  │   NDPR)      │    └──────────┬──────────┘                    │
│  └──────────────┘               │                              │
│                                 │                              │
│                     ┌───────────┴────────────┐                  │
│                     │   Integration Layer    │                  │
│                     │   - Open Banking APIs  │                  │
│                     │   - Bank Partners      │                  │
│                     │   - Lender APIs        │                  │
│                     └────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

### Mapping to this prototype

| Diagram box | Prototype equivalent | Gap to production |
|---|---|---|
| Mobile App (React Native) | `cashclear/` (this Expo app) | Needs real device builds, offline support |
| Web Portal / Admin Dashboard | Not built | Out of scope for this pass |
| API Gateway (Kong) | Single Express app (`backend/src/index.ts`) mounts each domain under its own path prefix | Needs a real gateway (Kong or equivalent) once services actually split apart |
| User Auth & Consent Management | `backend/src/routes/auth.ts` | Static demo token instead of OAuth2; `/consent` endpoint is shaped like OBCMS but doesn't call NIBSS |
| Core Services - Categorization | `backend/src/services/categorization.ts` | Keyword rules instead of a trained supervised model |
| Core Services - Forecasting | `backend/src/services/cashFlowForecast.ts` | Trailing-average instead of an LSTM model |
| Core Services - Scoring Engine | `backend/src/services/creditScoreEngine.ts` | Weights are static, not dynamically recalibrated |
| Core Services - Reporting | `backend/src/routes/lenderPortal.ts` (`/report`) | Returns JSON, not a formatted PDF |
| Data Lake (S3 + Redshift) | In-memory mock store (`backend/src/data/mockDb.ts`) | No persistence at all yet |
| Integration Layer - Open Banking / Bank Partners | `backend/src/routes/accounts.ts` | Returns mock wallets, no real API calls |
| Integration Layer - Lender APIs | `backend/src/routes/lenderPortal.ts` (`/share`) | Records a share event locally, doesn't call Moniepoint/Carbon/bank APIs |

## 1. Cloud-native architecture

Following the RBC Clear model, CashClear is designed as cloud-native,
API-first, next-gen technology:

- **Microservices-based** for scalability - each Core Services box above is a
  separately deployable unit with its own datastore, communicating over
  the API Gateway.
- **Cloud-agnostic (AWS/Azure)** for flexibility - services run in containers
  behind a standard gateway, avoiding provider-specific managed services
  that would create lock-in.
- **Omnichannel** - mobile app, web, and lender portal all consume the same
  API surface, so a feature shipped once is available everywhere.

## 2. Open Banking API integration

Nigeria's Open Banking API standard is RESTful and locally adapted from
global best practice. Key integration points:

- **Account aggregation** via standardized APIs across mobile money wallets,
  bank accounts, and POS terminals.
- **Consent management** through the Open Banking Consent Management System
  (OBCMS) being operationalized by NIBSS - a business explicitly grants
  CashClear a scoped, time-bound consent to read their account data.
- **NDPR compliance** - consent scope, data minimization, and the right to
  revoke access are first-class, not bolted on.

## 3. Machine learning pipeline

- **Transaction Categorization** - supervised model trained on Nigerian SME
  transaction text; the prototype's `categorization.ts` keyword rules are a
  placeholder with the same input/output contract.
- **Cash Flow Forecasting** - LSTM time-series model; the prototype's
  `cashFlowForecast.ts` trailing-average is a placeholder with the same
  contract.
- **Credit Readiness Score** - proprietary algorithm weighing the 5 pillars,
  with dynamic recalibration over time as more repayment/outcome data comes
  in. The prototype's `creditScoreEngine.ts` implements the 5-pillar
  weighting with static weights.

## 4. Data security & privacy

Target production posture:

- End-to-end encryption for all data in transit (TLS everywhere).
- Data at rest encrypted (AES-256).
- Audit logs for all data access, required by the CBN Open Banking
  Operational Guidelines - the prototype has a minimal version of this in
  `backend/src/middleware/auditLog.ts` and `GET /api/audit-log`, logging to
  memory instead of a durable, tamper-evident store.
- Incident response plan with 72-hour breach reporting.

## 5. Scalability considerations

- Designed to handle Nigeria's 40+ million MSMEs.
- Horizontal scaling of stateless microservices behind the gateway.
- Redis caching layer for frequently accessed data (credit scores, account
  balances) - referenced in `backend/.env.example` (`REDIS_URL`) but not
  wired up in this prototype.
- Asynchronous processing for heavy computations (forecasting, score
  recalculation) via a queue, so these don't block request/response cycles
  at scale.

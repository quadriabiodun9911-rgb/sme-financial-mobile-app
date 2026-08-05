import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { auditLog, auditLogEntries } from './middleware/auditLog';
import accountsRouter from './routes/accounts';
import authRouter from './routes/auth';
import cashflowRouter from './routes/cashflow';
import creditScoreRouter from './routes/creditScore';
import lenderPortalRouter from './routes/lenderPortal';
import projectAccountsRouter from './routes/projectAccounts';
import transactionsRouter from './routes/transactions';

// This process plays the role of the API Gateway + Core Services in
// ARCHITECTURE.md's diagram: one deployable unit today, split by route
// prefix below so each mount point maps 1:1 to a future standalone
// microservice (auth, accounts, transactions, credit-score, cashflow,
// lender-portal, project-accounts) behind a real gateway like Kong.
const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());
app.use(auditLog);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'cashclear-api' }));

app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/credit-score', creditScoreRouter);
app.use('/api/cashflow', cashflowRouter);
app.use('/api/lender-portal', lenderPortalRouter);
app.use('/api/project-accounts', projectAccountsRouter);

// Audit log endpoint required for CBN Open Banking Operational Guidelines
// compliance review - lists recent data-access events.
app.get('/api/audit-log', (req, res) => res.json({ entries: auditLogEntries.slice(-100) }));

app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`CashClear API listening on http://localhost:${port}`);
});

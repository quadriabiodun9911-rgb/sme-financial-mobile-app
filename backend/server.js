require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const bankDataRoutes        = require('./routes/bank-data');
const pngmeRoutes           = require('./routes/pngme');
const usersRoutes           = require('./routes/users');
const transactionsRoutes    = require('./routes/transactions');
const financialHealthRoutes = require('./routes/financial-health');
const paymentsRoutes        = require('./routes/payments');
const { requireAuth }       = require('./middleware/auth');
const { ConnectionPool }    = require('./utils/connection-pool');
const { Cache }             = require('./utils/cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize connection pool and cache
const connectionPool = new ConnectionPool(50, 1000);
const responseCache = new Cache(1000, 60000); // 60s TTL

// Security middleware
app.use(helmet());

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : [];

if (allowedOrigins.length === 0) {
  console.warn('[SECURITY] CORS_ORIGIN env var not set — all cross-origin requests will be blocked. Set CORS_ORIGIN=https://your-app.vercel.app on Render.');
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server (no origin) and explicitly allowed origins
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Rate limiting - increased for load testing (normally 100/15min in production)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute (for testing, production uses 15 min)
  max: 5000, // 5000 requests per minute (test mode)
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health', // Don't rate limit health checks
});
app.use(limiter);

// Body parser — webhook route needs raw body for signature verification
app.use('/pngme/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Health check - optimized for high load
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  });
});

// Metrics endpoint - monitor pool and cache performance
app.get('/metrics', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connectionPool: connectionPool.getStats(),
    cache: responseCache.getStats(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
    },
  });
});

// Connection pool middleware - manage concurrent requests
app.use(async (req, res, next) => {
  try {
    const release = await connectionPool.acquire();
    res.on('finish', () => {
      connectionPool.recordRequest(res.statusCode < 400);
      release();
    });
    res.on('error', () => {
      connectionPool.recordRequest(false);
      release();
    });
    next();
  } catch (err) {
    console.error('[POOL] Queue full:', err.message);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
});

// Routes — payment and bank routes require valid Supabase session token
app.use('/api/payments', requireAuth, paymentsRoutes);
app.use('/api/bank-data', requireAuth, bankDataRoutes);
app.use('/api/transactions', requireAuth, transactionsRoutes);
app.use('/api/financial-health', requireAuth, financialHealthRoutes);
// Users and webhooks don't require auth (registration + server callbacks)
app.use('/api/users', usersRoutes);
app.use('/pngme', pngmeRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler — never expose internal details to clients
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  // Only expose safe, user-facing messages
  const safeMessages = {
    400: 'Bad request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not found',
    429: 'Too many requests',
  };
  res.status(status).json({ error: safeMessages[status] || 'An error occurred. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Quad360 backend running on port ${PORT}`);
});

module.exports = app;

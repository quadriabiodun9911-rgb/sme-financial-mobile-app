# Load Testing Guide for Quad360

## Overview

This guide explains how to run load tests to validate that Quad360 can handle 10,000 concurrent users before launching partnerships with Paystack, Flutterwave, Shopify, and other platforms.

## Critical Thresholds

Before partnership launch, the platform must meet these requirements:

| Metric | Target | Reason |
|--------|--------|--------|
| **p99 Latency** | < 500ms | User experience deteriorates above 500ms |
| **Error Rate** | < 0.1% | Must maintain 99.9% uptime during surge |
| **Throughput** | > 1,000 req/s | Handle concurrent user signups during campaigns |
| **Availability** | 99.5%+ | SLA requirement for enterprise partners |

## Quick Start (Simple Load Test)

### Option 1: Using the Simple Built-in Test

No external dependencies required. Works with vanilla Node.js.

```bash
# Test with 100 concurrent users for 30 seconds
node load-test-simple.js http://localhost:3000 30 100

# Test with 500 concurrent users for 60 seconds
node load-test-simple.js http://localhost:3000 60 500

# Test with 1000 concurrent users for 120 seconds
node load-test-simple.js http://localhost:3000 120 1000
```

**Output example:**
```
========================================
Load Test Results
========================================
Total Requests: 50,432
Success: 50,389
Errors: 43
Error Rate: 0.09%

Latency (ms):
  Min: 12.45
  Avg: 234.67
  p50: 210.33
  p95: 450.12
  p99: 489.34 ✅ (target: < 500ms)
  Max: 1,245.67

Status Codes:
  200: 50,389
  502: 43

========================================
Assessment:
✅ PASS - Platform ready for 10k concurrent users
========================================
```

## Advanced Load Testing (Using Artillery)

### Installation

```bash
npm install -g artillery
```

### Run Full Load Test

```bash
# Set the target URL
export LOAD_TEST_URL=http://localhost:3000

# Run the test
artillery run load-test.yml

# View detailed HTML report
artillery report

# Custom duration (phase definitions in load-test.yml)
artillery run load-test.yml --duration 300
```

### Load Test Phases

The test simulates realistic user behavior across 3 phases:

1. **Warmup (30s @ 100 req/s)**
   - Tests basic connectivity
   - Warms up database connections
   - Establishes baseline latency

2. **Ramp Up (120s @ 100-500 req/s)**
   - Gradually increases load
   - Shows how system handles increasing concurrency
   - Identifies bottlenecks

3. **Sustained Load (60s @ 500 req/s)**
   - Peak load testing
   - Measures system stability under sustained stress
   - Validates error handling

### Test Scenarios

The load test simulates real user workflows:

- **Health Checks (10%)**: Basic connectivity
- **User Registration (40%)**: New user signups (heaviest load)
- **User Login (30%)**: Returning user authentication
- **Financial Health Check (20%)**: API calls after login

## Interpreting Results

### Latency Analysis

**p99 (99th Percentile):**
- What: 99% of requests respond faster than this time
- Target: < 500ms
- Why: Ensures 99% of users have good experience

**p95:**
- 95% of requests are faster than this
- Helps identify tail latency issues
- Good: < 300ms

**Max Latency:**
- Slowest request in the entire test
- Indicates worst-case scenario
- Should investigate spikes > 1s

### Error Rate Analysis

**Acceptable Thresholds:**
- < 0.1%: Ready for production
- 0.1% - 1%: Acceptable with monitoring
- > 1%: Needs optimization before launch

**Common Error Codes:**
- 200: Success
- 400: Bad request (check test data)
- 401: Authentication failed
- 502/503: Backend overloaded
- TIMEOUT: Connection timeout

## Optimization Checklist

If tests fail, implement these optimizations in order:

### 1. Database Level
```sql
-- Add indexes for frequently queried fields
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_transactions_user_id ON transactions(user_id, created_at DESC);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Enable connection pooling
SET max_connections = 500;
```

### 2. Application Level
- [ ] Enable connection pooling (currently 10 connections)
- [ ] Implement response caching (Redis)
- [ ] Use database query caching
- [ ] Optimize N+1 queries
- [ ] Implement rate limiting appropriately

### 3. Infrastructure Level
- [ ] Scale backend instances (add more servers)
- [ ] Use load balancer (HAProxy, nginx)
- [ ] Enable CDN caching for static assets
- [ ] Use read replicas for database reads

### 4. Code Optimization
- [ ] Profile hot paths
- [ ] Optimize API response sizes
- [ ] Implement pagination for large datasets
- [ ] Use async operations where possible

## Pre-Launch Checklist

Before approaching partners, verify:

- [ ] p99 latency < 500ms ✅
- [ ] Error rate < 0.1% ✅
- [ ] Throughput > 1,000 req/s ✅
- [ ] No database connection pool exhaustion
- [ ] Memory usage stable (no leaks)
- [ ] CPU usage < 80% at peak load
- [ ] Monitoring/alerting in place
- [ ] Rollback procedures documented
- [ ] On-call rotation established

## Production Load Testing

Before going live with major partners:

1. **Staging Environment Test**
   - Use production-like data volumes
   - Use production backend infrastructure
   - Duration: 30-60 minutes

2. **Production Shadow Test** (Optional)
   - Run test against production during low-traffic hours
   - Monitor but don't verify results
   - Validates actual production behavior

3. **Gradual Rollout**
   - Start partnerships with pilot (100-1k users)
   - Monitor metrics continuously
   - Increase to 10k users after 1-2 weeks
   - Full launch only after sustained success

## Monitoring During Test

Open separate terminal to monitor:

```bash
# CPU and Memory
top

# Backend logs
tail -f backend.log

# Database connections
# For Supabase, use dashboard to monitor:
# - Connection count
# - Active queries
# - Query execution time
# - Cache hit rate

# Network
# Monitor bandwidth usage, especially for large API responses
```

## Troubleshooting

### Issue: High p99 Latency (> 500ms)

**Diagnosis:**
1. Check backend CPU usage (should be < 80%)
2. Check database slow query log
3. Look for N+1 queries or full table scans
4. Check response payload size

**Solutions:**
- Add database indexes
- Implement query caching
- Scale backend horizontally
- Optimize API response sizes

### Issue: High Error Rate (> 0.1%)

**Diagnosis:**
1. What status codes appear? (502 = backend overload, 401 = auth issue, etc.)
2. Do errors appear at specific load levels?
3. Are errors increasing over time or constant?

**Solutions:**
- Increase backend worker processes
- Fix authentication/authorization logic
- Implement circuit breaker pattern
- Add better error handling

### Issue: Memory Growing During Test

**Diagnosis:**
1. Memory leak in application
2. Cache not being evicted
3. Request queue building up

**Solutions:**
- Add garbage collection tuning
- Implement LRU cache with max size
- Check for event listener leaks
- Profile memory with heap snapshots

## CI/CD Integration

Add to your deployment pipeline:

```bash
#!/bin/bash
# load-test-ci.sh

echo "Running load test before deployment..."
node load-test-simple.js $STAGING_URL 60 500

if [ $? -eq 0 ]; then
  echo "✅ Load test passed - proceeding with deployment"
  exit 0
else
  echo "❌ Load test failed - aborting deployment"
  exit 1
fi
```

## Partnership-Specific Load Scenarios

Prepare for these partnership-specific surge patterns:

### Paystack Integration
- **Scenario**: 1,000 SMEs sign up after SMS campaign
- **Expected**: 500 req/s for 2 hours
- **Test**: `node load-test-simple.js http://localhost:3000 7200 500`

### Shopify/WooCommerce Integration
- **Scenario**: 5,000 e-commerce stores onboard
- **Expected**: 1,000 req/s for 4 hours
- **Test**: `node load-test-simple.js http://localhost:3000 14400 1000`

### Bank Partnership (Zenith)
- **Scenario**: 10,000 SMEs in pilot
- **Expected**: 2,000 req/s peak
- **Test**: `node load-test-simple.js http://localhost:3000 3600 2000`

## Next Steps

1. ✅ Set up backend locally
2. ✅ Run simple load test (`node load-test-simple.js`)
3. ✅ Analyze results
4. 📋 Fix any failures
5. ✅ Re-run test to confirm fixes
6. 🚀 Mark as ready for partnerships

---

**Last Updated:** July 5, 2026  
**Status:** Ready for testing  
**Target**: p99 < 500ms, error rate < 0.1%

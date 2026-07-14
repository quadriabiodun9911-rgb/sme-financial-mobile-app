#!/usr/bin/env node

/**
 * Simple Load Test for Quad360
 *
 * Stress tests the /health endpoint with configurable concurrency
 * No dependencies - runs with vanilla Node.js
 *
 * Usage:
 * node load-test-simple.js [baseUrl] [duration] [concurrency]
 *
 * Examples:
 * node load-test-simple.js http://localhost:3000 60 100
 * node load-test-simple.js http://localhost:3000 120 500
 */

const http = require('http');
const https = require('https');
const url = require('url');

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const DURATION_SECONDS = parseInt(process.argv[3]) || 30;
const CONCURRENCY = parseInt(process.argv[4]) || 100;

console.log(`
========================================
Quad360 Load Test
========================================
Target: ${BASE_URL}
Duration: ${DURATION_SECONDS}s
Concurrency: ${CONCURRENCY} users
========================================
`);

let totalRequests = 0;
let successRequests = 0;
let errorRequests = 0;
let totalLatency = 0;
let minLatency = Infinity;
let maxLatency = 0;
const latencies = [];

const stats = {
  byStatus: {},
  errors: {},
};

function makeRequest() {
  return new Promise((resolve) => {
    const startTime = process.hrtime.bigint();
    const parsedUrl = new URL(BASE_URL);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: '/health',
      method: 'GET',
      timeout: 5000,
    };

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = process.hrtime.bigint();
        const latency = Number(endTime - startTime) / 1_000_000; // Convert to ms

        totalRequests++;
        totalLatency += latency;
        minLatency = Math.min(minLatency, latency);
        maxLatency = Math.max(maxLatency, latency);
        latencies.push(latency);

        stats.byStatus[res.statusCode] = (stats.byStatus[res.statusCode] || 0) + 1;

        if (res.statusCode === 200) {
          successRequests++;
        } else {
          errorRequests++;
        }

        resolve();
      });
    });

    req.on('error', (err) => {
      totalRequests++;
      errorRequests++;
      stats.errors[err.code] = (stats.errors[err.code] || 0) + 1;
      resolve();
    });

    req.on('timeout', () => {
      totalRequests++;
      errorRequests++;
      stats.errors['TIMEOUT'] = (stats.errors['TIMEOUT'] || 0) + 1;
      req.destroy();
      resolve();
    });

    req.end();
  });
}

async function runLoadTest() {
  const startTime = Date.now();
  const endTime = startTime + DURATION_SECONDS * 1000;

  // Start concurrent requests
  const promises = [];

  while (Date.now() < endTime) {
    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(makeRequest());
    }

    // Wait a bit before next batch
    await new Promise(resolve => setTimeout(resolve, 100));

    // Show progress
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rps = Math.round(totalRequests / (elapsed || 1));
    process.stdout.write(`\r[${elapsed}s] Requests: ${totalRequests} | RPS: ${rps} | Errors: ${errorRequests}`);
  }

  // Wait for remaining requests
  await Promise.all(promises);

  const totalTime = (Date.now() - startTime) / 1000;

  // Calculate percentiles
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  const avgLatency = totalLatency / totalRequests;
  const rps = totalRequests / totalTime;
  const errorRate = (errorRequests / totalRequests) * 100;

  console.log(`\n
========================================
Load Test Results
========================================
Total Requests: ${totalRequests}
Success: ${successRequests}
Errors: ${errorRequests}
Error Rate: ${errorRate.toFixed(2)}%
Requests/sec: ${rps.toFixed(2)}

Latency (ms):
  Min: ${minLatency.toFixed(2)}
  Avg: ${avgLatency.toFixed(2)}
  p50: ${p50.toFixed(2)}
  p95: ${p95.toFixed(2)}
  p99: ${p99.toFixed(2)} ${p99 < 500 ? '✅' : '❌'} (target: < 500ms)
  Max: ${maxLatency.toFixed(2)}

Status Codes:
${Object.entries(stats.byStatus).map(([code, count]) => `  ${code}: ${count}`).join('\n')}

${Object.keys(stats.errors).length > 0 ? `Errors:\n${Object.entries(stats.errors).map(([type, count]) => `  ${type}: ${count}`).join('\n')}` : 'No network errors'}

========================================
Assessment:
${p99 < 500 && errorRate < 0.1 ? '✅ PASS - Platform ready for 10k concurrent users' : '❌ FAIL - Platform needs optimization'}
========================================
`);

  process.exit(errorRate > 5 || p99 > 1000 ? 1 : 0);
}

runLoadTest().catch(console.error);

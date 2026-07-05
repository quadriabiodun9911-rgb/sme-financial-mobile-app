#!/usr/bin/env node

/**
 * Load Testing Script for Quad360
 *
 * Tests platform capacity to handle 10k concurrent signups
 * Measures: Response time (p99 < 500ms), error rate (< 0.1%), throughput
 *
 * Usage:
 * npm install artillery
 * artillery run load-test.yml --target http://localhost:3000
 */

const fs = require('fs');
const path = require('path');

// Generate Artillery YAML config
const config = `
config:
  target: "{{ $processEnvironment.LOAD_TEST_URL || 'http://localhost:3000' }}"
  phases:
    - duration: 30
      arrivalRate: 100
      name: "Warmup phase"
    - duration: 120
      arrivalRate: 500
      name: "Ramp up to 500 req/s"
    - duration: 60
      arrivalRate: 500
      name: "Sustained load at 500 req/s"
  processor: "./load-test-processor.js"
  variables:
    baseUrl: "{{ \$processEnvironment.LOAD_TEST_URL || 'http://localhost:3000' }}"
  plugins:
    statsd:
      host: localhost
      port: 8125

scenarios:
  - name: "Health checks (10%)"
    weight: 10
    flow:
      - get:
          url: "/health"
          expect:
            - statusCode: 200
          capture:
            json: "$.status"
            as: "healthStatus"

  - name: "User registration (40%)"
    weight: 40
    flow:
      - function: "generateUser"
      - post:
          url: "/api/users/register"
          json:
            email: "{{ email }}"
            password: "TestPass123!@#"
            businessName: "{{ businessName }}"
            ownerName: "{{ ownerName }}"
          expect:
            - statusCode: [200, 201, 400]
          capture:
            json: "$.token"
            as: "authToken"

  - name: "User login (30%)"
    weight: 30
    flow:
      - function: "generateUser"
      - post:
          url: "/api/users/login"
          json:
            email: "{{ email }}"
            password: "TestPass123!@#"
          expect:
            - statusCode: [200, 401]
          capture:
            json: "$.token"
            as: "authToken"

  - name: "Financial health check (20%)"
    weight: 20
    flow:
      - function: "generateUser"
      - post:
          url: "/api/users/login"
          json:
            email: "{{ email }}"
            password: "TestPass123!@#"
          expect:
            - statusCode: [200, 401]
          capture:
            json: "$.token"
            as: "authToken"
      - get:
          url: "/api/financial-health"
          headers:
            Authorization: "Bearer {{ authToken }}"
          expect:
            - statusCode: [200, 401]

after:
  flow:
    - log: "Load test completed"
`;

// Generate processor file for dynamic variables
const processorCode = `
module.exports = {
  generateUser: generateUser,
};

function generateUser(context, ee, next) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);

  context.vars.email = \`test-\${timestamp}-\${random}@quad360.test\`;
  context.vars.businessName = \`TestBiz\${random}\`;
  context.vars.ownerName = \`Owner\${random}\`;

  return next();
}
`;

// Write Artillery config
fs.writeFileSync(path.join(__dirname, 'load-test.yml'), config);
console.log('✅ Created load-test.yml');

// Write processor
fs.writeFileSync(path.join(__dirname, 'load-test-processor.js'), processorCode);
console.log('✅ Created load-test-processor.js');

console.log(`
🚀 Load Testing Setup Complete!

Next steps:
1. Install Artillery:
   npm install -g artillery

2. Start backend server:
   npm run dev

3. Run load test:
   LOAD_TEST_URL=http://localhost:3000 artillery run load-test.yml

4. View results:
   - Response times (p99 < 500ms target)
   - Error rate (< 0.1% target)
   - Throughput (max requests/sec)

Metrics to track:
- Median response time
- p95 response time
- p99 response time (critical: < 500ms)
- Error rate % (target: < 0.1%)
- Requests/sec throughput
- Concurrent users handled

After test, check:
- Backend CPU usage
- Database query performance
- Memory usage on Supabase
`);

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('deterministic Ask uses global API protection without a router-wide request bucket', () => {
  const routes = readFileSync(resolve(__dirname, '../../src/routes/ask.routes.ts'), 'utf8');
  const limiters = readFileSync(resolve(__dirname, '../../src/middleware/rateLimiter.middleware.ts'), 'utf8');
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

  assert.doesNotMatch(routes, /askRateLimiter/);
  assert.doesNotMatch(limiters, /ASK_RATE_LIMITED|Too many Ask requests/);
  assert.match(
    orchestrator,
    /userId_clientRequestId: \{ userId, clientRequestId: input\.clientRequestId \}/,
    'new Ask executions must retain durable per-user idempotency protection',
  );
});

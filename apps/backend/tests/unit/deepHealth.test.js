const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { runDeepHealthChecks } = require('../../src/lib/deepHealth.ts');

test('deep health is healthy when database passes and redis is not configured', async () => {
  const result = await runDeepHealthChecks({
    checkDatabase: async () => {},
    redisConfigured: false,
    redisTimeoutMs: 1500,
  });

  assert.equal(result.httpStatus, 200);
  assert.equal(result.status, 'healthy');
  assert.equal(result.allOk, true);
  assert.deepEqual(result.checks, { database: 'ok' });
});

test('deep health degrades when database check fails', async () => {
  const result = await runDeepHealthChecks({
    checkDatabase: async () => {
      throw new Error('db down');
    },
    redisConfigured: false,
    redisTimeoutMs: 1500,
  });

  assert.equal(result.httpStatus, 503);
  assert.equal(result.status, 'degraded');
  assert.equal(result.allOk, false);
  assert.deepEqual(result.checks, { database: 'error' });
});

test('deep health degrades when redis is configured and ping fails', async () => {
  const result = await runDeepHealthChecks({
    checkDatabase: async () => {},
    redisConfigured: true,
    pingRedis: async () => {
      throw new Error('redis down');
    },
    redisTimeoutMs: 1500,
  });

  assert.equal(result.httpStatus, 503);
  assert.equal(result.status, 'degraded');
  assert.equal(result.allOk, false);
  assert.deepEqual(result.checks, { database: 'ok', redis: 'error' });
});

test('deep health marks redis as error when ping times out', async () => {
  const startedAt = Date.now();

  const result = await runDeepHealthChecks({
    checkDatabase: async () => {},
    redisConfigured: true,
    pingRedis: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    },
    redisTimeoutMs: 25,
  });

  const elapsedMs = Date.now() - startedAt;

  assert.equal(result.httpStatus, 503);
  assert.equal(result.status, 'degraded');
  assert.equal(result.allOk, false);
  assert.deepEqual(result.checks, { database: 'ok', redis: 'error' });
  assert.ok(elapsedMs < 150, `Expected timeout path to finish quickly, got ${elapsedMs}ms`);
});

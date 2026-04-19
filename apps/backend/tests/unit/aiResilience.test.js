const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  withTimeout,
  AITimeoutError,
  AICircuitBreaker,
  AICircuitOpenError,
} = require('../../src/lib/aiResilience.ts');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('withTimeout resolves when operation completes before deadline', async () => {
  const value = await withTimeout(
    async () => {
      await sleep(10);
      return 'ok';
    },
    { timeoutMs: 100, operation: 'unit_test_operation' }
  );

  assert.equal(value, 'ok');
});

test('withTimeout throws AITimeoutError when operation exceeds deadline', async () => {
  await assert.rejects(
    () =>
      withTimeout(
        async () => {
          await sleep(80);
          return 'late';
        },
        { timeoutMs: 20, operation: 'slow_operation' }
      ),
    (error) => {
      assert.equal(error instanceof AITimeoutError, true);
      assert.equal(error.code, 'AI_TIMEOUT');
      assert.equal(error.operation, 'slow_operation');
      return true;
    }
  );
});

test('circuit breaker opens after configured consecutive failures', async () => {
  const breaker = new AICircuitBreaker('unit-circuit-open', {
    failureThreshold: 2,
    openMs: 100,
  });

  await assert.rejects(() => breaker.execute(async () => { throw new Error('fail-1'); }));
  await assert.rejects(() => breaker.execute(async () => { throw new Error('fail-2'); }));

  await assert.rejects(
    () => breaker.execute(async () => 'should-not-run'),
    (error) => {
      assert.equal(error instanceof AICircuitOpenError, true);
      assert.equal(error.code, 'AI_CIRCUIT_OPEN');
      return true;
    }
  );
});

test('circuit breaker transitions to half-open then closes on successful probe', async () => {
  const breaker = new AICircuitBreaker('unit-circuit-recover', {
    failureThreshold: 1,
    openMs: 30,
  });

  await assert.rejects(() => breaker.execute(async () => { throw new Error('trip-open'); }));
  assert.equal(breaker.getSnapshot().state, 'OPEN');

  await sleep(130);

  const probeResult = await breaker.execute(async () => 'probe-ok');
  assert.equal(probeResult, 'probe-ok');
  assert.equal(breaker.getSnapshot().state, 'CLOSED');
});

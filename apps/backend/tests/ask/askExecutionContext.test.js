const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { enterAskExecutionContext, getAskPropertyTimezone } = require('../../src/services/ask/askExecutionContext.ts');

test('defaults to UTC when no context has been entered', () => {
  // Node's AsyncLocalStorage store is per async-execution-chain; a bare
  // synchronous call outside any prior enterWith() sees no store.
  const fn = () => getAskPropertyTimezone();
  assert.equal(fn(), 'UTC');
});

test('returns the entered timezone for the remainder of the async chain', async () => {
  await new Promise((resolve) => {
    enterAskExecutionContext({ propertyTimezone: 'America/New_York' });
    setTimeout(() => {
      assert.equal(getAskPropertyTimezone(), 'America/New_York');
      resolve();
    }, 0);
  });
});

test('falls back to UTC when the property has no recorded timezone', async () => {
  await new Promise((resolve) => {
    enterAskExecutionContext({ propertyTimezone: null });
    setTimeout(() => {
      assert.equal(getAskPropertyTimezone(), 'UTC');
      resolve();
    }, 0);
  });
});

test('concurrent async chains do not leak timezone context into each other', async () => {
  // This is the property that actually matters: two "requests" (simulated
  // here as two concurrent async chains) running interleaved on the event
  // loop must never see each other's property timezone.
  const run = (timezone, delayMs) => new Promise((resolve) => {
    enterAskExecutionContext({ propertyTimezone: timezone });
    setTimeout(() => resolve(getAskPropertyTimezone()), delayMs);
  });
  const [first, second] = await Promise.all([
    run('America/Los_Angeles', 10),
    run('Europe/London', 5),
  ]);
  assert.equal(first, 'America/Los_Angeles');
  assert.equal(second, 'Europe/London');
});

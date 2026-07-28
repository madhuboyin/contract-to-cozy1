const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { withBoundedRetry } = require('../../src/services/homeDigitalTwin.service.ts');

test('withBoundedRetry returns the result on first success without retrying', async () => {
  let calls = 0;
  const result = await withBoundedRetry(async () => {
    calls += 1;
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('withBoundedRetry retries once after a transient failure and returns the retry result', async () => {
  let calls = 0;
  const result = await withBoundedRetry(async () => {
    calls += 1;
    if (calls === 1) throw new Error('transient');
    return 'ok on retry';
  });
  assert.equal(result, 'ok on retry');
  assert.equal(calls, 2);
});

test('withBoundedRetry gives up after the configured attempts and throws the last error', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withBoundedRetry(async () => {
        calls += 1;
        throw new Error(`fail ${calls}`);
      }),
    /fail 2/,
  );
  assert.equal(calls, 2);
});

test('withBoundedRetry respects a custom attempts count', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withBoundedRetry(async () => {
        calls += 1;
        throw new Error('always fails');
      }, 3),
  );
  assert.equal(calls, 3);
});

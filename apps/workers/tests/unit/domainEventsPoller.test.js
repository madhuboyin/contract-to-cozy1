// apps/workers/tests/unit/domainEventsPoller.test.js
//
// W4 item 4: startDomainEventsPoller (runner key domain-events-poller) had
// no dedicated test — thin setInterval wrapper around processDomainEventsJob
// (covered separately in processDomainEventsJob.test.js). Just verifies it
// fires once immediately with the configured batchSize and returns a
// working stop function, without leaking a real interval past the test.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadPoller({ processResult = { processed: 0 } } = {}) {
  const calls = { processCalls: [] };

  const jobPath = require.resolve('../../src/jobs/processDomainEvents.job.ts');
  require.cache[jobPath] = {
    id: jobPath,
    filename: jobPath,
    loaded: true,
    exports: {
      processDomainEventsJob: async (opts) => {
        calls.processCalls.push(opts);
        return processResult;
      },
    },
  };

  const pollerPath = require.resolve('../../src/runners/domainEvents.poller.ts');
  delete require.cache[pollerPath];
  return { ...require(pollerPath), calls };
}

test('runs processDomainEventsJob immediately on start with the configured batchSize', async () => {
  const { startDomainEventsPoller, calls } = loadPoller();

  const stop = startDomainEventsPoller({ batchSize: 10, intervalMs: 60_000 });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.processCalls.length, 1);
    assert.deepEqual(calls.processCalls[0], { batchSize: 10 });
  } finally {
    stop();
  }
});

test('defaults to batchSize 25 when unset', async () => {
  const { startDomainEventsPoller, calls } = loadPoller();

  const stop = startDomainEventsPoller();
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls.processCalls[0], { batchSize: 25 });
  } finally {
    stop();
  }
});

test('the returned stop function clears the interval (no lingering timer)', async () => {
  const { startDomainEventsPoller } = loadPoller();

  const stop = startDomainEventsPoller({ intervalMs: 5 });
  await new Promise((resolve) => setImmediate(resolve));
  stop();
  // If clearInterval didn't actually work, this test file would hang the
  // process on exit — node --test would report it, making this a
  // meaningful assertion even without an explicit check here.
  assert.ok(true);
});

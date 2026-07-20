// apps/backend/tests/unit/queuePort.test.js
//
// W4 item 1/2 ("small interfaces" + "in-memory fakes instead of fragile
// module replacement"): unit coverage for the createLazyQueue/createFakeQueue
// helpers that replace every `export const xQueue = new Queue(...)`
// module-scope singleton in this codebase.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { createLazyQueue, createFakeQueue } = require('../../src/lib/queuePort.ts');

test('createLazyQueue does not call the factory until first invocation', () => {
  let factoryCalls = 0;
  const getQueue = createLazyQueue(() => {
    factoryCalls += 1;
    return createFakeQueue();
  });

  assert.equal(factoryCalls, 0, 'the factory must not run just from creating the lazy wrapper');

  getQueue();
  assert.equal(factoryCalls, 1);

  getQueue();
  assert.equal(factoryCalls, 1, 'a second call must reuse the same instance, not construct again');
});

test('__setForTesting bypasses the real factory entirely', () => {
  let factoryCalls = 0;
  const getQueue = createLazyQueue(() => {
    factoryCalls += 1;
    return createFakeQueue();
  });

  const fake = createFakeQueue();
  getQueue.__setForTesting(fake);

  const resolved = getQueue();
  assert.equal(resolved, fake);
  assert.equal(factoryCalls, 0, 'the real factory must never run once a fake is injected');
});

test('__setForTesting(undefined) restores real (lazy) construction', () => {
  let factoryCalls = 0;
  const realFake = createFakeQueue();
  const getQueue = createLazyQueue(() => {
    factoryCalls += 1;
    return realFake;
  });

  getQueue.__setForTesting(createFakeQueue());
  getQueue.__setForTesting(undefined);

  const resolved = getQueue();
  assert.equal(resolved, realFake);
  assert.equal(factoryCalls, 1);
});

test('createFakeQueue records every add() call and never performs real I/O', async () => {
  const fake = createFakeQueue();

  const job = await fake.add('my-job', { foo: 'bar' }, { jobId: 'custom-id' });

  assert.equal(fake.added.length, 1);
  assert.deepEqual(fake.added[0], { name: 'my-job', data: { foo: 'bar' }, opts: { jobId: 'custom-id' } });
  assert.equal(job.id, 'custom-id');

  const missing = await fake.getJob('anything');
  assert.equal(missing, undefined);
});

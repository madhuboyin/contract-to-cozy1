const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

require('ts-node/register/transpile-only');

// Findings Implementation Plan, Phase 5: the properties only a real Redis can prove. A storage-port test double cannot show that an increment is
// atomic, that exactly one of many concurrent callers wins the half-open probe, that a dead probe owner's lease expires, or that a stale claimant is
// rejected, because those depend on Redis executing each Lua script as one indivisible step against Redis's own clock.
//
// This file is AUTHORED COVERAGE. It runs only when AI_GOVERNANCE_TEST_REDIS_URL points at a disposable Redis (for example redis://localhost:6379/15).
// Without it every test is skipped, and a skipped run is not evidence. It uses a unique key prefix per run and deletes only that prefix.
const url = process.env.AI_GOVERNANCE_TEST_REDIS_URL;
const skip = url ? false : 'set AI_GOVERNANCE_TEST_REDIS_URL to a disposable Redis to run the shared-state integration tests';

const { InMemoryAIGovernanceStore, RedisAIGovernanceStore } = require('../../src/lib/aiGovernanceStore.ts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const config = { failureThreshold: 3, openMs: 300, probeTtlMs: 250 };

let client;
let prefix;
let redisStore;

test.before(async () => {
  if (!url) return;
  const Redis = require('ioredis');
  client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1 });
  prefix = `ai:gov:test:${randomUUID()}:`;
  redisStore = new RedisAIGovernanceStore(client, prefix);
});

test.after(async () => {
  if (!client) return;
  const keys = await client.keys(`${prefix}*`);
  if (keys.length) await client.del(...keys);
  await client.quit();
});

const route = () => `ai:t-${randomUUID().slice(0, 8)}`;

test('rate window: concurrent increments are atomic and the window expires on its own', { skip }, async () => {
  const id = route();
  const counts = await Promise.all(Array.from({ length: 50 }, () => redisStore.incrementRateWindow(id, 400)));
  assert.deepEqual([...counts].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1), 'every caller saw a distinct count');
  await sleep(500);
  assert.equal(await redisStore.incrementRateWindow(id, 400), 1, 'the window expired by itself');
});

test('rate window: two processes (two clients) share one count', { skip }, async () => {
  const Redis = require('ioredis');
  const second = new Redis(url, { maxRetriesPerRequest: 1 });
  try {
    const other = new RedisAIGovernanceStore(second, prefix);
    const id = route();
    const results = [];
    for (let i = 0; i < 6; i += 1) results.push(await (i % 2 === 0 ? redisStore : other).incrementRateWindow(id, 5000));
    assert.deepEqual(results, [1, 2, 3, 4, 5, 6]);
  } finally {
    await second.quit();
  }
});

test('circuit: exactly one of many concurrent callers wins the half-open probe', { skip }, async () => {
  const id = route();
  for (let i = 0; i < 3; i += 1) await redisStore.circuitRecord(id, 'FAILURE', config, null);
  assert.equal((await redisStore.circuitAcquire(id, config, 'early')).decision, 'DENY');
  await sleep(350);
  const results = await Promise.all(Array.from({ length: 25 }, (_, i) => redisStore.circuitAcquire(id, config, `token-${i}`)));
  assert.equal(results.filter((r) => r.decision === 'PROBE').length, 1, 'one winner');
  assert.equal(results.filter((r) => r.decision === 'DENY').length, 24);
});

test('circuit: an abandoned probe lease expires, a new probe is granted, and the old claimant is rejected', { skip }, async () => {
  const id = route();
  for (let i = 0; i < 3; i += 1) await redisStore.circuitRecord(id, 'FAILURE', config, null);
  await sleep(350);
  assert.deepEqual(await redisStore.circuitAcquire(id, config, 'dead'), { decision: 'PROBE', token: 'dead' });
  assert.equal((await redisStore.circuitAcquire(id, config, 'other')).decision, 'DENY', 'the lease holds');
  await sleep(300);
  assert.deepEqual(await redisStore.circuitAcquire(id, config, 'new'), { decision: 'PROBE', token: 'new' }, 'the TTL freed the slot');
  const stale = await redisStore.circuitRecord(id, 'SUCCESS', config, 'dead');
  assert.equal(stale.applied, false, 'a stale claimant cannot commit');
  assert.deepEqual(await redisStore.circuitRecord(id, 'SUCCESS', config, 'new'), { applied: true, state: 'CLOSED' });
});

test('circuit: the Lua scripts agree with the in-memory state machine on the same scripted sequence', { skip }, async () => {
  const id = route();
  const memory = new InMemoryAIGovernanceStore();
  const both = async (fn) => [await fn(memory), await fn(redisStore)];
  const steps = [
    (s) => s.circuitAcquire(id, config, 'a'),
    (s) => s.circuitRecord(id, 'FAILURE', config, null),
    (s) => s.circuitRecord(id, 'FAILURE', config, null),
    (s) => s.circuitRecord(id, 'SUCCESS', config, null),
    (s) => s.circuitRecord(id, 'FAILURE', config, null),
    (s) => s.circuitRecord(id, 'FAILURE', config, null),
    (s) => s.circuitRecord(id, 'FAILURE', config, null),
    (s) => s.circuitRecord(id, 'SUCCESS', config, null),
  ];
  for (const step of steps) {
    const [fromMemory, fromRedis] = await both(step);
    const strip = (value) => (value && 'retryAfterMs' in value ? { ...value, retryAfterMs: 'n/a' } : value);
    assert.deepEqual(strip(fromRedis), strip(fromMemory));
  }
  // Open now. Wait out the open period, then compare the probe sequence.
  await sleep(350);
  const [memProbe, redisProbe] = await both((s) => s.circuitAcquire(id, config, 'p1'));
  assert.deepEqual(redisProbe, memProbe);
  const [memDeny, redisDeny] = await both((s) => s.circuitAcquire(id, config, 'p2'));
  assert.equal(redisDeny.decision, memDeny.decision);
  const [memBad, redisBad] = await both((s) => s.circuitRecord(id, 'SUCCESS', config, 'not-the-holder'));
  assert.deepEqual(redisBad, memBad);
  const [memOk, redisOk] = await both((s) => s.circuitRecord(id, 'SUCCESS', config, 'p1'));
  assert.deepEqual(redisOk, memOk);
});

test('keys: only the versioned prefix, a kind and the route id are stored, and the circuit key expires on its own', { skip }, async () => {
  const id = route();
  await redisStore.circuitRecord(id, 'FAILURE', config, null);
  await redisStore.incrementRateWindow(id, 5000);
  const keys = await client.keys(`${prefix}*`);
  const mine = keys.filter((key) => key.endsWith(id));
  assert.deepEqual(mine.sort(), [`${prefix}circuit:${id}`, `${prefix}rate:${id}`].sort());
  assert.ok((await client.pttl(`${prefix}circuit:${id}`)) > 0, 'the circuit key has a TTL');
  assert.ok((await client.pttl(`${prefix}rate:${id}`)) > 0, 'the rate key has a TTL');
});

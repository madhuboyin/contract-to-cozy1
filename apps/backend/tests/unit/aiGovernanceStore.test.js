const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Findings Implementation Plan, Phase 5A/5B: shared AI rate windows and circuit state, and the AI-GOV-1 outage behaviour. Everything here runs against
// the in-memory store and test doubles. It proves the policy and the state machine; it does NOT prove Redis atomicity, which tests/integration/
// aiGovernanceRedis.test.js covers only when a Redis URL is supplied.
const store = require('../../src/lib/aiGovernanceStore.ts');
const {
  InMemoryAIGovernanceStore, ResilientAIGovernanceStore, RedisAIGovernanceStore,
  RATE_WINDOW_LUA, CIRCUIT_ACQUIRE_LUA, CIRCUIT_RECORD_LUA,
} = store;
const governance = require('../../src/services/ai/aiRequestGovernance.service.ts');
const { register } = require('prom-client');
const fs = require('node:fs');
const path = require('node:path');
const { transitionHealth } = store;
const sourceRegistry = require('../../src/services/intelligence/sourceRegistry.ts');
const consumerRegistry = require('../../src/services/intelligence/intelligenceConsumerRegistry.ts');
const projection = require('../../src/services/intelligence/sourceHealthProjection.service.ts');

const config = { failureThreshold: 3, openMs: 1000, probeTtlMs: 500 };
const clock = (start = 1_000_000) => { let now = start; return { now: () => now, advance: (ms) => { now += ms; } }; };
const never = () => new Promise(() => {});

test('a fixed rate window starts at its first request and resets after the window', async () => {
  const c = clock();
  const memory = new InMemoryAIGovernanceStore(c.now);
  assert.deepEqual([await memory.incrementRateWindow('ai:ask', 60_000), await memory.incrementRateWindow('ai:ask', 60_000), await memory.incrementRateWindow('ai:ask', 60_000)], [1, 2, 3]);
  c.advance(59_999);
  assert.equal(await memory.incrementRateWindow('ai:ask', 60_000), 4, 'still inside the window');
  c.advance(1);
  assert.equal(await memory.incrementRateWindow('ai:ask', 60_000), 1, 'a new window starts at the next request');
  assert.equal(await memory.incrementRateWindow('ai:other', 60_000), 1, 'routes are counted separately');
});

test('two clients on one shared store see one aggregate count (storage-port test; Redis atomicity is proved elsewhere)', async () => {
  const shared = new InMemoryAIGovernanceStore();
  const a = new ResilientAIGovernanceStore(shared, new InMemoryAIGovernanceStore(), { commandTimeoutMs: 100, retryAfterFailureMs: 1000 });
  const b = new ResilientAIGovernanceStore(shared, new InMemoryAIGovernanceStore(), { commandTimeoutMs: 100, retryAfterFailureMs: 1000 });
  const counts = [];
  for (let i = 0; i < 6; i += 1) counts.push((await (i % 2 === 0 ? a : b).incrementRateWindow('ai:ask', 60_000)).count);
  assert.deepEqual(counts, [1, 2, 3, 4, 5, 6]);
});

test('the circuit opens at the failure threshold, denies with a retry time, and a late closed-state completion is ignored', async () => {
  const c = clock();
  const memory = new InMemoryAIGovernanceStore(c.now);
  for (let i = 0; i < 2; i += 1) {
    assert.deepEqual(await memory.circuitAcquire('ai:ask', config, 't'), { decision: 'ALLOW' });
    assert.deepEqual(await memory.circuitRecord('ai:ask', 'FAILURE', config, null), { applied: true, state: 'CLOSED' });
  }
  assert.deepEqual(await memory.circuitRecord('ai:ask', 'FAILURE', config, null), { applied: true, state: 'OPEN' });
  c.advance(400);
  assert.deepEqual(await memory.circuitAcquire('ai:ask', config, 't'), { decision: 'DENY', retryAfterMs: 600 });
  // A request admitted before the circuit opened finishes now: it must not close the open circuit.
  assert.deepEqual(await memory.circuitRecord('ai:ask', 'SUCCESS', config, null), { applied: false, state: 'OPEN' });
});

test('a success resets the failure count', async () => {
  const memory = new InMemoryAIGovernanceStore(clock().now);
  await memory.circuitRecord('ai:ask', 'FAILURE', config, null);
  await memory.circuitRecord('ai:ask', 'FAILURE', config, null);
  await memory.circuitRecord('ai:ask', 'SUCCESS', config, null);
  assert.deepEqual(await memory.circuitRecord('ai:ask', 'FAILURE', config, null), { applied: true, state: 'CLOSED' }, 'one failure after a success does not open it');
});

test('exactly one half-open probe wins among concurrent callers; the rest are denied', async () => {
  const c = clock();
  const memory = new InMemoryAIGovernanceStore(c.now);
  for (let i = 0; i < 3; i += 1) await memory.circuitRecord('ai:ask', 'FAILURE', config, null);
  c.advance(1000);
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => memory.circuitAcquire('ai:ask', config, `token-${i}`)));
  assert.equal(results.filter((r) => r.decision === 'PROBE').length, 1);
  assert.equal(results.filter((r) => r.decision === 'DENY').length, 9);
});

test('a dead probe owner recovers after the lease TTL, and its late completion is rejected', async () => {
  const c = clock();
  const memory = new InMemoryAIGovernanceStore(c.now);
  for (let i = 0; i < 3; i += 1) await memory.circuitRecord('ai:ask', 'FAILURE', config, null);
  c.advance(1000);
  assert.deepEqual(await memory.circuitAcquire('ai:ask', config, 'dead'), { decision: 'PROBE', token: 'dead' });
  c.advance(499);
  assert.equal((await memory.circuitAcquire('ai:ask', config, 'other')).decision, 'DENY', 'the lease still holds');
  c.advance(1);
  assert.deepEqual(await memory.circuitAcquire('ai:ask', config, 'new'), { decision: 'PROBE', token: 'new' }, 'the abandoned lease expired');
  assert.deepEqual(await memory.circuitRecord('ai:ask', 'SUCCESS', config, 'dead'), { applied: false, state: 'HALF_OPEN' }, 'a stale claimant cannot commit');
  assert.deepEqual(await memory.circuitRecord('ai:ask', 'SUCCESS', config, 'new'), { applied: true, state: 'CLOSED' });
});

test('a failed probe reopens the circuit and a successful probe closes it', async () => {
  const c = clock();
  const memory = new InMemoryAIGovernanceStore(c.now);
  for (let i = 0; i < 3; i += 1) await memory.circuitRecord('ai:ask', 'FAILURE', config, null);
  c.advance(1000);
  await memory.circuitAcquire('ai:ask', config, 'p1');
  assert.deepEqual(await memory.circuitRecord('ai:ask', 'FAILURE', config, 'p1'), { applied: true, state: 'OPEN' });
  assert.equal((await memory.circuitAcquire('ai:ask', config, 'p2')).decision, 'DENY');
  c.advance(1000);
  await memory.circuitAcquire('ai:ask', config, 'p3');
  assert.deepEqual(await memory.circuitRecord('ai:ask', 'SUCCESS', config, 'p3'), { applied: true, state: 'CLOSED' });
  assert.deepEqual(await memory.circuitAcquire('ai:ask', config, 'x'), { decision: 'ALLOW' });
});

function failingShared(mode) {
  return {
    kind: 'REDIS',
    incrementRateWindow: async () => (mode === 'hang' ? never() : Promise.reject(new Error('redis down'))),
    circuitAcquire: async () => (mode === 'hang' ? never() : Promise.reject(new Error('redis down'))),
    circuitRecord: async () => (mode === 'hang' ? never() : Promise.reject(new Error('redis down'))),
  };
}

test('AI-GOV-1: a failing shared store falls back to the per-process store, is counted, and retries after the interval', async () => {
  const c = clock();
  let healthy = false;
  const real = new InMemoryAIGovernanceStore(c.now);
  const flaky = {
    kind: 'REDIS',
    incrementRateWindow: (route, ms) => (healthy ? real.incrementRateWindow(route, ms) : Promise.reject(new Error('redis down'))),
    circuitAcquire: (r, cfg, t) => (healthy ? real.circuitAcquire(r, cfg, t) : Promise.reject(new Error('redis down'))),
    circuitRecord: (r, o, cfg, t) => (healthy ? real.circuitRecord(r, o, cfg, t) : Promise.reject(new Error('redis down'))),
  };
  const resilient = new ResilientAIGovernanceStore(flaky, new InMemoryAIGovernanceStore(c.now), { commandTimeoutMs: 50, retryAfterFailureMs: 5000, now: c.now });
  const first = await resilient.incrementRateWindow('ai:ask', 60_000);
  assert.deepEqual(first, { count: 1, degraded: true });
  assert.equal(resilient.isDegraded(), true);
  assert.equal((await resilient.incrementRateWindow('ai:ask', 60_000)).count, 2, 'served by the local fallback while degraded');
  healthy = true;
  c.advance(4999);
  assert.equal((await resilient.incrementRateWindow('ai:ask', 60_000)).degraded, true, 'not retried before the interval');
  c.advance(1);
  assert.deepEqual(await resilient.incrementRateWindow('ai:ask', 60_000), { count: 1, degraded: false });
  assert.equal(resilient.isDegraded(), false);
  const text = await register.metrics();
  assert.match(text, /ai_governance_degraded_total\{component="rate",reason="ERROR"\} \d+/);
  assert.match(text, /ai_governance_degraded_total\{component="rate",reason="FALLBACK_ACTIVE"\} \d+/);
});

test('AI-GOV-1: a hung shared store is cut off by the command timeout instead of stalling the request', async () => {
  const resilient = new ResilientAIGovernanceStore(failingShared('hang'), new InMemoryAIGovernanceStore(), { commandTimeoutMs: 40, retryAfterFailureMs: 5000 });
  const startedAt = Date.now();
  const reading = await resilient.incrementRateWindow('ai:ask', 60_000);
  assert.equal(reading.degraded, true);
  assert.ok(Date.now() - startedAt < 1000, 'returned well inside a second');
  assert.match(await register.metrics(), /ai_governance_degraded_total\{component="rate",reason="TIMEOUT"\} \d+/);
});

test('a permit is recorded only to the store that granted it; recording never throws; a stale local probe cannot touch recovered shared state', async () => {
  const c = clock();
  const shared = new InMemoryAIGovernanceStore(c.now);
  let sharedDown = true;
  const gate = (fn) => (...args) => (sharedDown ? Promise.reject(new Error('redis down')) : fn(...args));
  const flaky = {
    kind: 'REDIS',
    incrementRateWindow: gate((r, m) => shared.incrementRateWindow(r, m)),
    circuitAcquire: gate((r, cfg, t) => shared.circuitAcquire(r, cfg, t)),
    circuitRecord: gate((r, o, cfg, t) => shared.circuitRecord(r, o, cfg, t)),
  };
  const local = new InMemoryAIGovernanceStore(c.now);
  const resilient = new ResilientAIGovernanceStore(flaky, local, { commandTimeoutMs: 50, retryAfterFailureMs: 1000, now: c.now });

  // Open the local circuit during the outage, then let it take a local probe.
  for (let i = 0; i < 3; i += 1) {
    const permit = await resilient.circuitAcquire('ai:ask', config, `t${i}`);
    assert.equal(permit.source, 'LOCAL');
    await resilient.circuitRecord('ai:ask', 'FAILURE', config, permit);
  }
  c.advance(1000);
  const localProbe = await resilient.circuitAcquire('ai:ask', config, 'local-probe');
  assert.deepEqual([localProbe.decision, localProbe.source], ['PROBE', 'LOCAL']);

  // Redis comes back and the shared circuit is closed. The local probe finishes now: it must not change shared state.
  sharedDown = false;
  c.advance(1000);
  const sharedPermit = await resilient.circuitAcquire('ai:ask', config, 'shared-1');
  assert.deepEqual([sharedPermit.decision, sharedPermit.source], ['ALLOW', 'SHARED']);
  await resilient.circuitRecord('ai:ask', 'FAILURE', config, localProbe);
  assert.equal(shared.snapshot('ai:ask').failures, 0, 'the local completion did not reach the shared store');
  assert.equal(await resilient.circuitRecord('ai:ask', 'SUCCESS', config, { decision: 'ALLOW', retryAfterMs: 0, source: 'SHARED', token: null }) !== undefined, true);
});

test('the fallback rate limit is stricter than the normal limit, never below one, and the fraction is bounded', () => {
  assert.equal(governance.fallbackRateLimit(60, {}), 30);
  assert.equal(governance.fallbackRateLimit(1, {}), 1);
  assert.equal(governance.fallbackRateLimit(7, {}), 3);
  assert.equal(governance.fallbackRateLimit(60, { AI_GOVERNANCE_FALLBACK_LIMIT_FRACTION: '0.25' }), 15);
  assert.equal(governance.fallbackRateLimit(60, { AI_GOVERNANCE_FALLBACK_LIMIT_FRACTION: '3' }), 30, 'a fraction above 1 is ignored, so the fallback can never be looser than normal');
  assert.equal(governance.fallbackRateLimit(60, { AI_GOVERNANCE_FALLBACK_LIMIT_FRACTION: 'abc' }), 30);
});

test('service: while the shared store is down the stricter fallback limit applies and the request still runs; deterministic work never waits on it', async () => {
  const resilient = new ResilientAIGovernanceStore(failingShared('error'), new InMemoryAIGovernanceStore(), { commandTimeoutMs: 50, retryAfterFailureMs: 60_000 });
  governance.setAIGovernanceStoreForTests(resilient);
  const env = { AI_ROUTE_ASK_RATE_LIMIT_PER_MINUTE: '4', AI_REQUEST_MAX_ATTEMPTS: '1' };
  let runs = 0;
  const call = () => governance.executeGovernedAIRequest({ routeId: 'ai:ask', model: 'm', env, work: async () => { runs += 1; return {}; } });
  await call();
  await call();
  await assert.rejects(call(), (error) => error.code === 'AI_RATE_LIMITED', 'the normal limit is 4, the degraded limit is 2');
  assert.equal(runs, 2);
  governance.resetAIRequestGovernanceForTests();
});

test('service: the shared circuit opens after the threshold and then rejects without running the work', async () => {
  governance.resetAIRequestGovernanceForTests();
  const env = { AI_CIRCUIT_FAILURE_THRESHOLD: '2', AI_REQUEST_MAX_ATTEMPTS: '1', AI_REQUEST_RETRY_BACKOFF_MS: '1' };
  let runs = 0;
  const failing = () => governance.executeGovernedAIRequest({ routeId: 'ai:ask', model: 'm', env, work: async () => { runs += 1; throw new Error('provider down'); } });
  await assert.rejects(failing(), /provider down/);
  await assert.rejects(failing(), /provider down/);
  await assert.rejects(failing(), (error) => error.code === 'AI_CIRCUIT_OPEN');
  assert.equal(runs, 2, 'the third call never reached the provider');
  governance.resetAIRequestGovernanceForTests();
});

test('Redis keys carry only a version prefix, a kind and a registered route id; scripts use the server clock and a token check', async () => {
  const calls = [];
  const fake = { eval: async (script, numKeys, ...args) => { calls.push({ script, numKeys, args }); return script === RATE_WINDOW_LUA ? 1 : script === CIRCUIT_ACQUIRE_LUA ? ['ALLOW', 0] : [1, 'CLOSED']; } };
  const redisStore = new RedisAIGovernanceStore(fake);
  await redisStore.incrementRateWindow('ai:ask', 60_000);
  await redisStore.circuitAcquire('ai:ask', config, 'tok');
  await redisStore.circuitRecord('ai:ask', 'FAILURE', config, null);
  for (const call of calls) {
    assert.equal(call.numKeys, 1);
    assert.match(String(call.args[0]), /^ai:gov:v1:(rate|circuit):ai:[a-z0-9-]+$/);
  }
  assert.ok(calls[1].args[3] >= 3_600_000, 'the circuit key has a stale-key expiry of at least an hour');
  assert.match(CIRCUIT_ACQUIRE_LUA, /redis\.call\('TIME'\)/);
  assert.match(CIRCUIT_RECORD_LUA, /redis\.call\('TIME'\)/);
  assert.match(CIRCUIT_RECORD_LUA, /current ~= token/, 'a probe completion is checked against the current lease holder');
  assert.match(RATE_WINDOW_LUA, /PEXPIRE/);
});

test('governance metric labels are fixed and carry no route, user, property or message', () => {
  const metric = register.getSingleMetric('ai_governance_degraded_total');
  assert.deepEqual(metric.labelNames, ['component', 'reason']);
});

// ── 5C: provider health as one shared record read where source health is assembled (owner decision AI-HEALTH-1) ───────────────────────────────

test('health: a failure run is DEGRADED then UNHEALTHY at the threshold, keeps the last success, and a success clears it', async () => {
  const c = clock();
  const memory = new InMemoryAIGovernanceStore(c.now);
  assert.equal(await memory.readRouteHealth('ai:ask'), null, 'never observed');
  const ok = await memory.recordRouteHealth('ai:ask', 'SUCCESS', 3, null);
  assert.deepEqual([ok.status, ok.consecutiveFailures, ok.lastSuccessAtMs], ['HEALTHY', 0, 1_000_000]);
  c.advance(10);
  const first = await memory.recordRouteHealth('ai:ask', 'FAILURE', 3, 'provider 500');
  assert.deepEqual([first.status, first.consecutiveFailures, first.lastSuccessAtMs, first.message], ['DEGRADED', 1, 1_000_000, 'provider 500']);
  await memory.recordRouteHealth('ai:ask', 'FAILURE', 3, 'again');
  assert.equal((await memory.recordRouteHealth('ai:ask', 'FAILURE', 3, 'third')).status, 'UNHEALTHY');
  const recovered = await memory.recordRouteHealth('ai:ask', 'SUCCESS', 3, null);
  assert.deepEqual([recovered.status, recovered.consecutiveFailures, recovered.message], ['HEALTHY', 0, null]);
});

test('health: a long provider message is bounded', () => {
  const next = transitionHealth(null, 'FAILURE', 5, 3, 'x'.repeat(2000));
  assert.equal(next.message.length, 500);
});

test('health: two processes share one failure run, which a per-process count could not', async () => {
  const shared = new InMemoryAIGovernanceStore();
  const a = new ResilientAIGovernanceStore(shared, new InMemoryAIGovernanceStore(), { commandTimeoutMs: 100, retryAfterFailureMs: 1000 });
  const b = new ResilientAIGovernanceStore(shared, new InMemoryAIGovernanceStore(), { commandTimeoutMs: 100, retryAfterFailureMs: 1000 });
  await a.recordRouteHealth('ai:ask', 'FAILURE', 2, 'a');
  await b.recordRouteHealth('ai:ask', 'FAILURE', 2, 'b');
  const seen = await a.readRouteHealth('ai:ask');
  assert.deepEqual([seen.source, seen.health.consecutiveFailures, seen.health.status], ['SHARED', 2, 'UNHEALTHY']);
});

test('health: successes are written to the shared record at most once per interval, but a failure and the success after it are always written', async () => {
  const c = clock();
  const writes = [];
  const real = new InMemoryAIGovernanceStore(c.now);
  const counting = { ...real, kind: 'REDIS', recordRouteHealth: (r, o, t, m) => { writes.push(o); return real.recordRouteHealth(r, o, t, m); }, readRouteHealth: (r) => real.readRouteHealth(r), incrementRateWindow: real.incrementRateWindow.bind(real), circuitAcquire: real.circuitAcquire.bind(real), circuitRecord: real.circuitRecord.bind(real) };
  const resilient = new ResilientAIGovernanceStore(counting, new InMemoryAIGovernanceStore(c.now), { commandTimeoutMs: 50, retryAfterFailureMs: 1000, now: c.now, healthSuccessWriteIntervalMs: 15_000 });
  for (let i = 0; i < 5; i += 1) { await resilient.recordRouteHealth('ai:ask', 'SUCCESS', 3, null); c.advance(1000); }
  assert.deepEqual(writes, ['SUCCESS'], 'five successes inside the interval wrote once');
  await resilient.recordRouteHealth('ai:ask', 'FAILURE', 3, 'x');
  await resilient.recordRouteHealth('ai:ask', 'SUCCESS', 3, null);
  assert.deepEqual(writes, ['SUCCESS', 'FAILURE', 'SUCCESS'], 'a failure and the success right after it are never throttled');
  c.advance(15_000);
  await resilient.recordRouteHealth('ai:ask', 'SUCCESS', 3, null);
  assert.equal(writes.length, 4, 'a success after the interval is written again');
});

test('AI-GOV-1 for health: with the shared store down a read serves this process\'s own last observation, labelled, or nothing, never a guess; it recovers', async () => {
  const c = clock();
  let down = true;
  const real = new InMemoryAIGovernanceStore(c.now);
  const gate = (fn) => (...args) => (down ? Promise.reject(new Error('redis down')) : fn(...args));
  const flaky = { kind: 'REDIS', incrementRateWindow: gate((...a) => real.incrementRateWindow(...a)), circuitAcquire: gate((...a) => real.circuitAcquire(...a)), circuitRecord: gate((...a) => real.circuitRecord(...a)), recordRouteHealth: gate((...a) => real.recordRouteHealth(...a)), readRouteHealth: gate((...a) => real.readRouteHealth(...a)) };
  const resilient = new ResilientAIGovernanceStore(flaky, new InMemoryAIGovernanceStore(c.now), { commandTimeoutMs: 50, retryAfterFailureMs: 1000, now: c.now });
  const none = await resilient.readRouteHealth('ai:ask');
  assert.deepEqual([none.health, none.source, none.sharedUnavailable], [null, 'LOCAL_LAST_KNOWN', true]);
  await resilient.recordRouteHealth('ai:ask', 'FAILURE', 3, 'seen here');
  const lastKnown = await resilient.readRouteHealth('ai:ask');
  assert.deepEqual([lastKnown.health.status, lastKnown.health.message, lastKnown.source, lastKnown.sharedUnavailable], ['DEGRADED', 'seen here', 'LOCAL_LAST_KNOWN', true]);
  down = false;
  c.advance(1000);
  const back = await resilient.readRouteHealth('ai:ask');
  assert.deepEqual([back.source, back.sharedUnavailable, back.health], ['SHARED', false, null], 'the shared view is authoritative again, and it never saw the outage-time failure');
  assert.match(await register.metrics(), /ai_governance_degraded_total\{component="health",reason="(ERROR|FALLBACK_ACTIVE)"\} \d+/);
});

test('service: a governed request records shared health, and a failed request run reaches UNHEALTHY at the configured threshold', async () => {
  governance.resetAIRequestGovernanceForTests();
  assert.equal((await governance.getAIRouteHealth('ai:ask')).snapshot, null, 'nothing observed yet');
  const env = { AI_CIRCUIT_FAILURE_THRESHOLD: '2', AI_REQUEST_MAX_ATTEMPTS: '1', AI_CIRCUIT_OPEN_MS: '60000' };
  await governance.executeGovernedAIRequest({ routeId: 'ai:ask', model: 'm', env, work: async () => ({}) });
  assert.equal((await governance.getAIRouteHealth('ai:ask')).snapshot.status, 'HEALTHY');
  await assert.rejects(governance.executeGovernedAIRequest({ routeId: 'ai:ask', model: 'm', env, work: async () => { throw new Error('provider down'); } }), /provider down/);
  assert.deepEqual([(await governance.getAIRouteHealth('ai:ask')).snapshot.status, (await governance.getAIRouteHealth('ai:ask')).snapshot.consecutiveFailures], ['DEGRADED', 1]);
  await assert.rejects(governance.executeGovernedAIRequest({ routeId: 'ai:ask', model: 'm', env, work: async () => { throw new Error('provider down'); } }), /provider down/);
  const unhealthy = await governance.getAIRouteHealth('ai:ask');
  assert.equal(unhealthy.snapshot.status, 'UNHEALTHY');
  assert.equal(unhealthy.snapshot.lastSuccessAt instanceof Date, true, 'the last success is kept');
  governance.resetAIRequestGovernanceForTests();
});

test('5C: governed AI no longer fans a health change out to properties', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/services/ai/aiRequestGovernance.service.ts'), 'utf8');
  for (const forbidden of ['allPropertyIds', 'emitSourceHealthChangesForProperties', 'sourceHealthImpact', 'publishRouteHealthIfChanged', 'emittedRouteHealth', 'SOURCE_HEALTH_CHANGED']) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not be referenced by the AI governance path`);
  }
});

test('5C: every AI source is a read-time source with no recompute mapping, and no consumer subscribes to a health type nothing emits', () => {
  assert.deepEqual(sourceRegistry.validateIntelligenceSourceRegistry(), []);
  for (const entry of sourceRegistry.AI_SOURCE_REGISTRY) {
    assert.equal(entry.healthPropagation, 'READ_TIME', entry.sourceId);
    assert.equal(entry.healthEntityType, undefined, entry.sourceId);
    assert.equal(entry.recomputeConsumerKeys, undefined, entry.sourceId);
  }
  const emitted = new Set(sourceRegistry.INTELLIGENCE_SOURCE_REGISTRY.map((entry) => entry.healthEntityType).filter(Boolean));
  const subscribed = new Set(consumerRegistry.INTELLIGENCE_CONSUMER_REGISTRY.flatMap((consumer) => consumer.relevantSourceHealthEntityTypes ?? []));
  assert.equal(subscribed.has('AI_SOURCE'), false);
  // PROPERTY_INTELLIGENCE_SOURCE is emitted by property intelligence code rather than a registry entry; the point is only that AI_SOURCE is gone.
  assert.equal(emitted.has('AI_SOURCE'), false);
});

test('5C: the registry still rejects a recompute source without a mapping, and a read-time source that declares one', () => {
  const base = { sourceId: 'x:y', kind: 'EXTERNAL', owner: 'o', capabilityConsumers: ['c'], freshnessSlaSeconds: 1, credentialConfigRequirements: ['k'], retryPolicy: { maxAttempts: 1, backoffMs: 0 }, fallbackBehavior: 'f', userVisibleDegradationMessage: 'm', operationalRunbook: 'r' };
  assert.match(sourceRegistry.validateIntelligenceSourceRegistry([{ ...base }]).join(), /missing source-health recompute mapping/);
  assert.match(sourceRegistry.validateIntelligenceSourceRegistry([{ ...base, healthPropagation: 'READ_TIME', healthEntityType: 'T', recomputeConsumerKeys: ['home-actions'] }]).join(), /read-time source must not declare a recompute mapping/);
  assert.deepEqual(sourceRegistry.validateIntelligenceSourceRegistry([{ ...base, healthPropagation: 'READ_TIME' }]), []);
});

test('5C: the admin projection shows shared health, labels last-known readings, and never invents a status', () => {
  const entry = sourceRegistry.AI_SOURCE_REGISTRY[0];
  const env = { GEMINI_API_KEY: 'k' };
  const snapshot = { status: 'UNHEALTHY', lastAttemptAt: new Date('2026-11-05T10:00:00Z'), lastSuccessAt: new Date('2026-11-05T09:00:00Z'), consecutiveFailures: 4, message: 'provider 500' };
  const shared = projection.mapAIRegistryHealth(entry, env, { snapshot, source: 'SHARED', sharedUnavailable: false });
  assert.deepEqual([shared.status, shared.consecutiveFailures, shared.message], ['UNHEALTHY', 4, 'provider 500']);
  const lastKnown = projection.mapAIRegistryHealth(entry, env, { snapshot, source: 'LOCAL_LAST_KNOWN', sharedUnavailable: true });
  assert.equal(lastKnown.status, 'UNHEALTHY');
  assert.match(lastKnown.message, /Shared AI health is unavailable; showing this process's last observation \(2026-11-05T10:00:00.000Z\)/);
  const nothing = projection.mapAIRegistryHealth(entry, env, { snapshot: null, source: 'LOCAL_LAST_KNOWN', sharedUnavailable: true });
  assert.deepEqual([nothing.status, nothing.lastCheckedAt], ['UNKNOWN', null]);
  assert.match(nothing.message, /Shared AI health is unavailable and this process has not observed/);
  assert.equal(projection.mapAIRegistryHealth(entry, { GEMINI_API_KEY: 'k', AI_REQUESTS_ENABLED: 'false' }, { snapshot, source: 'SHARED', sharedUnavailable: false }).status, 'DISABLED');
  assert.equal(projection.mapAIRegistryHealth(entry, {}, { snapshot, source: 'SHARED', sharedUnavailable: false }).status, 'UNKNOWN', 'no credential configured');
  assert.equal(projection.mapAIRegistryHealth(entry, env, null).status, 'UNKNOWN');
});

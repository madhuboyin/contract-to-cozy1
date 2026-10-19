const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  ASK_WORK_PROVIDER_REGISTRY, workProviderReadFloor, workProviderActionFloors, workActionAllowed, evaluateWorkProviderApplicability, validateAskWorkProviderRegistry,
} = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');
const { composeAskWorkPage, encodeWorkCursor, validateAskWorkProviders, ASK_WORK_PROVIDER_READERS } = require('../../src/services/ask/askWork.service.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

const byId = (id) => ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === id);
const PROPERTY = 'prop-1';
const row = (providerId, key, sortAt, extra = {}) => ({
  workKey: key, sourceAliases: [], providerId, workType: byId(providerId).workType, propertyId: PROPERTY, entity: { type: 'x', id: key },
  title: key, summary: null, status: { canonical: 'OPEN', label: 'Open' }, lifecycleView: 'NEEDS_YOU', nextAction: null, sortAt,
  freshness: { version: 'v1', asOf: sortAt }, sourceOwner: byId(providerId).owner,
  resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: { operationId: null, entityType: null, entityId: null, actionId: null, decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: null } },
  ...extra,
});
const input = (role = 'OWNER') => ({ userId: 'u1', propertyId: PROPERTY, role, operatingMode: 'OWNING' });
// Treat every provider as connected so the merge, dedup and failure paths run against injected readers.
const CONNECTED = ASK_WORK_PROVIDER_REGISTRY.map((entry) => ({ ...entry, reader: { state: 'CONNECTED' } }));
const compose = (inp, q, readers) => composeAskWorkPage(inp, q, readers, CONNECTED);
const query = (extra = {}) => ({ view: 'NEEDS_YOU', limit: 2, after: null, workType: null, status: null, ...extra });

test('work provider registry is valid and covers every FR-WORK-001 source', () => {
  assert.deepEqual(validateAskWorkProviderRegistry(), []);
  assert.deepEqual(validateAskWorkProviders(), []);
  const types = new Set(ASK_WORK_PROVIDER_REGISTRY.map((entry) => entry.workType));
  for (const required of ['PENDING_EXECUTION', 'PROJECT', 'GUIDANCE_JOURNEY', 'DECISION_THREAD', 'INCIDENT', 'CLAIM', 'REPAIR', 'RENOVATION_CASE', 'MONITOR', 'QUEUED_JOB', 'RETRYABLE_EXECUTION', 'UNKNOWN_OUTCOME_EXECUTION', 'SCHEDULED_FOLLOW_UP']) assert.ok(types.has(required), required);
});

test('read floor is the strictest read operation floor; action floors are per command', () => {
  for (const entry of ASK_WORK_PROVIDER_REGISTRY) {
    const strictest = entry.readOperationIds.reduce((floor, id) => {
      const next = ASK_OPERATION_DEFINITIONS[id].propertyRoleFloor;
      const rank = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
      return next && (floor === null || rank[next] > rank[floor]) ? next : floor;
    }, null);
    assert.equal(workProviderReadFloor(entry), strictest, entry.id);
  }
  assert.equal(workProviderReadFloor(byId('CLAIMS')), 'VIEWER');
  assert.equal(workProviderReadFloor(byId('MONITORS')), 'CONTRIBUTOR');
  assert.equal(workActionAllowed(byId('CLAIMS'), 'CLAIM_TRANSITION', 'VIEWER'), false);
  assert.equal(workActionAllowed(byId('CLAIMS'), 'CLAIM_TRANSITION', 'CONTRIBUTOR'), true);
  assert.equal(workActionAllowed(byId('CLAIMS'), 'ROOM_CREATE', 'OWNER'), false, 'an operation the provider does not declare is never allowed');
  assert.deepEqual(Object.keys(workProviderActionFloors(byId('DIY_PROJECTS'))).sort(), [...byId('DIY_PROJECTS').commandOperationIds].sort());
});

test('applicability reports a restricted role without hiding the provider', () => {
  assert.equal(evaluateWorkProviderApplicability(byId('MONITORS'), { householdRole: 'VIEWER', operatingMode: 'OWNING' }), 'RESTRICTED');
  assert.equal(evaluateWorkProviderApplicability(byId('PENDING_EXECUTIONS'), { householdRole: 'VIEWER', operatingMode: 'OWNING' }), 'APPLICABLE');
});

test('validation rejects dishonest reader claims and a fallback that outranks canonical providers', () => {
  const claims = byId('CLAIMS');
  assert.match(validateAskWorkProviderRegistry([{ ...claims, reader: { state: 'UNAVAILABLE', reason: ' ' } }]).join('\n'), /gives no reason/);
  assert.match(validateAskWorkProviderRegistry([{ ...claims, readOperationIds: [] }]).join('\n'), /declares none/);
  assert.match(validateAskWorkProviderRegistry([claims, { ...byId('OPERATIONAL_WORK_ITEMS'), precedence: 5 }]).join('\n'), /fallback projection/);
  assert.match(validateAskWorkProviders([{ ...claims, reader: { state: 'CONNECTED' } }], {}).join('\n'), /no registered reader/);
  assert.match(validateAskWorkProviders([{ ...claims, reader: { state: 'UNAVAILABLE', reason: 'not yet' } }], { CLAIMS: async () => ({ rows: [], total: 0, viewCounts: null }) }).join('\n'), /registered reader but is declared unavailable/);
});

test('with no readers supplied, every provider is UNAVAILABLE and the page is partial with no total', async () => {
  assert.deepEqual(Object.keys(ASK_WORK_PROVIDER_READERS).sort(), ASK_WORK_PROVIDER_REGISTRY.filter((entry) => entry.reader.state === 'CONNECTED').map((entry) => entry.id).sort());
  const page = await composeAskWorkPage(input(), query(), {});
  assert.equal(page.providers.length, ASK_WORK_PROVIDER_REGISTRY.length, 'no provider is omitted');
  assert.ok(page.partial);
  assert.equal(page.total, null);
  assert.equal(page.totalScope, 'PARTIAL');
  assert.equal(page.rows.length, 0);
  for (const status of page.providers.filter((entry) => entry.state === 'UNAVAILABLE')) assert.ok(status.reason);
});

test('merges provider pages in (sortAt desc, workKey asc) order and pages with a stable cursor', async () => {
  const data = {
    PROJECTS: [row('PROJECTS', 'project:a', '2026-10-05T00:00:00.000Z'), row('PROJECTS', 'project:b', '2026-10-03T00:00:00.000Z')],
    CLAIMS: [row('CLAIMS', 'claim:a', '2026-10-05T00:00:00.000Z'), row('CLAIMS', 'claim:b', '2026-10-01T00:00:00.000Z')],
  };
  const reader = (id) => async (_ctx, q) => {
    const rows = data[id].filter((r) => !q.after || r.sortAt < q.after.sortAt || (r.sortAt === q.after.sortAt && r.workKey > q.after.workKey)).slice(0, q.limit);
    return { rows, total: data[id].length, viewCounts: { NEEDS_YOU: data[id].length } };
  };
  const first = await compose(input(), query({ limit: 2 }), { PROJECTS: reader('PROJECTS'), CLAIMS: reader('CLAIMS') });
  assert.deepEqual(first.rows.map((r) => r.workKey), ['claim:a', 'project:a']);
  assert.equal(first.truncated, true);
  assert.ok(first.nextCursor);
  const boundary = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'));
  const second = await compose(input(), query({ limit: 2, after: { sortAt: boundary.t, workKey: boundary.k } }), { PROJECTS: reader('PROJECTS'), CLAIMS: reader('CLAIMS') });
  assert.deepEqual(second.rows.map((r) => r.workKey), ['project:b', 'claim:b']);
  assert.equal(second.truncated, false);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(JSON.parse(Buffer.from(encodeWorkCursor('NEEDS_YOU', { sortAt: 'x', workKey: 'y' }), 'base64url').toString('utf8')), { v: 'NEEDS_YOU', t: 'x', k: 'y' });
});

test('the canonical provider wins over the OperationalWorkItem projection and the loser becomes an alias', async () => {
  const project = row('PROJECTS', 'project:p1', '2026-10-05T00:00:00.000Z');
  const projection = row('OPERATIONAL_WORK_ITEMS', 'workItem:w1', '2026-10-06T00:00:00.000Z', { sourceAliases: ['project:p1'] });
  const reader = (rows) => async () => ({ rows, total: rows.length, viewCounts: null });
  for (const readers of [
    { PROJECTS: reader([project]), OPERATIONAL_WORK_ITEMS: reader([projection]) },
    { OPERATIONAL_WORK_ITEMS: reader([projection]), PROJECTS: reader([project]) },
  ]) {
    const page = await compose(input(), query({ limit: 5 }), readers);
    assert.equal(page.rows.length, 1);
    assert.equal(page.rows[0].workKey, 'project:p1');
    assert.equal(page.rows[0].providerId, 'PROJECTS');
    assert.deepEqual(page.rows[0].sourceAliases, ['workItem:w1']);
  }
});

test('a failing provider is reported FAILED, never dropped or counted as zero, and the page stays partial', async () => {
  const page = await compose(input(), query(), {
    PROJECTS: async () => { throw new Error('boom'); },
    CLAIMS: async () => ({ rows: [row('CLAIMS', 'claim:a', '2026-10-05T00:00:00.000Z')], total: 1, viewCounts: null }),
  });
  assert.equal(page.providers.find((p) => p.providerId === 'PROJECTS').state, 'FAILED');
  assert.equal(page.providers.find((p) => p.providerId === 'PROJECTS').total, null);
  assert.equal(page.rows.length, 1);
  assert.equal(page.partial, true);
  assert.equal(page.total, null);
});

test('a role below the read floor withholds rows without calling the reader', async () => {
  let called = false;
  const page = await compose(input('VIEWER'), query(), { MONITORS: async () => { called = true; return { rows: [], total: 0, viewCounts: null }; } });
  assert.equal(called, false);
  assert.equal(page.providers.find((p) => p.providerId === 'MONITORS').state, 'RESTRICTED');
});

test('rows from another property are never delivered', async () => {
  const stray = row('PROJECTS', 'project:z', '2026-10-05T00:00:00.000Z', { propertyId: 'other' });
  const page = await compose(input(), query(), { PROJECTS: async () => ({ rows: [stray], total: 1, viewCounts: null }) });
  assert.equal(page.rows.length, 0);
});

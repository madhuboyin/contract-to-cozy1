const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { parseCrossDomainSemanticRequest } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

// "show open claims for water damage" parsed as a complete plan for "open claims" alone: "water damage" was recognised and never used, so every open claim came back.
const base = buildSeededCrossDomainSnapshot();
const claim = (id, title, status, claimType) => ({ id, propertyId: base.propertyId, title, slug: id, status, requiredDocumentTypes: [], ...(claimType ? { claimType } : {}) });
const CLAIMS = [
  claim('c1', 'Basement flood', 'OPEN', 'WATER_DAMAGE'), claim('c2', 'Old pipe burst', 'CLOSED', 'WATER_DAMAGE'),
  claim('c3', 'Kitchen fire', 'OPEN', 'FIRE_SMOKE'), claim('c4', 'Untyped draft', 'OPEN', undefined),
];
const run = async (rawText) => {
  const execution = await X.executeCrossDomainSnapshot({ rawText, snapshot: { ...base, claims: CLAIMS, claimDocLinks: [] }, role: 'OWNER', propertyAuthorized: true });
  const facet = execution.facetResults[0];
  return { execution, ids: [...(facet?.recordIds ?? [])].sort(), summary: facet?.summary ?? '' };
};
const where = (m) => parseCrossDomainSemanticRequest(m).plan.facets[0]?.where;
const atoms = (w) => (w.kind === 'PREDICATE' ? [w] : w.operands.flatMap(atoms));

test('a claim-type word is part of the plan, not ignored: open AND water damage', () => {
  for (const m of ['show open claims that are related to water damage', 'show open claims for water damage', 'show open water damage claims']) {
    const plan = parseCrossDomainSemanticRequest(m).plan;
    assert.equal(plan.outcome, 'MATCH', m);
    assert.deepEqual(plan.unresolvedSpans, [], m);
    assert.deepEqual(atoms(plan.facets[0].where).map((a) => `${a.predicateId}=${a.enumStatus}`).sort(), ['predicate.claim.has_status=OPEN', 'predicate.claim.has_type=WATER_DAMAGE'], m);
  }
  assert.equal(where('show water damage claims').predicateId, 'predicate.claim.has_type', 'a type alone applies to every status');
  assert.equal(where('show open claims').predicateId, 'predicate.claim.has_status');
});

test('open AND type returns only open claims of that type; a type alone includes closed ones', async () => {
  assert.deepEqual((await run('show open claims that are related to water damage')).ids, ['c1']);
  assert.deepEqual((await run('show water damage claims')).ids, ['c1', 'c2']);
  assert.deepEqual((await run('show open fire claims')).ids, ['c3']);
});

test('plain "open claims" is unchanged: every open claim, whatever its type', async () => {
  const r = await run('show open claims');
  assert.deepEqual(r.ids, ['c1', 'c3', 'c4']);
  assert.match(r.summary, /^3 open claim\(s\): /);
});

test('the answer says which type and that it comes from the type each claim was filed under; an empty result is plain', async () => {
  const hit = await run('show open claims that are related to water damage');
  assert.match(hit.summary, /^1 open water damage claim \(by the type each claim was filed under\): Basement flood\.? ?/);
  assert.match(hit.summary, /1 claim has no recorded type and is not counted\./, 'an untyped claim is never guessed into the type');
  const none = await run('show open storm claims');
  assert.match(none.summary, /^No open storm, wind or hail claims are recorded \(by the type each claim was filed under\)\./);
});

test('claim DOCUMENT questions are not taken by the claim list', () => {
  assert.equal(parseCrossDomainSemanticRequest('which water damage claim documents are missing').plan.facets[0]?.evidence.jobMatch, 'query.claim.documents');
});

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });

test('the live prompt through the real handler is filtered by the type the claim was filed under', async () => {
  const empty = { findMany: async () => [], findFirst: async () => null, findUnique: async () => null, count: async () => 0 };
  const row = (id, title, status, type) => ({ id, propertyId: 'p1', title, status, type, documents: [], checklistItems: [] });
  prismaModule.prisma = new Proxy({}, { get: (_t, m) => (m === 'then' ? undefined : m === '$disconnect' ? (async () => {}) : m === 'claim' ? { ...empty, findMany: async () => [row('a', 'Water damage claim', 'DRAFT', 'WATER_DAMAGE'), row('b', 'Fire or smoke claim', 'DRAFT', 'FIRE_SMOKE')] } : m === 'property' ? { ...empty, findUnique: async () => ({ id: 'p1', timezone: 'UTC' }) } : empty) });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  const result = await capabilityInvoke('DATA_POINT_READ', { userId: 'u1', propertyId: 'p1', message: 'show open claims that are related to water damage' });
  const text = JSON.stringify(result.blocks);
  assert.match(text, /Water damage claim/);
  assert.ok(!/Fire or smoke claim/.test(text), 'the fire claim is not a water damage claim');
});

// "fire" and "smoke" were emergencies on their own in the cross-domain parser, so a fire CLAIM or a smoke-detector question was answered with the emergency card.
test('fire and smoke describing something happening are still emergencies', () => {
  for (const m of ['my kitchen is on fire', 'there is a fire in my house', 'I smell smoke', 'smoke is coming from the vent', 'fire right now', 'electrical fire', 'my smoke alarm is going off', 'the house is filling with smoke', 'there is a fire in the basement']) {
    assert.equal(parseCrossDomainSemanticRequest(m).plan.outcome, 'BOUNDARY', m);
  }
});

test('the words alone, in an ordinary question, are not an emergency', () => {
  for (const m of ['show open fire claims', 'show my smoke detector maintenance tasks', 'Smoke & CO detector check', 'when does my fire insurance expire']) {
    assert.notEqual(parseCrossDomainSemanticRequest(m).plan.outcome, 'BOUNDARY', m);
  }
});

test('a fire claim question is answered from the claim list, not with the emergency card', async () => {
  assert.deepEqual((await run('show open fire claims')).ids, ['c3']);
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { parseCrossDomainSemanticRequest, buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { verifySemanticReadReceiptEntailment } = require('../../src/services/ask/semantic/semanticReceiptEntailment.ts');
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

// Live prompt #3 ("are there any open claims or pending permits for this home?") returned the open claims and nothing else: the first domain's job was compiled
// and the permits part vanished, so "no permits" could be read into a claims-only answer.
const parsed = (m) => parseCrossDomainSemanticRequest(m);
const jobs = (m) => parsed(m).plan.facets.map((f) => f.evidence.jobMatch);
const overflow = (m) => parsed(m).overflowFacets.map((o) => o.label);

test('an "or" between different domains is two questions: the supported one is answered, the other is named', () => {
  assert.deepEqual(jobs('are there any open claims or pending permits for this home?'), ['query.claim.filter']);
  assert.deepEqual(overflow('are there any open claims or pending permits for this home?'), ['pending permits for this home?']);
  assert.deepEqual(jobs('show open claims or open projects'), ['query.claim.filter']);
  assert.deepEqual(overflow('show open claims or open projects'), ['open projects']);
});

test('an "and" across domains defers the part it cannot answer instead of failing the whole question', () => {
  assert.deepEqual(jobs('are there any open claims and pending permits for this home?'), ['query.claim.filter']);
  assert.deepEqual(overflow('are there any open claims and pending permits for this home?'), ['pending permits for this home?']);
});

test('nothing changes where every part is answerable', () => {
  const m = 'what claims are open and which active projects still need a permit?';
  assert.deepEqual(jobs(m), ['query.claim.filter', 'query.project.needs_permit']);
  assert.deepEqual(overflow(m), []);
});

test('an "or" inside one domain is a condition, not a second question', () => {
  assert.deepEqual(jobs('which appliances have no warranty or are older than 10 years'), ['query.inventory_item.relation_boolean']);
  assert.deepEqual(overflow('which appliances have no warranty or are older than 10 years'), []);
  assert.deepEqual(overflow('show open claims or water damage claims'), [], 'two claim conditions are one domain');
});

test('the answered section says it is only part of what was asked, in plain words', async () => {
  const execution = await X.executeCrossDomainSnapshot({ rawText: 'are there any open claims or pending permits for this home?', snapshot: buildSeededCrossDomainSnapshot(), role: 'OWNER', propertyAuthorized: true });
  assert.equal(execution.status, 'PARTIAL');
  const result = X.buildOperationResultFromCrossDomainExecution(execution);
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  const summary = result.blocks.find((b) => b.type === 'SUMMARY');
  assert.match(summary.title, /\(partly answered\)$/);
  assert.equal(summary.tone, 'CAUTION');
  assert.match(summary.body, /open claim\(s\): Water-damage claim\./);
  assert.match(summary.body, /I couldn’t answer “pending permits for this home” here, so that part isn’t included in this answer\./);
  assert.ok(!/DOMAIN_NOT_SEARCHED|Overflow/.test(JSON.stringify(result.blocks)), 'no developer text reaches the homeowner');
  assert.equal(verifySemanticReadReceiptEntailment(result).outcome, 'PASS', 'the receipt-bound block keeps its id');
});

test('a fully answered question has no note and keeps its title', async () => {
  const execution = await X.executeCrossDomainSnapshot({ rawText: 'what claims are open and which active projects still need a permit?', snapshot: buildSeededCrossDomainSnapshot(), role: 'OWNER', propertyAuthorized: true });
  const result = X.buildOperationResultFromCrossDomainExecution(execution);
  assert.ok(!/couldn’t answer|partly answered/.test(JSON.stringify(result.blocks)));
});

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });

test('the live prompt through the real handler names the part it could not answer', async () => {
  const empty = { findMany: async () => [], findFirst: async () => null, findUnique: async () => null, count: async () => 0 };
  const row = { id: 'a', propertyId: 'p1', title: 'Water damage claim', status: 'DRAFT', type: 'WATER_DAMAGE', documents: [], checklistItems: [] };
  prismaModule.prisma = new Proxy({}, { get: (_t, m) => (m === 'then' ? undefined : m === '$disconnect' ? (async () => {}) : m === 'claim' ? { ...empty, findMany: async () => [row] } : m === 'property' ? { ...empty, findUnique: async () => ({ id: 'p1', timezone: 'UTC' }) } : empty) });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  const result = await capabilityInvoke('DATA_POINT_READ', { userId: 'u1', propertyId: 'p1', message: 'are there any open claims or pending permits for this home?' });
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  const text = JSON.stringify(result.blocks);
  assert.match(text, /Water damage claim/);
  assert.match(text, /I couldn’t answer “pending permits for this home”/);
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Claims C-2 (FRD v1.128): the status read's filters are a governed refinement. The real registered `incident-claim.status` handler runs
// against a fake prisma that honours status filters, take limits and counts, and records which queries ran. Reading never writes.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const inStatus = (row, where) => !where?.status || (where.status.in ? where.status.in.includes(row.status) : where.status.notIn ? !where.status.notIn.includes(row.status) : true);
const incident = (id, status) => ({ id, title: `Incident ${id}`, summary: null, status, severity: 'HIGH', openedAt: new Date('2026-09-01'), resolvedAt: status === 'RESOLVED' ? new Date('2026-09-10') : null, typeKey: 'WATER_LEAK' });
const claim = (id, status) => ({ id, title: `Claim ${id}`, status, type: 'WATER_DAMAGE', sourceType: 'INSURANCE', providerName: 'Acme', incidentAt: null, openedAt: new Date('2026-09-01'), closedAt: status === 'CLOSED' ? new Date('2026-09-15') : null, updatedAt: new Date('2026-09-20') });
const BASE = { incidents: [incident('i-active', 'ACTIVE'), incident('i-resolved', 'RESOLVED')], claims: [claim('c-open', 'SUBMITTED'), claim('c-draft', 'DRAFT'), claim('c-closed', 'CLOSED')] };

let data; let calls; let priorOperation; let priorViewState;
function install(overrides = {}) {
  data = { ...BASE, ...overrides }; calls = []; priorOperation = 'INCIDENT_CLAIM_STATUS'; priorViewState = null;
  const model = (name) => ({
    findMany: async ({ where, take }) => { calls.push([name, 'findMany', take]); return data[name === 'incident' ? 'incidents' : 'claims'].filter((row) => inStatus(row, where)).slice(0, take); },
    count: async ({ where }) => { calls.push([name, 'count']); return data[name === 'incident' ? 'incidents' : 'claims'].filter((row) => inStatus(row, where)).length; },
  });
  prismaModule.prisma = new Proxy({}, { get(_t, m) {
    if (m === 'then') return undefined;
    if (m === 'incident') return model('incident');
    if (m === 'claim') return model('claim');
    if (m === 'askExecution') return { findFirst: async () => (priorViewState ? { operationId: priorOperation, parametersJson: { viewState: priorViewState } } : null) };
    throw new Error(`Unexpected prisma.${String(m)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });
// FR-FAST-10 / FR-GATE-8 slice 7: INCIDENT_CLAIM_STATUS provisional read. The real registered handler runs (fake prisma as claimsRefinementRuntime.test.js) and its answer goes through the delivery gate.
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { groundedClaimStatusVerdict, GROUNDED_READ_CHECKS } = require('../../src/services/ask/support/provisionalRead.ts');
const { isProvisionalReadOperation } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const list = (result) => result.blocks.find((block) => block.id === 'incident-claim-list');
const run = (message, role) => { if (role) propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' }); return capabilityInvoke('INCIDENT_CLAIM_STATUS', { userId: 'u1', propertyId: 'p1', message }); };
const gate = (question, result) => validateAskAnswerTrustPipeline({ question, operationId: 'INCIDENT_CLAIM_STATUS', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('INCIDENT_CLAIM_STATUS')].flat()) });

test('INCIDENT_CLAIM_STATUS is on the allowlist and started for plain status questions only', () => {
  assert.ok('INCIDENT_CLAIM_STATUS' in GROUNDED_READ_CHECKS); assert.equal(isProvisionalReadOperation('INCIDENT_CLAIM_STATUS'), true);
  for (const m of ['What is my claim status?', 'Show my claims', 'Do I have any open claims?']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL', m); assert.equal(d.operation.operationId, 'INCIDENT_CLAIM_STATUS', m); }
  for (const m of ['File a claim for my broken furnace', 'Mark this claim approved', 'How much will my claim pay out?']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.notEqual(d.operation?.operationId === 'INCIDENT_CLAIM_STATUS' && d.stage === 'PROVISIONAL', true, m); }
});
test('real claim answers are delivered for the scope asked', async () => {
  install();
  for (const q of ['What is my claim status?', 'Show my claims', 'Show my incidents', 'Do I have any open claims?']) {
    const a = await run(q, 'CONTRIBUTOR'); const c = gate(q, a); assert.equal(c.semantic.outcome, 'PASS', `${q}: ${JSON.stringify(c.semantic)} ${JSON.stringify(list(a)?.sections?.map((s) => s.id))}`); assert.deepEqual(c.semantic.reasonCodes, ['PROVISIONAL_READ_GROUNDED']);
  }
  const claimsOnly = await run('Show my claims', 'CONTRIBUTOR'); assert.equal(list(claimsOnly).sections.some((s) => s.id.includes('incidents')), false);
  const viewer = await run('Show my claims', 'VIEWER'); assert.equal(gate('Show my claims', viewer).semantic.outcome, 'PASS', 'a viewer restriction notice states no value');
  install({ incidents: [], claims: [] }); assert.equal(gate('What is my claim status?', await run('What is my claim status?', 'CONTRIBUTOR')).semantic.outcome, 'PASS', 'none recorded is an honest answer');
});
test('a mismatched answer is withheld', async () => {
  install(); const both = await run('Show my incidents and claims', 'CONTRIBUTOR'); const claimsOnly = await run('Show my claims', 'CONTRIBUTOR'); const incidentsOnly = await run('Show my incidents', 'CONTRIBUTOR');
  const code = (q, a) => groundedClaimStatusVerdict(q, a).reasonCodes[1];
  assert.equal(code('Show my claims', both), 'INCIDENTS_SHOWN_FOR_A_CLAIMS_QUESTION'); assert.equal(code('Show my incidents', claimsOnly), 'CLAIMS_SHOWN_FOR_AN_INCIDENTS_QUESTION');
  assert.equal(code('Show my claims', incidentsOnly), 'CLAIMS_SHOWN_FOR_AN_INCIDENTS_QUESTION'.replace('CLAIMS_SHOWN_FOR_AN_INCIDENTS_QUESTION', 'INCIDENTS_SHOWN_FOR_A_CLAIMS_QUESTION'));
  assert.equal(code('When does my warranty expire?', both), 'QUESTION_NOT_ABOUT_CLAIMS_OR_INCIDENTS'); assert.equal(code('File a claim for the leak', both), 'ANOTHER_OPERATION_OWNS_THE_QUESTION');
  assert.equal(code('What is my claim status?', { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'x', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }], suggestions: [] }), 'ANSWER_LACKS_THE_RECORDED_INFORMATION_BOUNDARY');
  const onlyClosed = { ...claimsOnly, blocks: claimsOnly.blocks.map((b) => (b.id === 'incident-claim-list' ? { ...b, sections: b.sections.filter((s) => s.id.startsWith('closed-') || s.id.startsWith('resolved-')) } : b)) };
  assert.equal(code('Do I have any open claims?', onlyClosed), 'ONLY_CLOSED_RECORDS_SHOWN_FOR_AN_OPEN_QUESTION'); assert.equal(gate('Do I have any open claims?', onlyClosed).trust.outcome, 'CLARIFY');
});

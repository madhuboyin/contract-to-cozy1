const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.66: HOA_COMPLIANCE_STATUS (HOA Compliance), the seventeenth new Ask operation for a
// capability the Appendix D audit found with none. The service's three reads run against a fake prisma, so the page's
// own queries are what the operation reads.

const prismaModule = require('../../src/lib/prisma.ts');
const { hoaComplianceFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');

const NOW = new Date('2026-09-24T12:00:00.000Z');
const PAGE = '/dashboard/hoa?propertyId=p1';
const GUIDANCE = '/dashboard/properties/p1/tools/guidance-overview';
const EMAIL = 'manager@hoa.example';
const NOTE = 'Board meets second Tuesday';
const original = prismaModule.prisma;
let queries;

const association = () => ({
  id: 'a1', propertyId: 'p1', name: 'Maple Ridge HOA', managementCompany: 'Summit Management', contactName: 'Dana', contactEmail: EMAIL,
  contactPhone: '555-0100', duesAmountCents: 25000, duesFrequency: 'MONTHLY', nextDueDate: new Date('2026-11-01T12:00:00.000Z'), notes: NOTE, isActive: true,
});
const approval = (id, overrides = {}) => ({
  id, propertyId: 'p1', workType: 'FENCE', description: null, reportedStatus: 'NOT_SUBMITTED', decisionStatus: null, decisionTruthLayer: null,
  submittedDate: null, approvalConditions: null, denialReason: null, expirationDate: null, notes: NOTE, isActive: true, createdAt: NOW, ...overrides,
});
const approvals = () => [
  approval('fence', { description: 'Cedar privacy fence', reportedStatus: 'APPROVED', decisionStatus: 'APPROVED_WITH_CONDITIONS', decisionTruthLayer: 'ASSOCIATION_CONFIRMED', submittedDate: new Date('2026-08-01T12:00:00.000Z'), approvalConditions: 'Max height 6 ft', expirationDate: new Date('2027-02-01T12:00:00.000Z') }),
  // Reported approved by the household and backed only by an uploaded document: not an association approval.
  approval('paint', { workType: 'EXTERIOR_PAINT', reportedStatus: 'APPROVED', decisionStatus: 'APPROVED', decisionTruthLayer: 'DOCUMENTED', expirationDate: new Date('2026-06-01T12:00:00.000Z') }),
  approval('deck', { workType: 'DECK_PATIO', reportedStatus: 'UNDER_REVIEW' }),
];
const incidents = () => [
  { id: 'v1', title: 'HOA violation: Trash cans visible', summary: 'Trash cans visible', status: 'ACTIVE', severity: 'WARNING', details: { description: 'Neighbor complaint', cureDeadline: '2026-10-10T12:00:00.000Z', fineAmountCents: 5000 }, openedAt: new Date('2026-09-01T12:00:00.000Z'), resolvedAt: null },
  { id: 'v2', title: 'HOA violation: Lawn height', summary: 'Lawn height', status: 'RESOLVED', severity: 'INFO', details: {}, openedAt: new Date('2026-05-01T12:00:00.000Z'), resolvedAt: new Date('2026-05-20T12:00:00.000Z') },
];

function install({ withAssociation = true } = {}) {
  queries = [];
  prismaModule.prisma = {
    hoaAssociation: { findFirst: async (query) => { queries.push(['association', query]); return withAssociation ? association() : null; } },
    hoaApprovalRecord: { findMany: async (query) => { queries.push(['approvals', query]); return withAssociation ? approvals() : []; } },
    incident: { findMany: async (query) => { queries.push(['incidents', query]); return withAssociation ? incidents() : []; } },
    guidanceSignal: { findMany: async () => [{ sourceEntityId: 'v1', duplicateGroupKey: 'hoa-group' }] },
    guidanceJourney: { findMany: async () => [{ id: 'j1', mergedSignalGroupKey: 'hoa-group' }] },
  };
}

test.beforeEach(() => install());
test.afterEach(() => { prismaModule.prisma = original; });

const invoke = () => capabilityInvoke('HOA_COMPLIANCE_STATUS', { userId: 'u1', propertyId: 'p1', message: 'Show my HOA records' }, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });

test('the operation runs the page\'s three reads behind the page\'s viewer floor', async () => {
  const result = await invoke();
  assert.equal(result.reasonCode, 'HOA_COMPLIANCE_READY');
  assert.deepEqual(queries.find(([name]) => name === 'association')[1].where, { propertyId: 'p1', isActive: true });
  assert.deepEqual(queries.find(([name]) => name === 'approvals')[1].where, { propertyId: 'p1', isActive: true });
  assert.deepEqual(queries.find(([name]) => name === 'incidents')[1].where, { propertyId: 'p1', typeKey: 'HOA_VIOLATION_DETECTED' });
  const open = result.blocks.find((block) => block.id === 'hoa-compliance-items').sections[0];
  assert.equal(open.items[0].href, `${GUIDANCE}?journeyId=j1`);
});

test('reported statuses stay apart from decisions on record; only the association\'s count as approved', async () => {
  const result = hoaComplianceFromView({ association: association(), approvals: approvals(), violations: [
    { id: 'v1', title: 'HOA violation: Trash cans visible', summary: 'Trash cans visible', status: 'ACTIVE', cureDeadline: '2026-10-10T12:00:00.000Z', fineAmountCents: 5000, openedAt: new Date('2026-09-01T12:00:00.000Z'), resolvedAt: null, journeyId: null },
    { id: 'v2', title: 'HOA violation: Lawn height', summary: 'Lawn height', status: 'RESOLVED', cureDeadline: null, fineAmountCents: null, openedAt: new Date('2026-05-01T12:00:00.000Z'), resolvedAt: new Date('2026-05-20T12:00:00.000Z'), journeyId: null },
    // Just reported, not yet reviewed: still open.
    { id: 'v3', title: 'HOA violation: Mailbox color', summary: 'Mailbox color', status: 'DETECTED', cureDeadline: null, fineAmountCents: null, openedAt: new Date('2026-09-20T12:00:00.000Z'), resolvedAt: null, journeyId: null },
  ] }, 'p1', NOW);
  const [summary, list] = result.blocks;
  assert.equal(summary.title, 'Maple Ridge HOA');
  assert.equal(summary.body, 'Managed by Summit Management. Dues are $250 monthly, next due Nov 1, 2026. 3 approval requests: 1 approved by the association, 1 awaiting a decision. 2 open violations.');
  assert.equal(summary.tone, 'CAUTION');
  assert.equal(summary.actions[0].href, PAGE);
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((item) => item.title)]), [
    ['Open violations', ['Trash cans visible', 'Mailbox color']],
    ['Approval requests', ['Fence', 'Exterior Paint', 'Deck / Patio']],
    ['Past violations', ['Lawn height']],
  ]);
  const [violation] = list.sections[0].items;
  assert.deepEqual(violation.meta, ['Cure by Oct 10, 2026', 'Fine $50']);
  assert.equal(violation.status, 'Needs Attention');
  assert.equal(violation.href, GUIDANCE);
  assert.equal(list.sections[0].items[1].status, 'Reported');
  const [fence, paint, deck] = list.sections[1].items;
  assert.deepEqual(fence.meta, ['You reported: Approved', 'Association: Approved (Conditions)', 'Submitted Aug 1, 2026', 'Conditions: Max height 6 ft', 'Expires Feb 1, 2027']);
  assert.equal(fence.status, 'Approved (Conditions)');
  assert.deepEqual(paint.meta, ['You reported: Approved', 'Documented (association not confirmed): Approved', 'Expired Jun 1, 2026']);
  assert.equal(paint.status, 'Not confirmed');
  assert.deepEqual(deck.meta, ['You reported: Under Review', 'No association decision on record']);
  assert.deepEqual(list.sections[2].items[0].meta, ['Resolved May 20, 2026']);
  const text = JSON.stringify(result);
  assert.equal(text.includes(EMAIL) || text.includes('555-0100') || text.includes(NOTE), false);
});

test('no HOA recorded is not an all-clear', async () => {
  install({ withAssociation: false });
  const result = await invoke();
  assert.equal(result.reasonCode, 'HOA_COMPLIANCE_EMPTY');
  assert.equal(result.blocks[0].title, 'No HOA recorded for this home');
  assert.equal(result.blocks.at(-1).title, 'A reported status is not an approval');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', async () => {
  const raw = await invoke();
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'hoa-compliance.status', operationId: 'HOA_COMPLIANCE_STATUS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: NOW.toISOString() }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my HOA records', operationId: 'HOA_COMPLIANCE_STATUS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'HOA_COMPLIANCE_STATUS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('HOA record questions route here; approval requirements, closing and reporting are not claimed', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my HOA records', 'Did the HOA approve our fence request?', 'Are there any open HOA violations?', 'How much are our HOA dues?']) {
    assert.equal(route(message).operation?.operationId, 'HOA_COMPLIANCE_STATUS', message);
  }
  // Each of these matches the HOA pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Do I need HOA approval to build a deck?', 'Report an HOA violation for the trash cans', 'What HOA dues are owed at closing?', 'Update the HOA approval status']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'HOA_COMPLIANCE_STATUS', false, message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('HOA_COMPLIANCE_STATUS').id, 'hoa-compliance');
  assert.equal(ASK_OPERATION_CAPABILITY.HOA_COMPLIANCE_STATUS, 'hoa-compliance');
  const launch = capabilityCardLaunch('hoa-compliance').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'HOA_COMPLIANCE_STATUS');
});

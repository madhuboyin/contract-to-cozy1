const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.64: the Emergency Help card (product decision, option A). The card launches
// INCIDENT_CONTINUATION inline; the page's AI troubleshooter stays a labelled handoff; the immediate-danger boundary
// carries no app link.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const original = prismaModule.prisma;
let queries;

test.beforeEach(() => {
  queries = [];
  prismaModule.prisma = {
    incident: { findMany: async (query) => { queries.push(['incident', query]); return [{ id: 'i1', title: 'Basement water', status: 'ACTIVE', updatedAt: new Date() }]; } },
    claim: { findMany: async (query) => { queries.push(['claim', query]); return [{ id: 'c1', title: 'Water damage claim', status: 'DRAFT', updatedAt: new Date() }]; } },
  };
});
test.afterEach(() => { prismaModule.prisma = original; });

const invoke = (role = 'VIEWER') => capabilityInvoke('INCIDENT_CONTINUATION', { userId: 'u1', propertyId: 'p1', message: 'Follow up on a home emergency' }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });

test('the Emergency Help card launches the incident and claim follow-up read', () => {
  const launch = capabilityCardLaunch('emergency').inlineLaunch;
  assert.equal(launch.operationId, 'INCIDENT_CONTINUATION');
  const route = resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true });
  assert.equal(route.operation.operationId, 'INCIDENT_CONTINUATION');
  assert.equal(route.stage, 'DETERMINISTIC');
});

test('incidents follow the Incidents page default (suppressed hidden) and carry no desktop link', async () => {
  const result = await invoke();
  assert.deepEqual(queries.find(([model]) => model === 'incident')[1].where, { propertyId: 'p1', isSuppressed: false });
  const list = result.blocks.find((block) => block.id === 'incident-continuation-records');
  const [incidents, claims] = list.sections;
  assert.equal(incidents.items[0].href, null);
  assert.equal(incidents.items[0].description, 'active');
  assert.equal(claims.items[0].href, null);
});

test('a contributor is offered starting a claim in Ask, a viewer is offered nothing, and no answer links to a desktop page', async () => {
  for (const role of ['OWNER', 'CONTRIBUTOR']) {
    const raw = await invoke(role);
    const result = { ...raw, parameters: { ...raw.parameters, audiencePresentation: { householdRole: role } } };
    const list = result.blocks.find((block) => block.id === 'incident-continuation-records');
    assert.deepEqual(list.actions.map((action) => [action.id, action.label, action.interactionType, action.operationId, action.href]), [
      ['claim-file-start', 'Start a claim', 'START_WORKFLOW', 'CLAIM_FILE', undefined],
    ], role);
    assert.equal(isAskActionApplicable({ action: list.actions[0], operationId: 'INCIDENT_CONTINUATION', propertyId: 'p1', householdRole: role, authoritativeSourceAvailable: true }), true, role);
    assert.equal(JSON.stringify(result).includes('/dashboard/'), false, role);
    assert.match(list.description, /Emergency Help AI troubleshooter is not currently available in Ask/);
  }
  const raw = await invoke('VIEWER');
  const viewer = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'incident-claim.continuation', operationId: 'INCIDENT_CONTINUATION', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  assert.deepEqual(viewer.blocks.find((block) => block.id === 'incident-continuation-records').actions, []);
  const checked = validateAskAnswerTrust({ question: 'Follow up on a home emergency', operationId: 'INCIDENT_CONTINUATION', result: viewer, propertyId: 'p1' });
  assert.deepEqual(checked.result.blocks.map((block) => block.id), viewer.blocks.map((block) => block.id));
});

test('an immediate-danger message still gets the emergency boundary, with no app link', async () => {
  const route = resolveAskRoutingCascade('I smell gas in the kitchen', { localRoutingEnabled: true });
  assert.equal(route.operation.operationId, 'EMERGENCY_BOUNDARY');
  const result = await capabilityInvoke('EMERGENCY_BOUNDARY', { userId: 'u1', propertyId: 'p1', message: 'I smell gas in the kitchen' }, {});
  assert.equal(result.reasonCode, 'IMMEDIATE_SAFETY');
  assert.equal(JSON.stringify(result).includes('/dashboard/emergency'), false);
});

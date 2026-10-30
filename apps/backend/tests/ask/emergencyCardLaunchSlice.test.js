const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.64: the Emergency Help card (product decision, option A). The card launches
// INCIDENT_CONTINUATION inline; the page's AI troubleshooter stays a labelled handoff; the immediate-danger boundary
// carries no app link.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/handlers/claims.handler.ts');
require('../../src/services/ask/handlers/miscHandlers.handler.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const original = prismaModule.prisma;
let queries;

test.beforeEach(() => {
  queries = [];
  const incident = { id: 'i1', title: 'Basement water', summary: 'Water entered the basement.', status: 'ACTIVE', severity: 'HIGH', openedAt: new Date('2026-10-20T00:00:00Z'), resolvedAt: null, typeKey: 'WATER' };
  const claim = { id: 'c1', title: 'Water damage claim', status: 'DRAFT', type: 'WATER_DAMAGE', sourceType: 'INSURANCE', providerName: 'Acme', incidentAt: new Date('2026-10-20T00:00:00Z'), openedAt: new Date('2026-10-21T00:00:00Z'), closedAt: null };
  prismaModule.prisma = {
    incident: {
      findMany: async (query) => { queries.push(['incident', query]); return query.where.status.in ? [incident] : []; },
      count: async (query) => query.where.status.in ? 1 : 0,
    },
    claim: {
      findMany: async (query) => { queries.push(['claim', query]); return query.where.status.in ? [claim] : []; },
      count: async (query) => query.where.status.in ? 1 : 0,
    },
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

test('emergency follow-up reuses the modern incident and claim result with actionable records', async () => {
  const result = await invoke('OWNER');
  assert.equal(queries.find(([model]) => model === 'incident')[1].where.propertyId, 'p1');
  assert.equal(queries.find(([model]) => model === 'incident')[1].where.isSuppressed, false);
  const list = result.blocks.find((block) => block.id === 'incident-claim-list');
  const incidents = list.sections.find((section) => section.id === 'active-incidents');
  const claims = list.sections.find((section) => section.id === 'active-claims');
  assert.equal(incidents.items[0].href, null);
  assert.equal(incidents.items[0].entityType, 'INCIDENT');
  assert.equal(incidents.items[0].description, 'Water entered the basement.');
  assert.equal(incidents.items[0].actions[0].operationId, 'CLAIM_FILE');
  assert.equal(claims.items[0].href, null);
  assert.equal(claims.items[0].entityType, 'CLAIM');
  assert.equal(result.blocks[0].id, 'incident-continuation-boundary');
  assert.match(result.blocks[0].body, /call 911 or local emergency services now/i);
});

test('a contributor is offered starting a claim in Ask, a viewer is offered nothing, and no answer links to a desktop page', async () => {
  for (const role of ['OWNER', 'CONTRIBUTOR']) {
    const raw = await invoke(role);
    const result = { ...raw, parameters: { ...raw.parameters, audiencePresentation: { householdRole: role } } };
    const summary = result.blocks.find((block) => block.id === 'incident-claim-summary');
    assert.deepEqual(summary.actions.map((action) => [action.id, action.label, action.interactionType, action.operationId, action.href]), [
      ['claim-file-start', 'Start a claim', 'START_WORKFLOW', 'CLAIM_FILE', undefined],
    ], role);
    const list = result.blocks.find((block) => block.id === 'incident-claim-list');
    assert.deepEqual(list.actions.map((action) => action.id), ['claim-file-start'], role);
    assert.equal(isAskActionApplicable({ action: summary.actions[0], operationId: 'INCIDENT_CONTINUATION', propertyId: 'p1', householdRole: role, authoritativeSourceAvailable: true }), true, role);
    assert.equal(JSON.stringify(result).includes('/dashboard/'), false, role);
    assert.match(result.blocks.find((block) => block.id === 'incident-claim-list').description, /live emergency troubleshooting is not available in Ask/);
  }
  const raw = await invoke('VIEWER');
  const viewer = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'incident-claim.continuation', operationId: 'INCIDENT_CONTINUATION', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  assert.deepEqual(viewer.blocks.find((block) => block.id === 'incident-claim-summary').actions, []);
  const viewerList = viewer.blocks.find((block) => block.id === 'incident-claim-list');
  assert.deepEqual(viewerList.actions, []);
  const incidentSection = viewerList.sections.find((section) => section.id === 'active-incidents');
  assert.deepEqual(incidentSection.items[0].actions, []);
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

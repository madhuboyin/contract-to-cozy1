const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Claims C-1 (FRD v1.127): the incident and claim status read as a calm answer. The real registered `incident-claim.status` handler runs
// against a fake prisma. Nothing here changes filing or status transitions: those keep their own confirmation flows.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { claimsCalmCopy } = require('../../src/services/ask/handlers/claims.handler.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const BOUNDARY_TEXT = 'This shows the incident and claim records in your Home Record. It does not decide whether a claim will be approved or covered. Filing a claim or changing its status happens only when you ask and confirm.';
const incident = (id, status, overrides = {}) => ({ id, title: `Incident ${id}`, summary: null, status, severity: 'HIGH', openedAt: new Date('2026-09-01'), resolvedAt: status === 'RESOLVED' ? new Date('2026-09-10') : null, typeKey: 'WATER_LEAK', ...overrides });
const claim = (id, status, overrides = {}) => ({ id, title: `Claim ${id}`, status, type: 'WATER_DAMAGE', sourceType: 'INSURANCE', providerName: 'Acme', incidentAt: null, openedAt: new Date('2026-09-01'), closedAt: status === 'CLOSED' ? new Date('2026-09-15') : null, updatedAt: new Date('2026-09-20'), ...overrides });
const matchesStatus = (row, where) => !where?.status || (where.status.in ? where.status.in.includes(row.status) : where.status.notIn ? !where.status.notIn.includes(row.status) : true);
const readable = (rows) => ({ findMany: async ({ where, take } = {}) => rows().filter((row) => matchesStatus(row, where)).slice(0, take ?? 1000), count: async ({ where } = {}) => rows().filter((row) => matchesStatus(row, where)).length });
let role; let data;
function install(incidents = [], claims = []) {
  role = 'CONTRIBUTOR'; data = { incidents, claims };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'incident') return readable(() => data.incidents);
    if (model === 'claim') return readable(() => data.claims);
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });
const run = (message = 'What is the status of my insurance claim?') => capabilityInvoke('INCIDENT_CLAIM_STATUS', { userId: 'u1', propertyId: 'p1', message });
const summary = (result) => result.blocks.find((block) => block.id === 'incident-claim-summary');
const list = (result) => result.blocks.find((block) => block.id === 'incident-claim-list');

test('the headline says what is open in one sentence, and never anything about approval, coverage or eligibility', () => {
  const copy = (overrides) => claimsCalmCopy({ focus: 'BOTH', activeIncidents: 0, resolvedIncidents: 0, openClaims: 0, closedClaims: 0, truncated: false, ...overrides });
  assert.equal(copy({ activeIncidents: 2, openClaims: 1 }).headline, '2 active incidents and 1 open claim.');
  assert.equal(copy({ activeIncidents: 1 }).headline, '1 active incident.');
  assert.equal(copy({ openClaims: 3 }).headline, '3 open claims.');
  assert.equal(copy({ resolvedIncidents: 2, closedClaims: 1 }).headline, 'No active incidents or open claims.');
  assert.equal(copy({ focus: 'CLAIMS', openClaims: 0, closedClaims: 2 }).headline, 'No open claims.');
  assert.equal(copy({ focus: 'INCIDENTS', activeIncidents: 0 }).headline, 'No active incidents.');
  for (const value of [copy({ activeIncidents: 2, openClaims: 1, closedClaims: 4 }), copy({ closedClaims: 1 })]) {
    assert.ok(!/approv|cover|eligib|deny|denied|pay|settle/i.test(value.headline + (value.supportLine ?? '') + value.chips.map((chip) => chip.label).join(' ')));
  }
});

test('closed and resolved records are named once, as also on file, and never inside the headline; a full page says so', () => {
  const copy = claimsCalmCopy({ focus: 'BOTH', activeIncidents: 1, resolvedIncidents: 2, openClaims: 1, closedClaims: 3, truncated: true });
  assert.equal(copy.supportLine, '2 resolved incidents and 3 closed claims also on file. Showing the most recent records; open the page for the full record.');
  assert.ok(!/closed|resolved/.test(copy.headline));
  assert.deepEqual(copy.chips, [
    { label: '1 active incident', tone: 'CAUTION' }, { label: '1 open claim', tone: 'CAUTION' }, { label: '2 resolved', tone: 'DEFAULT' }, { label: '3 closed', tone: 'DEFAULT' },
  ]);
  assert.ok(copy.supportLine.length <= 240);
});

test('the answer declares its headline and chips from the same records, and a recorded-information boundary in every outcome', async () => {
  install([incident('i1', 'ACTIVE'), incident('i2', 'RESOLVED')], [claim('c1', 'SUBMITTED'), claim('c2', 'CLOSED')]);
  const result = await run('Show my incidents and claims');
  assert.equal(summary(result).headline, '1 active incident and 1 open claim.');
  assert.equal(summary(result).supportLine, '1 resolved incident and 1 closed claim also on file.');
  const boundary = result.blocks.find((block) => block.id === 'claim-status-boundary');
  assert.equal(boundary.body, BOUNDARY_TEXT);
  assert.equal(boundary.severity, 'INFO');
  install([], []);
  const empty = await run('Show my claims');
  assert.equal(empty.blocks.at(-1).id, 'claim-status-boundary');
  assert.equal(empty.blocks[0].id, 'incident-claim-empty');
});

test('page links ride on the list as quiet secondary links; no action is filled, and claim rows still carry only the transition actions they did', async () => {
  install([incident('i1', 'ACTIVE')], [claim('c1', 'DRAFT')]);
  const result = await run('Show my incidents and claims');
  assert.deepEqual(list(result).actions.map((action) => [action.id, action.style]), [['open-incidents-list', 'SECONDARY'], ['open-claims-list', 'SECONDARY']]);
  assert.ok(!list(result).actions.some((action) => action.interactionType === 'START_WORKFLOW'), 'no claim action is offered from the answer');
  const claimItem = list(result).sections.flatMap((section) => section.items).find((item) => item.entityType === 'CLAIM');
  assert.ok(claimItem.actions.length > 0 && claimItem.actions.every((action) => action.operationId === 'CLAIM_TRANSITION'));
  const incidentItem = list(result).sections.flatMap((section) => section.items).find((item) => item.id === 'i1');
  assert.equal(incidentItem.actions, undefined);
  role = 'VIEWER';
  const viewer = await run('Show my incidents and claims');
  assert.ok(list(viewer).sections.flatMap((section) => section.items).filter((item) => item.entityType === 'CLAIM').every((item) => item.actions.length === 0), 'a viewer gets read-only rows');
  const claimsOnly = await run('Show my claims');
  assert.deepEqual(list(claimsOnly).actions.map((action) => action.id), ['open-claims-list'], 'a claims question does not link the incidents page');
});

test('the answer survives the answer-trust validator with its boundary and the new page links on the whitelist', async () => {
  install([incident('i1', 'ACTIVE')], [claim('c1', 'SUBMITTED')]);
  const raw = await run('Show my incidents and claims');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'incident-claim.status', operationId: 'INCIDENT_CLAIM_STATUS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-26T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my incidents and claims', operationId: 'INCIDENT_CLAIM_STATUS', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  for (const id of ['open-incidents-list', 'open-claims-list']) {
    assert.equal(isAskActionApplicable({ action: { id, label: 'x', href: '/x', style: 'SECONDARY' }, operationId: 'INCIDENT_CLAIM_STATUS', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), false, id);
  }
});

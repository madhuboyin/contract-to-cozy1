const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// Group B recall-mutation follow-up (gap audit §17; FRD v1.163). Same fake-prisma-plus-service-swap
// harness as tests/ask/inspectionHubCapabilitySlice.test.js -- recalls.service.ts's own
// confirmRecallMatch/dismissRecallMatch/resolveRecallMatch are swapped out (not exercised for real),
// since this slice only wires Ask's propose/confirm dispatch to them, not new write logic.

const prismaModule = require('../../src/lib/prisma.ts');
const {
  RECALL_MATCH_ACTIONS, recallMatchItemActions, recallReviewHref, RECALL_RESOLUTION_DEFAULT,
} = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { RecallResolutionSchema } = require('../../src/services/ask/askHandlerSupport.ts');
const recallsService = require('../../src/services/recalls.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = {
  confirmRecallMatch: recallsService.confirmRecallMatch,
  dismissRecallMatch: recallsService.dismissRecallMatch,
  resolveRecallMatch: recallsService.resolveRecallMatch,
  resolveAccess: propertyAccess.resolvePropertyAccess,
};
const UPDATED_AT = new Date('2026-09-29T00:00:00.000Z');
let accessRole;
let match;
let calls;

function install() {
  accessRole = 'CONTRIBUTOR';
  match = {
    id: 'match-1', propertyId: 'p1', status: 'NEEDS_CONFIRMATION', confirmedAt: null, dismissedAt: null, resolvedAt: null,
    confidencePct: 40, maintenanceTaskId: null, updatedAt: UPDATED_AT,
    recall: { title: 'Dishwasher Fire Hazard', severity: 'CRITICAL', hazard: 'Fire risk', remedy: 'Stop use and contact manufacturer', summary: null, status: 'ACTIVE' },
    inventoryItem: { name: 'Dishwasher', isVerified: false, manufacturer: null, modelNumber: null },
  };
  calls = { confirm: [], dismiss: [], resolve: [] };
  const models = {
    askExecution: { findMany: async () => [] },
    recallMatch: {
      findMany: async () => [match],
      findFirst: async ({ where }) => (where.id === match.id ? match : null),
    },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return models[model];
    },
  });
  recallsService.confirmRecallMatch = async (...args) => { calls.confirm.push(args); return {}; };
  recallsService.dismissRecallMatch = async (...args) => { calls.dismiss.push(args); return {}; };
  recallsService.resolveRecallMatch = async (...args) => { calls.resolve.push(args); return {}; };
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = realPrisma;
  Object.assign(recallsService, { confirmRecallMatch: originals.confirmRecallMatch, dismissRecallMatch: originals.dismissRecallMatch, resolveRecallMatch: originals.resolveRecallMatch });
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const version = () => createHash('sha256').update(`${match.id}:${match.status}:${UPDATED_AT.toISOString()}`).digest('hex');
const propose = (message) => capabilityInvoke('RECALL_MATCH_UPDATE', {
  userId: 'u1', propertyId: 'p1', message,
  launchContext: { surface: 'ASK_WORKSPACE', entityType: 'RECALL_MATCH', entityId: 'match-1', operationId: 'RECALL_MATCH_UPDATE', sourceExecutionId: 'exec-list' },
});
const execution = () => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'RECALL_MATCH_UPDATE', createdAt: new Date('2026-09-29T00:00:00.000Z') });
const confirm = (parameters) => confirmCapabilityInvoke('RECALL_MATCH_UPDATE', { userId: 'u1', execution: execution(), parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('RECALL_MATCH_UPDATE') });
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };

test('confirm is the only available action while identity is unconfirmed (NEEDS_CONFIRMATION); dismiss also available', async () => {
  const confirmResult = await propose('Confirm this recall match.');
  assert.equal(confirmResult.status, 'NEEDS_CONFIRMATION', 'confirm should be allowed');
  assert.equal(confirmResult.parameters.recallMatchId, 'match-1');
  assert.equal(confirmResult.parameters.recallMatchAction, 'CONFIRM');

  const dismissResult = await propose('Dismiss this recall match.');
  assert.equal(dismissResult.status, 'NEEDS_CONFIRMATION', 'dismiss should be allowed');

  // Resolve is not yet allowed: identity has not been confirmed (applicability is still UNKNOWN).
  const resolveResult = await propose('Resolve this recall match.');
  assert.equal(resolveResult.status, 'NEEDS_ENTITY', 'resolve should not be offered before identity is confirmed');
});

test('once identity is confirmed and status is OPEN, resolve is available and confirm is not', async () => {
  match.status = 'OPEN';
  match.confirmedAt = UPDATED_AT;
  match.confidencePct = 95;
  match.inventoryItem = { name: 'Dishwasher', isVerified: true, manufacturer: 'Acme', modelNumber: 'DW-100' };

  const resolveResult = await propose('Resolve this recall match.');
  assert.equal(resolveResult.status, 'NEEDS_CONFIRMATION');
  assert.equal(resolveResult.parameters.recallMatchAction, 'RESOLVE');
  assert.deepEqual(resolveResult.parameters.recallResolution, RECALL_RESOLUTION_DEFAULT);
  assert.deepEqual(resolveResult.confirmation.editableFields.map((field) => [field.key, field.type, field.value]), [['resolutionType', 'SELECT', 'FIXED'], ['resolutionNotes', 'TEXTAREA', '']]);

  const confirmResult = await propose('Confirm this recall match.');
  assert.equal(confirmResult.status, 'NEEDS_ENTITY', 'confirm should no longer be offered once identity is already confirmed');
});

test('confirming a confirm/dismiss/resolve action calls the matching canonical recalls.service.ts write', async () => {
  await confirm({ recallMatchId: 'match-1', recallMatchAction: 'CONFIRM', recallMatchContextVersion: version() });
  assert.equal(calls.confirm.length, 1);
  assert.deepEqual(calls.confirm[0], ['p1', 'match-1']);

  await confirm({ recallMatchId: 'match-1', recallMatchAction: 'DISMISS', recallMatchContextVersion: version() });
  assert.equal(calls.dismiss.length, 1);
  assert.deepEqual(calls.dismiss[0], ['p1', 'match-1']);

  await confirm({ recallMatchId: 'match-1', recallMatchAction: 'RESOLVE', recallMatchContextVersion: version(), recallResolution: { resolutionType: 'REPLACED', resolutionNotes: 'Swapped for a new unit' } });
  assert.equal(calls.resolve.length, 1);
  assert.deepEqual(calls.resolve[0], [{ propertyId: 'p1', matchId: 'match-1', resolutionType: 'REPLACED', resolutionNotes: 'Swapped for a new unit' }]);
  assert.equal(RecallResolutionSchema.safeParse({ resolutionType: 'REPLACED', resolutionNotes: 'Swapped for a new unit' }).success, true);

  // A proposal made before an edit carries no resolution and gets the traditional default type.
  await confirm({ recallMatchId: 'match-1', recallMatchAction: 'RESOLVE', recallMatchContextVersion: version() });
  assert.equal(calls.resolve[1][0].resolutionType, 'FIXED');
});

test('a stale contextVersion is rejected unless the action was already applied', async () => {
  const stale = 'stale-version';
  const code = await codeOf(confirm({ recallMatchId: 'match-1', recallMatchAction: 'CONFIRM', recallMatchContextVersion: stale }));
  assert.equal(code, 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(calls.confirm.length, 0);

  // Already applied (status already DISMISSED): stale version is tolerated, no write repeated.
  match.status = 'DISMISSED';
  await confirm({ recallMatchId: 'match-1', recallMatchAction: 'DISMISS', recallMatchContextVersion: stale });
  assert.equal(calls.dismiss.length, 0, 'already-applied dismiss should not call the write again');
});

test('match rows carry every live-state action for contributors; viewers get read-only rows', async () => {
  const list = async () => (await capabilityInvoke('RECALL_REVIEW', { userId: 'u1', propertyId: 'p1', message: 'Show my open recall matches' })).blocks.find((block) => block.id === 'recall-review-matches');
  const contributor = await list();
  const [row] = contributor.sections[0].items;
  assert.equal(row.href, recallReviewHref('p1'));
  assert.deepEqual(row.actions.map((action) => action.id), ['recall-confirm', 'recall-dismiss']);
  accessRole = 'VIEWER';
  assert.deepEqual((await list()).sections[0].items[0].actions, []);
});

test('the match actions and the recalls link survive the answer-trust whitelist', () => {
  for (const action of [...recallMatchItemActions('OWNER'), { id: 'open-recalls', label: 'Open Recalls & Safety Alerts', href: '/dashboard/properties/p1/recalls', style: 'SECONDARY' }]) {
    assert.equal(isAskActionApplicable({ action, operationId: 'RECALL_REVIEW', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, action.id);
  }
});

test('every declared recall match action canned message proposes exactly its own action for the launched match', async () => {
  match.status = 'OPEN';
  match.confirmedAt = UPDATED_AT;
  match.inventoryItem = { name: 'Dishwasher', isVerified: true, manufacturer: 'Acme', modelNumber: 'DW-100' };
  for (const action of RECALL_MATCH_ACTIONS) {
    if (action.action === 'CONFIRM') continue; // not allowed once identity is already confirmed, per the state fixture above
    const result = await propose(action.message);
    assert.equal(result.status, 'NEEDS_CONFIRMATION', action.id);
    assert.equal(result.parameters.recallMatchId, 'match-1');
    assert.equal(result.parameters.recallMatchAction, action.action, action.id);
  }
});

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
  RECALL_MATCH_ACTIONS, recallMatchItemActions, RECALL_RESOLUTION_DEFAULT,
} = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { RecallResolutionSchema } = require('../../src/services/ask/askHandlerSupport.ts');
const recallsService = require('../../src/services/recalls.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const { buildRecallMatchCompletion } = require('../../src/services/guidanceEngine/guidanceToolReporting.ts');

const realPrisma = prismaModule.prisma;
const originals = {
  confirmRecallMatch: recallsService.confirmRecallMatch,
  dismissRecallMatch: recallsService.dismissRecallMatch,
  resolveRecallMatch: recallsService.resolveRecallMatch,
  resolveAccess: propertyAccess.resolvePropertyAccess,
  recordToolCompletion: guidanceJourneyService.recordToolCompletion,
};
const UPDATED_AT = new Date('2026-09-29T00:00:00.000Z');
let accessRole;
let match;
let calls;
let reports;
let reportFailure;
let sourceLaunch;
let stepRow;

function install() {
  accessRole = 'CONTRIBUTOR';
  match = {
    id: 'match-1', propertyId: 'p1', status: 'NEEDS_CONFIRMATION', confirmedAt: null, dismissedAt: null, resolvedAt: null,
    confidencePct: 40, maintenanceTaskId: null, updatedAt: UPDATED_AT, inventoryItemId: 'item-1',
    recall: { title: 'Dishwasher Fire Hazard', severity: 'CRITICAL', hazard: 'Fire risk', remedy: 'Stop use and contact manufacturer', summary: null, status: 'ACTIVE' },
    inventoryItem: { name: 'Dishwasher', isVerified: false, manufacturer: null, modelNumber: null },
  };
  calls = { confirm: [], dismiss: [], resolve: [] };
  reports = [];
  reportFailure = false;
  sourceLaunch = null; stepRow = null;
  guidanceJourneyService.recordToolCompletion = async (input) => { if (reportFailure) throw new Error('guidance down'); reports.push(input); return {}; };
  const models = {
    askExecution: { findMany: async () => [], findFirst: async () => (sourceLaunch ? { launchContextJson: sourceLaunch } : null) },
    guidanceSignal: {}, guidanceJourney: {}, guidanceJourneyEvent: {}, guidanceStepEvidence: {},
    guidanceJourneyStep: { findFirst: async () => stepRow },
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
  guidanceJourneyService.recordToolCompletion = originals.recordToolCompletion;
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
  assert.equal(row.href, null);
  assert.deepEqual(row.actions.map((action) => action.id), ['recall-confirm', 'recall-dismiss']);
  accessRole = 'VIEWER';
  assert.deepEqual((await list()).sections[0].items[0].actions, []);
});

test('the typed match actions are whitelisted and no desktop recalls link exists to whitelist', () => {
  for (const action of recallMatchItemActions('OWNER')) {
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

// Guided-journey continuation FRD, Phase 0: an Ask recall write reports to the guidance engine exactly as the
// traditional recalls controller does, so a journey does not stay stuck when the homeowner finishes in Ask.
test('each Ask recall action reports the same guidance step and proof as the traditional controller', async () => {
  const conn = (action, extra = {}) => ({ recallMatchId: 'match-1', recallMatchAction: action, recallMatchContextVersion: version(), ...extra });
  await confirm(conn('CONFIRM'));
  await confirm(conn('DISMISS'));
  await confirm(conn('RESOLVE'));
  assert.deepEqual(reports.map((r) => [r.stepKey, r.status, r.producedData.proofType]), [
    ['safety_alert', 'COMPLETED', 'recall_confirmation'],
    ['recall_resolution', 'SKIPPED', 'recall_dismissal'],
    ['recall_resolution', 'COMPLETED', 'recall_resolution'],
  ]);
  for (const r of reports) {
    assert.equal(r.sourceToolKey, 'recalls');
    assert.equal(r.sourceEntityType, 'RECALL_MATCH');
    assert.equal(r.sourceEntityId, 'match-1');
    assert.equal(r.signalIntentFamily, 'recall_detected');
    assert.equal(r.issueDomain, 'SAFETY');
    assert.equal(r.propertyId, 'p1');
    assert.equal(r.actorUserId, 'u1');
  }
  assert.equal(new Set(reports.map((r) => r.dedupeKey)).size, 3, 'each action has its own dedupe key');
  // Same payload the controller builds.
  const row = { id: 'match-1', status: 'OPEN', recallId: 'r1' };
  assert.deepEqual(buildRecallMatchCompletion('p1', 'DISMISS', row).producedData, { proofType: 'recall_dismissal', proofId: 'match-1', status: 'OPEN', recallId: 'r1' });
});

test('a replayed Ask confirmation reports with the same dedupe key, and an already-applied action still reports', async () => {
  await confirm({ recallMatchId: 'match-1', recallMatchAction: 'DISMISS', recallMatchContextVersion: version() });
  match.status = 'DISMISSED';
  await confirm({ recallMatchId: 'match-1', recallMatchAction: 'DISMISS', recallMatchContextVersion: 'stale-but-already-applied' });
  assert.equal(calls.dismiss.length, 1, 'the write is not repeated');
  assert.equal(reports.length, 2);
  assert.equal(reports[0].dedupeKey, reports[1].dedupeKey);
});

test('a guidance reporting failure never fails the Ask write', async () => {
  reportFailure = true;
  const response = await confirm({ recallMatchId: 'match-1', recallMatchAction: 'CONFIRM', recallMatchContextVersion: version() });
  assert.equal(calls.confirm.length, 1);
  assert.ok(response);
});

// ── Guided journey: a recall action started from a journey completes that exact step, for that exact item, or nothing (continuation FRD section 26) ──
const recallStep = (over = {}) => ({ stepKey: 'safety_alert', toolKey: 'recalls', status: 'PENDING', journey: { id: 'j-recall', status: 'ACTIVE', inventoryItemId: 'item-1', primarySignal: { signalIntentFamily: 'recall_detected' } }, ...over });

test('the journey\'s recall steps carry the step to the recall review', () => {
  const { askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
  for (const step of ['safety_alert', 'recall_resolution']) assert.equal(askGuidanceStepMode('recalls', step).inAsk.carriesStep, 'FIELD', step);
});

test('an action started from a recall review the journey opened carries that step through the proposal and reports to exactly that journey', async () => {
  sourceLaunch = { operationId: 'RECALL_REVIEW', guidanceStepId: 'step-r' }; stepRow = recallStep();
  const proposal = await propose('Confirm this recall match.');
  assert.equal(proposal.parameters.guidanceStepId, 'step-r');
  const out = await confirm({ recallMatchId: 'match-1', recallMatchAction: 'CONFIRM', recallMatchContextVersion: version(), guidanceStepId: 'step-r' });
  assert.deepEqual({ j: reports[0].journeyId, s: reports[0].stepKey, st: reports[0].status }, { j: 'j-recall', s: 'safety_alert', st: 'COMPLETED' });
  assert.equal(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, 'This step is recorded as done');
  reports.length = 0; stepRow = recallStep({ stepKey: 'recall_resolution' });
  await confirm({ recallMatchId: 'match-1', recallMatchAction: 'DISMISS', recallMatchContextVersion: version(), guidanceStepId: 'step-r' });
  assert.deepEqual({ j: reports[0].journeyId, s: reports[0].stepKey, st: reports[0].status }, { j: 'j-recall', s: 'recall_resolution', st: 'SKIPPED' });
});

test('confirming one recall never advances another recall\'s journey: a different item, the wrong step for the action or a closed step reports nothing and does not fall back to the family', async () => {
  sourceLaunch = { operationId: 'RECALL_REVIEW', guidanceStepId: 'step-r' };
  for (const [step, why] of [
    [recallStep({ journey: { id: 'j-other', status: 'ACTIVE', inventoryItemId: 'item-9', primarySignal: { signalIntentFamily: 'recall_detected' } } }), 'another item'],
    [recallStep({ stepKey: 'recall_resolution' }), 'a resolution step for a confirmation'],
    [recallStep({ status: 'COMPLETED' }), 'a step already done'],
    [recallStep({ toolKey: 'coverage-intelligence' }), 'another tool'],
    [recallStep({ journey: { id: 'j-recall', status: 'DISMISSED', inventoryItemId: 'item-1', primarySignal: null } }), 'a dismissed journey'],
    [null, 'a step that is gone'],
  ]) {
    stepRow = step; reports.length = 0;
    const proposal = await propose('Confirm this recall match.');
    assert.equal(proposal.parameters.guidanceStepRefused, true, why);
    assert.equal('guidanceStepId' in proposal.parameters, false, why);
    const out = await confirm({ recallMatchId: 'match-1', recallMatchAction: 'CONFIRM', recallMatchContextVersion: version(), guidanceStepRefused: true });
    assert.equal(reports.length, 0, `${why}: nothing is reported, not even by signal family`);
    assert.equal(out.result.status, 'COMPLETED', 'the recall write itself is unaffected');
    assert.match(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, /no journey step was updated/);
  }
});

test('the step is re-read at confirmation: one that closed since the proposal reports nothing', async () => {
  stepRow = recallStep({ status: 'SKIPPED' });
  const out = await confirm({ recallMatchId: 'match-1', recallMatchAction: 'CONFIRM', recallMatchContextVersion: version(), guidanceStepId: 'step-r' });
  assert.equal(reports.length, 0);
  assert.equal(out.result.status, 'COMPLETED');
});

test('an action that never came from a journey keeps the signal-family compatibility path, and a failed exact report never fails the write', async () => {
  const proposal = await propose('Confirm this recall match.');
  assert.equal('guidanceStepId' in proposal.parameters || 'guidanceStepRefused' in proposal.parameters, false);
  await confirm({ recallMatchId: 'match-1', recallMatchAction: 'CONFIRM', recallMatchContextVersion: version() });
  assert.deepEqual([reports[0].journeyId, reports[0].signalIntentFamily], [undefined, 'recall_detected']);
  stepRow = recallStep(); reportFailure = true;
  const out = await confirm({ recallMatchId: 'match-1', recallMatchAction: 'CONFIRM', recallMatchContextVersion: version(), guidanceStepId: 'step-r' });
  assert.equal(out.result.status, 'COMPLETED');
  assert.match(out.result.blocks[0].details.find((d) => d.label === 'Guided journey').value, /saved, but the journey step could not be updated/);
});


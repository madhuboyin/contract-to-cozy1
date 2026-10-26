const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register/transpile-only');

// Historical (retroactive) renovation review from Ask: past work on the timeline, and starting a review. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const retroactive = require('../../src/homeRenovationAdvisor/engine/retroactive/retroactiveCompliance.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const command = require('../../src/services/ask/support/renovationReadinessCommand.ts');
const overview = require('../../src/services/ask/support/renovationCaseOverview.ts');
const capital = require('../../src/services/ask/handlers/capitalPlanning.handler.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const OP = 'RENOVATION_READINESS_COMMAND';
const M = command.READINESS_COMMAND_MESSAGES;
const EVENT = '77777777-7777-4777-8777-777777777777';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const version = (existing = null) => sha(`retroactive:REVIEW:${EVENT}:${existing ?? 'none'}`);
const candidate = (over = {}) => ({ timelineEventId: EVENT, propertyId: 'prop-1', eventTitle: 'Deck addition', occurredAt: '2024-06-15T00:00:00.000Z', amount: 18500, suggestedRenovationType: 'DECK_ADDITION', suggestedRenovationLabel: 'Deck addition', hasLinkedAdvisorSession: false, existingRenovationCaseId: null, ...over });
const fmt = { date: (value) => (value ? 'Jun 15, 2024' : null), money: (value) => `$${value.toLocaleString('en-US')}` };

test('the request is narrow, routes to the renovation answer, and does not take over the cases, readiness or start questions', () => {
  for (const yes of ['Review my past renovation work for compliance', 'Start a historical compliance review', 'retroactive review', 'Check my previous remodels for permits', 'Do my completed renovations need a compliance review?']) {
    assert.equal(overview.isRenovationRetroactiveRequest(yes), true, yes);
    assert.equal(resolveAskOperation(yes).operationId, 'RENOVATION_PERMIT_READINESS', yes);
  }
  for (const no of ['Show my renovation cases', 'Is my renovation ready to start?', 'What past renovations added the most value?', 'Show my permits', 'What requirements apply to my renovation?', 'Review my previous work orders', 'Check my old maintenance work']) assert.equal(overview.isRenovationRetroactiveRequest(no), false, no);
  assert.equal(resolveAskOperation('Start a renovation case.').operationId, 'RENOVATION_CASE_START');
  assert.equal(overview.isRenovationRetroactiveRequest(overview.RENOVATION_RETROACTIVE_MESSAGE), true, 'the list action asks for exactly this');
});

test('a row offers a review to a contributor while none is started, and the requirements of a started one', () => {
  const rows = overview.renovationRetroactiveRows([candidate(), candidate({ timelineEventId: 'e2', eventTitle: 'Roof', existingRenovationCaseId: 'case-9', amount: null, suggestedRenovationLabel: null })], new Map([['case-9', 'Roof']]), { canChange: true, ...fmt });
  assert.deepEqual(rows[0].meta, ['Completed Jun 15, 2024', '$18,500', 'Deck addition', 'Not reviewed yet']);
  assert.deepEqual([rows[0].actions[0].entityId, rows[0].actions[0].message, rows[0].actions[0].entityType], [EVENT, M.RETROACTIVE_REVIEW, command.RENOVATION_RETROACTIVE_ENTITY_TYPE]);
  assert.equal(rows[1].description, 'A historical review of this work has been started.');
  assert.deepEqual([rows[1].actions.length, rows[1].actions[0].label, rows[1].actions[0].message], [1, 'Show requirements', 'Show the requirements for my renovation Roof.']);
  assert.equal(overview.renovationRetroactiveRows([candidate()], new Map(), { canChange: false, ...fmt })[0].actions, undefined, 'a viewer is not offered it');
  const list = { type: 'GROUPED_LIST', filters: [], id: 'g', title: 't', sections: [{ id: 'a', title: 'a', count: 2, items: rows }], actions: [] };
  assert.ok(AskPresentationBlockSchema.safeParse(list).success);
});

function withCandidates(candidates, created = { id: 'case-new', name: 'Deck addition' }) {
  const saved = { d: retroactive.detectRetroactiveCandidates, c: retroactive.createRetroactiveRenovationCase, x: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  retroactive.detectRetroactiveCandidates = async () => candidates;
  retroactive.createRetroactiveRenovationCase = async (...args) => { calls.push(args); return created; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { retroactive.detectRetroactiveCandidates = saved.d; retroactive.createRetroactiveRenovationCase = saved.c; executeOperation.reconcileAskExecutionSideEffects = saved.x; } };
}

test('the answer lists past work, says a review organizes questions and does not decide compliance, and states the empty and all-reviewed cases plainly', async () => {
  let w = withCandidates([candidate(), candidate({ timelineEventId: 'e2', eventTitle: 'Roof', existingRenovationCaseId: 'c9' })]);
  try {
    const result = await capital.renovationRetroactiveResult('prop-1', [{ id: 'c9', name: 'Roof', updatedAt: UPDATED }], true);
    assert.equal(result.status, 'ANSWERED');
    assert.match(result.blocks[0].title, /^1 past improvement could be reviewed for compliance$/);
    assert.match(result.blocks[0].body, /does not decide that the work was compliant/);
    assert.equal(result.blocks.find((block) => block.id === 'renovation-retroactive').sections[0].items.length, 2);
    assert.match((await capital.renovationRetroactiveResult('prop-1', [], false)).blocks[0].body, /A contributor or owner can start one/);
    w.restore(); w = withCandidates([candidate({ existingRenovationCaseId: 'c9' })]);
    assert.equal((await capital.renovationRetroactiveResult('prop-1', [], true)).blocks[0].title, 'Every past improvement on your timeline already has a review');
    w.restore(); w = withCandidates([]);
    const none = await capital.renovationRetroactiveResult('prop-1', [], true);
    assert.equal(none.reasonCode, 'RENOVATION_RETROACTIVE_NO_CANDIDATES');
    assert.match(none.blocks[0].body, /not evidence that no work was done/);
  } finally { w.restore(); }
});

test('the answer is schema-valid, uses only blocks the operation allows and survives the answer-trust validator with its action ids', async () => {
  const w = withCandidates([candidate()]);
  try {
    const result = await capital.renovationRetroactiveResult('prop-1', [], true);
    const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
    const allowed = new Set(getAskOperationDefinition('RENOVATION_PERMIT_READINESS').allowedBlockTypes);
    for (const block of result.blocks) { assert.ok(allowed.has(block.type), `${block.type} is allowed`); assert.ok(AskPresentationBlockSchema.safeParse(block).success, block.id); }
    result.parameters = { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'renovation-permit.readiness', operationId: 'RENOVATION_PERMIT_READINESS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-26T00:00:00.000Z' }] } };
    const { result: validated } = validateAskAnswerTrust({ question: overview.RENOVATION_RETROACTIVE_MESSAGE, operationId: 'RENOVATION_PERMIT_READINESS', result, propertyId: 'prop-1' });
    const kept = validated.blocks.find((block) => block.id === 'renovation-retroactive').sections[0].items[0].actions;
    assert.deepEqual(kept.map((action) => action.id), ['renovation-retroactive-review']);
    for (const id of ['renovation-retroactive-review', overview.RENOVATION_RETROACTIVE_LIST_ACTION_ID]) {
      assert.equal(isAskActionApplicable({ action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId: OP, style: 'SECONDARY' }, operationId: 'RENOVATION_PERMIT_READINESS', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true, id);
    }
  } finally { w.restore(); }
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
const invoke = (role = 'CONTRIBUTOR', over = {}) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M.RETROACTIVE_REVIEW, launchContext: { operationId: OP, surface: 'ASK_PAGE', entityId: EVENT, entityType: command.readinessCommandEntityType('RETROACTIVE_REVIEW'), ...over } }, { propertyAccess: { role } });
const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('starting a review is a declared-action contributor step; viewers, misrouted launches, missing and already-started work are refused before any confirmation', async () => {
  assert.equal(command.readinessKindNeedsOwner('RETROACTIVE_REVIEW'), false);
  assert.equal(command.readinessCommandEntityType('RETROACTIVE_REVIEW'), command.RENOVATION_RETROACTIVE_ENTITY_TYPE);
  assert.equal(command.readinessCommandKindFromMessage(M.RETROACTIVE_REVIEW), 'RETROACTIVE_REVIEW');
  assert.notEqual(resolveAskRoutingCascade(M.RETROACTIVE_REVIEW, { localRoutingEnabled: true }).operation?.operationId, OP);
  let w = withCandidates([candidate()]); let restoreRole = withRole('VIEWER');
  try {
    assert.equal((await invoke('VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    restoreRole(); restoreRole = withRole('CONTRIBUTOR');
    assert.equal((await invoke('CONTRIBUTOR', { surface: 'ASK_REFRESH' })).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('CONTRIBUTOR', { entityType: command.RENOVATION_READINESS_ITEM_ENTITY_TYPE })).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('CONTRIBUTOR', { entityId: 'other-event' })).reasonCode, 'RENOVATION_RETROACTIVE_CANDIDATE_NOT_FOUND');
    w.restore(); w = withCandidates([candidate({ existingRenovationCaseId: 'c9' })]);
    assert.equal((await invoke()).reasonCode, 'RENOVATION_RETROACTIVE_ALREADY_STARTED');
    assert.equal(w.calls.length, 0);
  } finally { restoreRole(); w.restore(); }
});

test('the review says what the case is, that it records only what the timeline says, and that it does not decide compliance; it saves nothing', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const w = withCandidates([candidate()]);
  try {
    const review = await invoke();
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.contextVersion, version());
    assert.match(review.confirmation.description, /compliance sensitive and opened at historical research/);
    assert.match(review.confirmation.description, /only what your timeline says: the title, the date and the amount/);
    assert.match(review.confirmation.description, /does not decide that the work was or was not compliant.*nothing is applied for, filed or sent anywhere.*Starting it again changes nothing/);
    assert.deepEqual(review.confirmation.fields.map((field) => field.label), ['Work', 'Completed', 'Amount', 'Kind of work']);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); restoreRole(); }
});

test('confirming starts one historical review through the canonical create; a changed or already-started candidate writes nothing', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let w = withCandidates([candidate()]);
  try {
    const done = await confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'RETROACTIVE_REVIEW', entityId: EVENT }, readinessContextVersion: version() }));
    assert.deepEqual(w.calls, [['prop-1', EVENT, 'user-1']]);
    assert.equal(done.result.reasonCode, 'RENOVATION_READINESS_RETROACTIVE_REVIEW_COMPLETED');
    assert.equal(done.result.blocks[0].title, 'Historical review started');
    assert.equal(done.result.blocks[0].actions[0].label, 'See requirements');
    assert.equal(done.result.blocks[0].actions[0].message, 'Show the requirements for my renovation Deck addition.');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'RETROACTIVE_REVIEW', entityId: EVENT }, readinessContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    w.restore(); w = withCandidates([candidate({ existingRenovationCaseId: 'c9' })]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'RETROACTIVE_REVIEW', entityId: EVENT }, readinessContextVersion: version('c9') })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); restoreRole(); }
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { activationMissingGaps, ACTIVATION_GAP_LABELS, activationContextActionCopy, ACTIVATION_CONTEXT_SIGNAL, ACTIVATION_CONTEXT_TITLE_PATTERN } = require('../../src/services/activationContextGaps.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const entryContextService = require('../../src/services/entryContext.service.ts');
const {
  deriveActivationContextCapture, dismissedActivationRequirements, saveActivationContextAnswer, activationContextVersion, isActivationContextAction, ACTIVATION_CONTEXT_CAPTURE_KEY, isActivationContextRequirement,
} = require('../../src/services/ask/support/activationContextCapture.ts');
const { isActivationContextActionTitle } = require('../../src/services/ask/healthGapCapture.ts');
const { buildFocusedHomeActionGuidance } = require('../../src/services/ask/askFocusedGuidance.ts');
const { reconcileActivationCaptureForSessionRead } = require('../../src/services/ask/execution/askSessions.ts');
const { HouseholdRole } = require('@prisma/client');

// The canonical activation action owns its missing scope and trigger detail; Ask asks only those decision-relevant facts inline.

const all = { triggerEntityId: null, triggerEntityType: 'PROPERTY', triggerScopeConfirmedAt: null, triggerDetail: null, evidenceDetailPresent: false };

test('activation asks only decision-relevant gaps and does not mistake default property scope for confirmation', () => {
  assert.deepEqual(activationMissingGaps(all), ['AFFECTED_ITEM', 'TRIGGER_DETAILS']);
  assert.deepEqual(activationMissingGaps(all).map((gap) => ACTIVATION_GAP_LABELS[gap]), ['Specific affected item or record', 'Trigger details']);
  assert.deepEqual(activationMissingGaps({ ...all, triggerScopeConfirmedAt: new Date(), evidenceDetailPresent: true }), [], 'an explicitly confirmed whole-home scope and evidence detail resolve both gaps');
  assert.deepEqual(activationMissingGaps({ ...all, triggerEntityType: 'INVENTORY_ITEM', triggerEntityId: 'item-1', triggerScopeConfirmedAt: new Date(), triggerDetail: 'x' }), []);
  assert.deepEqual(activationMissingGaps({ ...all, triggerEntityType: 'INVENTORY_ITEM', triggerScopeConfirmedAt: new Date() }), ['AFFECTED_ITEM', 'TRIGGER_DETAILS'], 'a type with no id is still unlinked');
});

test('the action and its quoted title are recognised', () => {
  assert.equal(isActivationContextAction({ id: 'activation:trigger-1', signal: 'Something needs repair' }), true);
  assert.equal(isActivationContextAction({ id: 'legacy', signal: ACTIVATION_CONTEXT_SIGNAL }), true);
  assert.equal(isActivationContextAction({ id: 'other', signal: 'Systems Factor' }), false);
  assert.equal(ACTIVATION_CONTEXT_TITLE_PATTERN.test('Review and correct: Trigger details. Skip anything that does not change the active decision.'), true);
  assert.equal(ACTIVATION_CONTEXT_TITLE_PATTERN.test('Tell Cozy what prompted this plan: Replace the water heater'), true);
  assert.deepEqual(activationContextActionCopy('Replace the water heater'), {
    title: 'Tell Cozy what prompted this plan: Replace the water heater',
    whyItMatters: 'A little more context about “Replace the water heater” will help Cozy tailor the next steps for this home.',
    expectedOutcome: 'Get next steps that fit what is happening in your home.',
    timingRationale: 'Add this when convenient, or sooner if the situation changes.',
  });
  assert.equal(isActivationContextActionTitle('What should I do next for “Review and correct: Year built, Property size. Skip anything that does not change the active decision.”?'), true);
  assert.equal(isActivationContextActionTitle('What should I do next for “Add your home type and roof type”?'), false);
});

const requirement = (key) => ({ requirementId: `req-${key}`, classification: 'ENHANCEMENT_ACCURACY', state: 'UNKNOWN', capture: { captureKey: key, title: key, question: `Q ${key}`, helpText: null, inputSchema: { type: 'INTEGER' }, allowNotSure: true, sensitivity: 'STANDARD' } });
const evaluateAll = async (feature) => ({ requirements: [requirement(feature.operationKey)], contextVersion: 'ctx-v1' });

let state;
function stubPrisma() {
  const originals = {
    property: prisma.property.findUnique, onboarding: prisma.propertyOnboarding.findUnique, onboardingUpdate: prisma.propertyOnboarding.update,
    items: prisma.inventoryItem.findMany, item: prisma.inventoryItem.findFirst, records: prisma.propertyRecord.findMany, evidence: entryContextService.addTriggerEvidence,
  };
  state = { activeTriggerId: 'trigger-1', activeTriggerLabel: 'Something needs repair', scopeConfirmedAt: null, entityType: 'PROPERTY', entityId: null, detail: null, evidence: [], updates: [], evidenceCalls: [], items: [{ id: 'item-1', name: 'Water heater' }, { id: 'item-2', name: 'Roof' }], records: [{ id: 'record-1', title: 'Contractor quote', recordType: 'QUOTE' }] };
  prisma.property.findUnique = async () => ({});
  prisma.propertyOnboarding.findUnique = async () => ({ activeTriggerId: state.activeTriggerId, activeTriggerLabel: state.activeTriggerLabel, triggerEntityType: state.entityType, triggerEntityId: state.entityId, triggerScopeConfirmedAt: state.scopeConfirmedAt, activeTriggerDetail: state.detail, triggerEvidenceJson: state.evidence });
  prisma.propertyOnboarding.update = async ({ data }) => { state.updates.push(data); state.entityType = data.triggerEntityType ?? state.entityType; state.entityId = 'triggerEntityId' in data ? data.triggerEntityId : state.entityId; state.scopeConfirmedAt = data.triggerScopeConfirmedAt ?? state.scopeConfirmedAt; return {}; };
  prisma.inventoryItem.findMany = async () => state.items;
  prisma.inventoryItem.findFirst = async ({ where }) => state.items.find((item) => item.id === where.id) ?? null;
  prisma.propertyRecord.findMany = async ({ where }) => state.records.filter((record) => !where.id || where.id.in.includes(record.id));
  entryContextService.addTriggerEvidence = async (propertyId, userId, input) => { state.evidenceCalls.push(input); state.evidence = [...state.evidence, { ...input }]; return state.evidence; };
  return () => {
    prisma.property.findUnique = originals.property; prisma.propertyOnboarding.findUnique = originals.onboarding; prisma.propertyOnboarding.update = originals.onboardingUpdate;
    prisma.inventoryItem.findMany = originals.items; prisma.inventoryItem.findFirst = originals.item; prisma.propertyRecord.findMany = originals.records; entryContextService.addTriggerEvidence = originals.evidence;
  };
}

test('cards identify the affected item before asking what happened', async () => {
  const restore = stubPrisma();
  try {
    let card = await deriveActivationContextCapture('p1', evaluateAll);
    assert.equal(card.feature, null);
    assert.equal(card.request.requirementId, 'activation-affected-item');
    assert.equal(card.request.question, 'What needs repair?');
    assert.equal(card.request.captureKey, ACTIVATION_CONTEXT_CAPTURE_KEY);
    assert.deepEqual(card.request.inputSchema.options.map((option) => option.label), ['Water heater', 'Roof', 'The home as a whole']);
    assert.match(card.request.helpText, /^Question 1 of 2\./);
    state.scopeConfirmedAt = new Date(); state.entityType = 'INVENTORY_ITEM'; state.entityId = 'item-1';
    card = await deriveActivationContextCapture('p1', evaluateAll);
    assert.equal(card.request.requirementId, 'activation-trigger-details');
    assert.equal(card.request.inputSchema.type, 'GROUP');
    assert.equal(card.request.question, 'What is happening with Water heater?');
    assert.match(card.request.helpText, /active leak, gas smell, smoke, sparks, or immediate damage/);
    assert.deepEqual(card.request.inputSchema.fields.map((field) => field.key), ['detail', 'evidenceKind', 'recordIds']);
    assert.deepEqual(card.request.inputSchema.fields[1].inputSchema.options.map((option) => option.value), ['FREE_TEXT', 'CONVERSATION', 'DOCUMENT', 'QUOTE', 'INVOICE', 'PHOTO', 'EMAIL_PDF']);
    assert.equal(card.request.inputSchema.fields[0].inputSchema.maxLength, 4000);
    assert.equal(card.request.inputSchema.fields[2].inputSchema.allowUpload, true);
    assert.equal(card.request.inputSchema.fields[2].inputSchema.uploadLabel, 'Add evidence');
    assert.doesNotMatch(card.request.helpText, /Question/, 'a single remaining question is not numbered');
    state.detail = 'The water heater is leaking.';
    assert.equal(await deriveActivationContextCapture('p1', evaluateAll), null, 'nothing missing: no card');
  } finally { restore(); }
});

test('saving the affected item links it; the whole home clears the gap; a foreign item is refused', async () => {
  const restore = stubPrisma();
  try {
    const version = () => activationContextVersion({ activeTriggerId: state.activeTriggerId, entityType: state.entityType, entityId: state.entityId, triggerScopeConfirmedAt: state.scopeConfirmedAt, detail: state.detail, evidenceCount: state.evidence.length });
    const after = await saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-affected-item', answer: { value: 'item-1' }, expectedContextVersion: version() });
    assert.equal(state.updates[0].triggerEntityType, 'INVENTORY_ITEM');
    assert.equal(state.updates[0].triggerEntityId, 'item-1');
    assert.ok(state.updates[0].triggerScopeConfirmedAt instanceof Date);
    assert.equal(after, version(), 'the returned version is the one after the write');
    await saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-affected-item', answer: { value: 'PROPERTY' }, expectedContextVersion: version() });
    assert.equal(state.updates[1].triggerEntityType, 'PROPERTY');
    assert.equal(state.updates[1].triggerEntityId, null);
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-affected-item', answer: { value: 'not-mine' }, expectedContextVersion: version() }), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-affected-item', answer: {}, expectedContextVersion: version() }), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    assert.equal(state.updates.length, 2, 'refused answers wrote nothing');
  } finally { restore(); }
});

test('saving trigger details writes free-text evidence through the same service the first-value page uses; stale forms are refused', async () => {
  const restore = stubPrisma();
  try {
    const version = () => activationContextVersion({ activeTriggerId: state.activeTriggerId, entityType: state.entityType, entityId: state.entityId, triggerScopeConfirmedAt: state.scopeConfirmedAt, detail: state.detail, evidenceCount: state.evidence.length });
    const stale = version();
    await saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-trigger-details', answer: { evidenceKind: 'FREE_TEXT', detail: '  The water heater is leaking.  ' }, expectedContextVersion: version() });
    assert.equal(state.evidenceCalls.length, 1);
    assert.equal(state.evidenceCalls[0].kind, 'FREE_TEXT');
    assert.equal(state.evidenceCalls[0].detail, 'The water heater is leaking.', 'trimmed');
    await saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-trigger-details', answer: { detail: 'The pilot light keeps going out.' }, expectedContextVersion: version() });
    assert.equal(state.evidenceCalls[1].kind, 'FREE_TEXT', 'a simple note does not force the homeowner to classify its evidence type');
    await saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-trigger-details', answer: { evidenceKind: 'QUOTE', recordIds: ['record-1'] }, expectedContextVersion: version() });
    assert.equal(state.evidenceCalls[2].documentId, 'record-1', 'a selected or uploaded Home Record uses the canonical trigger-evidence writer');
    assert.equal(state.evidenceCalls[2].kind, 'QUOTE', 'Ask preserves the Desktop evidence kind');
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-trigger-details', answer: { evidenceKind: 'FREE_TEXT', detail: 'again' }, expectedContextVersion: stale }), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-trigger-details', answer: { evidenceKind: 'FREE_TEXT', detail: '   ' }, expectedContextVersion: version() }), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-trigger-details', answer: { evidenceKind: 'FREE_TEXT', recordIds: ['record-1'] }, expectedContextVersion: version() }), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'something-else', answer: { value: 'x' }, expectedContextVersion: version() }), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    assert.equal(state.evidenceCalls.length, 3);
  } finally { restore(); }
  assert.equal(isActivationContextRequirement('activation-affected-item'), true);
  assert.equal(isActivationContextRequirement('anything'), false);
});

test('session reads re-derive activation-owned capture cards from current Desktop state and remove duplicate View details', async () => {
  const restore = stubPrisma();
  const originalEvents = prisma.askExecutionEvent.findMany;
  prisma.askExecutionEvent.findMany = async () => [];
  try {
    state.scopeConfirmedAt = new Date(); state.entityType = 'PROPERTY';
    const execution = {
      sessionId: 'session-1', propertyId: 'p1', operationId: 'HOME_ACTIONS',
      parametersJson: { focusedHomeActionId: 'activation:trigger-1' },
      resultJson: {
        blocks: [{ type: 'SUMMARY', id: 'focused-home-action-guidance', actions: [{ id: 'view', label: 'View details' }] }],
        captureRequests: [{ requirementId: 'activation-affected-item', captureKey: ACTIVATION_CONTEXT_CAPTURE_KEY }],
      },
    };
    const refreshed = await reconcileActivationCaptureForSessionRead('u1', execution, HouseholdRole.OWNER);
    assert.equal(refreshed.resultJson.captureRequests[0].requirementId, 'activation-trigger-details');
    assert.deepEqual(refreshed.resultJson.blocks[0].actions, []);
    state.detail = 'Desktop supplied the trigger detail.';
    const resolved = await reconcileActivationCaptureForSessionRead('u1', execution, HouseholdRole.OWNER);
    assert.deepEqual(resolved.resultJson.captureRequests, [], 'a Desktop save removes the stale Ask form on reload');
    const viewer = await reconcileActivationCaptureForSessionRead('u1', execution, HouseholdRole.VIEWER);
    assert.deepEqual(viewer.resultJson.captureRequests, [], 'a role downgrade removes the writable form');
  } finally {
    prisma.askExecutionEvent.findMany = originalEvents;
    restore();
  }
});

test('freshness is bound to the exact active trigger, and inline capture removes the desktop link', () => {
  const before = activationContextVersion({ activeTriggerId: 'trigger-1', entityType: null, entityId: null, detail: null, evidenceCount: 0 });
  const after = activationContextVersion({ activeTriggerId: 'trigger-2', entityType: null, entityId: null, detail: null, evidenceCount: 0 });
  assert.notEqual(before, after, 'changing only the active trigger invalidates an open form');

  const action = {
    id: 'activation:trigger-1', lineageId: 'trigger-1', source: { kind: 'GUIDANCE' }, priority: 'NOW', state: 'OPEN', signal: 'Something needs repair',
    whyItMatters: 'A little more context will help Cozy tailor the next steps.', recommendedAction: 'Tell Cozy what prompted this plan: Replace the water heater', expectedOutcome: 'Get next steps that fit what is happening in your home.',
    presentation: { variant: 'GENERIC_ACTION', summary: 'Add a little more context to tailor the next steps.', keyFacts: [], factGroups: [] }, primaryCta: { kind: 'CORRECT_FACT', label: 'Add context', href: '/dashboard/properties/p1/onboarding' },
    governance: { safetyTier: 'LOW_CONSEQUENCE' }, timing: { dueAt: null, rationale: 'Within 12 months' }, confidence: { label: 'HIGH' }, evidence: [], recommendationResponse: { status: 'AVAILABLE' }, ranking: { explanation: 'x' }, feedbackControls: ['DISMISS'],
  };
  const capture = { requirementId: 'activation-trigger-details', captureKey: ACTIVATION_CONTEXT_CAPTURE_KEY };
  const result = buildFocusedHomeActionGuidance(action, 'v1', undefined, capture, { canContribute: true });
  const guidance = result.blocks.find((block) => block.id === 'focused-home-action-guidance');
  assert.deepEqual(result.captureRequests, [capture]);
  assert.deepEqual(guidance.actions, [], 'the inline capture replaces View details rather than rendering both');
  assert.deepEqual(guidance.sections[0].items[0].meta, ['Within 12 months'], 'implementation confidence is not exposed as a homeowner task');
});

test('wiring: the focused handler derives the card, and the submit path saves the two own cards before the generic Property Context write', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const handler = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/homeActions.handler.ts'), 'utf8');
  assert.match(handler, /isActivationContextAction\(focusedAction\)\s*\?\s*await deriveActivationContextCapture\(/);
  assert.match(handler, /!focusedAction && \(isHealthGapActionTitle\(message\) \|\| isActivationContextActionTitle\(message\)\)/);
  const capture = readFileSync(resolve(__dirname, '../../src/services/ask/execution/askCapture.ts'), 'utf8');
  assert.match(capture, /input\.captureKey === ACTIVATION_CONTEXT_CAPTURE_KEY && isActivationContextRequirement\(input\.requirementId\)/);
  const captureCard = readFileSync(resolve(__dirname, '../../../frontend/src/components/ask/workspace/CaptureCards.tsx'), 'utf8');
  assert.match(captureCard, /Attach supporting evidence/);
  assert.match(captureCard, /compactActivationContext \? 'Save context'/);
  const producer = readFileSync(resolve(__dirname, '../../src/services/entryContext.service.ts'), 'utf8');
  assert.doesNotMatch(producer, /id: `activation-context:/, 'the missing-context companion is no longer emitted as a ranked Home Action');
  assert.match(producer, /PLAN: \[\]/);
  assert.match(producer, /launchOperationId=HOME_ACTIONS/);
});

// Owner ruling 2026-11-09: skipping is for the Ask session only. The card's dismiss button records CAPTURE_DISMISSED on the execution; the next
// derivation in the same session leaves that question out, and a new session asks again.
test('a question dismissed in this session is left out, the rest are renumbered, and nothing is stored across sessions', async () => {
  const restore = stubPrisma();
  const originalEvents = prisma.askExecutionEvent.findMany;
  try {
    let query;
    prisma.askExecutionEvent.findMany = async (args) => {
      query = args;
      return [{ metadataJson: { requirementId: 'activation-trigger-details', captureKey: 'ACTIVATION_CONTEXT_INPUTS' } }, { metadataJson: null }, { metadataJson: { requirementId: 7 } }];
    };
    const dismissed = await dismissedActivationRequirements('session-1');
    assert.deepEqual([...dismissed], ['activation-trigger-details'], 'only well-formed requirement ids count');
    assert.deepEqual(query.where, { eventType: 'CAPTURE_DISMISSED', execution: { sessionId: 'session-1' } }, 'scoped to this Ask session');

    let card = await deriveActivationContextCapture('p1', evaluateAll, dismissed);
    assert.equal(card.request.requirementId, 'activation-affected-item');
    assert.doesNotMatch(card.request.helpText, /Question/, 'the dismissed details question is not counted: one question left');
    card = await deriveActivationContextCapture('p1', evaluateAll, new Set(['activation-trigger-details', 'activation-affected-item']));
    assert.equal(card, null, 'everything dismissed: no card');
    card = await deriveActivationContextCapture('p1', evaluateAll);
    assert.match(card.request.helpText, /^Question 1 of 2\./, 'a new session (nothing dismissed) asks both again');

    const first = await deriveActivationContextCapture('p1', evaluateAll);
    assert.equal(first.request.requirementId, 'activation-affected-item');
    const next = await deriveActivationContextCapture('p1', evaluateAll, new Set([first.request.requirementId]));
    assert.notEqual(next.request.requirementId, first.request.requirementId, 'a dismissed fact question is skipped');
    assert.doesNotMatch(next.request.helpText, /Question/, 'two missing, one dismissed: one left');
  } finally { prisma.askExecutionEvent.findMany = originalEvents; restore(); }
});

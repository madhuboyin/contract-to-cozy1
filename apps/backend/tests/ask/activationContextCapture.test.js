const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { activationMissingGaps, ACTIVATION_GAP_LABELS, ACTIVATION_CONTEXT_SIGNAL, ACTIVATION_CONTEXT_TITLE_PATTERN } = require('../../src/services/activationContextGaps.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const entryContextService = require('../../src/services/entryContext.service.ts');
const {
  deriveActivationContextCapture, dismissedActivationRequirements, saveActivationContextAnswer, activationContextVersion, isActivationContextAction, ACTIVATION_CONTEXT_CAPTURE_KEY, isActivationContextRequirement,
} = require('../../src/services/ask/support/activationContextCapture.ts');
const { isActivationContextActionTitle } = require('../../src/services/ask/healthGapCapture.ts');

// Owner screenshot 2026-11-09: "Review and correct: Trigger details. Skip anything that does not change the active decision." had no button in Ask.
// The action lists up to four missing starting facts; Ask now asks for each inline.

const all = { yearBuilt: null, propertySize: null, triggerEntityId: null, triggerEntityType: null, triggerDetail: null, evidenceDetailPresent: false };

test('the four gaps, in ask order, with the producer\'s wording', () => {
  assert.deepEqual(activationMissingGaps(all), ['YEAR_BUILT', 'PROPERTY_SIZE', 'AFFECTED_ITEM', 'TRIGGER_DETAILS']);
  assert.deepEqual(activationMissingGaps(all).map((gap) => ACTIVATION_GAP_LABELS[gap]), ['Year built', 'Property size', 'Specific affected item or record', 'Trigger details']);
  assert.deepEqual(activationMissingGaps({ ...all, yearBuilt: 1990, propertySize: 1800, triggerEntityType: 'PROPERTY', evidenceDetailPresent: true }), [], 'the home as a whole counts as the affected record; evidence detail counts as detail');
  assert.deepEqual(activationMissingGaps({ ...all, yearBuilt: 1990, propertySize: 1800, triggerEntityId: 'item-1', triggerDetail: 'x' }), []);
  assert.deepEqual(activationMissingGaps({ ...all, yearBuilt: 1990, propertySize: 1800, triggerEntityType: 'INVENTORY_ITEM' }), ['AFFECTED_ITEM', 'TRIGGER_DETAILS'], 'a type with no id is still unlinked');
});

test('the action and its quoted title are recognised', () => {
  assert.equal(isActivationContextAction({ signal: ACTIVATION_CONTEXT_SIGNAL }), true);
  assert.equal(isActivationContextAction({ signal: 'Systems Factor' }), false);
  assert.equal(ACTIVATION_CONTEXT_TITLE_PATTERN.test('Review and correct: Trigger details. Skip anything that does not change the active decision.'), true);
  assert.equal(isActivationContextActionTitle('What should I do next for “Review and correct: Year built, Property size. Skip anything that does not change the active decision.”?'), true);
  assert.equal(isActivationContextActionTitle('What should I do next for “Add your home type and roof type”?'), false);
});

const requirement = (key) => ({ requirementId: `req-${key}`, classification: 'ENHANCEMENT_ACCURACY', state: 'UNKNOWN', capture: { captureKey: key, title: key, question: `Q ${key}`, helpText: null, inputSchema: { type: 'INTEGER' }, allowNotSure: true, sensitivity: 'STANDARD' } });
const evaluateAll = async (feature) => ({ requirements: [requirement(feature.operationKey)], contextVersion: 'ctx-v1' });

let state;
function stubPrisma() {
  const originals = {
    property: prisma.property.findUnique, onboarding: prisma.propertyOnboarding.findUnique, onboardingUpdate: prisma.propertyOnboarding.update,
    items: prisma.inventoryItem.findMany, item: prisma.inventoryItem.findFirst, evidence: entryContextService.addTriggerEvidence,
  };
  state = { yearBuilt: null, propertySize: null, entityType: null, entityId: null, detail: null, evidence: [], updates: [], evidenceCalls: [], items: [{ id: 'item-1', name: 'Water heater' }, { id: 'item-2', name: 'Roof' }] };
  prisma.property.findUnique = async () => ({ yearBuilt: state.yearBuilt, propertySize: state.propertySize });
  prisma.propertyOnboarding.findUnique = async () => ({ triggerEntityType: state.entityType, triggerEntityId: state.entityId, activeTriggerDetail: state.detail, triggerEvidenceJson: state.evidence });
  prisma.propertyOnboarding.update = async ({ data }) => { state.updates.push(data); state.entityType = data.triggerEntityType ?? state.entityType; state.entityId = 'triggerEntityId' in data ? data.triggerEntityId : state.entityId; return {}; };
  prisma.inventoryItem.findMany = async () => state.items;
  prisma.inventoryItem.findFirst = async ({ where }) => state.items.find((item) => item.id === where.id) ?? null;
  entryContextService.addTriggerEvidence = async (propertyId, userId, input) => { state.evidenceCalls.push(input); state.evidence = [...state.evidence, { ...input }]; return state.evidence; };
  return () => {
    prisma.property.findUnique = originals.property; prisma.propertyOnboarding.findUnique = originals.onboarding; prisma.propertyOnboarding.update = originals.onboardingUpdate;
    prisma.inventoryItem.findMany = originals.items; prisma.inventoryItem.findFirst = originals.item; entryContextService.addTriggerEvidence = originals.evidence;
  };
}

test('cards come in order: year built, size, affected item, details; each says where it stands', async () => {
  const restore = stubPrisma();
  try {
    let card = await deriveActivationContextCapture('p1', evaluateAll);
    assert.equal(card.feature.featureKey, 'ASK_NEXT_ACTION');
    assert.match(card.request.helpText, /^Question 1 of 4\./);
    assert.equal(card.request.allowNotSure, false);
    state.yearBuilt = 1990;
    card = await deriveActivationContextCapture('p1', evaluateAll);
    assert.match(card.request.helpText, /^Question 1 of 3\./);
    state.propertySize = 1800;
    card = await deriveActivationContextCapture('p1', evaluateAll);
    assert.equal(card.feature, null);
    assert.equal(card.request.requirementId, 'activation-affected-item');
    assert.equal(card.request.captureKey, ACTIVATION_CONTEXT_CAPTURE_KEY);
    assert.deepEqual(card.request.inputSchema.options.map((option) => option.label), ['Water heater', 'Roof', 'The home as a whole']);
    state.entityType = 'PROPERTY';
    card = await deriveActivationContextCapture('p1', evaluateAll);
    assert.equal(card.request.requirementId, 'activation-trigger-details');
    assert.equal(card.request.inputSchema.type, 'LONG_TEXT');
    assert.doesNotMatch(card.request.helpText, /Question/, 'a single remaining question is not numbered');
    state.detail = 'The water heater is leaking.';
    assert.equal(await deriveActivationContextCapture('p1', evaluateAll), null, 'nothing missing: no card');
  } finally { restore(); }
});

test('a fact Property Context already holds is skipped, not asked again', async () => {
  const restore = stubPrisma();
  try {
    const noYear = async (feature) => feature.operationKey.includes('YEAR') ? { requirements: [], contextVersion: 'v' } : evaluateAll(feature);
    const card = await deriveActivationContextCapture('p1', noYear);
    assert.match(card.request.captureKey, /SIZE/i, 'moved on to property size');
  } finally { restore(); }
});

test('saving the affected item links it; the whole home clears the gap; a foreign item is refused', async () => {
  const restore = stubPrisma();
  try {
    const version = () => activationContextVersion({ entityType: state.entityType, entityId: state.entityId, detail: state.detail, evidenceCount: state.evidence.length });
    const after = await saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-affected-item', answer: { value: 'item-1' }, expectedContextVersion: version() });
    assert.deepEqual(state.updates[0], { triggerEntityType: 'INVENTORY_ITEM', triggerEntityId: 'item-1' });
    assert.equal(after, version(), 'the returned version is the one after the write');
    await saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-affected-item', answer: { value: 'PROPERTY' }, expectedContextVersion: version() });
    assert.deepEqual(state.updates[1], { triggerEntityType: 'PROPERTY', triggerEntityId: null });
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-affected-item', answer: { value: 'not-mine' }, expectedContextVersion: version() }), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-affected-item', answer: {}, expectedContextVersion: version() }), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    assert.equal(state.updates.length, 2, 'refused answers wrote nothing');
  } finally { restore(); }
});

test('saving trigger details writes free-text evidence through the same service the first-value page uses; stale forms are refused', async () => {
  const restore = stubPrisma();
  try {
    const version = () => activationContextVersion({ entityType: state.entityType, entityId: state.entityId, detail: state.detail, evidenceCount: state.evidence.length });
    const stale = version();
    await saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-trigger-details', answer: { value: '  The water heater is leaking.  ' }, expectedContextVersion: version() });
    assert.equal(state.evidenceCalls.length, 1);
    assert.equal(state.evidenceCalls[0].kind, 'FREE_TEXT');
    assert.equal(state.evidenceCalls[0].detail, 'The water heater is leaking.', 'trimmed');
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-trigger-details', answer: { value: 'again' }, expectedContextVersion: stale }), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'activation-trigger-details', answer: { value: '   ' }, expectedContextVersion: version() }), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
    await assert.rejects(saveActivationContextAnswer({ userId: 'u1', propertyId: 'p1', requirementId: 'something-else', answer: { value: 'x' }, expectedContextVersion: version() }), { code: 'ASK_CAPTURE_NOT_ACTIVE' });
    assert.equal(state.evidenceCalls.length, 1);
  } finally { restore(); }
  assert.equal(isActivationContextRequirement('activation-affected-item'), true);
  assert.equal(isActivationContextRequirement('anything'), false);
});

test('wiring: the focused handler derives the card, and the submit path saves the two own cards before the generic Property Context write', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const handler = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/homeActions.handler.ts'), 'utf8');
  assert.match(handler, /isActivationContextAction\(focusedAction\)\s*\?\s*await deriveActivationContextCapture\(/);
  assert.match(handler, /!focusedAction && \(isHealthGapActionTitle\(message\) \|\| isActivationContextActionTitle\(message\)\)/);
  const capture = readFileSync(resolve(__dirname, '../../src/services/ask/execution/askCapture.ts'), 'utf8');
  assert.match(capture, /input\.captureKey === ACTIVATION_CONTEXT_CAPTURE_KEY && isActivationContextRequirement\(input\.requirementId\)/);
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

    state.yearBuilt = 1990; state.propertySize = 1800;
    let card = await deriveActivationContextCapture('p1', evaluateAll, dismissed);
    assert.equal(card.request.requirementId, 'activation-affected-item');
    assert.doesNotMatch(card.request.helpText, /Question/, 'the dismissed details question is not counted: one question left');
    card = await deriveActivationContextCapture('p1', evaluateAll, new Set(['activation-trigger-details', 'activation-affected-item']));
    assert.equal(card, null, 'everything dismissed: no card');
    card = await deriveActivationContextCapture('p1', evaluateAll);
    assert.match(card.request.helpText, /^Question 1 of 2\./, 'a new session (nothing dismissed) asks both again');

    state.yearBuilt = null;
    const first = await deriveActivationContextCapture('p1', evaluateAll);
    assert.ok(first.feature, 'year built is asked first when missing');
    const next = await deriveActivationContextCapture('p1', evaluateAll, new Set([first.request.requirementId]));
    assert.notEqual(next.request.requirementId, first.request.requirementId, 'a dismissed fact question is skipped');
    assert.match(next.request.helpText, /^Question 1 of 2\./, 'three missing, one dismissed: two left');
  } finally { prisma.askExecutionEvent.findMany = originalEvents; restore(); }
});

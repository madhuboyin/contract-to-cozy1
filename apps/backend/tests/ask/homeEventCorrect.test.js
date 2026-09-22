const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 write slice 2: HOME_EVENT_CORRECT.

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { AskConfirmationSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const source = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
const routeOf = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;

function body(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start > 0, `${startMarker} not found`);
  return source.slice(start, source.indexOf(endMarker, start));
}

test('declared item-action messages and natural phrasing route to HOME_EVENT_CORRECT', () => {
  for (const message of [
    'Correct the title of this timeline event.',
    'Correct the date of this timeline event.',
    'The date on my roof repair timeline event is wrong, fix the date',
  ]) {
    assert.equal(routeOf(message), 'HOME_EVENT_CORRECT', message);
  }
});

test('neighbouring intents are not captured', () => {
  assert.notEqual(routeOf('Correct the install date of this inventory item.'), 'HOME_EVENT_CORRECT');
  assert.notEqual(routeOf('Reschedule the gutter cleaning task'), 'HOME_EVENT_CORRECT');
  assert.notEqual(routeOf('Show my home timeline'), 'HOME_EVENT_CORRECT');
});

test('registered as a contributor-floor confirmed command', () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.HOME_EVENT_CORRECT.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation('HOME_EVENT_CORRECT').roleFloor, 'CONTRIBUTOR');
});

test('confirmation contract accepts TEXT editable fields', () => {
  const base = { confirmationId: 'c', version: 1, title: 't', description: 'd', fields: [], confirmLabel: 'ok', consentText: 'c', expiresAt: new Date().toISOString() };
  assert.ok(AskConfirmationSchema.safeParse({ ...base, editableFields: [{ key: 'value', label: 'Title', type: 'TEXT', value: 'Roof repair' }] }).success);
  assert.equal(AskConfirmationSchema.safeParse({ ...base, editableFields: [{ key: 'value', label: 'x', type: 'NUMBER', value: '1' }] }).success, false);
});

test('propose never writes; confirm writes only via updateHomeEvent with the idempotency guard, freshness and visibility checks', () => {
  const propose = body('async function homeEventCorrectResult(', "registerCapabilityHandler('home-event.correct'");
  assert.doesNotMatch(propose, /updateHomeEvent\(/);
  assert.match(propose, /NEEDS_CONFIRMATION/);
  assert.match(propose, /visibility: \{ not: 'PRIVATE' \}/, 'propose must not offer events the requester cannot see');
  const confirm = body('async function confirmHomeEventCorrect(', "registerConfirmCapabilityHandler('home-event.correct'");
  assert.match(confirm, /homeEventsServiceForCapture\.updateHomeEvent\(/);
  assert.match(confirm, /ask-correction:\$\{execution\.id\}/);
  assert.match(confirm, /HOME_EVENT_NOT_FOUND/);
  assert.match(confirm, /P2002/);
  assert.match(confirm, /homeEventContextVersion\(current\)/);
  assert.match(confirm, /PRIVATE/);
  assert.match(confirm, /reconcileAskExecutionSideEffects/);
  // The patch is built by homeEventFieldPatch (behaviour is proven by correctionHandlersRuntime.test.js).
  assert.match(confirm, /homeEventFieldPatch\(field, normalized\)/);
  assert.match(body('function homeEventFieldPatch(', 'function homeEventCorrectionBlocker('), /datePrecision: 'EXACT_DATE'/, 'a corrected date must not keep a coarser precision');
});

test('declared item-action messages and natural phrasing route to HOME_EVENT_CORRECT for the room and inventory item links', () => {
  for (const message of ['Correct the room of this timeline event.', 'Correct the inventory item of this timeline event.']) {
    assert.equal(routeOf(message), 'HOME_EVENT_CORRECT', message);
  }
  assert.notEqual(routeOf('What room is the roof replacement linked to?'), 'HOME_EVENT_CORRECT');
});

test('event correction actions are declared only for contributor-and-up on both event producers; edit handler registered', () => {
  assert.match(body('function homeEventCorrectionItemActions(', 'function homeEventCorrectionConfirmation('), /if \(!canManage\) return undefined;/);
  assert.equal((source.match(/actions: homeEventCorrectionItemActions\(access\.role !== HouseholdRole\.VIEWER\)/g) ?? []).length, 2);
  assert.match(source, /HOME_EVENT_CORRECT: editHomeEventCorrectConfirmation/);
});

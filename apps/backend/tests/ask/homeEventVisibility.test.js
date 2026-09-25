const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 write slice 7: HOME_EVENT_VISIBILITY.

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');

const source = readAskOrchestratorSources();
const routeOf = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;

function body(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start > 0, `${startMarker} not found`);
  return source.slice(start, source.indexOf(endMarker, start));
}

test('declared item-action message and natural phrasing route to HOME_EVENT_VISIBILITY', () => {
  for (const message of [
    'Change the visibility of this timeline event.',
    'Make this timeline event private',
    'Share this timeline event in resale summaries',
    'Who can see this timeline event?',
  ]) {
    assert.equal(routeOf(message), 'HOME_EVENT_VISIBILITY', message);
  }
});

test('neighbouring intents are not captured', () => {
  assert.notEqual(routeOf('Correct the title of this timeline event.'), 'HOME_EVENT_VISIBILITY');
  assert.notEqual(routeOf('Show my home timeline'), 'HOME_EVENT_VISIBILITY');
  assert.notEqual(routeOf('Make my property private'), 'HOME_EVENT_VISIBILITY');
});

test('registered as a contributor-floor confirmed command', () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.HOME_EVENT_VISIBILITY.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation('HOME_EVENT_VISIBILITY').roleFloor, 'CONTRIBUTOR');
});

test('propose never writes and never offers an event the requester cannot see; confirm writes only through setVisibility with freshness, permission and already-applied checks', () => {
  const propose = body('async function homeEventVisibilityResult(', "registerCapabilityHandler('home-event.visibility'");
  assert.doesNotMatch(propose, /setVisibility\(/);
  assert.match(propose, /NEEDS_CONFIRMATION/);
  // The exact same exclusion the read producers and HOME_EVENT_CORRECT use: a PRIVATE event not created by this
  // user must never be selectable, proposed, or shown in the disambiguation list.
  assert.match(propose, /visibility: \{ not: 'PRIVATE' \}.*createdById: userId/, 'propose must exclude another member\'s PRIVATE events from both selection and the disambiguation list');
  const confirm = body('async function confirmHomeEventVisibility(', "registerConfirmCapabilityHandler('home-event.visibility'");
  assert.match(confirm, /homeEventsServiceForCapture\.setVisibility\(/);
  assert.doesNotMatch(confirm, /updateHomeEvent\(/, 'visibility is an in-place write, never a superseding correction');
  assert.match(confirm, /current\.visibility === 'PRIVATE' && current\.createdById !== userId/, 'confirm must re-check the read-side PRIVATE exclusion, not trust the proposal');
  assert.match(confirm, /homeEventVisibilityBlocker\(/);
  assert.match(confirm, /homeEventContextVersion\(current\)/);
  assert.match(confirm, /alreadyApplied/);
  assert.match(confirm, /reconcileAskExecutionSideEffects/);
});

test('the creator-only privacy rule is a pure function of userId, createdById and the values on either side of the change', () => {
  const blocker = body('function homeEventVisibilityBlocker(', 'function homeEventVisibilityConfirmation(');
  assert.match(blocker, /current === 'PRIVATE' \|\| proposed === 'PRIVATE'/);
  assert.match(blocker, /createdById !== userId/);
});

test('the item action is offered to any contributor (creator-only enforcement happens at propose/confirm, not the listing)', () => {
  assert.match(body('function homeEventCorrectionItemActions(', 'function homeEventCorrectionConfirmation('), /correct-visibility/);
  assert.match(source, /HOME_EVENT_VISIBILITY: editHomeEventVisibilityConfirmation/);
});

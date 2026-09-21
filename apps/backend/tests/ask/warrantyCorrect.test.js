const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 write slice 3: WARRANTY_CORRECT (owner-only).

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');

const source = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
const routeOf = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;

function body(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start > 0, `${startMarker} not found`);
  return source.slice(start, source.indexOf(endMarker, start));
}

test('declared item-action messages and natural phrasing route to WARRANTY_CORRECT', () => {
  for (const message of [
    'Correct the provider of this warranty.',
    'Correct the expiry date of this warranty.',
    'The expiration on my HVAC warranty is wrong, please update the expiration date of the warranty',
  ]) {
    assert.equal(routeOf(message), 'WARRANTY_CORRECT', message);
  }
});

test('neighbouring intents are not captured', () => {
  assert.notEqual(routeOf('Correct the install date of this inventory item.'), 'WARRANTY_CORRECT');
  assert.notEqual(routeOf('Correct the date of this timeline event.'), 'WARRANTY_CORRECT');
  assert.notEqual(routeOf('Show my warranties'), 'WARRANTY_CORRECT');
});

test('registered as a contributor-floor confirmed command', () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.WARRANTY_CORRECT.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation('WARRANTY_CORRECT').roleFloor, 'CONTRIBUTOR');
});

test('owner-only: propose, confirm and edit all verify the requester owns the warranty; actions need ownership', () => {
  const propose = body('async function warrantyCorrectResult(', "registerCapabilityHandler('warranty.correct'");
  assert.doesNotMatch(propose, /updateWarranty\(/);
  assert.match(propose, /WARRANTY_NOT_OWNED_BY_REQUESTER/);
  const confirm = body('async function confirmWarrantyCorrect(', "registerConfirmCapabilityHandler('warranty.correct'");
  assert.match(confirm, /homeownerProfile\.userId !== userId/);
  assert.match(confirm, /ASK_PERMISSION_REQUIRED/);
  const edit = body('async function editWarrantyCorrectConfirmation(', 'const EDIT_CONFIRMATION_HANDLERS');
  assert.match(edit, /homeownerProfile\.userId !== userId/);
  assert.match(body('function warrantyCorrectionItemActions(', 'function warrantyCorrectionConfirmation('), /if \(!canManage \|\| !owned\) return undefined;/);
  assert.match(source, /warrantyCorrectionItemActions\(access\.role !== HouseholdRole\.VIEWER, ownedWarrantyIds\.has\(warranty\.id\)\)/);
});

test('confirm writes a NARROWED patch through updateWarranty with freshness, replay and date-order guards', () => {
  const confirm = body('async function confirmWarrantyCorrect(', "registerConfirmCapabilityHandler('warranty.correct'");
  // Only the one confirmed field is written, built by warrantyFieldPatch, and scoped to the owning profile.
  assert.match(confirm, /updateWarranty\(warranty\.id, warranty\.homeownerProfile\.id, warrantyFieldPatch\(field, next\)\)/);
  assert.doesNotMatch(body('function warrantyFieldPatch(', 'function warrantyContextVersion('), /\.\.\.parameters|req\.body|\.\.\.value/);
  assert.doesNotMatch(confirm, /\.\.\.parameters|req\.body/);
  assert.match(confirm, /warrantyContextVersion\(warranty\)/);
  assert.match(confirm, /alreadyApplied/);
  assert.match(confirm, /reconcileAskExecutionSideEffects/);
  assert.match(source, /cannot be before the warranty start date/);
  assert.match(source, /WARRANTY_CORRECT: editWarrantyCorrectConfirmation/);
});

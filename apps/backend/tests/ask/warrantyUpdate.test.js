const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 write slice 3: WARRANTY_UPDATE (owner-only).

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

test('declared item-action messages and natural phrasing route to WARRANTY_UPDATE', () => {
  for (const message of [
    'Edit this warranty.',
    'Correct the provider of this warranty.',
    'Correct the expiry date of this warranty.',
    'The expiration on my HVAC warranty is wrong, please update the expiration date of the warranty',
  ]) {
    assert.equal(routeOf(message), 'WARRANTY_UPDATE', message);
  }
});

test('neighbouring intents are not captured', () => {
  assert.notEqual(routeOf('Correct the install date of this inventory item.'), 'WARRANTY_UPDATE');
  assert.notEqual(routeOf('Correct the date of this timeline event.'), 'WARRANTY_UPDATE');
  assert.notEqual(routeOf('Show my warranties'), 'WARRANTY_UPDATE');
});

test('registered as a contributor-floor confirmed command', () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.WARRANTY_UPDATE.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation('WARRANTY_UPDATE').roleFloor, 'CONTRIBUTOR');
});

test('owner-only: propose and confirm both verify the requester owns the warranty; the one action needs ownership', () => {
  const propose = body('export async function warrantyUpdateResult(', "registerCapabilityHandler('warranty.update'");
  assert.doesNotMatch(propose, /updateWarranty\(/);
  assert.match(propose, /WARRANTY_NOT_OWNED_BY_REQUESTER/);
  const confirm = body('async function confirmWarrantyUpdate(', "registerConfirmCapabilityHandler('warranty.update'");
  assert.match(confirm, /homeownerProfile\.userId !== userId/);
  assert.match(confirm, /ASK_PERMISSION_REQUIRED/);
  assert.match(body('export function warrantyEditItemActions(', 'export function warrantyUpdateCaptureRequest('), /if \(!canManage \|\| !owned\) return undefined;/);
  assert.match(source, /warrantyEditItemActions\(canWrite, ownedIds\.has\(entry\.record\.id\), conflictedIds\.has\(entry\.record\.id\)\)/);
});

test('the seven "Correct ..." actions are retired: one Edit warranty action, and no single-field correction code remains', () => {
  const actions = require('../../src/services/ask/handlers/homeRecordWrites.handler.ts').warrantyEditItemActions(true, true);
  assert.deepEqual(actions.map((action) => [action.id, action.label, action.operationId]), [['edit-warranty', 'Edit warranty', 'WARRANTY_UPDATE'], ['delete-warranty', 'Delete warranty', 'WARRANTY_UPDATE']]);
  assert.deepEqual(require('../../src/services/ask/handlers/homeRecordWrites.handler.ts').warrantyEditItemActions(true, true, true).map((action) => action.id), ['edit-warranty', 'keep-warranty', 'delete-warranty']);
  assert.equal(require('../../src/services/ask/handlers/homeRecordWrites.handler.ts').warrantyEditItemActions(true, false), undefined);
  assert.doesNotMatch(source, /WARRANTY_CORRECTION_FIELDS|WarrantyCorrectionInputSchema|warrantyCorrectionConfirmation|editWarrantyCorrectConfirmation/);
});

test('confirm writes a NARROWED patch of only the changed keys through updateWarranty as a compare-and-swap, with freshness and replay guards', () => {
  const confirm = body('async function confirmWarrantyUpdate(', "registerConfirmCapabilityHandler('warranty.update'");
  assert.match(confirm, /updateWarranty\(warranty\.id, warranty\.homeownerProfile\.id, warrantyEditorPatch\(Object\.keys\(changes\), values\) as never, \{ expectedUpdatedAt: warranty\.updatedAt \}\)/);
  assert.doesNotMatch(confirm, /\.\.\.parameters|req\.body/);
  assert.match(confirm, /warrantyContextVersion\(warranty\)/);
  assert.match(confirm, /alreadyApplied/);
  assert.match(confirm, /WARRANTY_VERSION_CONFLICT/);
  assert.match(confirm, /reconcileAskExecutionSideEffects/);
  const service = readFileSync(resolve(__dirname, '../../src/services/home-management.service.ts'), 'utf8');
  assert.match(service, /updateMany\(\{\s*where: \{ id: warrantyId, homeownerProfileId, updatedAt: options\.expectedUpdatedAt \}/);
});

test('no per-confirmation edit path is registered any more (the editor replaces it)', () => {
  assert.doesNotMatch(readFileSync(resolve(__dirname, '../../src/services/ask/execution/askConfirm.ts'), 'utf8'), /WARRANTY_UPDATE:/);
});

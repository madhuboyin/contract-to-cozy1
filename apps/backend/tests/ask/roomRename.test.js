const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 write slice 4: ROOM_RENAME.

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

test('declared item-action message and natural phrasing route to ROOM_RENAME', () => {
  for (const message of ['Rename this room.', 'Can you rename the spare room to office', 'The room name is wrong, please fix the name of the guest room']) {
    assert.equal(routeOf(message), 'ROOM_RENAME', message);
  }
});

test('neighbouring intents are not captured', () => {
  assert.notEqual(routeOf('Correct the install date of this inventory item.'), 'ROOM_RENAME');
  assert.notEqual(routeOf('Correct the title of this timeline event.'), 'ROOM_RENAME');
  assert.notEqual(routeOf('Show my rooms'), 'ROOM_RENAME');
});

test('registered as a contributor-floor confirmed command', () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.ROOM_RENAME.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation('ROOM_RENAME').roleFloor, 'CONTRIBUTOR');
});

test('propose never writes; confirm writes a narrowed { name } patch and repeats the controller stale-analysis markers', () => {
  const propose = body('async function roomRenameResult(', "registerCapabilityHandler('room.rename'");
  assert.doesNotMatch(propose, /updateRoom\(/);
  assert.match(propose, /NEEDS_CONFIRMATION/);
  const confirm = body('async function confirmRoomRename(', "registerConfirmCapabilityHandler('room.rename'");
  assert.match(confirm, /inventoryService\.updateRoom\(execution\.propertyId!, room\.id, \{ name \}\)/);
  for (const marker of ['markCoverageAnalysisStale', 'markRiskPremiumOptimizerStale', 'markDoNothingRunsStale']) assert.match(confirm, new RegExp(marker));
  assert.match(confirm, /roomContextVersion\(room\)/);
  assert.match(confirm, /alreadyApplied/);
  assert.match(confirm, /ROOM_ALREADY_EXISTS/);
  assert.match(confirm, /reconcileAskExecutionSideEffects/);
});

test('name uniqueness is checked in propose-edit and confirm; rename action is contributor-and-up on the rooms producer', () => {
  assert.match(body('async function roomRenameNameError(', 'function roomRenameItemActions('), /id: \{ not: roomId \}/);
  assert.match(body('async function editRoomRenameConfirmation(', 'const EDIT_CONFIRMATION_HANDLERS'), /roomRenameNameError\(/);
  assert.match(body('function roomRenameItemActions(', 'function roomRenameConfirmation('), /if \(!canManage\) return undefined;/);
  assert.match(source, /actions: roomRenameItemActions\(access\.role !== HouseholdRole\.VIEWER\)/);
  assert.match(source, /ROOM_RENAME: editRoomRenameConfirmation/);
});

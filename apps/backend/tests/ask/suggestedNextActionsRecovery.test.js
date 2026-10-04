const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const registry = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { restartAfterExpiryCandidates } = require('../../src/services/ask/suggestedActions/recoveryCandidates.ts');
const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');
const { operationalUnavailableResult } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

// Plan C.13 (Phase 4): platform recovery. Restart after expiry is registry-bound; retryable failure, cancel and unavailable get no chip.

const src = (file) => readFileSync(resolve(__dirname, '../../src/services/ask', file), 'utf8');
const stored = (over = {}) => ({ operationId: 'MAINTENANCE_TASK_CREATE', message: 'Add a task to clean the gutters in May', propertyId: 'prop-1', launchContextJson: { surface: 'ASK_PAGE' }, ...over });

test('restart candidate is built from the stored operation, message and property and is schema-valid', () => {
  const [c] = restartAfterExpiryCandidates(stored());
  assert.equal(c.operationId, 'MAINTENANCE_TASK_CREATE');
  assert.equal(c.message, 'Add a task to clean the gutters in May');
  assert.equal(c.outcomeKey, 'RESTART_AFTER_EXPIRY');
  assert.equal(c.label, registry.RESTART_AFTER_EXPIRY_LABELS.MAINTENANCE_TASK_CREATE);
  assert.equal(c.source, 'PLATFORM_STATE');
  assert.equal(c.traits.recovery, true);
  assert.equal(c.traits.promotional, false);
  assert.equal(c.entityContext.entityId, null);
  assert.equal(SuggestedNextActionCandidateSchema.safeParse(c).success, true);
});

test('no restart chip without an approved label, a property, a message, or when the stored launch carries an entity or outcome', () => {
  assert.deepEqual(restartAfterExpiryCandidates(stored({ operationId: 'INVENTORY_ITEM_CORRECT' })), []);
  assert.deepEqual(restartAfterExpiryCandidates(stored({ operationId: null })), []);
  assert.deepEqual(restartAfterExpiryCandidates(stored({ propertyId: null })), []);
  assert.deepEqual(restartAfterExpiryCandidates(stored({ message: '   ' })), []);
  assert.deepEqual(restartAfterExpiryCandidates(stored({ message: 'x'.repeat(301) })), []);
  assert.deepEqual(restartAfterExpiryCandidates(stored({ launchContextJson: { entityType: 'INVENTORY_ITEM', entityId: 'item-1' } })), []);
  assert.deepEqual(restartAfterExpiryCandidates(stored({ launchContextJson: { outcomeKey: 'ADD_BRAND' } })), []);
});

test('the restart outcome is operation-owned: declared on every labelled operation, on no other, and repeatable', () => {
  for (const operationId of Object.keys(registry.RESTART_AFTER_EXPIRY_LABELS)) {
    assert.ok(operationId in ASK_OPERATION_DEFINITIONS, operationId);
    assert.equal(registry.isRegisteredOutcome(operationId, 'RESTART_AFTER_EXPIRY'), true);
    assert.equal(registry.isRepeatableOutcome(operationId, 'RESTART_AFTER_EXPIRY'), true);
  }
  for (const [operationId, outcomes] of Object.entries(registry.SUGGESTED_ACTION_OUTCOMES)) {
    if (outcomes.includes('RESTART_AFTER_EXPIRY')) assert.ok(operationId in registry.RESTART_AFTER_EXPIRY_LABELS, `${operationId} declares restart without a label`);
  }
  assert.equal(registry.isRegisteredOutcome('INVENTORY_ITEM_CORRECT', 'RESTART_AFTER_EXPIRY'), false);
  assert.equal(registry.isRegisteredOutcome('INVENTORY_LOOKUP', 'REVIEW_CURRENT_RECORD'), true);
  assert.deepEqual(registry.validateSuggestedNextActionRegistry(), []);
});

test('restart actions survive SAFE_RECOVERY_ONLY through the shared finalizer; a non-recovery candidate does not', async () => {
  const [restart] = restartAfterExpiryCandidates(stored());
  const run = async (candidates) => finalizeSuggestedNextActionsWithReport({
    result: { status: 'EXPIRED', blocks: [], suggestions: [], suggestedNextActionCandidates: candidates },
    executionId: 'exec-1', userId: 'user-1', sessionId: 'sess-1', propertyId: 'prop-1', operationId: 'MAINTENANCE_TASK_CREATE', message: '',
  }, {
    clock: fixedSuggestedNextActionClock(new Date('2026-10-04T12:00:00.000Z')),
    loadOperationAvailability: async () => new Map([['MAINTENANCE_TASK_CREATE', null]]),
    loadExecutionExpiresAt: async () => null,
  });
  const ok = await run([restart]);
  assert.equal(ok.report.mode, 'SAFE_RECOVERY_ONLY');
  assert.equal(ok.result.suggestedNextActions.length, 1);
  assert.equal(ok.result.suggestedNextActions[0].operationId, 'MAINTENANCE_TASK_CREATE');
  assert.equal(ok.result.suggestedNextActions[0].outcomeKey, 'RESTART_AFTER_EXPIRY');
  const promo = await run([{ ...restart, traits: { ...restart.traits, recovery: false } }]);
  assert.deepEqual(promo.result.suggestedNextActions, []);
});

test('the restart chip is withheld while the operation is unavailable', async () => {
  const [restart] = restartAfterExpiryCandidates(stored());
  const { result } = await finalizeSuggestedNextActionsWithReport({
    result: { status: 'EXPIRED', blocks: [], suggestions: [], suggestedNextActionCandidates: [restart] },
    executionId: 'exec-1', userId: 'user-1', sessionId: 'sess-1', propertyId: 'prop-1', operationId: 'MAINTENANCE_TASK_CREATE', message: '',
  }, { loadOperationAvailability: async () => new Map([['MAINTENANCE_TASK_CREATE', 'HEALTH']]), loadExecutionExpiresAt: async () => null });
  assert.deepEqual(result.suggestedNextActions, []);
});

test('retry, cancel and unavailable branches no longer persist top-level compact strings', () => {
  assert.deepEqual(operationalUnavailableResult('OPERATION_DISABLED').suggestions, []);
  for (const file of ['execution/askConfirm.ts', 'execution/askClarification.ts', 'execution/createAskExecution.ts', 'execution/askSessions.ts', 'support/executionState.ts']) {
    assert.doesNotMatch(src(file), /Ask this question again|Ask a new question|command\.cancellation\.suggestion|unavailable\.suggestions/, `${file} still persists a recovery string`);
  }
});

test('conflict and stale recovery offer a review only for inventory items; other stale callers pass no entity', () => {
  assert.match(src('execution/askConfirm.ts'), /conflictLaunch\.entityType === 'INVENTORY_ITEM'/);
  assert.match(src('handlers/inventory.handler.ts'), /staleSuggestedActionResult\(\{ propertyId, item: items\.find/);
  for (const file of ['handlers/maintenance.handler.ts', 'handlers/homeRecordWrites.handler.ts', 'handlers/miscHandlers.handler.ts']) {
    assert.doesNotMatch(src(file), /staleSuggestedActionResult\([^)]/, `${file} must not request an inventory review`);
  }
});

test('a stale inventory selection offers the exact-item review; a missing item or another domain offers nothing', () => {
  const { staleSuggestedActionResult } = require('../../src/services/ask/suggestedActions/staleSuggestedActionResult.ts');
  const row = { id: 'item-1', name: 'Samsung microwave', updatedAt: new Date('2026-10-01T00:00:00.000Z') };
  const [c] = staleSuggestedActionResult({ propertyId: 'prop-1', item: row, sourceOperationId: 'INVENTORY_ITEM_CORRECT' }).suggestedNextActionCandidates;
  assert.equal(c.operationId, 'INVENTORY_LOOKUP');
  assert.equal(c.outcomeKey, 'REVIEW_CURRENT_RECORD');
  assert.equal(c.entityContext.entityId, 'item-1');
  assert.equal(c.label, 'Review current Samsung microwave');
  assert.equal(SuggestedNextActionCandidateSchema.safeParse(c).success, true);
  assert.equal(staleSuggestedActionResult({ propertyId: 'prop-1', item: undefined, sourceOperationId: null }).suggestedNextActionCandidates, undefined);
  assert.equal(staleSuggestedActionResult().suggestedNextActionCandidates, undefined);
});

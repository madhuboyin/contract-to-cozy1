const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const { inventoryAddItemAction, inventoryViewItemAction, inventoryShowAllAction, INVENTORY_ADD_MESSAGE } = require('../../src/services/ask/handlers/inventoryAskActions.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '../../src/services/ask/handlers', file), 'utf8');

test('inventory next-step actions declare the operation their own message routes to', () => {
  for (const action of [inventoryAddItemAction(), inventoryViewItemAction('HVAC Furnace'), inventoryShowAllAction()]) {
    assert.equal(action.interactionType, 'START_WORKFLOW');
    assert.equal(resolveAskOperation(action.message).operationId, action.operationId, action.id);
    assert.equal(action.href, undefined, 'an in-Ask action must not also navigate');
  }
  assert.equal(inventoryAddItemAction().message, INVENTORY_ADD_MESSAGE);
});

test('the actions validate as response-level block actions', () => {
  const block = { type: 'SUMMARY', id: 's', title: 't', body: 'b', tone: 'DEFAULT', actions: [inventoryViewItemAction('Water heater'), inventoryAddItemAction()] };
  const parsed = AskPresentationBlockSchema.safeParse(block);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? []).slice(0, 300));
});

test('inventory receipts and empty states no longer link out to the desktop inventory page', () => {
  for (const file of ['recordConfirm.handler.ts', 'captureConfirm.handler.ts', 'hvacDecision.handler.ts', 'capitalPlanning.handler.ts', 'miscHandlers.handler.ts']) {
    // (capitalPlanning keeps one /inventory fallbackHref on its property-context capture form; that is not an action.)
    assert.doesNotMatch(read(file), /id: 'open-inventory'|id: 'open-attached-record', label: 'Open home inventory'|openItemId/, `${file} still links to the desktop inventory page`);
  }
  assert.doesNotMatch(read('inventory.handler.ts'), /action=add-item/);
});

test('the repair-or-replace picker declares the operation each item sentence routes to', () => {
  const source = read('miscHandlers.handler.ts');
  assert.match(source, /operationId: resolveAskOperation\(message\)\.operationId/);
  // HVAC-type items route to the HVAC decision flow; a fixed REPLACEMENT_GUIDANCE would override that.
  assert.equal(resolveAskOperation('Should I repair or replace HVAC Furnace?').operationId, 'HVAC_DECISION_START');
  assert.equal(resolveAskOperation('Should I repair or replace Oven Range?').operationId, 'REPLACEMENT_GUIDANCE');
});

// The answer-trust validator silently removes any block action whose id is not allowlisted for the operation. A schema-valid,
// correctly-routed action is therefore still invisible to the homeowner unless it is declared in OPERATION_ACTION_IDS.
test('every in-Ask next-step action survives the answer-trust validator for the operation that emits it', () => {
  const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
  const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
  const { buildSeasonalHomeCareResult } = require('../../src/services/ask/support/seasonalHomeCare.ts');
  const view = inventoryViewItemAction('Water heater');
  const add = inventoryAddItemAction();
  const cases = [
    ['INVENTORY_ITEM_CORRECT', 'WORKFLOW_PROGRESS', view, 'COMPLETED'],
    ['INVENTORY_ITEM_CREATE', 'WORKFLOW_PROGRESS', view, 'COMPLETED'],
    ['CAPTURE_EVIDENCE_CONFIRM', 'SUMMARY', inventoryViewItemAction('Water heater', 'SECONDARY'), 'COMPLETED'],
    ['INVENTORY_LOOKUP', 'SUMMARY', add, 'READY_WITH_LIMITATIONS'],
    ['REPLACEMENT_GUIDANCE', 'SUMMARY', inventoryShowAllAction(), 'READY_WITH_LIMITATIONS'],
    ['REPLACEMENT_GUIDANCE', 'SUMMARY', add, 'READY_WITH_LIMITATIONS'],
    ['HVAC_DECISION_START', 'SUMMARY', add, 'NOT_APPLICABLE'],
    ['HVAC_DECISION_START', 'EMPTY_STATE', view, 'NOT_APPLICABLE'],
    ['CAPITAL_RESERVE_PLAN', 'SUMMARY', add, 'READY_WITH_LIMITATIONS'],
  ];
  const seasonal = buildSeasonalHomeCareResult({ zipCode: '08536', now: new Date('2026-10-05T12:00:00Z'), focus: 'NEXT_SEASON' });
  const seasonalAction = seasonal.blocks[0].actions[0];
  cases.push(['SEASONAL_HOME_CARE', 'SUMMARY', seasonalAction, 'ANSWERED']);
  assert.equal(seasonalAction.href, undefined, 'the seasonal CTA must stay in Ask');
  assert.equal(resolveAskOperation(seasonalAction.message).operationId, seasonalAction.operationId);

  for (const [operationId, type, action, status] of cases) {
    const definition = getAskOperationDefinition(operationId);
    const block = type === 'WORKFLOW_PROGRESS'
      ? { type, id: 'b', title: 't', status: 'COMPLETED', description: 'd', details: [], actions: [action] }
      : type === 'EMPTY_STATE' ? { type, id: 'b', title: 't', body: 'b', actions: [action] }
        : { type, id: 'b', title: 't', body: 'b', tone: 'DEFAULT', actions: [action] };
    const result = {
      status, reasonCode: 'X', blocks: [block], suggestions: [],
      parameters: {
        audiencePresentation: { householdRole: 'OWNER' },
        answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: definition.adapterKey, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: new Date().toISOString() }] },
      },
    };
    const validated = validateAskAnswerTrust({ question: 'q', operationId, propertyId: 'p1', result });
    const kept = validated.result.blocks.flatMap((candidate) => candidate.actions ?? []).map((candidate) => candidate.id);
    assert.deepEqual(kept, [action.id], `${operationId} must keep "${action.id}" (trust: ${(validated.trust?.reasonCodes ?? []).join(',')})`);
  }
});

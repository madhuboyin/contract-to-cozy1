const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { validateAskAnswerTrust, validateAskAnswerTrustPipeline, isAskHonestLimitationResult } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence: attachEvidence, completedAskAuthoritativeSourceEvidence, isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { inventoryShowAllAction } = require('../../src/services/ask/handlers/inventoryAskActions.ts');

// Review screenshots (2026-11-07): "is my water heater still good" showed "I'm not sure I understood that" with one option, the operation that had just
// run, because that operation's own honest answer ("Choose a recorded appliance first") shares few words with the question; "should i replace my
// furnace, update on my furnace decision" answered "No active decision for this system yet" with no way to start one.

const withEvidence = (result, operationId) => attachEvidence(result, [completedAskAuthoritativeSourceEvidence(operationId)]);
const notRecorded = () => withEvidence({
  status: 'READY_WITH_LIMITATIONS', reasonCode: 'REPAIR_REPLACE_ITEM_NOT_IN_HOME_RECORD',
  blocks: [{
    type: 'SUMMARY', id: 'repair-replace-no-item', title: 'Choose a recorded appliance or home system first',
    body: 'I could not resolve this request to one canonical inventory item. Ask will not manufacture a repair/replace calculation without the item’s condition, lifecycle, cost, and repair history. This home has 12 recorded items.',
    tone: 'CAUTION', actions: [inventoryShowAllAction()],
  }],
  suggestions: [],
}, 'REPLACEMENT_GUIDANCE');

test('an operation reached by a certain rule that answers with its own plain limitation shows it directly, with no "I\'m not sure I understood" step', () => {
  for (const question of ['is my water heater still good', 'should i replace my water heater', 'can i keep using my old dishwasher']) {
    const validation = validateAskAnswerTrustPipeline({ question, operationId: 'REPLACEMENT_GUIDANCE', result: notRecorded(), semanticEnabled: true, propertyId: 'p1', routedDeterministically: true });
    assert.equal(validation.result.status, 'READY_WITH_LIMITATIONS', question);
    assert.equal(validation.result.clarification ?? null, null, question);
    assert.equal(validation.result.blocks[0].title, 'Choose a recorded appliance or home system first', question);
    assert.equal(validation.semantic, null, question);
    assert.ok(validation.result.blocks[0].actions.some((action) => action.id === 'show-inventory'), 'its next step is kept');
  }
});

test('the same answer from a score-based route is still checked, as before', () => {
  const validation = validateAskAnswerTrustPipeline({ question: 'is my water heater still good', operationId: 'REPLACEMENT_GUIDANCE', result: notRecorded(), semanticEnabled: true, propertyId: 'p1' });
  assert.equal(validation.result.status, 'NEEDS_CLARIFICATION');
  assert.equal(validation.semantic.outcome, 'UNKNOWN');
});

test('only a plain limitation skips the check: an answer with data, or a vague answer, is still verified', () => {
  const base = notRecorded();
  assert.equal(isAskHonestLimitationResult(base), true);
  assert.equal(isAskHonestLimitationResult({ ...base, reasonCode: undefined }), false, 'a typed reason is required');
  assert.equal(isAskHonestLimitationResult({ ...base, status: 'ANSWERED' }), false);
  assert.equal(isAskHonestLimitationResult({ ...base, blocks: [{ ...base.blocks[0], tone: 'DEFAULT' }] }), false, 'a neutral summary is an answer, not a limitation');
  assert.equal(isAskHonestLimitationResult({ ...base, blocks: [...base.blocks, { type: 'GROUPED_LIST', id: 'x', title: 'Items', filters: [], sections: [], actions: [] }] }), false, 'data blocks are verified');
  const vague = withEvidence({ status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'vague', title: 'Response', body: 'I found a result.', tone: 'DEFAULT', actions: [] }], suggestions: [] }, 'MAINTENANCE_STATUS');
  const validation = validateAskAnswerTrustPipeline({ question: 'What maintenance is pending?', operationId: 'MAINTENANCE_STATUS', result: vague, semanticEnabled: true, routedDeterministically: true });
  assert.equal(validation.result.status, 'NEEDS_CLARIFICATION', 'a deterministic route does not excuse a vague answer');
});

test('"no active decision yet" can start one, and its buttons survive the answer-trust allowlist', () => {
  const message = 'Should I repair or replace HVAC Furnace?';
  assert.equal(resolveAskOperation(message).operationId, 'HVAC_DECISION_START', 'the start action asks the question the homeowner would ask');
  assert.equal(resolveAskOperation('Should I repair or replace Carrier heat pump?').operationId, 'HVAC_DECISION_START');
  const start = { id: 'hvac-decision-start', label: 'Start a repair-or-replace decision', message, style: 'PRIMARY', interactionType: 'START_WORKFLOW', operationId: 'HVAC_DECISION_START' };
  const view = { id: 'view-inventory-item', label: 'View this item', message: 'Show inventory item "HVAC Furnace"', style: 'SECONDARY', interactionType: 'START_WORKFLOW', operationId: 'INVENTORY_LOOKUP' };
  const result = withEvidence({
    status: 'NOT_APPLICABLE', reasonCode: 'HVAC_DECISION_NOT_STARTED',
    blocks: [{ type: 'EMPTY_STATE', id: 'hvac-decision-none', title: 'No active decision for this system yet', body: 'Ask has not started a repair-or-replace decision for HVAC Furnace.', actions: [start, view] }],
    suggestions: [],
  }, 'HVAC_DECISION_CONTINUE');
  const validated = validateAskAnswerTrust({ question: 'should i replace my furnace, update on my furnace decision', operationId: 'HVAC_DECISION_CONTINUE', result, propertyId: 'p1' });
  assert.deepEqual(validated.result.blocks[0].actions.map((action) => action.id), ['hvac-decision-start', 'view-inventory-item']);
  const applicable = (action, operationId = 'HVAC_DECISION_CONTINUE') => isAskActionApplicable({ action, operationId, propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true });
  assert.equal(applicable(start), true);
  assert.equal(applicable({ ...start, id: 'hvac-decision-something-else' }), false, 'an unlisted action is still removed');
});

test('the handler offers the start action in its no-active-decision answer', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/hvacDecision.handler.ts'), 'utf8');
  assert.match(source, /id: 'hvac-decision-none'[^\n]*actions: \[hvacStartDecisionAction\(item\.name\)/);
});

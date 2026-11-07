const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence: attachEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { CANONICAL_ANSWER_BLOCK_ID_PREFIXES, matchesCanonicalAnswerBlocks } = require('../../src/services/ask/support/canonicalAnswerBlocks.ts');
const { containsWholeWord } = require('../../src/services/ask/support/wholeWord.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

// Review screenshots (2026-11-07): "do I need a new roof" ended in "I'm not sure I understood that" although the repair-or-replace analysis was
// complete; "do i need a new washing machine" offered a Dishwasher as a possible match; "what need to be taken care for my plant for winter" offered
// "export the home record as a PDF" as the request the answer should address.

const withEvidence = (result, operationId) => attachEvidence(result, [completedAskAuthoritativeSourceEvidence(operationId)]);
const analysis = (status = 'ANSWERED', reasonCode) => withEvidence({
  status, reasonCode, parameters: { inventoryItemId: 'i1' }, captureRequests: [],
  blocks: [
    { type: 'SUMMARY', id: 'repair-replace-guidance', title: 'Roof: keep monitoring', body: 'The canonical model currently favors repairing and monitoring this item for now.', tone: 'DEFAULT', actions: [] },
    { type: 'TABLE', id: 'repair-replace-costs', title: 'Modeled decision inputs', description: 'Planning estimates.', columns: [{ key: 'path', label: 'Measure' }, { key: 'amount', label: 'Amount' }], rows: [{ id: 'repair', values: { path: 'Estimated next repair', amount: '$1,200' } }], actions: [] },
    { type: 'BOUNDARY', id: 'repair-replace-boundary', title: 'Planning guidance—not a diagnosis or quote', body: 'A qualified technician should diagnose safety.', severity: 'INFO', suggestions: [] },
  ],
  suggestions: [],
}, 'REPLACEMENT_GUIDANCE');

test('an operation’s own typed answer is not refused as "not what you asked for"', () => {
  for (const question of ['do I need a new roof', 'do i need a new washing machine', 'is my water heater still good']) {
    for (const [status, reason] of [['ANSWERED'], ['READY_WITH_LIMITATIONS', 'LIFECYCLE_CONTEXT_OPTIONAL'], ['READY_WITH_LIMITATIONS', 'REPAIR_REPLACE_CONFIDENCE_LIMITED']]) {
      const validation = validateAskAnswerTrustPipeline({ question, operationId: 'REPLACEMENT_GUIDANCE', result: analysis(status, reason), semanticEnabled: true, propertyId: 'p1', routedDeterministically: true });
      assert.equal(validation.semantic.outcome, 'PASS', `${question} / ${reason}`);
      assert.deepEqual(validation.semantic.reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
      assert.equal(validation.result.status, status);
      assert.equal(validation.result.clarification ?? null, null);
    }
  }
});

test('the contract needs the operation’s own block: the fallback’s block, a footer, or another operation’s block does not count', () => {
  const block = (type, id) => ({ type, id });
  assert.equal(matchesCanonicalAnswerBlocks('REPLACEMENT_GUIDANCE', { blocks: [block('SUMMARY', 'repair-replace-guidance')] }), true);
  assert.equal(matchesCanonicalAnswerBlocks('REPLACEMENT_GUIDANCE', { blocks: [block('SUMMARY', 'hvac-decision-progress')] }), true, 'an HVAC item is answered by the HVAC decision');
  assert.equal(matchesCanonicalAnswerBlocks('REPLACEMENT_GUIDANCE', { blocks: [block('SUMMARY', 'grounded-guidance')] }), false);
  assert.equal(matchesCanonicalAnswerBlocks('REPLACEMENT_GUIDANCE', { blocks: [block('BOUNDARY', 'repair-replace-boundary'), block('EVIDENCE', 'repair-replace-evidence')] }), false, 'a footer alone is not an answer');
  assert.equal(matchesCanonicalAnswerBlocks('PLANT_CARE_OUTLOOK', { blocks: [block('SUMMARY', 'repair-replace-guidance')] }), false);
  assert.equal(matchesCanonicalAnswerBlocks('PLANT_CARE_OUTLOOK', { blocks: [block('SUMMARY', 'plant-care-summary')] }), true);
  assert.equal(matchesCanonicalAnswerBlocks('NEIGHBORHOOD_CHANGE_FEED', { blocks: [block('GROUPED_LIST', 'neighborhood-changes')] }), true);
  assert.equal(matchesCanonicalAnswerBlocks('SAVED_RESULTS', { blocks: [block('SUMMARY', 'anything')] }), false, 'an operation with no entry is still checked');
  for (const operationId of Object.keys(CANONICAL_ANSWER_BLOCK_ID_PREFIXES)) assert.ok(ASK_OPERATION_DEFINITIONS[operationId], `${operationId} is a registered operation`);
});

const fallbackAnswer = (body) => withEvidence({
  status: 'ANSWERED',
  blocks: [{ type: 'SUMMARY', id: 'grounded-guidance', title: 'Guidance for this home', body, tone: 'DEFAULT', actions: [] }],
  suggestions: [],
}, 'GROUNDED_GUIDANCE');

test('a clarification never offers a write or export operation as the request the answer should address', () => {
  const question = 'what need to be taken care for my plant for winter';
  for (const body of ['Export the home record as a PDF after showing exactly what is included and left out.', 'Export home record sections as a PDF showing what is included. The export is ready to download.']) {
    const validation = validateAskAnswerTrustPipeline({ question, operationId: 'GROUNDED_GUIDANCE', result: fallbackAnswer(body), semanticEnabled: true, propertyId: 'p1' });
    assert.equal(validation.semantic.outcome, 'FAIL');
    assert.equal(validation.semantic.competingOperationId, 'HOME_RECORD_EXPORT', 'the answer resembles the export operation, as in the screenshot');
    assert.ok(!(validation.result.clarification?.options ?? []).some((option) => option.operationId === 'HOME_RECORD_EXPORT'));
    assert.equal(validation.result.reasonCode, 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE', 'with nothing real to offer, the plain message is shown');
  }
});

test('a read-only competitor is still offered', () => {
  const validation = validateAskAnswerTrustPipeline({
    question: 'what need to be taken care for my plant for winter', operationId: 'GROUNDED_GUIDANCE', semanticEnabled: true, propertyId: 'p1',
    result: fallbackAnswer('Pending and completed maintenance tasks: the furnace filter task is due soon and two tasks are completed.'),
  });
  assert.equal(validation.semantic.competingOperationId, 'MAINTENANCE_STATUS');
  assert.deepEqual((validation.result.clarification?.options ?? []).map((option) => option.operationId), ['MAINTENANCE_STATUS']);
});

test('an appliance name matches whole words only: "washer" is not "Dishwasher"', () => {
  assert.equal(containsWholeWord('Dishwasher appliance', 'washer'), false);
  assert.equal(containsWholeWord('Washer Dryer appliance', 'washer'), true);
  assert.equal(containsWholeWord('Samsung washing machine', 'washing machine'), true);
  assert.equal(containsWholeWord('Dishwasher appliance', 'dishwasher'), true);
  assert.equal(containsWholeWord('Rheem water heater', 'water heater'), true);
  assert.equal(containsWholeWord('Roof (asphalt)', 'roof'), true);
  assert.equal(containsWholeWord('Rooftop unit', 'roof'), false);
  assert.equal(containsWholeWord('anything', ''), false);
});

test('both handlers that look an item up by appliance name use whole-word matching', () => {
  const read = (file) => readFileSync(resolve(__dirname, `../../src/services/ask/handlers/${file}`), 'utf8');
  const repair = read('miscHandlers.handler.ts');
  assert.match(repair, /aliases\.some\(\(alias\) => containsWholeWord\(itemText\(item\), alias\)/);
  assert.doesNotMatch(repair, /itemText\(item\)\.includes\(alias\)/);
  const inventory = read('inventory.handler.ts');
  assert.match(inventory, /specific\.terms\.some\(\(term\) => containsWholeWord\(inventoryItemSearchText\(item\), term\)\)/);
  assert.doesNotMatch(inventory, /specific\.terms\.some\(\(term\) => inventoryItemSearchText\(item\)\.includes\(term\)\)/);
});

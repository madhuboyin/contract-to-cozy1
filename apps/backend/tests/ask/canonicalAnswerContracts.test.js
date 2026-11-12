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

test('a read-only competitor alone is not a card (FR-REC-1): one option is declined, not offered', () => {
  const validation = validateAskAnswerTrustPipeline({
    question: 'what need to be taken care for my plant for winter', operationId: 'GROUNDED_GUIDANCE', semanticEnabled: true, propertyId: 'p1',
    result: fallbackAnswer('Pending and completed maintenance tasks: the furnace filter task is due soon and two tasks are completed.'),
  });
  assert.equal(validation.semantic.competingOperationId, 'MAINTENANCE_STATUS');
  assert.equal(validation.result.clarification, undefined);
  assert.equal(validation.result.reasonCode, 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE');
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

test('the savings contract accepts every savings- block the handler emits, and still rejects a foreign block', () => {
  const { matchesSavingsOpportunitiesAnswerContract } = require('../../src/services/ask/askSavingsIntent.ts');
  const block = (id, type = 'METRIC_ROW') => ({ type, id, title: id });
  const result = (blocks) => ({ status: 'ANSWERED', blocks });
  assert.equal(matchesSavingsOpportunitiesAnswerContract(result([block('savings-summary', 'SUMMARY'), block('savings-headline'), block('savings-recurring-setup', 'GROUPED_LIST'), block('savings-realized-totals'), block('savings-exclusion-conflicts', 'SUMMARY'), block('related-capabilities', 'CAPABILITY_LIST')])), true);
  assert.equal(matchesSavingsOpportunitiesAnswerContract(result([block('savings-summary', 'SUMMARY'), block('some-other-block')])), false);
  assert.equal(matchesSavingsOpportunitiesAnswerContract(result([block('maintenance-summary', 'SUMMARY')])), false);
});

// Audit Phase 3: operations added to the canonical contract. Each prefix must be one the operation's own handler really emits (checked against the
// handler source, so a typo or a renamed block id fails here), must accept that operation's answer block, and must not accept a footer, the fallback, or
// another operation's block.
const PHASE3 = {
  APPLIANCE_FAILURE_RISK: ['applianceOracleBudget.handler.ts', 'appliance-oracle-summary'],
  WARRANTY_LOOKUP: ['warranties.handler.ts', 'warranty-summary'],
  INCIDENT_CLAIM_STATUS: ['claims.handler.ts', 'incident-claim-summary'],
  RECALL_REVIEW: ['recallReview.handler.ts', 'recall-review-summary'],
  SELL_HOLD_RENT_ANALYSIS: ['sellHoldRent.handler.ts', 'sell-hold-rent-summary'],
  PROPERTY_TAX_APPEAL_READINESS: ['capitalPlanning.handler.ts', 'tax-readiness-summary'],
  BREAK_EVEN_ANALYSIS: ['refinance.handler.ts', 'break-even-summary'],
  DO_NOTHING_SIMULATION: ['doNothingSimulator.handler.ts', 'do-nothing-summary'],
  HOA_COMPLIANCE_STATUS: ['hoaCompliance.handler.ts', 'hoa-compliance-summary'],
  SERVICE_PRICE_CHECKS: ['servicePriceRadar.handler.ts', 'service-price-radar-summary'],
  PROJECT_TRACKER_PROJECTS: ['projectTracker.handler.ts', 'project-tracker-summary'],
  DIY_PROJECTS: ['diyProjectCenter.handler.ts', 'diy-summary'],
};

test('every Phase 3 operation accepts its own handler block and nothing else', () => {
  const block = (type, id) => ({ type, id });
  const ids = Object.entries(PHASE3);
  for (const [operationId, [file, ownId]] of ids) {
    const source = readFileSync(resolve(__dirname, `../../src/services/ask/handlers/${file}`), 'utf8');
    assert.ok(source.includes(`id: '${ownId}'`), `${operationId}: ${file} emits ${ownId}`);
    assert.equal(matchesCanonicalAnswerBlocks(operationId, { blocks: [block('SUMMARY', ownId)] }), true, operationId);
    assert.equal(matchesCanonicalAnswerBlocks(operationId, { blocks: [block('SUMMARY', 'grounded-guidance')] }), false, `${operationId}: the fallback never counts`);
    assert.equal(matchesCanonicalAnswerBlocks(operationId, { blocks: [block('BOUNDARY', ownId), block('EVIDENCE', ownId)] }), false, `${operationId}: a footer alone is not an answer`);
    for (const [otherId, [, otherOwn]] of ids) {
      if (otherId !== operationId) assert.equal(matchesCanonicalAnswerBlocks(operationId, { blocks: [block('SUMMARY', otherOwn)] }), false, `${operationId} must not accept ${otherId}'s block`);
    }
  }
});

// External review P2: a prefix that a command or capture handler also emits would let a write's review card skip the relevance check. Every block id
// written as a literal in any handler is checked against every Phase 3 entry; the only file allowed to match is the operation's own read handler.
test('no Phase 3 entry matches a block id emitted by any other handler', () => {
  const { readdirSync } = require('node:fs');
  const dir = resolve(__dirname, '../../src/services/ask/handlers');
  const emitted = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    for (const m of source.matchAll(/\bid: '([a-z0-9-]+)'/g)) emitted.push({ file, id: m[1] });
  }
  assert.ok(emitted.length > 500, 'the scan must really see the handlers');
  for (const [operationId, [ownFile]] of Object.entries(PHASE3)) {
    const foreign = emitted.filter(({ file, id }) => file !== ownFile && matchesCanonicalAnswerBlocks(operationId, { blocks: [{ type: 'SUMMARY', id }] }));
    assert.deepEqual(foreign, [], `${operationId} accepts blocks emitted outside ${ownFile}`);
  }
});

test('the single-project view of PROJECT_TRACKER_PROJECTS is an answer too', () => {
  for (const id of ['project-detail-summary', 'project-detail-financials', 'project-execution-alignment', 'project-closeout-preview']) {
    assert.equal(matchesCanonicalAnswerBlocks('PROJECT_TRACKER_PROJECTS', { blocks: [{ type: 'SUMMARY', id }] }), true, id);
  }
  assert.equal(matchesCanonicalAnswerBlocks('PROJECT_TRACKER_PROJECTS', { blocks: [{ type: 'BOUNDARY', id: 'project-tracker-boundary' }] }), false);
});

test('operations the routing sweep shows other questions misrouted into stay under the relevance check', () => {
  for (const operationId of ['MAINTENANCE_BUDGET_FORECAST', 'MAINTENANCE_FORECAST', 'DOCUMENT_LOOKUP', 'INSPECTION_FINDINGS']) {
    assert.equal(CANONICAL_ANSWER_BLOCK_ID_PREFIXES[operationId], undefined, operationId);
  }
});

// FR-FAST / FR-GATE (provisional reads, slice 1: data-point reads): an uncertified deterministic rule may START a harmless read, and the result earns delivery on grounded evidence. It never gets the canonical bypass and a
// write, a decision or any other operation keeps the strict path.
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
require('ts-node/register/transpile-only');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { isProvisionalReadOperation, PROVISIONAL_READ_OPERATIONS } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { groundedReadVerdict, pointsNamedBy } = require('../../src/services/ask/support/provisionalRead.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { handleDataPointRead } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { prisma } = require('../../src/lib/prisma.ts');
// production attaches the authoritative-source evidence of a completed read before the delivery gate runs (executeOperation)
const withEvidence = (r) => attachAskAuthoritativeSourceEvidence(r, [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');

const route = (message, options = {}) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, ...options });

test('an uncertified rule that matches a reviewed data-point read starts it provisionally, with the rule named in lineage and still demoted', () => {
  for (const message of ['How much did I pay for my furnace?', 'what is the serial number of my fridge', 'what year was my house built', 'how many bedrooms does my house have', 'which appliances have no serial number recorded']) {
    const decision = route(message);
    assert.equal(decision.stage, 'PROVISIONAL', message); assert.equal(decision.operation.operationId, 'DATA_POINT_READ', message);
    assert.equal(decision.requiresClarification, false); assert.match(decision.fastPathLineage.ruleId, /^DET_DATA_POINT_READ_\d+$/); assert.equal(decision.fastPathLineage.status, 'DEMOTED');
    assert.ok(decision.candidates[0].reasonCodes.includes('FAST_PATH_PROVISIONAL_READ'));
  }
});
test('nothing else changes: a write, a decision, a safety message, another read operation or an operation this home cannot run is never provisional', () => {
  assert.ok(isProvisionalReadOperation('DATA_POINT_READ')); assert.deepEqual([...PROVISIONAL_READ_OPERATIONS].sort(), ['DATA_POINT_READ', 'HOME_BASICS_GUIDE', 'HOME_STATUS_BOARD', 'MAINTENANCE_STATUS', 'PROPERTY_SUMMARY', 'WARRANTY_LOOKUP']);
  for (const op of ['INVENTORY_ITEM_CORRECT', 'HVAC_DECISION_START', 'MAINTENANCE_TASK_CREATE', 'COVERAGE_GAPS', 'EMERGENCY_BOUNDARY', 'GROUNDED_GUIDANCE']) assert.equal(isProvisionalReadOperation(op), false, op);
  for (const message of ['Add a task to clean the gutters', 'Show my insurance policies', 'Correct the model number of my dishwasher', 'What coverage gaps does my home have?']) assert.notEqual(route(message).stage, 'PROVISIONAL', message);
  assert.equal(route('My house is on fire').stage, 'SAFETY');
  assert.notEqual(route('How much did I pay for my furnace?', { eligibleOperationIds: ['INVENTORY_LOOKUP'] }).stage, 'PROVISIONAL', 'an operation outside the eligible set is not tried');
});

const result = (extra = {}) => ({ status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'data-point-summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] }], suggestions: [], parameters: { sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] }, ...extra });
test('the grounded verdict: a value must be the value of a point the question names and come from a source; a limitation states no value; anything else is not grounded', () => {
  const ask = 'how much did I pay for my furnace';
  assert.ok(pointsNamedBy(ask).has('item.purchaseCost'));
  assert.deepEqual(groundedReadVerdict(ask, result({ parameters: { dataPointRead: { pointIds: ['item.purchaseCost'] }, sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] } })).reasonCodes, ['PROVISIONAL_READ_GROUNDED']);
  assert.deepEqual(groundedReadVerdict(ask, result({ parameters: { dataPointRead: { pointIds: ['item.serial'] }, sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] } })).reasonCodes, ['PROVISIONAL_READ_NOT_GROUNDED', 'ANSWERED_A_DIFFERENT_DATA_POINT']);
  assert.deepEqual(groundedReadVerdict(ask, result({ parameters: { dataPointRead: { pointIds: ['item.purchaseCost'] }, sources: [] } })).reasonCodes, ['PROVISIONAL_READ_NOT_GROUNDED', 'NO_SOURCE_RECORD']);
  for (const reasonCode of ['DATA_POINT_NOT_RECORDED', 'DATA_POINT_AMBIGUOUS', 'DATA_POINT_ITEM_NOT_FOUND', 'DATA_POINT_RESTRICTED']) assert.equal(groundedReadVerdict(ask, result({ status: 'READY_WITH_LIMITATIONS', reasonCode, parameters: { sources: [] } })).outcome, 'PASS', reasonCode);
  assert.equal(groundedReadVerdict(ask, result({ parameters: {} })).outcome, 'FAIL'); assert.equal(groundedReadVerdict(ask, result({ reasonCode: 'SOMETHING_ELSE', parameters: {} })).outcome, 'FAIL');
  // a computed answer must be the plan the question itself produces
  assert.equal(groundedReadVerdict('which appliances have no serial number recorded', result({ parameters: { dataPointQuery: { template: 'shape789' }, sources: [] } })).outcome, 'PASS');
  assert.equal(groundedReadVerdict('what is the weather', result({ parameters: { dataPointQuery: { template: 'shape789' }, sources: [] } })).outcome, 'FAIL');
});

function stub(items) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  prisma.inventoryItem = { findMany: async () => items };
}
const deliver = async (question, items) => {
  stub(items);
  const answer = await handleDataPointRead({ userId: 'u1', propertyId: 'p1', message: question });
  return { answer, validated: validateAskAnswerTrustPipeline({ question, operationId: 'DATA_POINT_READ', result: withEvidence(answer), propertyId: 'p1', semanticEnabled: true, provisionalRead: true }) };
};
const FURNACE = { id: 'i1', name: 'Furnace', purchaseCostCents: 420000, serialNumber: 'F-77', room: null };
test('the furnace price: delivered directly from the reviewed read; a missing value and an item that is not there are honest answers, and two matching furnaces are both stated', async () => {
  const ok = await deliver('How much did I pay for my furnace?', [FURNACE, { id: 'i2', name: 'Water Heater', purchaseCostCents: 90000, room: null }]);
  assert.equal(ok.answer.status, 'ANSWERED'); assert.match(ok.answer.blocks[0].body, /\$4,200/); assert.deepEqual(ok.answer.parameters.dataPointRead.pointIds, ['item.purchaseCost']);
  assert.equal(ok.validated.trust.outcome === 'CLARIFY', false); assert.equal(ok.validated.semantic.outcome, 'PASS'); assert.deepEqual(ok.validated.semantic.reasonCodes, ['PROVISIONAL_READ_GROUNDED']); assert.match(ok.validated.result.blocks[0].body, /\$4,200/);
  const missing = await deliver('How much did I pay for my furnace?', [{ ...FURNACE, purchaseCostCents: null }]);
  assert.equal(missing.answer.reasonCode, 'DATA_POINT_NOT_RECORDED'); assert.equal(missing.validated.semantic.outcome, 'PASS'); assert.equal(missing.validated.trust.outcome === 'CLARIFY', false);
  const two = await deliver('How much did I pay for my furnace?', [FURNACE, { ...FURNACE, id: 'i3', room: { name: 'Attic' } }]);
  assert.equal(two.answer.status, 'ANSWERED'); assert.equal((two.answer.blocks[0].body.match(/\$4,200/g) ?? []).length, 2, 'two matching furnaces: each is stated, none is picked for the homeowner'); assert.equal(two.validated.semantic.outcome, 'PASS');
  const absent = await deliver('How much did I pay for my furnace?', [{ id: 'i4', name: 'Dishwasher', purchaseCostCents: 50000, room: null }]);
  assert.equal(absent.answer.reasonCode, 'DATA_POINT_ITEM_NOT_FOUND'); assert.doesNotMatch(absent.answer.blocks[0].body, /\$500/);
});
test('an answer that is not grounded is withheld, with no canonical bypass: a value for a different point, and a value with no source', () => {
  const question = 'how much did I pay for my furnace';
  const wrongPoint = validateAskAnswerTrustPipeline({ question, operationId: 'DATA_POINT_READ', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: withEvidence(result({ parameters: { dataPointRead: { pointIds: ['item.serial'] }, sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] } })) });
  assert.equal(wrongPoint.semantic.outcome, 'FAIL'); assert.ok(wrongPoint.semantic.reasonCodes.includes('ANSWERED_A_DIFFERENT_DATA_POINT')); assert.equal(wrongPoint.trust.outcome, 'CLARIFY');
  const unsourced = validateAskAnswerTrustPipeline({ question, operationId: 'DATA_POINT_READ', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: withEvidence(result({ parameters: { dataPointRead: { pointIds: ['item.purchaseCost'] }, sources: [] } })) });
  assert.equal(unsourced.semantic.outcome, 'FAIL'); assert.equal(unsourced.trust.outcome, 'CLARIFY');
  // the flag is the only thing that selects this check: without it the ordinary gate applies
  const ordinary = validateAskAnswerTrustPipeline({ question, operationId: 'DATA_POINT_READ', propertyId: 'p1', semanticEnabled: true, result: withEvidence(result({ parameters: { dataPointRead: { pointIds: ['item.purchaseCost'] }, sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] } })) });
  assert.ok(!ordinary.semantic.reasonCodes.includes('PROVISIONAL_READ_GROUNDED'));
});
test('createAskExecution marks a provisional read for the delivery gate, and only for the operation the rule selected', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  assert.match(src, /provisionalRead: routingDecision\.stage === 'PROVISIONAL' && operation\.operationId === routingDecision\.operation\.operationId/);
});

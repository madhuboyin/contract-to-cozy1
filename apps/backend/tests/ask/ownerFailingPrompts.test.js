// The owner's six failing prompts (2026-11-13 screenshots): "How old is my water heater?", "When was my roof installed?", "What is the model number of my refrigerator", "How old is my HVAC system?" and "How much would a new
// furnace cost?" ... the first four are single recorded facts. They must route to the data-point read (a provisional read), the real handler must state the fact (with an age when asked), and the delivery gate must pass it.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');
const { handleDataPointRead } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const years = (n) => new Date(Date.now() - n * 365.25 * 86_400_000);
const ITEMS = [{ id: 'w1', name: 'Water Heater', installedOn: years(7.5), modelNumber: 'XG50', room: null }, { id: 'h1', name: 'HVAC System', installedOn: years(12.2), room: null }, { id: 'r1', name: 'Refrigerator', modelNumber: 'RF28R7351SR', room: null }];
function stub(property = { roofReplacementYear: new Date().getUTCFullYear() - 9 }) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  prisma.inventoryItem = { findMany: async () => ITEMS };
  prisma.property = { findUnique: async () => property, findFirst: async () => property, findMany: async () => [{ id: 'p1', ...property }] };
}
const deliver = async (question) => {
  stub(); const answer = await handleDataPointRead({ userId: 'u1', propertyId: 'p1', message: question });
  return { answer, validated: validateAskAnswerTrustPipeline({ question, operationId: 'DATA_POINT_READ', result: attachAskAuthoritativeSourceEvidence(answer, [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')].flat()), propertyId: 'p1', semanticEnabled: true, provisionalRead: true }) };
};
test('the owner\'s single-fact prompts start the data-point read directly', () => {
  for (const m of ['How old is my water heater?', 'When was my roof installed?', 'What is the model number of my refrigerator', 'How old is my HVAC system?']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL', m); assert.equal(d.operation.operationId, 'DATA_POINT_READ', m); }
});
test('the real handler states the fact (an age when asked) and the delivery gate passes it', async () => {
  const water = await deliver('How old is my water heater?'); assert.equal(water.answer.status, 'ANSWERED'); assert.match(water.answer.blocks[0].body, /about 7 years old/); assert.equal(water.validated.semantic.outcome, 'PASS');
  const hvac = await deliver('How old is my HVAC system?'); assert.match(hvac.answer.blocks[0].body, /about 12 years old/); assert.equal(hvac.validated.semantic.outcome, 'PASS');
  const roof = await deliver('When was my roof installed?'); assert.equal(roof.answer.status, 'ANSWERED'); assert.deepEqual(roof.answer.parameters.dataPointRead.pointIds, ['home.roofReplacementYear']); assert.match(roof.answer.blocks[0].body, new RegExp(String(new Date().getUTCFullYear() - 9))); assert.equal(roof.validated.semantic.outcome, 'PASS');
  const roofAge = await deliver('How old is my roof?'); assert.match(roofAge.answer.blocks[0].body, /about 9 years old/);
  const model = await deliver('What is the model number of my refrigerator'); assert.match(model.answer.blocks[0].body, /RF28R7351SR/); assert.equal(model.validated.semantic.outcome, 'PASS');
});
test('an unrecorded roof year is said honestly, not as a missing inventory item', async () => {
  stub({ roofReplacementYear: null }); const answer = await handleDataPointRead({ userId: 'u1', propertyId: 'p1', message: 'When was my roof installed?' });
  assert.equal(answer.reasonCode, 'DATA_POINT_NOT_RECORDED'); assert.doesNotMatch(JSON.stringify(answer.blocks), /your inventory/i);
});

// ---- "How much would a new furnace cost?" (ITEM_REPLACEMENT_COST, slice 10) ----
const financialContext = require('../../src/services/financialContext/context.ts');
const { HomeCapitalTimelineService } = require('../../src/services/homeCapitalTimeline.service.ts');
const { itemReplacementCostResult } = require('../../src/services/ask/handlers/itemReplacementCost.handler.ts');
const { groundedItemCostVerdict, GROUNDED_READ_CHECKS } = require('../../src/services/ask/support/provisionalRead.ts');
const NOW = new Date(2026, 10, 9);
function stubCost({ items, analysis = true }) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  financialContext.getFinancialContextDecisions = async () => ({ contextVersion: 'ctx-1' });
  prisma.property = { findUnique: async () => ({ roofReplacementYear: null }) };
  HomeCapitalTimelineService.prototype.getLatestTimeline = async () => (analysis ? { horizonYears: 10, confidence: 'MEDIUM', computedAt: new Date(2026, 10, 1), inputsSnapshot: { _propertyContextVersion: 'ctx-1' }, items } : null);
}
const furnace = { id: 'ti-f', category: 'HVAC', windowStart: new Date(2031, 10, 1), windowEnd: new Date(2031, 10, 1), confidence: 'MEDIUM', estimatedCostMinCents: 800_000, estimatedCostMaxCents: 1_200_000, inventoryItem: { name: 'Furnace' } };
test('"How much would a new furnace cost?" starts the cost read; a figure, a dated figure and an honest notice are delivered', async () => {
  assert.ok('ITEM_REPLACEMENT_COST' in GROUNDED_READ_CHECKS);
  const d = resolveAskRoutingCascade('How much would a new furnace cost?', { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL'); assert.equal(d.operation.operationId, 'ITEM_REPLACEMENT_COST');
  const gate = (q, a) => validateAskAnswerTrustPipeline({ question: q, operationId: 'ITEM_REPLACEMENT_COST', result: attachAskAuthoritativeSourceEvidence(a, [completedAskAuthoritativeSourceEvidence('ITEM_REPLACEMENT_COST')].flat()), propertyId: 'p1', semanticEnabled: true, provisionalRead: true });
  stubCost({ items: [furnace] });
  const q = 'How much would a new furnace cost?'; const figure = await itemReplacementCostResult('u1', 'p1', q, NOW); assert.equal(figure.status, 'ANSWERED'); assert.equal(gate(q, figure).semantic.outcome, 'PASS');
  const q2 = 'How much will a new furnace cost in 5 years?'; assert.equal(gate(q2, await itemReplacementCostResult('u1', 'p1', q2, NOW)).semantic.outcome, 'PASS');
  assert.equal(groundedItemCostVerdict(q2, figure).reasonCodes[1], 'NAMED_DATE_WAS_NOT_APPLIED');
  stubCost({ items: [], analysis: false }); assert.equal(gate(q, await itemReplacementCostResult('u1', 'p1', q, NOW)).semantic.outcome, 'PASS', 'no timeline is an honest notice');
  assert.equal(groundedItemCostVerdict('How much should I save for a new furnace?', figure).reasonCodes[1], 'ANOTHER_OPERATION_OWNS_THE_QUESTION');
  assert.equal(groundedItemCostVerdict('How much did I pay for my furnace?', figure).reasonCodes[1], 'QUESTION_NOT_ABOUT_THE_COST_OF_A_NEW_ITEM');
});

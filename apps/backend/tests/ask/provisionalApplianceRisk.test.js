// Live prompt: "list appliances that have missing documents and are high risk".
// "High risk" = the Appliance Oracle's failure risk by age (HIGH or CRITICAL urgency). "Missing documents" = no document linked to the appliance's inventory record, directly or through one of its warranties.
// Covers routing (provisional, not DOCUMENT_LOOKUP), the narrowing, the document query, the grounded delivery check, and delivery through the real trust gate.
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const prismaModule = require('../../src/lib/prisma.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { isProvisionalReadOperation } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { groundedApplianceRiskVerdict, provisionalRouteAllowed, verifyProvisionalReadFamilyDispositions } = require('../../src/services/ask/support/provisionalRead.ts');
const { applianceFailureRiskFromView, inventoryItemsWithoutDocuments, askedHighRisk, askedMissingDocuments } = require('../../src/services/ask/handlers/applianceOracleBudget.handler.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const LIVE = 'list appliances that have missing documents and are high risk';
const route = (message) => resolveAskRoutingCascade(message, { localMinimumConfidence: 0.42, ambiguityMargin: 0.1 });

test('the operation is admitted and the live prompt starts the Oracle provisionally, not a document lookup', () => {
  assert.ok(isProvisionalReadOperation('APPLIANCE_FAILURE_RISK'));
  assert.deepEqual(verifyProvisionalReadFamilyDispositions(), []);
  for (const message of [LIVE, 'which appliances are high risk', 'show high risk appliances']) {
    const decision = route(message);
    assert.equal(decision.stage, 'PROVISIONAL', message);
    assert.equal(decision.operation.operationId, 'APPLIANCE_FAILURE_RISK', message);
  }
  // A purchase, brand, repair or record request keeps the strict path.
  for (const message of ['should I replace my high risk appliances', 'recommend a brand for my high risk appliance', 'add a document to my high risk appliance']) {
    assert.notEqual(route(message).stage, 'PROVISIONAL', message);
    assert.equal(provisionalRouteAllowed('APPLIANCE_FAILURE_RISK', message), false, message);
  }
  assert.equal(askedHighRisk(LIVE), true); assert.equal(askedMissingDocuments(LIVE), true);
  assert.equal(askedMissingDocuments('show my appliance documents'), false);
});

test('documents count when linked to the item or to one of its warranties; deleted documents are not asked for; the query is scoped to the given items', async () => {
  const real = prismaModule.prisma;
  let query;
  prismaModule.prisma = { document: { findMany: async (args) => { query = args; return [{ inventoryItemId: 'direct', warranty: null }, { inventoryItemId: null, warranty: { inventoryItemId: 'via-warranty' } }]; } } };
  try {
    const none = await inventoryItemsWithoutDocuments(['direct', 'via-warranty', 'bare']);
    assert.deepEqual([...none], ['bare']);
    assert.equal(query.where.deletedAt, null);
    assert.deepEqual(query.where.OR, [{ inventoryItemId: { in: ['direct', 'via-warranty', 'bare'] } }, { warranty: { inventoryItemId: { in: ['direct', 'via-warranty', 'bare'] } } }]);
    query = undefined;
    assert.deepEqual([...(await inventoryItemsWithoutDocuments([]))], []);
    assert.equal(query, undefined, 'no items, no query');
  } finally { prismaModule.prisma = real; }
});

const prediction = (id, urgency, replacementCost = 1000, inventoryItemId = id) => ({ inventoryItemId, applianceName: id, currentAge: 11, expectedLife: 12, remainingLife: 1, failureRisk: 60, urgency, estimatedFailureDate: new Date('2027-01-01T00:00:00Z'), replacementCost, maintenanceImpact: 'x', typicalLifeYears: { min: 10, max: 14 } });
const report = () => ({
  totalAppliances: 4, criticalCount: 1, highRiskCount: 2, estimatedTotalCost: 4000, appliancesWithoutAge: 0, appliancesWithoutAgeItems: [], meta: { disclaimer: 'An estimate.' },
  predictions: [prediction('high-nodocs', 'HIGH'), prediction('high-docs', 'HIGH'), prediction('low-nodocs', 'LOW'), prediction('critical-unlinked', 'CRITICAL', 1000, null)],
});
const noDocs = new Set(['high-nodocs', 'low-nodocs']);
const rowIds = (result) => (result.blocks.find((block) => block.id === 'appliance-oracle-items')?.items ?? []).map((row) => row.id);

test('high risk AND no document: only the high-risk appliance with nothing on file; the definition and the unlinked appliance are stated', () => {
  const result = applianceFailureRiskFromView(report(), 'p1', { replacementCostOverCents: null, highRiskOnly: true, missingDocumentItemIds: noDocs });
  assert.deepEqual(rowIds(result), ['high-nodocs']);
  const summary = result.blocks.find((block) => block.id === 'appliance-oracle-summary');
  assert.equal(summary.title, '1 appliance match');
  assert.match(summary.body, /^Appliances with high or critical failure risk and no document on file\./);
  assert.match(summary.body, /1 appliance has no inventory record linked, so documents could not be checked for it\./);
});

test('either narrowing alone, and the unchanged cost + risk filter, keep their own wording', () => {
  const risk = applianceFailureRiskFromView(report(), 'p1', { replacementCostOverCents: null, highRiskOnly: true });
  assert.deepEqual(rowIds(risk), ['high-nodocs', 'high-docs', 'appliance-2']);
  const docs = applianceFailureRiskFromView(report(), 'p1', { replacementCostOverCents: null, highRiskOnly: false, missingDocumentItemIds: noDocs });
  assert.deepEqual(rowIds(docs), ['high-nodocs', 'low-nodocs']);
  const legacy = applianceFailureRiskFromView(report(), 'p1', { replacementCostOverCents: 50000, highRiskOnly: true });
  assert.match(legacy.blocks.find((block) => block.id === 'appliance-oracle-summary').body, /^High or critical failure risk, with estimated replacement cost over \$500\./);
  const empty = applianceFailureRiskFromView(report(), 'p1', { replacementCostOverCents: null, highRiskOnly: true, missingDocumentItemIds: new Set(['low-nodocs']) });
  assert.equal(empty.blocks.find((block) => block.id === 'appliance-oracle-summary').title, 'No appliances match those filters');
  assert.match(empty.blocks.find((block) => block.id === 'appliance-oracle-summary').body, /^No appliance has high or critical failure risk and no document on file\./);
});

test('the grounded check delivers a narrowed answer to the question that asked for it and withholds every mismatch', () => {
  const both = applianceFailureRiskFromView(report(), 'p1', { replacementCostOverCents: null, highRiskOnly: true, missingDocumentItemIds: noDocs });
  assert.equal(groundedApplianceRiskVerdict(LIVE, both).outcome, 'PASS');
  const riskOnly = applianceFailureRiskFromView(report(), 'p1', { replacementCostOverCents: null, highRiskOnly: true });
  const unfiltered = applianceFailureRiskFromView(report(), 'p1');
  const asks = (verdict, code) => { assert.equal(verdict.outcome, 'FAIL'); assert.ok(verdict.reasonCodes.includes(code), JSON.stringify(verdict.reasonCodes)); };
  asks(groundedApplianceRiskVerdict(LIVE, riskOnly), 'DOCUMENT_NARROWING_NOT_STATED');
  asks(groundedApplianceRiskVerdict(LIVE, unfiltered), 'RISK_NARROWING_NOT_STATED');
  asks(groundedApplianceRiskVerdict('which appliances are high risk', unfiltered), 'RISK_NARROWING_NOT_STATED');
  asks(groundedApplianceRiskVerdict('show my appliance oracle', both), 'FILTERED_VIEW_FOR_AN_UNFILTERED_QUESTION');
  assert.equal(groundedApplianceRiskVerdict('show my appliance oracle', unfiltered).outcome, 'PASS');
  const legacy = applianceFailureRiskFromView(report(), 'p1', { replacementCostOverCents: 50000, highRiskOnly: true });
  assert.equal(groundedApplianceRiskVerdict('which appliances have an estimated replacement cost over $500 and high failure risk?', legacy).outcome, 'PASS');
  asks(groundedApplianceRiskVerdict('which appliances have an estimated replacement cost over $500 and high failure risk?', riskOnly), 'COST_NARROWING_NOT_STATED');
  const warranty = { status: 'ANSWERED', reasonCode: 'WARRANTY_SUMMARY', blocks: [{ type: 'SUMMARY', id: 'warranty-summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  asks(groundedApplianceRiskVerdict(LIVE, warranty), 'ANSWER_IS_NOT_A_VERIFIED_VARIANT');
});

test('the live prompt is delivered through the production trust and relevance gate, not withheld and not a question', () => {
  const result = attachAskAuthoritativeSourceEvidence(applianceFailureRiskFromView(report(), 'p1', { replacementCostOverCents: null, highRiskOnly: true, missingDocumentItemIds: noDocs }), [completedAskAuthoritativeSourceEvidence('APPLIANCE_FAILURE_RISK')]);
  const gate = validateAskAnswerTrustPipeline({ question: LIVE, operationId: 'APPLIANCE_FAILURE_RISK', result, propertyId: 'p1', semanticEnabled: true, routedDeterministically: false, provisionalRead: true });
  assert.ok(['PASS', 'REPAIRABLE'].includes(gate.trust.outcome), `${gate.trust.outcome} ${JSON.stringify(gate.trust.reasonCodes)}`);
  assert.ok(!gate.trust.reasonCodes.includes('PROVISIONAL_READ_NOT_GROUNDED'), JSON.stringify(gate.trust.reasonCodes));
  assert.ok(!gate.result.blocks.some((block) => block.id === 'answer-unverified'));
  assert.equal(gate.result.status, 'ANSWERED');
});

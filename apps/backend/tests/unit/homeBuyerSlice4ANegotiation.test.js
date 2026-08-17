const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  generateBuyerInspectionNegotiationAnalysis,
} = require('../../src/services/negotiationShieldBuyerInspection.service.ts');

function buyerContext(overrides = {}) {
  return {
    perspective: 'BUYER',
    caseTitle: 'Negotiate electrical finding',
    caseDescription: 'Open junction box observed in the basement.',
    requestedConcessionAmount: 2500,
    inspectionIssuesSummary: 'The confirmed inspection report identifies an exposed electrical junction in the basement.',
    requestedRepairs: 'Request licensed seller repair or a documented closing credit.',
    recentUpgradeNotes: null,
    reportDate: '2026-08-16',
    notes: null,
    rawText: null,
    hasAnyDocument: true,
    inspectionReportDocumentCount: 1,
    buyerRequestDocumentCount: 0,
    supportingDocumentCount: 0,
    propertySignals: {
      roofReplacementYear: null,
      roofAgeYears: null,
      completedMaintenanceCount: 0,
      recentImprovementCount: 0,
    },
    ...overrides,
  };
}

test('buyer mode produces buyer-oriented discussion points with professional boundaries', () => {
  const result = generateBuyerInspectionNegotiationAnalysis(buyerContext());

  assert.match(result.summary, /buyer request/i);
  assert.match(result.draft.body, /licensed professionals/i);
  assert.match(result.pricingAssessment.summary, /does not determine/i);
  assert.equal(result.pricingAssessment.requestedConcessionAmount, 2500);
  assert.match(result.modelVersion, /buyer-mode$/);
  assert.ok(result.recommendedActions.some((item) => item.key === 'record_seller_outcome'));
  assert.doesNotMatch(result.draft.body, /seller should push back/i);
});

test('buyer negotiation persistence has one canonical finding link and structured outcomes', () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, '../../src/services/negotiationShield.service.ts'), 'utf8');
  const routes = fs.readFileSync(path.resolve(__dirname, '../../src/routes/negotiationShield.routes.ts'), 'utf8');

  assert.match(schema, /model NegotiationShieldBuyerFinding/);
  assert.match(schema, /findingId String @unique/);
  assert.match(schema, /sellerResponse\s+BuyerNegotiationSellerResponse/);
  assert.match(schema, /outcome\s+BuyerNegotiationOutcome/);
  assert.match(schema, /outcomeDocumentId\s+String\?/);
  assert.match(schema, /buyerOutcomeDocumentId\s+String\?/);
  assert.match(service, /perspective: 'BUYER'/);
  assert.match(service, /PrismaClientKnownRequestError/);
  assert.match(service, /tx\.negotiationShieldBuyerFinding\.update/);
  assert.match(service, /tx\.inspectionFinding\.update/);
  assert.match(service, /tx\.homeBuyerTask\.updateMany/);
  assert.match(service, /findingIds = Array\.from\(new Set/);
  assert.match(service, /negotiationShieldBuyerFinding\.createMany/);
  assert.match(service, /BUYER_NEGOTIATION_CASE_CONFLICT/);
  assert.match(service, /BUYER_NEGOTIATION_EVIDENCE_NOT_ATTACHED/);
  assert.match(service, /effectiveCompletionDocumentId/);
  assert.match(routes, /negotiation-shield\/buyer-cases/);
  assert.match(routes, /buyer-outcome/);
});

test('Buyer Plan launches buyer mode from a pre-close finding and the workspace records the outcome', () => {
  const buyerPlan = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx'), 'utf8');
  const client = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/NegotiationShieldToolClient.tsx'), 'utf8');

  assert.match(buyerPlan, /startBuyerNegotiationCase/);
  assert.match(buyerPlan, /Open grouped negotiation/);
  assert.match(buyerPlan, /selectedNegotiationFindingIds/);
  assert.match(buyerPlan, /appendBuyerPlanReturnContext/);
  assert.match(client, /Buyer mode/);
  assert.match(client, /Seller response and final outcome/);
  assert.match(client, /Back to Closing Plan/);
  assert.match(client, /recordBuyerNegotiationOutcome/);
  assert.match(client, /Completion evidence/);
  assert.match(client, /selectedBuyerFindingId/);
  assert.match(client, /not a legal notice or amendment/);
});

test('closing lifecycle immediately hands transferred findings to the canonical maintenance queue', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '../../src/services/buyerAcquisition.service.ts'), 'utf8');

  assert.match(service, /ensureClosingRepairHandoff/);
  assert.match(service, /BUYER_CLOSING_REPAIR_HANDOFF/);
  assert.match(service, /buyer-handoff:\$\{task\.actionKey\}/);
  assert.match(service, /propertyMaintenanceTask\.upsert/);
  assert.match(service, /buyerMaintenanceTaskId: maintenance\.id/);
  assert.match(service, /\['CLOSED', 'MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'HANDED_OFF'\]/);
});

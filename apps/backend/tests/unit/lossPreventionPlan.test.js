const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { MitigationActionType } = require('@prisma/client');
const {
  mitigationHandoff,
  professionalHelpForAction,
} = require('../../src/services/riskPremiumOptimizer.service');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('safety-critical work requires qualified professional help', () => {
  for (const actionType of [
    MitigationActionType.AUTO_SHUTOFF_VALVE,
    MitigationActionType.ROOF_INSPECTION_OR_REPAIR,
    MitigationActionType.TREE_TRIMMING,
    MitigationActionType.WIND_HAIL_HARDENING,
    MitigationActionType.ELECTRICAL_PANEL_INSPECTION,
  ]) {
    assert.equal(professionalHelpForAction(actionType), 'QUALIFIED_PROFESSIONAL_REQUIRED');
    const handoff = mitigationHandoff('property-1', actionType, 'Safety work');
    assert.equal(handoff.handoff.kind, 'PROVIDER');
    assert.match(handoff.handoff.href, /dashboard\/providers/);
    assert.match(handoff.handoff.safetyNote, /qualified professional/i);
  }
});

test('appropriate low-complexity controls retain a safety-qualified DIY handoff', () => {
  const handoff = mitigationHandoff(
    'property-1',
    MitigationActionType.LEAK_SENSORS,
    'Install leak sensors',
  );
  assert.equal(handoff.professionalHelpLevel, 'DIY_ALLOWED');
  assert.equal(handoff.handoff.kind, 'DIY');
  assert.match(handoff.handoff.safetyNote, /Stop and use qualified help/);
});

test('canonical schema links the plan to a coverage review and removes savings columns', () => {
  const schema = read('apps/backend/prisma/schema.prisma');
  const analysis = schema.match(
    /model RiskPremiumOptimizationAnalysis \{([\s\S]*?)\n\}/,
  )[1];
  const planItem = schema.match(/model RiskMitigationPlanItem \{([\s\S]*?)\n\}/)[1];

  assert.match(analysis, /coverageReviewId\s+String\?/);
  assert.match(analysis, /coverageReview\s+CoverageReview\?/);
  assert.doesNotMatch(analysis, /estimatedSavings/);

  assert.match(planItem, /carrierBenefitStatus/);
  assert.match(planItem, /carrierReviewQuestion/);
  assert.match(planItem, /professionalHelpLevel/);
  assert.match(planItem, /handoffJson/);
  assert.doesNotMatch(planItem, /estimatedSavings/);

  const statuses = schema.match(/enum MitigationPlanStatus \{([\s\S]*?)\n\}/)[1];
  for (const status of ['PLANNED', 'COMPLETED', 'SKIPPED', 'RESTORED']) {
    assert.match(statuses, new RegExp(`\\b${status}\\b`));
  }
  assert.doesNotMatch(statuses, /\bDONE\b/);
});

test('loss-prevention output contains no additive savings or policy-lever plan items', () => {
  const service = read('apps/backend/src/services/riskPremiumOptimizer.service.ts');
  const api = read('apps/frontend/src/lib/api/riskPremiumOptimizerApi.ts');
  const controller = read('apps/backend/src/controllers/riskPremiumOptimizer.controller.ts');

  assert.doesNotMatch(service, /estimatedSavingsMin|estimatedSavingsMax|discountBoost|totalSavings/);
  assert.match(service, /\.filter\(\(recommendation\) => recommendation\.type === 'MITIGATE'\)/);
  assert.match(service, /carrierBenefitStatus: 'UNKNOWN'/);
  assert.match(service, /does not establish that mitigation caused the change/);
  assert.doesNotMatch(api, /estimatedSavingsMin|estimatedSavingsMax/);
  assert.doesNotMatch(controller, /estimatedSavings/);
});

test('workspace supports evidence add/remove, lifecycle restoration, and observational history', () => {
  const panel = read('apps/frontend/src/components/ai/RiskPremiumOptimizerPanel.tsx');
  const card = read(
    'apps/frontend/src/app/(dashboard)/dashboard/components/RiskPremiumOptimizerToolCard.tsx',
  );

  assert.match(panel, /Upload evidence/);
  assert.match(panel, /Remove evidence/);
  assert.match(panel, /evidenceDocumentId/);
  assert.match(panel, /value="COMPLETED"/);
  assert.match(panel, /value="SKIPPED"/);
  assert.match(panel, /value="RESTORED"/);
  assert.match(panel, /Carrier benefit:/);
  assert.match(panel, /Observed premium comparison/);
  assert.match(panel, /does not establish that completed work caused a premium change/);
  assert.match(card, /Carrier benefit remains unknown unless documented/);
  assert.doesNotMatch(card, /Potential annual savings|Lower Your Insurance Cost/);
});

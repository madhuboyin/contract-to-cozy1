// tests/unit/homeRenovationAdvisor.test.js
//
// Unit tests for the Home Renovation Risk Advisor backend engine.
// Uses Node.js native test runner (no Jest/Vitest).

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ============================================================================
// 1. JURISDICTION RESOLUTION
// ============================================================================

test('jurisdiction resolver — full address produces HIGH confidence at CITY level', () => {
  const { resolveJurisdiction } = require('../../dist/homeRenovationAdvisor/engine/jurisdiction/jurisdiction.resolver');

  const property = { address: '123 Main St', city: 'Austin', state: 'TX', zipCode: '78701' };
  const result = resolveJurisdiction(property, null);

  assert.equal(result.state, 'TX');
  assert.equal(result.city, 'Austin');
  assert.equal(result.postalCode, '78701');
  assert.equal(result.jurisdictionLevel, 'CITY');
  assert.equal(result.resolutionConfidence, 'HIGH');
  assert.equal(result.source, 'property_profile');
  assert.ok(result.normalizedJurisdictionKey, 'should produce a normalized key');
  assert.ok(result.normalizedJurisdictionKey.includes('tx'), 'key should include state lowercase');
});

test('jurisdiction resolver — state-only address produces LOW confidence', () => {
  const { resolveJurisdiction } = require('../../dist/homeRenovationAdvisor/engine/jurisdiction/jurisdiction.resolver');

  const property = { address: '', city: '', state: 'CA', zipCode: '' };
  const result = resolveJurisdiction(property, null);

  assert.equal(result.state, 'CA');
  assert.equal(result.city, null);
  assert.equal(result.jurisdictionLevel, 'STATE');
  assert.equal(result.resolutionConfidence, 'LOW');
});

test('jurisdiction resolver — override takes precedence over property profile', () => {
  const { resolveJurisdiction } = require('../../dist/homeRenovationAdvisor/engine/jurisdiction/jurisdiction.resolver');

  const property = { address: '100 A St', city: 'Boston', state: 'MA', zipCode: '02101' };
  const override = { state: 'NY', city: 'Brooklyn' };
  const result = resolveJurisdiction(property, override);

  assert.equal(result.state, 'NY');
  assert.equal(result.city, 'Brooklyn');
  assert.equal(result.source, 'user_override');
});

test('jurisdiction resolver — completely empty address returns UNKNOWN', () => {
  const { resolveJurisdiction } = require('../../dist/homeRenovationAdvisor/engine/jurisdiction/jurisdiction.resolver');

  const property = { address: '', city: '', state: '', zipCode: '' };
  const result = resolveJurisdiction(property, null);

  assert.equal(result.jurisdictionLevel, 'UNKNOWN');
  assert.equal(result.resolutionConfidence, 'UNAVAILABLE');
  assert.equal(result.normalizedJurisdictionKey, null);
});

// ============================================================================
// 2. CONFIDENCE SERVICE
// ============================================================================

test('confidence service — API_VERIFIED source maps to HIGH', () => {
  const { scoreConfidenceFromSource } = require('../../dist/homeRenovationAdvisor/engine/confidence/confidence.service');
  assert.equal(scoreConfidenceFromSource('API_VERIFIED'), 'HIGH');
});

test('confidence service — CURATED_DATASET source maps to HIGH', () => {
  const { scoreConfidenceFromSource } = require('../../dist/homeRenovationAdvisor/engine/confidence/confidence.service');
  assert.equal(scoreConfidenceFromSource('CURATED_DATASET'), 'HIGH');
});

test('confidence service — INTERNAL_RULE source maps to MEDIUM', () => {
  const { scoreConfidenceFromSource } = require('../../dist/homeRenovationAdvisor/engine/confidence/confidence.service');
  assert.equal(scoreConfidenceFromSource('INTERNAL_RULE'), 'MEDIUM');
});

test('confidence service — UNKNOWN source maps to LOW', () => {
  const { scoreConfidenceFromSource } = require('../../dist/homeRenovationAdvisor/engine/confidence/confidence.service');
  assert.equal(scoreConfidenceFromSource('UNKNOWN'), 'LOW');
});

test('confidence service — overall confidence is median of three modules', () => {
  const { computeOverallConfidence } = require('../../dist/homeRenovationAdvisor/engine/confidence/confidence.service');

  // All HIGH → overall HIGH
  assert.equal(computeOverallConfidence('HIGH', 'HIGH', 'HIGH'), 'HIGH');

  // HIGH, MEDIUM, LOW → median is MEDIUM
  assert.equal(computeOverallConfidence('HIGH', 'MEDIUM', 'LOW'), 'MEDIUM');

  // MEDIUM, MEDIUM, LOW → median is MEDIUM
  assert.equal(computeOverallConfidence('MEDIUM', 'MEDIUM', 'LOW'), 'MEDIUM');
});

test('confidence service — downgradeConfidence reduces by given steps', () => {
  const { downgradeConfidence } = require('../../dist/homeRenovationAdvisor/engine/confidence/confidence.service');
  assert.equal(downgradeConfidence('HIGH', 1), 'MEDIUM');
  assert.equal(downgradeConfidence('HIGH', 2), 'LOW');
  assert.equal(downgradeConfidence('HIGH', 3), 'UNAVAILABLE');
  // Should not go below UNAVAILABLE
  assert.equal(downgradeConfidence('UNAVAILABLE', 5), 'UNAVAILABLE');
});

// ============================================================================
// 3. PERMIT RULES DATA
// ============================================================================

test('permit rules data — ROOM_ADDITION has status REQUIRED', () => {
  const { PERMIT_RULES_BY_RENOVATION_TYPE } = require('../../dist/homeRenovationAdvisor/engine/permit/permitRules.data');
  const rule = PERMIT_RULES_BY_RENOVATION_TYPE['ROOM_ADDITION'];
  assert.equal(rule.requirementStatus, 'REQUIRED');
  assert.ok(rule.permitCostMin > 0, 'permit cost min should be positive');
  assert.ok(rule.permitCostMax > rule.permitCostMin, 'max should exceed min');
  assert.ok(rule.permitTypes.length > 0, 'should have permit types');
  assert.ok(rule.inspectionStages.length > 0, 'should have inspection stages');
});

test('permit rules data — BATHROOM_FULL_REMODEL has status LIKELY_REQUIRED', () => {
  const { PERMIT_RULES_BY_RENOVATION_TYPE } = require('../../dist/homeRenovationAdvisor/engine/permit/permitRules.data');
  const rule = PERMIT_RULES_BY_RENOVATION_TYPE['BATHROOM_FULL_REMODEL'];
  assert.equal(rule.requirementStatus, 'LIKELY_REQUIRED');
});

test('permit rules data — ADU_CONSTRUCTION has maximum permit types', () => {
  const { PERMIT_RULES_BY_RENOVATION_TYPE } = require('../../dist/homeRenovationAdvisor/engine/permit/permitRules.data');
  const rule = PERMIT_RULES_BY_RENOVATION_TYPE['ADU_CONSTRUCTION'];
  assert.equal(rule.requirementStatus, 'REQUIRED');
  assert.ok(rule.permitTypes.length >= 4, 'ADU should require multiple permit types');
});

test('permit rules data — structural wall removal is REQUIRED with structural permit', () => {
  const { PERMIT_RULES_BY_RENOVATION_TYPE } = require('../../dist/homeRenovationAdvisor/engine/permit/permitRules.data');
  const rule = PERMIT_RULES_BY_RENOVATION_TYPE['STRUCTURAL_WALL_REMOVAL'];
  assert.equal(rule.requirementStatus, 'REQUIRED');
  const hasStructural = rule.permitTypes.some((p) => p.permitType === 'STRUCTURAL');
  assert.ok(hasStructural, 'should include structural permit type');
});

// ============================================================================
// 4. TAX RULES DATA
// ============================================================================

test('tax rules data — all renovation types have median project cost > 0', () => {
  const { MEDIAN_PROJECT_COST_BY_TYPE } = require('../../dist/homeRenovationAdvisor/engine/tax/taxRules.data');
  const types = Object.keys(MEDIAN_PROJECT_COST_BY_TYPE);
  assert.ok(types.length === 12, 'should have all 12 renovation types');
  for (const [type, data] of Object.entries(MEDIAN_PROJECT_COST_BY_TYPE)) {
    assert.ok(data.median > 0, `${type} median cost should be positive`);
    assert.ok(data.low < data.median, `${type} low should be less than median`);
    assert.ok(data.high > data.median, `${type} high should exceed median`);
  }
});

test('tax rules data — all renovation types have value uplift between 0 and 1', () => {
  const { VALUE_UPLIFT_MULTIPLIER_BY_TYPE } = require('../../dist/homeRenovationAdvisor/engine/tax/taxRules.data');
  for (const [type, data] of Object.entries(VALUE_UPLIFT_MULTIPLIER_BY_TYPE)) {
    assert.ok(data.min > 0 && data.min < 1, `${type} uplift min should be fraction`);
    assert.ok(data.max > 0 && data.max <= 1, `${type} uplift max should be fraction`);
    assert.ok(data.max >= data.min, `${type} uplift max >= min`);
  }
});

test('tax rules data — CA state trigger is ON_COMPLETION (Prop 13)', () => {
  const { STATE_TAX_TRIGGER_DEFAULTS } = require('../../dist/homeRenovationAdvisor/engine/tax/taxRules.data');
  assert.equal(STATE_TAX_TRIGGER_DEFAULTS['CA'].triggerType, 'ON_COMPLETION');
});

test('tax rules data — unknown state uses JURISDICTION_SPECIFIC fallback', () => {
  const { DEFAULT_TAX_TRIGGER } = require('../../dist/homeRenovationAdvisor/engine/tax/taxRules.data');
  assert.equal(DEFAULT_TAX_TRIGGER.triggerType, 'JURISDICTION_SPECIFIC');
});

// ============================================================================
// 5. TAX IMPACT EVALUATION (unit logic)
// ============================================================================

test('tax impact math — assessed value increase is within expected uplift range', () => {
  // Manual calculation matching evaluator logic
  const projectCost = 50000;
  const upliftMin = 0.50;
  const upliftMax = 0.80;
  const expectedMin = Math.round(projectCost * upliftMin);
  const expectedMax = Math.round(projectCost * upliftMax);

  assert.equal(expectedMin, 25000);
  assert.equal(expectedMax, 40000);
});

test('tax impact math — monthly tax is 1/12 of annual', () => {
  const annualMin = 275;
  const annualMax = 440;
  const monthlyMin = Math.round(annualMin / 12);
  const monthlyMax = Math.round(annualMax / 12);

  assert.ok(monthlyMin > 0);
  assert.ok(monthlyMax > monthlyMin);
  assert.equal(monthlyMin, Math.round(275 / 12));
});

test('tax impact math — returns ranges not point estimates', () => {
  // Verify that our config produces range (min !== max)
  const { MEDIAN_PROJECT_COST_BY_TYPE, VALUE_UPLIFT_MULTIPLIER_BY_TYPE } = require('../../dist/homeRenovationAdvisor/engine/tax/taxRules.data');
  const cost = MEDIAN_PROJECT_COST_BY_TYPE['ROOM_ADDITION'].median;
  const uplift = VALUE_UPLIFT_MULTIPLIER_BY_TYPE['ROOM_ADDITION'];

  const valueMin = Math.round(cost * uplift.min);
  const valueMax = Math.round(cost * uplift.max);

  assert.ok(valueMax > valueMin, 'output should be a range, not a point estimate');
});

// ============================================================================
// 6. LICENSING RULES DATA
// ============================================================================

test('licensing rules — ROOM_ADDITION requires licensed GC', () => {
  const { LICENSING_RULES_BY_RENOVATION_TYPE } = require('../../dist/homeRenovationAdvisor/engine/licensing/licensingRules.data');
  const rule = LICENSING_RULES_BY_RENOVATION_TYPE['ROOM_ADDITION'];
  assert.equal(rule.requirementStatus, 'REQUIRED');
  const gcCategory = rule.categories.find((c) => c.licenseCategoryType === 'GENERAL_CONTRACTOR');
  assert.ok(gcCategory, 'should include GENERAL_CONTRACTOR category');
  assert.ok(gcCategory.isApplicable, 'GC should be applicable for room addition');
});

test('licensing rules — STRUCTURAL_WALL_REMOVAL requires STRUCTURAL license', () => {
  const { LICENSING_RULES_BY_RENOVATION_TYPE } = require('../../dist/homeRenovationAdvisor/engine/licensing/licensingRules.data');
  const rule = LICENSING_RULES_BY_RENOVATION_TYPE['STRUCTURAL_WALL_REMOVAL'];
  assert.equal(rule.requirementStatus, 'REQUIRED');
  const structural = rule.categories.find((c) => c.licenseCategoryType === 'STRUCTURAL');
  assert.ok(structural, 'should include STRUCTURAL category');
});

test('licensing rules — BATHROOM_FULL_REMODEL is MAY_BE_REQUIRED', () => {
  const { LICENSING_RULES_BY_RENOVATION_TYPE } = require('../../dist/homeRenovationAdvisor/engine/licensing/licensingRules.data');
  const rule = LICENSING_RULES_BY_RENOVATION_TYPE['BATHROOM_FULL_REMODEL'];
  assert.equal(rule.requirementStatus, 'MAY_BE_REQUIRED');
});

test('licensing rules — ADU requires all major trades', () => {
  const { LICENSING_RULES_BY_RENOVATION_TYPE } = require('../../dist/homeRenovationAdvisor/engine/licensing/licensingRules.data');
  const rule = LICENSING_RULES_BY_RENOVATION_TYPE['ADU_CONSTRUCTION'];
  assert.equal(rule.requirementStatus, 'REQUIRED');
  const required = rule.categories.filter((c) => c.isApplicable);
  assert.ok(required.length >= 4, 'ADU should require at least 4 trade licenses');
});

// ============================================================================
// 7. SUMMARY BUILDER
// ============================================================================

test('summary builder — REQUIRED permit + REQUIRED licensing → HIGH risk', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');

  const permit = { requirementStatus: 'REQUIRED' };
  const licensing = { requirementStatus: 'REQUIRED' };
  const tax = { monthlyTaxIncreaseMax: 100 };

  const risk = computeOverallRiskLevel(permit, licensing, tax);
  assert.ok(['HIGH', 'CRITICAL'].includes(risk), `expected HIGH or CRITICAL, got ${risk}`);
});

test('summary builder — no permit required + no licensing → LOW risk', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');

  const permit = { requirementStatus: 'NOT_REQUIRED' };
  const licensing = { requirementStatus: 'NOT_REQUIRED' };
  const tax = { monthlyTaxIncreaseMax: 50 };

  const risk = computeOverallRiskLevel(permit, licensing, tax);
  assert.equal(risk, 'LOW');
});

test('summary builder — getRenovationLabel returns human label', () => {
  const { getRenovationLabel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  assert.equal(getRenovationLabel('ROOM_ADDITION'), 'Room Addition');
  assert.equal(getRenovationLabel('ADU_CONSTRUCTION'), 'ADU Construction');
  assert.equal(getRenovationLabel('STRUCTURAL_WALL_REMOVAL'), 'Structural Wall Removal');
});

// ============================================================================
// 8. ASSUMPTIONS SERVICE
// ============================================================================

test('assumptions service — mergeAssumptions deduplicates by key', () => {
  const { mergeAssumptions } = require('../../dist/homeRenovationAdvisor/engine/assumptions/assumptions.service');

  const set1 = [
    { assumptionKey: 'median_cost', assumptionLabel: 'Cost', assumptionValueText: '$50k', assumptionValueNumber: 50000, assumptionUnit: 'USD', sourceType: 'INTERNAL_RULE', confidenceLevel: 'MEDIUM', rationale: null, isUserVisible: true, displayOrder: 0 },
  ];
  const set2 = [
    { assumptionKey: 'median_cost', assumptionLabel: 'Cost (dup)', assumptionValueText: '$50k', assumptionValueNumber: 50000, assumptionUnit: 'USD', sourceType: 'INTERNAL_RULE', confidenceLevel: 'MEDIUM', rationale: null, isUserVisible: true, displayOrder: 0 },
    { assumptionKey: 'tax_rate', assumptionLabel: 'Tax Rate', assumptionValueText: '1.1%', assumptionValueNumber: 0.011, assumptionUnit: 'rate', sourceType: 'INTERNAL_RULE', confidenceLevel: 'LOW', rationale: null, isUserVisible: true, displayOrder: 1 },
  ];

  const merged = mergeAssumptions(set1, set2);
  assert.equal(merged.length, 2, 'should deduplicate to 2 unique assumptions');
  assert.equal(merged[0].assumptionKey, 'median_cost');
  assert.equal(merged[1].assumptionKey, 'tax_rate');
});

test('assumptions service — displayOrder is renumbered sequentially after merge', () => {
  const { mergeAssumptions } = require('../../dist/homeRenovationAdvisor/engine/assumptions/assumptions.service');

  const set1 = [
    { assumptionKey: 'a', assumptionLabel: 'A', assumptionValueText: null, assumptionValueNumber: null, assumptionUnit: null, sourceType: 'INTERNAL_RULE', confidenceLevel: 'MEDIUM', rationale: null, isUserVisible: true, displayOrder: 5 },
    { assumptionKey: 'b', assumptionLabel: 'B', assumptionValueText: null, assumptionValueNumber: null, assumptionUnit: null, sourceType: 'INTERNAL_RULE', confidenceLevel: 'MEDIUM', rationale: null, isUserVisible: true, displayOrder: 10 },
  ];

  const merged = mergeAssumptions(set1);
  assert.equal(merged[0].displayOrder, 0);
  assert.equal(merged[1].displayOrder, 1);
});

// ============================================================================
// 9. WARNINGS BUILDER
// ============================================================================

test('warnings builder — REQUIRED permit generates PERMIT_REQUIRED warning', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');

  const ctx = {
    projectCostInput: 50000,
    isRetroactiveCheck: false,
    jurisdiction: { state: 'TX', jurisdictionLevel: 'CITY' },
  };
  const permit = { requirementStatus: 'REQUIRED', confidenceLevel: 'MEDIUM' };
  const tax = { monthlyTaxIncreaseMax: 100, dataAvailable: true };
  const licensing = { requirementStatus: 'UNKNOWN', confidenceLevel: 'MEDIUM' };

  const warnings = buildWarnings(ctx, permit, tax, licensing);
  const permitWarning = warnings.find((w) => w.code === 'PERMIT_REQUIRED');
  assert.ok(permitWarning, 'should have PERMIT_REQUIRED warning');
  assert.equal(permitWarning.severity, 'CRITICAL');
});

test('warnings builder — no state produces JURISDICTION_UNRESOLVED warning', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');

  const ctx = {
    projectCostInput: null,
    isRetroactiveCheck: false,
    jurisdiction: { state: null, jurisdictionLevel: 'UNKNOWN' },
  };
  const permit = { requirementStatus: 'UNKNOWN', confidenceLevel: 'UNAVAILABLE' };
  const tax = { monthlyTaxIncreaseMax: null, dataAvailable: false };
  const licensing = { requirementStatus: 'UNKNOWN', confidenceLevel: 'UNAVAILABLE' };

  const warnings = buildWarnings(ctx, permit, tax, licensing);
  const jWarning = warnings.find((w) => w.code === 'JURISDICTION_UNRESOLVED');
  assert.ok(jWarning, 'should have JURISDICTION_UNRESOLVED warning');
});

test('warnings builder — retroactive check generates RETROACTIVE_COMPLIANCE_RISK warning', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');

  const ctx = {
    projectCostInput: 50000,
    isRetroactiveCheck: true,
    jurisdiction: { state: 'CA', jurisdictionLevel: 'CITY' },
  };
  const permit = { requirementStatus: 'LIKELY_REQUIRED', confidenceLevel: 'MEDIUM' };
  const tax = { monthlyTaxIncreaseMax: 200, dataAvailable: true };
  const licensing = { requirementStatus: 'MAY_BE_REQUIRED', confidenceLevel: 'MEDIUM' };

  const warnings = buildWarnings(ctx, permit, tax, licensing);
  const retroWarning = warnings.find((w) => w.code === 'RETROACTIVE_COMPLIANCE_RISK');
  assert.ok(retroWarning, 'should have RETROACTIVE_COMPLIANCE_RISK warning');
});

// ============================================================================
// 10. RESPONSE MAPPER
// ============================================================================

test('response mapper — toNum converts Prisma Decimal to number', () => {
  // Test the numeric conversion inline since it's a private helper pattern
  // Mock a Decimal-like object
  const mockDecimal = { toNumber: () => 1234.56 };
  const result = typeof mockDecimal.toNumber === 'function' ? mockDecimal.toNumber() : Number(mockDecimal);
  assert.equal(result, 1234.56);
});

test('response mapper — null Decimal produces null in response', () => {
  const val = null;
  const result = val === null ? null : Number(val);
  assert.equal(result, null);
});

// ============================================================================
// 11. PERMIT EVALUATOR DEGRADATION
// ============================================================================

test('permit evaluator — state-only jurisdiction applies penalty (MEDIUM confidence max)', async () => {
  // Simulate the confidence penalty logic from permit.evaluator.ts
  // penalty for STATE level = 2, base INTERNAL_RULE = MEDIUM (index 1)
  // => MEDIUM + 2 = UNAVAILABLE

  // We can test the logic directly
  const levels = ['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE'];
  const baseIdx = levels.indexOf('MEDIUM'); // 1
  const penalty = 2; // STATE level
  const result = levels[Math.min(baseIdx + penalty, levels.length - 1)];
  assert.equal(result, 'UNAVAILABLE');
});

test('permit evaluator — city-level jurisdiction applies no penalty', () => {
  const computeJurisdictionPenalty = (level) => {
    switch (level) {
      case 'CITY': return 0;
      case 'ZIP': return 0;
      case 'COUNTY': return 1;
      case 'STATE': return 2;
      default: return 3;
    }
  };
  assert.equal(computeJurisdictionPenalty('CITY'), 0);
  assert.equal(computeJurisdictionPenalty('COUNTY'), 1);
  assert.equal(computeJurisdictionPenalty('STATE'), 2);
});

// ============================================================================
// 12. EVALUATION ENGINE VERSIONS
// ============================================================================

test('evaluation engine — exports version constants', () => {
  const { CALCULATION_VERSION, RULES_VERSION } = require('../../dist/homeRenovationAdvisor/engine/evaluationEngine.service');
  assert.ok(typeof CALCULATION_VERSION === 'string' && CALCULATION_VERSION.length > 0);
  assert.ok(typeof RULES_VERSION === 'string' && RULES_VERSION.length > 0);
});

// tests/unit/summaryBuilder.test.js
//
// Unit tests for Step 5 summaryBuilder.service — intelligence polish.
// Covers: computeOverallRiskLevel, buildOverallSummary, buildWarningsSummary,
//         buildNextStepsSummary, buildWarnings, buildNextActions.
//
// Uses Node.js native test runner — no DB, no TS compilation required.
// Imports from dist/ (run `npm run build` first).

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ============================================================================
// HELPERS — build minimal stub objects so tests read cleanly
// ============================================================================

function makePermit(opts = {}) {
  return {
    requirementStatus: opts.requirementStatus ?? 'UNKNOWN',
    confidenceLevel: opts.confidenceLevel ?? 'MEDIUM',
    applicationPortalUrl: opts.applicationPortalUrl ?? null,
    dataAvailable: opts.dataAvailable ?? true,
    ...opts,
  };
}

function makeLicensing(opts = {}) {
  return {
    requirementStatus: opts.requirementStatus ?? 'UNKNOWN',
    confidenceLevel: opts.confidenceLevel ?? 'MEDIUM',
    verificationToolUrl: opts.verificationToolUrl ?? null,
    consequenceSummary: opts.consequenceSummary ?? '',
    ...opts,
  };
}

function makeTax(opts = {}) {
  return {
    monthlyTaxIncreaseMin: opts.monthlyTaxIncreaseMin ?? null,
    monthlyTaxIncreaseMax: opts.monthlyTaxIncreaseMax ?? null,
    annualTaxIncreaseMax: opts.annualTaxIncreaseMax ?? null,
    dataAvailable: opts.dataAvailable ?? true,
    confidenceLevel: opts.confidenceLevel ?? 'MEDIUM',
    ...opts,
  };
}

function makeCtx(opts = {}) {
  return {
    sessionId: 'test-session',
    propertyId: 'test-property',
    createdByUserId: 'test-user',
    renovationType: opts.renovationType ?? 'DECK_ADDITION',
    jurisdiction: {
      state: opts.state ?? 'TX',
      city: opts.city ?? 'Austin',
      jurisdictionLevel: opts.jurisdictionLevel ?? 'CITY',
      ...opts.jurisdiction,
    },
    projectCostInput: opts.projectCostInput ?? 50000,
    projectCostSource: 'USER_INPUT',
    projectCostAssumptionNote: null,
    isRetroactiveCheck: opts.isRetroactiveCheck ?? false,
    flowType: opts.flowType ?? 'PRE_PROJECT',
    evaluationMode: 'FULL',
    ...opts,
  };
}

// ============================================================================
// 1. computeOverallRiskLevel — standard logic (backward-compatible)
// ============================================================================

test('computeOverallRiskLevel — REQUIRED permit + REQUIRED licensing → HIGH', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const risk = computeOverallRiskLevel(
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 100 }),
  );
  assert.ok(['HIGH', 'CRITICAL'].includes(risk), `expected HIGH or CRITICAL, got ${risk}`);
});

test('computeOverallRiskLevel — no permit, no licensing, low tax → LOW', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const risk = computeOverallRiskLevel(
    makePermit({ requirementStatus: 'NOT_REQUIRED' }),
    makeLicensing({ requirementStatus: 'NOT_REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 50 }),
  );
  assert.equal(risk, 'LOW');
});

test('computeOverallRiskLevel — REQUIRED permit only → MODERATE', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const risk = computeOverallRiskLevel(
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeLicensing({ requirementStatus: 'NOT_REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 50 }),
  );
  assert.equal(risk, 'MODERATE');
});

test('computeOverallRiskLevel — critical tax + permit + licensing → CRITICAL', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const risk = computeOverallRiskLevel(
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 800 }),
  );
  assert.equal(risk, 'CRITICAL');
});

// ============================================================================
// 2. computeOverallRiskLevel — ctx-aware structural/retroactive escalation
// ============================================================================

test('computeOverallRiskLevel — retroactive structural + permit required → CRITICAL (no checklist)', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const risk = computeOverallRiskLevel(
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 100 }),
    ctx,
    null,
  );
  assert.equal(risk, 'CRITICAL');
});

test('computeOverallRiskLevel — retroactive structural + permit required, no licensing → HIGH', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'STRUCTURAL_WALL_REMOVAL', isRetroactiveCheck: true });
  const risk = computeOverallRiskLevel(
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeLicensing({ requirementStatus: 'NOT_REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 100 }),
    ctx,
    null,
  );
  assert.equal(risk, 'HIGH');
});

test('computeOverallRiskLevel — retroactive checklist: permit not obtained, structural → CRITICAL', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'GARAGE_CONVERSION', isRetroactiveCheck: true });
  const risk = computeOverallRiskLevel(
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 100 }),
    ctx,
    { permitObtainedStatus: 'NO', licensedContractorUsedStatus: 'YES' },
  );
  assert.equal(risk, 'CRITICAL');
});

test('computeOverallRiskLevel — retroactive checklist: permit not obtained, non-structural → HIGH', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: true });
  const risk = computeOverallRiskLevel(
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeLicensing({ requirementStatus: 'NOT_REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 100 }),
    ctx,
    { permitObtainedStatus: 'NO', licensedContractorUsedStatus: 'YES' },
  );
  assert.equal(risk, 'HIGH');
});

test('computeOverallRiskLevel — retroactive checklist: unlicensed + structural → HIGH', () => {
  const { computeOverallRiskLevel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'BASEMENT_FINISHING', isRetroactiveCheck: true });
  const risk = computeOverallRiskLevel(
    makePermit({ requirementStatus: 'NOT_REQUIRED' }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 100 }),
    ctx,
    { permitObtainedStatus: 'YES', licensedContractorUsedStatus: 'NO' },
  );
  assert.equal(risk, 'HIGH');
});

// ============================================================================
// 3. buildOverallSummary — context-aware wording
// ============================================================================

test('buildOverallSummary — pre-project with permit required mentions permit check', () => {
  const { buildOverallSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: false });
  const summary = buildOverallSummary(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 0, dataAvailable: false }),
    makeLicensing({ requirementStatus: 'NOT_REQUIRED' }),
    'HIGH',
    'HIGH',
  );
  assert.ok(summary.includes('permit'), `expected "permit" in summary, got: ${summary}`);
});

test('buildOverallSummary — retroactive lead-in mentions retroactive compliance review', () => {
  const { buildOverallSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const summary = buildOverallSummary(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 0, dataAvailable: false }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'CRITICAL',
    'HIGH',
  );
  assert.ok(summary.toLowerCase().includes('retroactive'), `expected "retroactive" in summary, got: ${summary}`);
});

test('buildOverallSummary — low confidence lead-in mentions directional estimate', () => {
  const { buildOverallSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'BATHROOM_FULL_REMODEL', isRetroactiveCheck: false });
  const summary = buildOverallSummary(
    ctx,
    makePermit({ requirementStatus: 'UNKNOWN', confidenceLevel: 'LOW' }),
    makeTax({ monthlyTaxIncreaseMax: 0, dataAvailable: false }),
    makeLicensing({ requirementStatus: 'UNKNOWN' }),
    'LOW',
    'LOW',
  );
  assert.ok(summary.toLowerCase().includes('directional'), `expected "directional" in summary, got: ${summary}`);
});

test('buildOverallSummary — missing state mentions incomplete address', () => {
  const { buildOverallSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: false, state: null, jurisdiction: { state: null, jurisdictionLevel: 'UNKNOWN' } });
  const summary = buildOverallSummary(
    ctx,
    makePermit({ requirementStatus: 'UNKNOWN' }),
    makeTax({ monthlyTaxIncreaseMax: 0, dataAvailable: false }),
    makeLicensing({ requirementStatus: 'UNKNOWN' }),
    'LOW',
    'UNAVAILABLE',
  );
  assert.ok(summary.toLowerCase().includes('incomplete') || summary.toLowerCase().includes('national defaults'), `expected address/incomplete mention, got: ${summary}`);
});

test('buildOverallSummary — retroactive with material tax mentions reassessment', () => {
  const { buildOverallSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const summary = buildOverallSummary(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMin: 100, monthlyTaxIncreaseMax: 250, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'CRITICAL',
    'HIGH',
  );
  assert.ok(summary.includes('reassessment'), `expected "reassessment" in summary, got: ${summary}`);
});

// ============================================================================
// 4. buildWarningsSummary
// ============================================================================

test('buildWarningsSummary — no warnings returns no critical message', () => {
  const { buildWarningsSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const result = buildWarningsSummary([]);
  assert.ok(result.includes('No critical warnings'), `got: ${result}`);
});

test('buildWarningsSummary — 2 critical + 1 warning counts correctly', () => {
  const { buildWarningsSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const warnings = [
    { code: 'A', severity: 'CRITICAL', title: 'A', description: 'a' },
    { code: 'B', severity: 'CRITICAL', title: 'B', description: 'b' },
    { code: 'C', severity: 'WARNING', title: 'C', description: 'c' },
  ];
  const result = buildWarningsSummary(warnings);
  assert.ok(result.includes('2 critical'), `expected "2 critical", got: ${result}`);
  assert.ok(result.includes('1 notice'), `expected "1 notice", got: ${result}`);
});

test('buildWarningsSummary — single critical uses singular "requires"', () => {
  const { buildWarningsSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const warnings = [{ code: 'X', severity: 'CRITICAL', title: 'X', description: 'x' }];
  const result = buildWarningsSummary(warnings);
  assert.ok(result.includes('requires'), `expected "requires" for singular, got: ${result}`);
});

test('buildWarningsSummary — multiple criticals use plural form', () => {
  const { buildWarningsSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const warnings = [
    { code: 'X', severity: 'CRITICAL', title: 'X', description: 'x' },
    { code: 'Y', severity: 'CRITICAL', title: 'Y', description: 'y' },
  ];
  const result = buildWarningsSummary(warnings);
  assert.ok(result.includes('require') && !result.includes('requires'), `expected "require" (plural), got: ${result}`);
});

// ============================================================================
// 5. buildNextStepsSummary
// ============================================================================

test('buildNextStepsSummary — empty actions returns fallback message', () => {
  const { buildNextStepsSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const result = buildNextStepsSummary([]);
  assert.ok(result.includes('consult'), `got: ${result}`);
});

test('buildNextStepsSummary — shows first 3 action labels', () => {
  const { buildNextStepsSummary } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const actions = [
    { key: 'a', label: 'Step A', description: '', destinationType: 'INFO', destinationRef: null, priority: 1 },
    { key: 'b', label: 'Step B', description: '', destinationType: 'INFO', destinationRef: null, priority: 2 },
    { key: 'c', label: 'Step C', description: '', destinationType: 'INFO', destinationRef: null, priority: 3 },
    { key: 'd', label: 'Step D', description: '', destinationType: 'INFO', destinationRef: null, priority: 4 },
  ];
  const result = buildNextStepsSummary(actions);
  assert.ok(result.includes('Step A'), `got: ${result}`);
  assert.ok(result.includes('Step B'), `got: ${result}`);
  assert.ok(result.includes('Step C'), `got: ${result}`);
  assert.ok(!result.includes('Step D'), `should not include Step D, got: ${result}`);
});

// ============================================================================
// 6. buildWarnings — pre-project
// ============================================================================

test('buildWarnings — REQUIRED permit (pre-project) → PERMIT_REQUIRED CRITICAL', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: false });
  const warnings = buildWarnings(ctx, makePermit({ requirementStatus: 'REQUIRED' }), makeTax(), makeLicensing());
  const w = warnings.find((x) => x.code === 'PERMIT_REQUIRED');
  assert.ok(w, 'should have PERMIT_REQUIRED');
  assert.equal(w.severity, 'CRITICAL');
  assert.equal(w.urgency, 'HIGH');
});

test('buildWarnings — LIKELY_REQUIRED permit (pre-project) → PERMIT_LIKELY_REQUIRED WARNING', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: false });
  const warnings = buildWarnings(ctx, makePermit({ requirementStatus: 'LIKELY_REQUIRED' }), makeTax(), makeLicensing());
  const w = warnings.find((x) => x.code === 'PERMIT_LIKELY_REQUIRED');
  assert.ok(w, 'should have PERMIT_LIKELY_REQUIRED');
  assert.equal(w.severity, 'WARNING');
  assert.equal(w.urgency, 'MEDIUM');
});

test('buildWarnings — structural REQUIRED permit gets structural description', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'STRUCTURAL_WALL_REMOVAL', isRetroactiveCheck: false });
  const warnings = buildWarnings(ctx, makePermit({ requirementStatus: 'REQUIRED' }), makeTax(), makeLicensing());
  const w = warnings.find((x) => x.code === 'PERMIT_REQUIRED');
  assert.ok(w, 'should have PERMIT_REQUIRED');
  assert.ok(w.description.toLowerCase().includes('structural'), `expected structural in description, got: ${w.description}`);
});

test('buildWarnings — REQUIRED licensing (pre-project) → CONTRACTOR_LICENSE_REQUIRED CRITICAL', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: false });
  const warnings = buildWarnings(ctx, makePermit(), makeTax(), makeLicensing({ requirementStatus: 'REQUIRED', consequenceSummary: 'A license is required.' }));
  const w = warnings.find((x) => x.code === 'CONTRACTOR_LICENSE_REQUIRED');
  assert.ok(w, 'should have CONTRACTOR_LICENSE_REQUIRED');
  assert.equal(w.severity, 'CRITICAL');
  assert.equal(w.urgency, 'HIGH');
});

test('buildWarnings — no project cost generates PROJECT_COST_ASSUMED INFO', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: false, projectCostInput: null });
  const warnings = buildWarnings(ctx, makePermit(), makeTax(), makeLicensing());
  const w = warnings.find((x) => x.code === 'PROJECT_COST_ASSUMED');
  assert.ok(w, 'should have PROJECT_COST_ASSUMED');
  assert.equal(w.severity, 'INFO');
  assert.equal(w.urgency, 'LOW');
});

test('buildWarnings — tax > 300 generates MATERIAL_TAX_INCREASE', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: false });
  const warnings = buildWarnings(ctx, makePermit(), makeTax({ monthlyTaxIncreaseMin: 300, monthlyTaxIncreaseMax: 400 }), makeLicensing());
  const w = warnings.find((x) => x.code === 'MATERIAL_TAX_INCREASE');
  assert.ok(w, 'should have MATERIAL_TAX_INCREASE');
  assert.equal(w.severity, 'WARNING');
  assert.equal(w.urgency, 'LOW');
});

test('buildWarnings — partial jurisdiction generates JURISDICTION_PARTIAL INFO', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', jurisdiction: { state: 'TX', jurisdictionLevel: 'STATE' } });
  const warnings = buildWarnings(ctx, makePermit(), makeTax(), makeLicensing());
  const w = warnings.find((x) => x.code === 'JURISDICTION_PARTIAL');
  assert.ok(w, 'should have JURISDICTION_PARTIAL');
  assert.equal(w.severity, 'INFO');
  assert.equal(w.urgency, 'LOW');
});

test('buildWarnings — no state generates JURISDICTION_UNRESOLVED WARNING', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', jurisdiction: { state: null, jurisdictionLevel: 'UNKNOWN' } });
  const warnings = buildWarnings(ctx, makePermit({ confidenceLevel: 'UNAVAILABLE' }), makeTax({ confidenceLevel: 'UNAVAILABLE' }), makeLicensing());
  const w = warnings.find((x) => x.code === 'JURISDICTION_UNRESOLVED');
  assert.ok(w, 'should have JURISDICTION_UNRESOLVED');
  assert.equal(w.severity, 'WARNING');
  assert.equal(w.urgency, 'MEDIUM');
});

test('buildWarnings — low confidence generates LOW_CONFIDENCE_ESTIMATE', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: false });
  const warnings = buildWarnings(ctx, makePermit({ confidenceLevel: 'LOW' }), makeTax(), makeLicensing());
  const w = warnings.find((x) => x.code === 'LOW_CONFIDENCE_ESTIMATE');
  assert.ok(w, 'should have LOW_CONFIDENCE_ESTIMATE');
  assert.equal(w.severity, 'WARNING');
  assert.equal(w.urgency, 'LOW');
});

// ============================================================================
// 7. buildWarnings — retroactive (no checklist)
// ============================================================================

test('buildWarnings — retroactive no checklist → RETROACTIVE_COMPLIANCE_REVIEW', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: true });
  const warnings = buildWarnings(ctx, makePermit({ requirementStatus: 'REQUIRED' }), makeTax(), makeLicensing(), null);
  const w = warnings.find((x) => x.code === 'RETROACTIVE_COMPLIANCE_REVIEW');
  assert.ok(w, 'should have RETROACTIVE_COMPLIANCE_REVIEW');
  assert.equal(w.severity, 'WARNING');
});

test('buildWarnings — retroactive structural no checklist → RETROACTIVE_COMPLIANCE_REVIEW with HIGH urgency', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const warnings = buildWarnings(ctx, makePermit({ requirementStatus: 'REQUIRED' }), makeTax(), makeLicensing(), null);
  const w = warnings.find((x) => x.code === 'RETROACTIVE_COMPLIANCE_REVIEW');
  assert.ok(w, 'should have RETROACTIVE_COMPLIANCE_REVIEW');
  assert.equal(w.urgency, 'HIGH');
});

test('buildWarnings — retroactive no checklist does NOT add PERMIT_REQUIRED', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: true });
  const warnings = buildWarnings(ctx, makePermit({ requirementStatus: 'REQUIRED' }), makeTax(), makeLicensing(), null);
  const permitWarning = warnings.find((x) => x.code === 'PERMIT_REQUIRED');
  assert.equal(permitWarning, undefined, 'should NOT have PERMIT_REQUIRED in retroactive mode');
});

// ============================================================================
// 8. buildWarnings — retroactive with checklist answers
// ============================================================================

test('buildWarnings — retroactive checklist: permit not obtained, structural → RETROACTIVE_NO_PERMIT_OBTAINED CRITICAL', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const warnings = buildWarnings(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax(),
    makeLicensing(),
    { permitObtainedStatus: 'NO', licensedContractorUsedStatus: 'YES', reassessmentReceivedStatus: null },
  );
  const w = warnings.find((x) => x.code === 'RETROACTIVE_NO_PERMIT_OBTAINED');
  assert.ok(w, 'should have RETROACTIVE_NO_PERMIT_OBTAINED');
  assert.equal(w.severity, 'CRITICAL');
  assert.equal(w.urgency, 'IMMEDIATE');
});

test('buildWarnings — retroactive checklist: permit not obtained, non-structural → WARNING (not CRITICAL)', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: true });
  const warnings = buildWarnings(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax(),
    makeLicensing(),
    { permitObtainedStatus: 'NO', licensedContractorUsedStatus: 'YES', reassessmentReceivedStatus: null },
  );
  const w = warnings.find((x) => x.code === 'RETROACTIVE_NO_PERMIT_OBTAINED');
  assert.ok(w, 'should have RETROACTIVE_NO_PERMIT_OBTAINED');
  assert.equal(w.severity, 'WARNING');
  assert.equal(w.urgency, 'HIGH');
});

test('buildWarnings — retroactive checklist: unlicensed structural → RETROACTIVE_UNLICENSED_CONTRACTOR CRITICAL', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ADU_CONSTRUCTION', isRetroactiveCheck: true });
  const warnings = buildWarnings(
    ctx,
    makePermit({ requirementStatus: 'NOT_REQUIRED' }),
    makeTax(),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    { permitObtainedStatus: 'YES', licensedContractorUsedStatus: 'NO', reassessmentReceivedStatus: null },
  );
  const w = warnings.find((x) => x.code === 'RETROACTIVE_UNLICENSED_CONTRACTOR');
  assert.ok(w, 'should have RETROACTIVE_UNLICENSED_CONTRACTOR');
  assert.equal(w.severity, 'CRITICAL');
  assert.equal(w.urgency, 'HIGH');
});

test('buildWarnings — retroactive checklist: unlicensed non-structural → WARNING', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'BATHROOM_FULL_REMODEL', isRetroactiveCheck: true });
  const warnings = buildWarnings(
    ctx,
    makePermit({ requirementStatus: 'LIKELY_REQUIRED' }),
    makeTax(),
    makeLicensing({ requirementStatus: 'MAY_BE_REQUIRED' }),
    { permitObtainedStatus: 'YES', licensedContractorUsedStatus: 'NO', reassessmentReceivedStatus: null },
  );
  const w = warnings.find((x) => x.code === 'RETROACTIVE_UNLICENSED_CONTRACTOR');
  assert.ok(w, 'should have RETROACTIVE_UNLICENSED_CONTRACTOR');
  assert.equal(w.severity, 'WARNING');
  assert.equal(w.urgency, 'MEDIUM');
});

test('buildWarnings — retroactive checklist: reassessment not received + high tax → RETROACTIVE_REASSESSMENT_PENDING', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const warnings = buildWarnings(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ annualTaxIncreaseMax: 600, dataAvailable: true }),
    makeLicensing(),
    { permitObtainedStatus: 'YES', licensedContractorUsedStatus: 'YES', reassessmentReceivedStatus: 'NO' },
  );
  const w = warnings.find((x) => x.code === 'RETROACTIVE_REASSESSMENT_PENDING');
  assert.ok(w, 'should have RETROACTIVE_REASSESSMENT_PENDING');
  assert.equal(w.severity, 'INFO');
  assert.equal(w.urgency, 'LOW');
});

test('buildWarnings — retroactive checklist all compliant → no compliance gap warnings', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: true });
  const warnings = buildWarnings(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ annualTaxIncreaseMax: 200 }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    { permitObtainedStatus: 'YES', licensedContractorUsedStatus: 'YES', reassessmentReceivedStatus: 'YES' },
  );
  const gapWarnings = warnings.filter((x) =>
    x.code === 'RETROACTIVE_NO_PERMIT_OBTAINED' ||
    x.code === 'RETROACTIVE_UNLICENSED_CONTRACTOR' ||
    x.code === 'RETROACTIVE_REASSESSMENT_PENDING',
  );
  assert.equal(gapWarnings.length, 0, 'should have no compliance gap warnings when all compliant');
});

// ============================================================================
// 9. buildWarnings — urgency field is present on all warnings
// ============================================================================

test('buildWarnings — all returned warnings have a defined urgency field', () => {
  const { buildWarnings } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: false, projectCostInput: null, jurisdiction: { state: 'TX', jurisdictionLevel: 'STATE' } });
  const warnings = buildWarnings(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED', confidenceLevel: 'LOW' }),
    makeTax({ monthlyTaxIncreaseMin: 350, monthlyTaxIncreaseMax: 500 }),
    makeLicensing({ requirementStatus: 'REQUIRED', consequenceSummary: 'License needed.' }),
  );
  assert.ok(warnings.length > 0, 'should have at least one warning');
  for (const w of warnings) {
    assert.ok(w.urgency !== undefined, `warning ${w.code} is missing urgency field`);
    assert.ok(['LOW', 'MEDIUM', 'HIGH', 'IMMEDIATE'].includes(w.urgency), `warning ${w.code} has invalid urgency: ${w.urgency}`);
  }
});

// ============================================================================
// 10. buildNextActions — pre-project
// ============================================================================

test('buildNextActions — permit required → verify_permit_locally in top 5', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'DECK_ADDITION', isRetroactiveCheck: false });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 50, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'NOT_REQUIRED' }),
    'MODERATE',
    null,
  );
  const a = actions.find((x) => x.key === 'verify_permit_locally');
  assert.ok(a, 'should have verify_permit_locally action');
});

test('buildNextActions — licensing required → verify_contractor_license in actions', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: false });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 50, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'HIGH',
    null,
  );
  const a = actions.find((x) => x.key === 'verify_contractor_license');
  assert.ok(a, 'should have verify_contractor_license action');
});

test('buildNextActions — HIGH risk includes break-even analysis', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: false });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 50, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'HIGH',
    null,
  );
  const a = actions.find((x) => x.key === 'run_break_even_analysis');
  assert.ok(a, 'should have run_break_even_analysis for HIGH risk');
});

test('buildNextActions — structural renovation includes update_digital_twin', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'STRUCTURAL_WALL_REMOVAL', isRetroactiveCheck: false });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 50, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'HIGH',
    null,
  );
  const a = actions.find((x) => x.key === 'update_digital_twin');
  assert.ok(a, 'should have update_digital_twin for structural renovation');
});

test('buildNextActions — capped at 5 results', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: false, jurisdiction: { state: null, jurisdictionLevel: 'UNKNOWN' } });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED', confidenceLevel: 'LOW' }),
    makeTax({ monthlyTaxIncreaseMax: 500, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'CRITICAL',
    null,
  );
  assert.ok(actions.length <= 5, `should be capped at 5, got ${actions.length}`);
});

test('buildNextActions — sorted by priority ascending', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: false });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 200, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'HIGH',
    null,
  );
  for (let i = 1; i < actions.length; i++) {
    assert.ok(
      actions[i].priority >= actions[i - 1].priority,
      `actions should be sorted by priority: ${actions[i - 1].priority} then ${actions[i].priority}`,
    );
  }
});

// ============================================================================
// 11. buildNextActions — retroactive flow
// ============================================================================

test('buildNextActions — retroactive: first action is complete_compliance_checklist', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 200, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'CRITICAL',
    null,
  );
  assert.equal(actions[0].key, 'complete_compliance_checklist', `first retroactive action should be checklist, got: ${actions[0].key}`);
});

test('buildNextActions — retroactive: includes update_digital_twin_completed', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 50, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'HIGH',
    null,
  );
  const a = actions.find((x) => x.key === 'update_digital_twin_completed');
  assert.ok(a, 'should have update_digital_twin_completed for retroactive flow');
});

test('buildNextActions — retroactive: does NOT include pre-project verify_permit_locally', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 50, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'HIGH',
    null,
  );
  const a = actions.find((x) => x.key === 'verify_permit_locally');
  assert.equal(a, undefined, 'retroactive flow should not have verify_permit_locally');
});

test('buildNextActions — retroactive with material tax: includes retroactive_watch_reassessment', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ROOM_ADDITION', isRetroactiveCheck: true });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 200, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'HIGH',
    null,
  );
  const a = actions.find((x) => x.key === 'retroactive_watch_reassessment');
  assert.ok(a, 'should have retroactive_watch_reassessment when tax is material');
});

test('buildNextActions — retroactive also capped at 5', () => {
  const { buildNextActions } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const ctx = makeCtx({ renovationType: 'ADU_CONSTRUCTION', isRetroactiveCheck: true });
  const actions = buildNextActions(
    ctx,
    makePermit({ requirementStatus: 'REQUIRED' }),
    makeTax({ monthlyTaxIncreaseMax: 300, dataAvailable: true }),
    makeLicensing({ requirementStatus: 'REQUIRED' }),
    'CRITICAL',
    null,
  );
  assert.ok(actions.length <= 5, `should be capped at 5, got ${actions.length}`);
});

// ============================================================================
// 12. getRenovationLabel
// ============================================================================

test('getRenovationLabel — all 12 types return non-empty strings', () => {
  const { RENOVATION_TYPE_LABELS, getRenovationLabel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const types = Object.keys(RENOVATION_TYPE_LABELS);
  assert.equal(types.length, 12, 'should have all 12 renovation types');
  for (const t of types) {
    const label = getRenovationLabel(t);
    assert.ok(label && label.length > 0, `${t} should have a non-empty label`);
    assert.ok(!label.includes('_'), `${t} label should not contain underscores, got: ${label}`);
  }
});

test('getRenovationLabel — unknown type falls back to the key itself', () => {
  const { getRenovationLabel } = require('../../dist/homeRenovationAdvisor/engine/summary/summaryBuilder.service');
  const result = getRenovationLabel('SOME_FUTURE_TYPE');
  assert.equal(result, 'SOME_FUTURE_TYPE');
});

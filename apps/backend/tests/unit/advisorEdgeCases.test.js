// tests/unit/advisorEdgeCases.test.js
//
// Unit tests for Step 6 edge case hardening.
// Tests export mapper, warning deduplication, null/partial states.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ============================================================================
// HELPERS
// ============================================================================

function makeSession(opts = {}) {
  return {
    id: 'session-abc',
    propertyId: 'prop-123',
    renovationLabel: opts.renovationLabel ?? 'Deck Addition',
    jurisdiction: {
      state: opts.state ?? 'TX',
      city: opts.city ?? 'Austin',
      postalCode: opts.postalCode ?? '78701',
    },
    lastEvaluatedAt: opts.lastEvaluatedAt ?? '2025-01-01T00:00:00.000Z',
    flowType: opts.flowType ?? 'EXPLICIT_PRE_PROJECT',
    isRetroactiveCheck: opts.isRetroactiveCheck ?? false,
    overallRiskLevel: opts.overallRiskLevel ?? 'LOW',
    overallConfidence: opts.overallConfidence ?? 'MEDIUM',
    overallSummary: opts.overallSummary ?? 'Test summary.',
    permit: opts.permit ?? null,
    taxImpact: opts.taxImpact ?? null,
    licensing: opts.licensing ?? null,
    warnings: opts.warnings ?? [],
    nextActions: opts.nextActions ?? [],
    assumptions: opts.assumptions ?? [],
    complianceChecklist: opts.complianceChecklist ?? null,
    disclaimerText: opts.disclaimerText ?? null,
    disclaimerVersion: opts.disclaimerVersion ?? null,
    warningsSummary: opts.warningsSummary ?? null,
  };
}

function makePermitModule(opts = {}) {
  return {
    requirementStatus: opts.requirementStatus ?? 'REQUIRED',
    confidenceLevel: opts.confidenceLevel ?? 'MEDIUM',
    summary: opts.summary ?? 'Permit required.',
    costRange: { min: 500, max: 1500, ...opts.costRange },
    timelineRangeDays: { min: 30, max: 60, ...opts.timelineRangeDays },
    dataAvailable: opts.dataAvailable ?? true,
    sourceMeta: { sourceLabel: opts.sourceLabel ?? 'National defaults', ...opts.sourceMeta },
  };
}

function makeTaxModule(opts = {}) {
  return {
    confidenceLevel: opts.confidenceLevel ?? 'MEDIUM',
    plainLanguageSummary: opts.plainLanguageSummary ?? 'Tax may increase.',
    monthlyTaxIncreaseRange: { min: 50, max: 200, ...opts.monthlyTaxIncreaseRange },
    annualTaxIncreaseRange: { min: 600, max: 2400, ...opts.annualTaxIncreaseRange },
    reassessmentTriggerType: opts.reassessmentTriggerType ?? 'IMPROVEMENT',
    dataAvailable: opts.dataAvailable ?? true,
    sourceMeta: { sourceLabel: opts.sourceLabel ?? 'State data', ...opts.sourceMeta },
  };
}

function makeLicensingModule(opts = {}) {
  return {
    requirementStatus: opts.requirementStatus ?? 'REQUIRED',
    confidenceLevel: opts.confidenceLevel ?? 'MEDIUM',
    plainLanguageSummary: opts.plainLanguageSummary ?? 'Licensed contractor required.',
    consequenceSummary: opts.consequenceSummary ?? 'May void insurance.',
    dataAvailable: opts.dataAvailable ?? true,
    sourceMeta: { sourceLabel: opts.sourceLabel ?? 'State data', ...opts.sourceMeta },
  };
}

// ============================================================================
// EXPORT MAPPER TESTS
// ============================================================================

test('buildExportViewModel — produces valid export for complete session', () => {
  const { buildExportViewModel } = require('../../dist/homeRenovationAdvisor/export/advisorExportMapper');
  const session = makeSession({
    permit: makePermitModule(),
    taxImpact: makeTaxModule(),
    licensing: makeLicensingModule(),
    warnings: [{ severity: 'CRITICAL', title: 'Permit needed', description: 'desc' }],
    nextActions: [{ priority: 1, label: 'Get permit', description: 'Apply now', destinationType: 'INFO', destinationRef: null }],
    disclaimerText: 'Test disclaimer.',
    disclaimerVersion: '1.0.0',
  });
  const exported = buildExportViewModel(session);
  assert.equal(exported.sessionId, 'session-abc');
  assert.equal(exported.renovationLabel, 'Deck Addition');
  assert.equal(exported.jurisdiction, 'Austin, TX, 78701');
  assert.equal(exported.permit.status, 'REQUIRED');
  assert.equal(exported.taxImpact.monthlyIncreaseRange, '$50–$200');
  assert.equal(exported.licensing.status, 'REQUIRED');
  assert.equal(exported.warnings.length, 1);
  assert.equal(exported.nextActions.length, 1);
  assert.equal(exported.disclaimerText, 'Test disclaimer.');
  assert.ok(exported.exportedAt, 'should have exportedAt timestamp');
});

test('buildExportViewModel — handles null modules gracefully', () => {
  const { buildExportViewModel } = require('../../dist/homeRenovationAdvisor/export/advisorExportMapper');
  const session = makeSession(); // all modules null
  const exported = buildExportViewModel(session);
  assert.equal(exported.permit.status, 'UNKNOWN');
  assert.equal(exported.taxImpact.confidence, 'UNAVAILABLE');
  assert.equal(exported.licensing.status, 'UNKNOWN');
  assert.equal(exported.warnings.length, 0);
  assert.equal(exported.nextActions.length, 0);
  assert.equal(exported.assumptions.length, 0);
});

test('buildExportViewModel — only exports CRITICAL and WARNING warnings', () => {
  const { buildExportViewModel } = require('../../dist/homeRenovationAdvisor/export/advisorExportMapper');
  const session = makeSession({
    warnings: [
      { severity: 'CRITICAL', title: 'Critical', description: 'desc' },
      { severity: 'WARNING', title: 'Warning', description: 'desc' },
      { severity: 'INFO', title: 'Info', description: 'desc' },
    ],
  });
  const exported = buildExportViewModel(session);
  assert.equal(exported.warnings.length, 2, 'INFO warnings should be excluded from export');
});

test('buildExportViewModel — formats cost range correctly', () => {
  const { buildExportViewModel } = require('../../dist/homeRenovationAdvisor/export/advisorExportMapper');
  const session = makeSession({
    permit: makePermitModule({ costRange: { min: 1000, max: 2500 } }),
    taxImpact: makeTaxModule(),
    licensing: makeLicensingModule(),
  });
  const exported = buildExportViewModel(session);
  assert.equal(exported.permit.costRange, '$1,000–$2,500');
});

test('buildExportViewModel — formats equal min/max range as single value', () => {
  const { buildExportViewModel } = require('../../dist/homeRenovationAdvisor/export/advisorExportMapper');
  const session = makeSession({
    permit: makePermitModule({ costRange: { min: 500, max: 500 } }),
    taxImpact: makeTaxModule(),
    licensing: makeLicensingModule(),
  });
  const exported = buildExportViewModel(session);
  assert.equal(exported.permit.costRange, '$500', 'equal min/max should collapse to single value');
});

test('buildExportViewModel — formats day range', () => {
  const { buildExportViewModel } = require('../../dist/homeRenovationAdvisor/export/advisorExportMapper');
  const session = makeSession({
    permit: makePermitModule({ timelineRangeDays: { min: 30, max: 60 } }),
    taxImpact: makeTaxModule(),
    licensing: makeLicensingModule(),
  });
  const exported = buildExportViewModel(session);
  assert.equal(exported.permit.timelineRange, '30–60 days');
});

test('buildExportViewModel — retroactive session includes compliance checklist', () => {
  const { buildExportViewModel } = require('../../dist/homeRenovationAdvisor/export/advisorExportMapper');
  const session = makeSession({
    isRetroactiveCheck: true,
    complianceChecklist: {
      permitObtainedStatus: 'YES',
      licensedContractorUsedStatus: 'NO',
      reassessmentReceivedStatus: 'UNKNOWN',
    },
  });
  const exported = buildExportViewModel(session);
  assert.ok(exported.complianceChecklist, 'retroactive session should include compliance checklist');
  assert.equal(exported.complianceChecklist.permitObtained, 'YES');
  assert.equal(exported.complianceChecklist.licensedContractorUsed, 'NO');
});

test('buildExportViewModel — session with null complianceChecklist has null in export', () => {
  const { buildExportViewModel } = require('../../dist/homeRenovationAdvisor/export/advisorExportMapper');
  const session = makeSession({ complianceChecklist: null });
  const exported = buildExportViewModel(session);
  assert.equal(exported.complianceChecklist, null);
});

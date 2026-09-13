const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §15). This is the
// file extractionCandidateSchema.test.js's own header comment already
// referenced by name -- it did not previously exist (code review finding,
// 2026-09-13). Requires a real GEMINI_API_KEY and makes 24 live model calls
// (one per corpus row); skipped entirely otherwise, matching this codebase's
// existing convention for live-model checks (never part of the default
// `npm test` run, never CI-blocking). Run explicitly with:
//   GEMINI_API_KEY=... node --test tests/ask/extractionEvaluationHarness.manual.test.js

const { evaluateExtractionQuality } = require('../../src/services/ask/conversationalUnderstanding/extractionEvaluationHarness.ts');

if (!process.env.GEMINI_API_KEY) {
  test('extraction quality against the live model (SKIPPED -- set GEMINI_API_KEY to run)', { skip: true }, () => {});
} else {
  test('FRD §15 pilot thresholds against the live model and frozen corpus', async () => {
    const report = await evaluateExtractionQuality();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));

    // FRD §15's own thresholds are explicitly "illustrative... a Stage 3
    // implementation calibration task, not fixed science" and "not validated
    // against production traffic" -- asserted here as a genuine calibration
    // check (this run is exactly what validates them), not silently logged
    // and ignored. A null value (no scorable rows for that metric) never
    // satisfies its own threshold below -- surfaced as a real failure, not a
    // pass-by-omission.
    for (const [label, value, threshold] of [
      ['candidate extraction accuracy', report.candidateCategoryAccuracy, 0.90],
      ['field accuracy', report.fieldAccuracy, 0.85],
      ['date-precision accuracy', report.datePrecisionAccuracy, 0.95],
      ['source-attribution accuracy', report.attributionAccuracy, 0.85],
    ]) {
      assert.ok(
        value !== null && value >= threshold,
        `${label} ${value === null ? 'has no scorable rows' : `${(value * 100).toFixed(1)}%`} is below FRD §15's ${(threshold * 100).toFixed(0)}% pilot threshold`,
      );
    }
    assert.ok(
      report.duplicateRate !== null && report.duplicateRate <= 0.02,
      `duplicate rate ${report.duplicateRate === null ? 'unscored' : `${(report.duplicateRate * 100).toFixed(1)}%`} exceeds FRD §15's 2% pilot threshold`,
    );
    assert.ok(
      report.falsePersistenceProposalRate !== null && report.falsePersistenceProposalRate <= 0.05,
      `false-persistence proposal rate ${report.falsePersistenceProposalRate === null ? 'unscored' : `${(report.falsePersistenceProposalRate * 100).toFixed(1)}%`} exceeds FRD §15's 5% pilot threshold`,
    );
  });
}

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { buildReportMarkdown } = require('../../scripts/generate-home-intelligence-phase0-report.ts');

const REPORT_PATH = path.join(__dirname, '../../../../docs/product/HOME_INTELLIGENCE_PHASE0_REGISTRY_REPORT.md');

/**
 * The date line is expected to change every time a human regenerates the
 * report and commits it — it is not itself a signal of drift, so it is
 * normalized out here. Everything else (every generated table, every count)
 * must match exactly: this is the registry/report parity check the FRD
 * Phase 0 exit criterion requires — a loader, capability, or policy entry
 * added without regenerating the report fails this test.
 */
function normalizeDateLine(markdown) {
  return markdown.replace(/^date: ".*"$/m, 'date: "<normalized>"');
}

test('the committed Home Intelligence Phase 0 report matches its generator output', () => {
  const generated = normalizeDateLine(buildReportMarkdown());
  const committed = normalizeDateLine(fs.readFileSync(REPORT_PATH, 'utf8'));
  assert.equal(
    generated,
    committed,
    'docs/product/HOME_INTELLIGENCE_PHASE0_REGISTRY_REPORT.md is stale — run `npm run report:home-intelligence-phase0` and commit the result.',
  );
});

test('the generator is deterministic', () => {
  assert.equal(normalizeDateLine(buildReportMarkdown()), normalizeDateLine(buildReportMarkdown()));
});

const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { cases, manifest } = require('./fidelity/calculationFidelity.js');
const { validateFidelityManifest, fidelityCoverage } = require('../../src/services/ask/semantic/evaluation/biccEvaluationReport.ts');

// BICC-GATE-004A2: at least 300 distinct deterministic calculation cases across the EVAL-019 partition manifest, zero wrong results, no population claim.
test('the suite meets the EVAL-019 manifest contract: at least 300 distinct cases, every partition covered, no population-bound claim', () => {
  assert.deepEqual(validateFidelityManifest(manifest(), 300), []);
  const coverage = fidelityCoverage(manifest());
  assert.ok(coverage.distinctCases >= 300, `${coverage.distinctCases} cases`);
  assert.equal(coverage.populationBound, 'NOT_CLAIMED');
  assert.deepEqual(coverage.uncovered, []);
});

for (const fidelityCase of cases) {
  test(`[${fidelityCase.partition}] ${fidelityCase.id}`, async () => { await fidelityCase.run(); });
}

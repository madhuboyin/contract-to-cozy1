const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  COVERAGE_OPERATIONAL_DRILL_VERSION,
  runCoverageOperationalDrill,
} = require('../../src/services/coverageOperationalDrill.service');

test('coverage operational drill contains failures, restores controls, and survives a bounded burst', () => {
  const report = runCoverageOperationalDrill({
    iterations: 2_000,
    maxElapsedMs: 5_000,
  });
  assert.equal(report.contractVersion, COVERAGE_OPERATIONAL_DRILL_VERSION);
  assert.equal(report.passed, true);
  assert.equal(report.load.iterations, 2_000);
  assert.equal(report.load.evaluationFailures, 0);
  assert.equal(report.load.passed, true);
  assert.deepEqual(
    report.scenarios.map(({ code, passed }) => [code, passed]),
    [
      ['REAL_USER_KILL_SWITCH', true],
      ['CONTEXTUAL_ACTION_SUPPRESSION', true],
      ['BENCHMARK_SOURCE_UNAVAILABLE', true],
      ['BENCHMARK_SOURCE_STALE', true],
      ['PARTNER_UNAVAILABLE', true],
      ['INCIDENT_GATE', true],
      ['CONFIGURATION_RESTORATION', true],
    ],
  );
  assert.equal(report.evidence.containsPolicyOrContactData, false);
});

test('decision persistence atomically claims a draft and returns semantic replays without duplicate hooks', () => {
  const service = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/coverageComparison.service.ts'),
    'utf8',
  );
  const controller = fs.readFileSync(
    path.resolve(__dirname, '../../src/controllers/coverageAnalysis.controller.ts'),
    'utf8',
  );
  assert.match(service, /coverageComparison\.updateMany/);
  assert.match(service, /status: 'DRAFT'/);
  assert.match(service, /idempotentReplay: true/);
  assert.match(service, /COVERAGE_DECISION_CONFLICT/);
  assert.match(controller, /if \(result\.idempotentReplay\)/);
  assert.match(controller, /return res\.status\(200\)/);
});

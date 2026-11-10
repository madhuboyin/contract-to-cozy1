const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register/transpile-only');

// Findings Implementation Plan, Phase 4. This file turns the routing measurements into durable checks. Everything here EXECUTES the real, deterministic
// router over the reviewed certification corpus (no network, database or model). The numeric floors are ratchets set at the measured baseline: they stop
// the router getting worse silently, they are not quality targets, and they should be tightened when routing improves.
const { buildAskRoutingCoverageReport, calibrationDrift } = require('../../src/scripts/askRoutingCoverageReport.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { calibrateAskRoutingConfidence, askRoutingCalibrationKind } = require('../../src/services/ask/askRoutingCalibration.ts');
const { ASK_ROUTING_CERTIFICATION_FIXTURES } = require('../../src/services/ask/askTrustCertificationCorpus.ts');

const report = buildAskRoutingCoverageReport();
const rows = [...report.failures];

test('the mechanism is described as feature hashing, not a learned embedding, in the report and in the module that implements it', () => {
  assert.match(report.mechanism, /feature hashing/i);
  assert.match(report.mechanism, /not an embedding model/i);
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/askSemanticEmbedding.ts'), 'utf8');
  assert.match(source, /deterministic feature hashing/);
  assert.match(source, /NOT an embedding model/);
  assert.match(source, /no trained weights/);
  const calibration = readFileSync(resolve(__dirname, '../../src/services/ask/askRoutingCalibration.ts'), 'utf8');
  assert.match(calibration, /not a learned embedding/);
});

test('every fixture lands in exactly one outcome class', () => {
  const a = report.aggregate;
  assert.equal(a.correct + a.falseRoute + a.clarification + a.fallback + a.safetyIntercept, a.samples);
  assert.equal(a.samples, report.corpus.independent + report.corpus.regressions);
});

test('safety gate: boundary fixtures are taken by the gate, and the gate takes nothing it should not', () => {
  assert.equal(report.aggregate.safetyIntercept, 0, 'no ordinary fixture is intercepted as a safety boundary');
  assert.equal(report.byBand.SAFETY_GATE.correct, report.byBand.SAFETY_GATE.samples);
  assert.ok(report.byBand.SAFETY_GATE.samples >= 3, 'the emergency, restricted and out-of-scope fixtures are all taken by the gate');
});

test('quality ratchet: no fixture is routed to a wrong operation, and the share that reaches a deterministic answer or a clarification does not fall', () => {
  assert.equal(report.aggregate.falseRoute, 0);
  assert.equal(report.aggregate.confidentFalseRoute, 0);
  const reachable = report.aggregate.correct + report.aggregate.clarificationWithExpectedOffered;
  assert.ok(reachable >= 100, `${reachable} of ${report.aggregate.samples} reach an answer or a clarification that offers the right operation`);
  assert.ok(report.aggregate.fallback <= 26, `${report.aggregate.fallback} fixtures fall through to the remote fallback`);
});

test('every clarification is explained, and a policy clarification really is a write or high-materiality operation below the HIGH band', () => {
  const clarifications = rows.filter((row) => row.outcome === 'CLARIFICATION');
  assert.ok(clarifications.length > 0);
  for (const row of clarifications) {
    assert.ok(row.clarificationReason, row.fixtureId);
    assert.equal(row.expectedAmongCandidates, true, `${row.fixtureId}: the homeowner can still reach the expected operation`);
  }
  const policy = clarifications.filter((row) => row.clarificationReason === 'POLICY_WRITE_OR_MATERIAL_BELOW_HIGH');
  assert.equal(policy.length, report.aggregate.clarificationByPolicy);
  for (const row of policy) {
    const definition = ASK_OPERATION_DEFINITIONS[row.expected];
    assert.ok(definition.semantic.effect === 'WRITE' || definition.semantic.materiality === 'HIGH', `${row.fixtureId} is not a write or material operation`);
    assert.notEqual(row.expectedBand, 'HIGH', row.fixtureId);
  }
});

test('measured gap: a fixture that falls back is almost always ranked first, so the shortfall is calibrated confidence, not retrieval', () => {
  const fallbacks = rows.filter((row) => row.outcome === 'FALLBACK');
  const rankedFirst = fallbacks.filter((row) => row.expectedRank === 1).length;
  assert.equal(rankedFirst, report.aggregate.fallbackWithExpectedRankedFirst);
  assert.ok(rankedFirst / Math.max(1, fallbacks.length) >= 0.8, `${rankedFirst} of ${fallbacks.length} fallbacks have the expected operation ranked first`);
  for (const row of fallbacks) assert.ok(row.expectedBand === 'LOW' || row.expectedBand === 'MEDIUM' || row.expectedBand === null, row.fixtureId);
});

test('coverage: every message-routable operation is indexed, has a routing fixture, and owns hard negatives', () => {
  const coverage = report.operationCoverage;
  assert.equal(coverage.semanticallyIndexed, coverage.messageRoutableOperations);
  assert.deepEqual(coverage.withoutAnyRoutingFixture, []);
  assert.deepEqual(coverage.withoutHardNegativeExamples, []);
});

test('guardrail: the execution, high-band and ambiguity thresholds per operation kind are unchanged (a calibration edit must not weaken them)', () => {
  const pick = (kind) => Object.values(ASK_OPERATION_DEFINITIONS).find((definition) => definition.messageRoutable && askRoutingCalibrationKind(definition) === kind);
  const expected = {
    READ: { minimum: 0.42, ambiguity: 0.1, high: 0.7 },
    MATERIAL: { minimum: 0.52, ambiguity: 0.12, high: 0.7 },
    WRITE: { minimum: 0.62, ambiguity: 0.14, high: 0.78 },
  };
  for (const [kind, want] of Object.entries(expected)) {
    const definition = pick(kind);
    assert.ok(definition, `an operation of kind ${kind} exists`);
    const hybrid = calibrateAskRoutingConfidence({ definition, language: 'en', routingPath: 'HYBRID_LOCAL_EMBEDDING', rawScore: 0.5 });
    assert.equal(hybrid.minimumExecutionConfidence, want.minimum, `${kind} execution threshold`);
    assert.equal(hybrid.ambiguityMargin, want.ambiguity, `${kind} ambiguity margin`);
    const lexical = calibrateAskRoutingConfidence({ definition, language: 'en', routingPath: 'LEXICAL_LOCAL', rawScore: 0.5 });
    assert.ok(lexical.minimumExecutionConfidence >= hybrid.minimumExecutionConfidence, `${kind}: the lexical-only path is never looser`);
    // The HIGH band begins exactly at the profile threshold: probe the calibrated value just below and at it.
    const bands = [0.6, 0.7, 0.8, 0.9, 1].map((rawScore) => calibrateAskRoutingConfidence({ definition, language: 'en', routingPath: 'HYBRID_LOCAL_EMBEDDING', rawScore }));
    for (const result of bands) assert.equal(result.confidenceBand === 'HIGH', result.calibratedConfidence >= want.high, `${kind} high band at ${result.rawScore}`);
  }
});

test('calibration drift ratchet: the stored evidence differs from live scoring only for the known fixtures, and drift cannot grow unnoticed', () => {
  // Known at the measured baseline (2026-11-05): the strongest competitor changed for 015, 065 and 075, and 121 has no rows (068 and 122 added 2026-11-08, below). Refreshing them is an owner
  // decision recorded in docs/architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md. When it is applied, this set becomes empty.
  // 2026-11-08: 122 (CAPITAL_ITEM_FUNDING_GOAL) has no rows, and 068's strongest competitor is now that operation. Recording either refits the shared
  // confidence curve, which moved 40 operations' sweep results at once (+20 hits, +15 misroutes, 51 fewer fallbacks), so it is left with the other known
  // fixtures for the same owner decision rather than bundled into an unrelated feature.
  const KNOWN = new Set(require('../fixtures/askCalibrationKnownDrift.js'));
  const drift = calibrationDrift(ASK_ROUTING_CERTIFICATION_FIXTURES);
  assert.deepEqual(drift, report.calibrationDrift);
  const unexpected = drift.rows.filter((row) => !KNOWN.has(row.fixtureId));
  assert.deepEqual(unexpected, [], 'new calibration drift: re-derive the affected rows and record the before/after outcomes');
  for (const row of drift.rows) {
    assert.notEqual(row.kind, 'EXPECTED_SCORE_CHANGED', `${row.fixtureId}: the expected operation's own score must not drift`);
  }
});

test('the drift report lists every drifted fixture, not only the first (the certification test stops at the first)', () => {
  const ids = new Set(report.calibrationDrift.rows.map((row) => row.fixtureId));
  assert.equal(report.calibrationDrift.driftedFixtures, ids.size);
  assert.ok(ids.size >= 2, 'more than one fixture has drifted, which the existing test cannot show');
});

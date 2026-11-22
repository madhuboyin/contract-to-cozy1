const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const evaluation = '../../src/services/ask/semantic/evaluation/';
const {
  validateShardManifest, burnShard, disclosePool, isCertificationEligible, promptSimilarity, EVALUATION_ROLES,
} = require(`${evaluation}biccShardManifest.ts`);
const {
  buildSuccessReport, compareRevisions, isPromptSuccess, segmentClaims, validateScorerContract, judgeVersionKey, requiresHumanAdjudication,
  evaluatorEgressViolations, validateFidelityManifest, fidelityCoverage, recordFidelityFailure, FIDELITY_PARTITIONS,
} = require(`${evaluation}biccEvaluationReport.ts`);

const prompt = (id, text, family, extra = {}) => ({ id, text, templateFamily: family, authoredBy: 'a', reviewedBy: 'b', ...extra });
const manifest = () => ({
  version: '1',
  sampleFloors: { minEligiblePrompts: 3, minSealedShards: 2 },
  shards: [
    { id: 'T1', role: 'TUNING', status: 'SEALED', prompts: [prompt('t1', 'When was my roof replaced?', 'roof-age')] },
    { id: 'C1', role: 'CERTIFICATION', status: 'SEALED', prompts: [prompt('c1', 'Which warranties expire this year?', 'warranty-expiry'), prompt('c2', 'How old is the water heater?', 'asset-age')] },
    { id: 'C2', role: 'CERTIFICATION', status: 'SEALED', prompts: [prompt('c3', 'What did the HVAC service cost?', 'service-cost')] },
  ],
});

// EVAL-002 / EVAL-003
test('a well-formed manifest validates and discloses its pool', () => {
  assert.deepEqual(validateShardManifest(manifest()), []);
  const pool = disclosePool(manifest());
  assert.deepEqual([pool.eligiblePrompts, pool.sealedShards, pool.burnedShards, pool.burnRate, pool.meetsFloors], [3, 2, 0, 0, true]);
});

test('near-duplicates and same-family rephrasings of a tuning prompt cannot certify (EVAL-003)', () => {
  const m = manifest();
  m.shards[1].prompts.push(prompt('c9', 'hey cozy, when was the roof replaced please', 'roof-age-2'));
  m.shards[2].prompts.push(prompt('c10', 'Totally different wording about shingles', 'roof-age'));
  const issues = validateShardManifest(m).join('\n');
  assert.match(issues, /Prompt c9: near-duplicate of tuning prompt t1/);
  assert.match(issues, /Prompt c10: template family "roof-age" also appears in tuning/);
  assert.ok(promptSimilarity('When was my roof replaced?', 'hey cozy, when was the roof replaced please') >= 0.8);
});

test('certification prompts need an independent reviewer', () => {
  const m = manifest();
  m.shards[1].prompts[0] = prompt('c1', 'Which warranties expire this year?', 'warranty-expiry', { reviewedBy: 'a' });
  assert.match(validateShardManifest(m).join(' '), /independent reviewer/);
});

test('a revealed shard is burned, becomes tuning evidence, and drops out of the eligible pool', () => {
  const m = manifest();
  const revealed = { ...m, shards: m.shards.map((s) => s.id === 'C1' ? { ...s, revealedAt: '2026-11-22' } : s) };
  assert.match(validateShardManifest(revealed).join(' '), /revealed at 2026-11-22 but still SEALED/);
  const burned = burnShard(m, 'C1', 'diagnosis of failing prompts', '2026-11-22');
  assert.deepEqual(validateShardManifest(burned), []);
  assert.equal(isCertificationEligible(burned, 'C1'), false);
  assert.equal(isCertificationEligible(burned, 'C2'), true);
  const pool = disclosePool(burned);
  assert.equal(pool.burnedShards, 1);
  assert.equal(pool.burnRate, 0.5);
  assert.equal(pool.eligiblePrompts, 1);
  assert.equal(pool.meetsFloors, false);
  assert.equal(burned.shards.find((s) => s.id === 'C1').role, 'TUNING');
  assert.throws(() => burnShard(m, 'nope', 'x', 'y'));
});

test('ownership is role-based: a safety-critical certification prompt also needs the Home Safety/Policy Reviewer', () => {
  assert.deepEqual(EVALUATION_ROLES, { author: 'Ask Evaluation Author', reviewer: 'Ask Evaluation Reviewer', safetyReviewer: 'Home Safety/Policy Reviewer', evidenceOwner: 'Ask Product Owner' });
  const m = manifest();
  m.shards[1].prompts[0] = prompt('c1', 'There is a gas smell in the basement', 'gas-smell', { authoredBy: EVALUATION_ROLES.author, reviewedBy: EVALUATION_ROLES.reviewer, safetyCritical: true });
  assert.match(validateShardManifest(m).join(' '), /needs the Home Safety\/Policy Reviewer/);
  m.shards[1].prompts[0].safetyReviewedBy = EVALUATION_ROLES.safetyReviewer;
  assert.deepEqual(validateShardManifest(m), []);
});

// EVAL-013 / EVAL-018
const result = (promptId, source, outcome, extra = {}) => ({ promptId, source, outcome, strata: { domain: 'ROOF' }, shardId: source === 'HELD_OUT' ? 'C1' : undefined, ...extra });

test('a main-corpus result alone can never produce a certification headline (EVAL-013)', () => {
  const report = buildSuccessReport([result('a', 'MAIN_CORPUS', 'CORRECT_ANSWER'), result('b', 'MAIN_CORPUS', 'CORRECT_ANSWER')]);
  assert.equal(report.certificationHeadline, null);
  assert.equal(report.headlineRefusedReason, 'NO_HELD_OUT_RESULTS');
  assert.equal(report.tuningOrMainCorpus.label, 'TUNING_EVIDENCE_NOT_CERTIFICATION');
});

test('the headline uses held-out, uncontaminated results only, with an exact interval and per-stratum/shard rates', () => {
  const report = buildSuccessReport([
    result('h1', 'HELD_OUT', 'CORRECT_ANSWER'), result('h2', 'HELD_OUT', 'APPROPRIATE_CLARIFICATION'), result('h3', 'HELD_OUT', 'UNSUPPORTED_FALLBACK'),
    result('h4', 'HELD_OUT', 'CORRECT_ANSWER', { contaminated: true }),
    result('m1', 'MAIN_CORPUS', 'CORRECT_ANSWER'),
  ]);
  assert.equal(report.certificationHeadline.trials, 3);
  assert.equal(report.certificationHeadline.successes, 2);
  assert.ok(report.certificationHeadline.lower < 2 / 3 && report.certificationHeadline.upper > 2 / 3);
  assert.equal(report.heldOut.contaminatedExcluded, 1);
  assert.equal(report.heldOut.byStratum[0].trials, 3);
  assert.equal(report.heldOut.byShard.C1.trials, 3);
  assert.equal(report.tuningOrMainCorpus.results, 2);
  assert.equal(report.scope, 'PROMPT_SUCCESS_AS_DEFINED_BY_EVAL_018');
});

test('only a correct answer, appropriate clarification or specific supported boundary count as success (EVAL-018)', () => {
  for (const kind of ['CORRECT_ANSWER', 'APPROPRIATE_CLARIFICATION', 'SUPPORTED_BOUNDARY']) assert.equal(isPromptSuccess(kind), true);
  for (const kind of ['UNSUPPORTED_FALLBACK', 'WRONG_REFUSAL', 'DEAD_END_RECOVERY', 'DROPPED_FACET', 'DATA_POINT_UNREACHABLE', 'WRONG_ANSWER']) assert.equal(isPromptSuccess(kind), false);
});

test('revisions are compared only on the same pool, with the 2-point non-inferiority margin and movement lists', () => {
  const base = ['a', 'b', 'c', 'd'].map((id, i) => result(id, 'HELD_OUT', i < 3 ? 'CORRECT_ANSWER' : 'UNSUPPORTED_FALLBACK'));
  const worse = ['a', 'b', 'c', 'd'].map((id, i) => result(id, 'HELD_OUT', i < 1 ? 'CORRECT_ANSWER' : 'UNSUPPORTED_FALLBACK'));
  const comparison = compareRevisions(base, worse);
  assert.equal(comparison.comparable, true);
  assert.deepEqual(comparison.regressed.sort(), ['b', 'c']);
  assert.equal(comparison.withinNonInferiorityMargin, false);
  assert.equal(compareRevisions(base, base).withinNonInferiorityMargin, true);
  assert.equal(compareRevisions(base, base.slice(1)).comparable, false);
});

// EVAL-014
test('claim segmentation is deterministic', () => {
  assert.deepEqual(segmentClaims('The roof is 12 years old. It was replaced in 2014; the warranty ends in 2034.\n- Gutters cleaned'), ['The roof is 12 years old.', 'It was replaced in 2014', 'the warranty ends in 2034.', 'Gutters cleaned']);
});

const judge = { provider: 'p', model: 'm', promptVersion: '1', schemaVersion: '1', configVersion: '1' };
const calibratedJudge = () => ({
  id: 's', version: '1', claimSegmentation: 'segmentClaims@1', rubricVersion: 'r1', implementation: 'LLM_JUDGE', evaluates: 'VARIABLE_OUTPUT',
  decisionThresholds: { entailed: 0.5 }, judge,
  calibration: { sealedLabelSetId: 'labels-1', calibratedVersionKey: judgeVersionKey(judge), agreement: 0.93, classMetrics: { unsupported: { precision: 0.95, recall: 0.97 } }, calibratedAt: '2026-11-22' },
});

test('an LLM judge needs pinned versions and a fresh calibration against a sealed human set', () => {
  assert.deepEqual(validateScorerContract(calibratedJudge()), []);
  const stale = calibratedJudge(); stale.judge = { ...judge, model: 'm2' };
  assert.match(validateScorerContract(stale).join(' '), /Calibration is stale/);
  const missing = calibratedJudge(); delete missing.calibration;
  assert.match(validateScorerContract(missing).join(' '), /requires a calibration/);
  const weak = calibratedJudge(); weak.calibration.agreement = 0.7;
  assert.match(validateScorerContract(weak).join(' '), /below 0.9/);
  const unpinned = calibratedJudge(); unpinned.judge = { ...judge, promptVersion: '' };
  assert.match(validateScorerContract(unpinned).join(' '), /provider, model, prompt, schema and configuration/);
});

test('fixed authored content is not validated by a judge; non-judge scorers carry no judge records', () => {
  const staticJudge = { ...calibratedJudge(), evaluates: 'STATIC_AUTHORED_CONTENT' };
  assert.match(validateScorerContract(staticJudge).join(' '), /static authored content/);
  const deterministic = { id: 'd', version: '1', claimSegmentation: 'x', rubricVersion: 'r', implementation: 'DETERMINISTIC', evaluates: 'STATIC_AUTHORED_CONTENT', decisionThresholds: { lint: 0 } };
  assert.deepEqual(validateScorerContract(deterministic), []);
  assert.match(validateScorerContract({ ...deterministic, judge }).join(' '), /Only an LLM_JUDGE/);
});

test('borderline, safety-critical and disagreeing cases route to a human', () => {
  assert.equal(requiresHumanAdjudication({ id: 'x', safetyCritical: true, judgeScore: 0.99 }), true);
  assert.equal(requiresHumanAdjudication({ id: 'x', safetyCritical: false, judgeScore: 0.5 }), true);
  assert.equal(requiresHumanAdjudication({ id: 'x', safetyCritical: false, judgeScore: 0.9, deterministicVerdict: 'PASS', judgeVerdict: 'FAIL' }), true);
  assert.equal(requiresHumanAdjudication({ id: 'x', safetyCritical: false, judgeScore: 0.95, deterministicVerdict: 'PASS', judgeVerdict: 'PASS' }), false);
});

// OPS-009
test('evaluator egress accepts approved synthetic material and rejects real, replayed, production or identifier-bearing text', () => {
  assert.deepEqual(evaluatorEgressViolations([{ id: 's1', provenance: 'SYNTHETIC_APPROVED', text: 'When was the roof replaced?' }]), []);
  const bad = evaluatorEgressViolations([
    { id: 'r1', provenance: 'REAL_HOMEOWNER', text: 'x' }, { id: 'r2', provenance: 'REPLAYED', text: 'x' }, { id: 'r3', provenance: 'PRODUCTION', text: 'x' }, { id: 'r4', provenance: 'UNKNOWN', text: 'x' },
    { id: 's2', provenance: 'SYNTHETIC_APPROVED', text: 'Email me at owner@example.com or 415-555-0199' },
  ]).join('\n');
  for (const id of ['r1', 'r2', 'r3', 'r4']) assert.match(bad, new RegExp(`${id}: provenance`));
  assert.match(bad, /s2: contains an email address/);
  assert.match(bad, /s2: contains a phone number/);
});

// EVAL-019
const fidelityManifest = (n = 320) => ({
  version: '1', suite: 'HOME_RECORD_READ',
  cases: Array.from({ length: n }, (_, i) => ({ id: `case-${i}`, partition: FIDELITY_PARTITIONS[i % FIDELITY_PARTITIONS.length], description: `case ${i}` })),
});

test('a fixed fidelity matrix reports partition coverage and claims no population bound (EVAL-019)', () => {
  const m = fidelityManifest();
  assert.deepEqual(validateFidelityManifest(m), []);
  const coverage = fidelityCoverage(m);
  assert.equal(coverage.distinctCases, 320);
  assert.equal(coverage.populationBound, 'NOT_CLAIMED');
  assert.deepEqual(coverage.uncovered, []);
});

test('too few cases, an uncovered partition, duplicate ids and an unsupported population claim are rejected', () => {
  assert.match(validateFidelityManifest(fidelityManifest(299)).join(' '), /299 distinct cases/);
  const gap = fidelityManifest(); gap.cases = gap.cases.filter((c) => c.partition !== 'AUTHORIZATION');
  assert.match(validateFidelityManifest(gap, 10).join(' '), /Partitions with no case: AUTHORIZATION/);
  const dup = fidelityManifest(); dup.cases.push(dup.cases[0]);
  assert.match(validateFidelityManifest(dup).join(' '), /Duplicate case ids/);
  assert.match(validateFidelityManifest({ ...fidelityManifest(), claimsPopulationBound: true }).join(' '), /sampled input distribution/);
  assert.deepEqual(validateFidelityManifest({ ...fidelityManifest(), claimsPopulationBound: true, inputDistribution: 'production read mix 2026-Q4' }), []);
});

test('a fidelity failure adds a permanent regression case and never shrinks the suite', () => {
  const m = fidelityManifest();
  const next = recordFidelityFailure(m, 'case-3', { id: 'regression-1', partition: 'UNIT', description: 'unit mismatch found in case-3' });
  assert.equal(next.cases.length, m.cases.length + 1);
  assert.equal(next.cases.find((c) => c.id === 'regression-1').permanentRegression, true);
  assert.ok(next.cases.some((c) => c.id === 'case-3'));
  assert.throws(() => recordFidelityFailure(m, 'missing', { id: 'r', partition: 'UNIT', description: 'x' }));
});

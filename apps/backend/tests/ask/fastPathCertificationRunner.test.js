const test = require('node:test'); const assert = require('node:assert/strict');
const core = require('../../scripts/lib/askFastPathCertification');

// Synthetic pool: operation OP has two rules; the resolver claims by prefix so every outcome is under the test's control.
const rulesOf = () => ['DET_OP_01', 'DET_OP_02'];
const adjacentOf = () => ['OTHER'];
const resolve = (prompt) => prompt.startsWith('a ') ? { operationId: 'OP', ruleId: 'DET_OP_01' } : prompt.startsWith('b ') ? { operationId: 'OP', ruleId: 'DET_OP_02' } : { operationId: 'GROUNDED_GUIDANCE', ruleId: null };
const rows = (n, kind, expected, prefix) => Array.from({ length: n }, (_, i) => ({ family: `${kind}-${prefix}-${i}`, prompt: `${prefix} ${kind} ${i}`, kind, pool: 'OP', expected }));

test('wilson upper bound: zero errors needs 381 trials to be below 1% (the FR-FAST-2 floor)', () => {
  assert.ok(core.wilsonUpper(0, 381) < 0.01);
  assert.ok(core.wilsonUpper(0, 380) >= 0.0099);
  assert.ok(core.wilsonUpper(0, 200) > 0.01);
  assert.ok(core.wilsonUpper(1, 381) > 0.01);
});

test('a sealed set must be human confirmed, well formed and disjoint from tuning data', () => {
  const ok = { id: 's', humanConfirmed: true, confirmedBy: 'owner', rows: rows(2, 'POSITIVE', 'OP', 'a') };
  assert.deepEqual(core.validateSealedSet(ok), []);
  assert.ok(core.validateSealedSet({ ...ok, humanConfirmed: false }).some((i) => /humanConfirmed/.test(i)));
  assert.ok(core.validateSealedSet({ ...ok, confirmedBy: '' }).some((i) => /who confirmed/.test(i)));
  assert.ok(core.validateSealedSet({ ...ok, rows: [{ ...ok.rows[0], expected: 'X' }] }).some((i) => /POSITIVE/.test(i)));
  assert.ok(core.validateSealedSet({ ...ok, rows: [{ ...ok.rows[0], kind: 'ADJACENT_NEGATIVE', expected: 'OP' }] }).some((i) => /negative row/.test(i)));
  assert.ok(core.validateSealedSet(ok, { tuningPrompts: new Set(['a positive 0']) }).some((i) => /tuning/.test(i)));
});

test('a clean pool with enough trials, floors and a balanced mixture produces valid per-rule evidence', () => {
  const all = [...rows(150, 'POSITIVE', 'OP', 'a'), ...rows(40, 'ADJACENT_NEGATIVE', 'OTHER', 'x'), ...rows(40, 'CROSS_OPERATION', 'OTHER', 'y'), ...rows(160, 'CROSS_OPERATION', 'OTHER', 'z')];
  const { OP } = core.evaluateSealedSet({ rows: all, resolve, rulesOf, adjacentOf });
  assert.equal(OP.trials, 390);
  assert.equal(OP.errors, 0);
  assert.deepEqual(OP.mixtureIssues, []);
  const evidence = OP.rules.DET_OP_01.evidence;
  assert.equal(evidence.adjacentNegativeRows, 40);
  assert.equal(evidence.crossOperationRows, 200);
  assert.equal(evidence.leaveOneRuleOutPassed, true);
  assert.deepEqual(evidence.adjacentOperationIds, ['OTHER']);
  assert.ok(evidence.incorrectUpperBound < 0.01);
});

test('a rule that claims a negative is an error attributed to that rule, fails the negatives and fails leave-one-out', () => {
  const all = [...rows(5, 'POSITIVE', 'OP', 'a'), ...rows(3, 'ADJACENT_NEGATIVE', 'OTHER', 'b')];
  const { OP } = core.evaluateSealedSet({ rows: all, resolve, rulesOf, adjacentOf });
  assert.equal(OP.errors, 3);
  assert.equal(OP.rules.DET_OP_02.wrong, 3);
  assert.equal(OP.rules.DET_OP_02.wrongPrompts.length, 3);
  assert.equal(OP.rules.DET_OP_01.wrong, 0);
  assert.equal(OP.rules.DET_OP_02.evidence.adjacentNegativesPassed, false);
  assert.equal(OP.rules.DET_OP_01.evidence.leaveOneRuleOutPassed, false);
});

test('positives above half of the trials are a mixture problem (FR-FAST-9: easy positives cannot pad the bound)', () => {
  const { OP } = core.evaluateSealedSet({ rows: [...rows(8, 'POSITIVE', 'OP', 'a'), ...rows(2, 'CROSS_OPERATION', 'OTHER', 'x')], resolve, rulesOf, adjacentOf });
  assert.ok(OP.mixtureIssues.some((i) => /positives/.test(i)));
});

test('perturbations of one prompt share a family and count as one trial', () => {
  const same = [1, 2, 3].map((i) => ({ family: 'f', prompt: `a variant ${i}`, kind: 'POSITIVE', pool: 'OP', expected: 'OP' }));
  assert.equal(core.evaluateSealedSet({ rows: same, resolve, rulesOf, adjacentOf }).OP.trials, 1);
});

test('a rule version that failed on a sealed set cannot be re-certified on it after a change (FR-FAST-8), but an unchanged re-run is allowed', () => {
  const attempts = [{ ruleId: 'DET_OP_01', version: 'v1', sealedSetId: 's', passed: false }];
  assert.equal(core.reusedAfterFailure(attempts, 'DET_OP_01', 'v2', 's'), true);
  assert.equal(core.reusedAfterFailure(attempts, 'DET_OP_01', 'v1', 's'), false);
  assert.equal(core.reusedAfterFailure(attempts, 'DET_OP_01', 'v2', 'fresh'), false);
});

const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { FAST_PATH_RULES, fastPathRuleForOperation, validateFastPathRule, isFastPathCertified, validateFastPathAggregate } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const good = { sealedFamilies: 400, incorrectHighConfidence: 0, incorrectUpperBound: 0.0095, adjacentNegativeRows: 30, crossOperationRows: 30, adjacentNegativesPassed: true, crossOperationNegativesPassed: true, perRuleFailures: 0, leaveOneRuleOutPassed: true, tuningSetId: 'tune-1', sealedSetId: 'sealed-1', certifiedAt: '2026-12-01' };

test('every non-safety routable operation is enumerated with a stable resolver hash and is demoted until certified', () => {
  const expected = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.messageRoutable && !d.safetyClass.endsWith('_BOUNDARY') && d.operationId !== 'GROUNDED_GUIDANCE');
  assert.equal(FAST_PATH_RULES.length, expected.length);
  assert.equal(new Set(FAST_PATH_RULES.map((r) => r.id)).size, FAST_PATH_RULES.length);
  for (const definition of expected) {
    const rule = fastPathRuleForOperation(definition.operationId);
    assert.ok(rule, definition.operationId); assert.match(rule.version, /^[a-f0-9]{16}$/);
    assert.equal(rule.status, 'DEMOTED'); assert.deepEqual(validateFastPathRule(rule), []); assert.equal(isFastPathCertified(rule.id), false);
  }
});

test('certification requires per-rule negatives, isolation lineage, leave-one-out and the statistical bound', () => {
  const base = FAST_PATH_RULES[0]; const rule = { ...base, status: 'CERTIFIED', evidence: good };
  assert.deepEqual(validateFastPathRule(rule), []);
  assert.match(validateFastPathRule({ ...rule, evidence: undefined })[0], /without evidence/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, sealedFamilies: 100 } })[0], /below 381/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, incorrectUpperBound: 0.01 } })[0], /below 1%/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, adjacentNegativeRows: 29 } })[0], /adjacent/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, crossOperationRows: 29 } })[0], /cross-operation/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, perRuleFailures: 1 } })[0], /requires demotion/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, leaveOneRuleOutPassed: false } })[0], /leave-one/);
  assert.match(validateFastPathRule({ ...rule, status: 'DEMOTED' })[0], /must not carry/);
});

test('aggregate certification is a separate mandatory gate', () => {
  assert.deepEqual(validateFastPathAggregate({ sealedFamilies: 400, failures: 0, incorrectUpperBound: 0.009, sealedSetId: 'sealed-1' }), []);
  assert.equal(validateFastPathAggregate({ sealedFamilies: 100, failures: 0, incorrectUpperBound: 0.02, sealedSetId: '' }).length, 3);
});

test('an uncertified deterministic match cannot make a DETERMINISTIC final claim and carries lineage', () => {
  const decision = resolveAskRoutingCascade('Show my maintenance tasks', { localRoutingEnabled: false });
  assert.equal(decision.stage, 'REMOTE_FALLBACK');
  assert.equal(decision.operation.operationId, 'GROUNDED_GUIDANCE');
  assert.equal(decision.fastPathLineage.status, 'DEMOTED');
  assert.match(decision.fastPathLineage.ruleId, /^DET_/);
  assert.ok(decision.candidates.some((candidate) => candidate.reasonCodes?.includes('FAST_PATH_DEMOTED')));
  assert.equal(resolveAskRoutingCascade('My house is on fire').stage, 'SAFETY', 'safety interception is never demoted');
});

const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { FAST_PATH_RULES, fastPathRulesForOperation, fastPathRuleForResolution, fastPathPoolOf, fastPathAdjacentOperations, validateFastPathRule, isFastPathCertified, validateFastPathAggregate } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const good = { sealedFamilies: 400, incorrectHighConfidence: 0, incorrectUpperBound: 0.0095, adjacentNegativeRows: 30, crossOperationRows: 30, adjacentNegativesPassed: true, crossOperationNegativesPassed: true, perRuleFailures: 0, leaveOneRuleOutPassed: true, tuningSetId: 'tune-1', sealedSetId: 'sealed-1', certifiedAt: '2026-12-01' };

test('every non-safety routable operation has deterministic rules, each with a stable id and its own hash, all demoted until certified', () => {
  const expected = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.messageRoutable && !d.safetyClass.endsWith('_BOUNDARY') && d.operationId !== 'GROUNDED_GUIDANCE');
  assert.equal(new Set(FAST_PATH_RULES.map((r) => r.id)).size, FAST_PATH_RULES.length);
  const unruled = [];
  for (const definition of expected) {
    const rules = fastPathRulesForOperation(definition.operationId);
    if (!rules.length) { unruled.push(definition.operationId); continue; } // reached only by the classifier, a declared action or a continuation: there is no deterministic rule to certify
    for (const rule of rules) { assert.match(rule.id, new RegExp(`^DET_${definition.operationId}_\\d{2,}$`)); assert.match(rule.version, /^[a-f0-9]{16}$/); assert.equal(rule.status, 'DEMOTED'); assert.deepEqual(validateFastPathRule(rule), []); assert.equal(isFastPathCertified(rule.id), false); }
  }
  assert.ok(unruled.length < expected.length * 0.25, `most operations have deterministic rules (${unruled.length} unruled: ${unruled.join(', ')})`);
  assert.ok(FAST_PATH_RULES.length > expected.length - unruled.length, 'rules are tracked per rule, not per operation');
  assert.ok(new Set(FAST_PATH_RULES.map((r) => r.version)).size > FAST_PATH_RULES.length * 0.9, 'rules do not share one resolver-wide hash');
});

const evidenceFor = (rule) => ({ ...good, poolRuleIds: fastPathPoolOf(rule.operationId), adjacentOperationIds: fastPathAdjacentOperations(rule.operationId) });
test('certification requires per-rule negatives, isolation lineage, leave-one-out over the current pool, adjacency coverage and the statistical bound', () => {
  const base = FAST_PATH_RULES[0]; const rule = { ...base, status: 'CERTIFIED', evidence: evidenceFor(base) };
  assert.deepEqual(validateFastPathRule(rule), []);
  assert.match(validateFastPathRule({ ...rule, evidence: undefined })[0], /without evidence/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...rule.evidence, sealedFamilies: 100 } })[0], /below 381/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...rule.evidence, incorrectUpperBound: 0.01 } })[0], /below 1%/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...rule.evidence, adjacentNegativeRows: 29 } })[0], /adjacent/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...rule.evidence, crossOperationRows: 29 } })[0], /cross-operation/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...rule.evidence, perRuleFailures: 1 } })[0], /requires demotion/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...rule.evidence, leaveOneRuleOutPassed: false } })[0], /leave-one/);
  assert.match(validateFastPathRule({ ...rule, status: 'DEMOTED' })[0], /must not carry/);
  // the leave-one-rule-out pool is the operation's CURRENT rules: a stale pool (a rule was added or removed since) does not certify
  assert.ok(validateFastPathRule({ ...rule, evidence: { ...rule.evidence, poolRuleIds: [] } }).some((i) => /pool/.test(i)));
  // and the adjacent negatives must cover every operation the operation-owned adjacency manifest names
  const withAdjacency = FAST_PATH_RULES.find((r) => fastPathAdjacentOperations(r.operationId).length > 0);
  assert.ok(withAdjacency, 'at least one operation has declared adjacency');
  assert.ok(validateFastPathRule({ ...withAdjacency, status: 'CERTIFIED', evidence: { ...evidenceFor(withAdjacency), adjacentOperationIds: [] } }).some((i) => /adjacent negatives do not cover/.test(i)));
});

test('aggregate certification is a separate mandatory gate', () => {
  assert.deepEqual(validateFastPathAggregate({ sealedFamilies: 400, failures: 0, incorrectUpperBound: 0.009, sealedSetId: 'sealed-1' }), []);
  assert.equal(validateFastPathAggregate({ sealedFamilies: 100, failures: 0, incorrectUpperBound: 0.02, sealedSetId: '' }).length, 3);
});

test('an uncertified deterministic match cannot make a DETERMINISTIC final claim and carries lineage', () => {
  const decision = resolveAskRoutingCascade('Show my warranties', { localRoutingEnabled: false });
  assert.equal(decision.stage, 'REMOTE_FALLBACK');
  assert.equal(decision.operation.operationId, 'GROUNDED_GUIDANCE');
  assert.equal(decision.fastPathLineage.status, 'DEMOTED');
  assert.match(decision.fastPathLineage.ruleId, /^DET_/);
  assert.ok(decision.candidates.some((candidate) => candidate.reasonCodes?.includes('FAST_PATH_DEMOTED')));
  assert.equal(resolveAskRoutingCascade('My house is on fire').stage, 'SAFETY', 'safety interception is never demoted');
});

test('the cascade attributes a deterministic match to the ONE rule that fired, so its lineage names that rule and its own hash', () => {
  const { resolveAskOperation, ruleIdOfResolution } = require('../../src/services/ask/askOperationRegistry.ts');
  const resolution = resolveAskOperation('Show my warranties');
  const rule = fastPathRuleForResolution(resolution);
  assert.ok(rule); assert.equal(rule.id, ruleIdOfResolution(resolution)); assert.equal(rule.operationId, resolution.operationId);
  const decision = resolveAskRoutingCascade('Show my warranties', { localRoutingEnabled: false });
  assert.equal(decision.fastPathLineage.ruleId, rule.id); assert.equal(decision.fastPathLineage.version, rule.version);
  // two different phrasings of one operation can be two different rules
  const ids = new Set(['Show my warranties', 'What maintenance is due?', 'Is my maintenance overdue?'].map((m) => ruleIdOfResolution(resolveAskOperation(m))).filter(Boolean));
  assert.ok(ids.size >= 1);
  assert.equal(fastPathRuleForResolution({ operationId: 'GROUNDED_GUIDANCE' }), null);
});

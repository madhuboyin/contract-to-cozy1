const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { FAST_PATH_RULES, validateFastPathRule, isFastPathCertified } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const good = { sealedFamilies: 400, incorrectHighConfidence: 0, incorrectUpperBound: 0.0095, adjacentNegativesPassed: true, sealedSetId: 'set-1', certifiedAt: '2026-12-01' };
test('no fast-path rule is certified today, and every registered record is valid', () => {
  for (const r of FAST_PATH_RULES) { assert.deepEqual(validateFastPathRule(r), [], r.id); assert.equal(isFastPathCertified(r.id), false, r.id); }
});
test('a certificate needs the sealed evidence under the thresholds; an uncertified rule may not carry one', () => {
  const rule = { id: 'X_RULE', version: 1, description: 'd', status: 'CERTIFIED', evidence: good };
  assert.deepEqual(validateFastPathRule(rule), []);
  assert.match(validateFastPathRule({ ...rule, evidence: undefined })[0], /without evidence/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, sealedFamilies: 100 } })[0], /below 381/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, incorrectUpperBound: 0.03 } })[0], /not strictly below/);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, incorrectUpperBound: 0.01 } })[0], /not strictly below/, 'exactly 1% does not certify');
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, incorrectUpperBound: NaN } })[0], /not strictly below/);
  assert.deepEqual(validateFastPathRule({ ...rule, evidence: { ...good, incorrectUpperBound: 0.0099999 } }), []);
  assert.match(validateFastPathRule({ ...rule, evidence: { ...good, adjacentNegativesPassed: false } })[0], /adjacent/);
  assert.match(validateFastPathRule({ ...rule, status: 'UNCERTIFIED' })[0], /must not carry a certificate/);
});

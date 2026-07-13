const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { validateRuleAst, MAX_RULE_DEPTH, MAX_CHILDREN } = require('../../src/modules/personalization/domain/ruleAst.ts');

test('accepts a simple valid trait node', () => {
  const result = validateRuleAst({ op: 'trait', key: 'hvacFilterReplacementOverdue', cmp: 'eq', value: true });
  assert.equal(result.success, true);
  assert.deepEqual(result.errors, []);
});

test('accepts a nested all/any/not tree within depth limits', () => {
  const result = validateRuleAst({
    op: 'all',
    children: [
      { op: 'trait', key: 'a', cmp: 'exists' },
      { op: 'not', child: { op: 'trait', key: 'b', cmp: 'eq', value: false } },
      { op: 'any', children: [{ op: 'trait', key: 'c', cmp: 'in', value: [1, 2] }] },
    ],
  });
  assert.equal(result.success, true);
});

test('rejects an unknown op', () => {
  const result = validateRuleAst({ op: 'eval', code: 'process.exit(1)' });
  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
});

test('rejects a fact path not on the allowlist', () => {
  const result = validateRuleAst({ op: 'fact', path: 'household.income', cmp: 'gte', value: 100000 });
  assert.equal(result.success, false);
});

test('accepts an allowlisted fact path', () => {
  const result = validateRuleAst({ op: 'fact', path: 'property.yearBuilt', cmp: 'lte', value: 1980 });
  assert.equal(result.success, true);
});

test('rejects a tree deeper than MAX_RULE_DEPTH', () => {
  let node = { op: 'trait', key: 'leaf', cmp: 'exists' };
  for (let i = 0; i < MAX_RULE_DEPTH + 2; i++) {
    node = { op: 'not', child: node };
  }
  const result = validateRuleAst(node);
  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes('exceeds MAX_RULE_DEPTH')));
});

test('rejects an all/any node with more children than MAX_CHILDREN', () => {
  const children = Array.from({ length: MAX_CHILDREN + 1 }, (_, i) => ({
    op: 'trait',
    key: `k${i}`,
    cmp: 'exists',
  }));
  const result = validateRuleAst({ op: 'all', children });
  assert.equal(result.success, false);
});

test('rejects an all/any node with zero children', () => {
  const result = validateRuleAst({ op: 'all', children: [] });
  assert.equal(result.success, false);
});

test('rejects a non-object input without crashing', () => {
  assert.equal(validateRuleAst(null).success, false);
  assert.equal(validateRuleAst('not an ast').success, false);
  assert.equal(validateRuleAst(42).success, false);
});

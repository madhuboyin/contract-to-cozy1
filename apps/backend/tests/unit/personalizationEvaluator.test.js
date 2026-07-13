const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { evaluateRule } = require('../../src/modules/personalization/domain/evaluator.ts');

test('trait op: TRUE when the comparison matches a known value', () => {
  const node = { op: 'trait', key: 'overdue', cmp: 'eq', value: true };
  const result = evaluateRule(node, { overdue: { known: true, value: true } });
  assert.equal(result.result, 'TRUE');
  assert.equal(result.eligible, true);
});

test('trait op: FALSE when the comparison does not match a known value', () => {
  const node = { op: 'trait', key: 'overdue', cmp: 'eq', value: true };
  const result = evaluateRule(node, { overdue: { known: true, value: false } });
  assert.equal(result.result, 'FALSE');
  assert.equal(result.eligible, false);
});

test('trait op: UNKNOWN when the trait is not known/present, never treated as eligible', () => {
  const node = { op: 'trait', key: 'overdue', cmp: 'eq', value: true };
  const result = evaluateRule(node, {});
  assert.equal(result.result, 'UNKNOWN');
  assert.equal(result.eligible, false);

  const resultExplicitUnknown = evaluateRule(node, { overdue: { known: false } });
  assert.equal(resultExplicitUnknown.result, 'UNKNOWN');
  assert.equal(resultExplicitUnknown.eligible, false);
});

test('trait comparators: gte/lte/in/exists', () => {
  assert.equal(
    evaluateRule({ op: 'trait', key: 'age', cmp: 'gte', value: 10 }, { age: { known: true, value: 15 } }).result,
    'TRUE',
  );
  assert.equal(
    evaluateRule({ op: 'trait', key: 'age', cmp: 'lte', value: 10 }, { age: { known: true, value: 15 } }).result,
    'FALSE',
  );
  assert.equal(
    evaluateRule({ op: 'trait', key: 'color', cmp: 'in', value: ['red', 'blue'] }, { color: { known: true, value: 'blue' } }).result,
    'TRUE',
  );
  assert.equal(
    evaluateRule({ op: 'trait', key: 'color', cmp: 'exists' }, { color: { known: true, value: null } }).result,
    'FALSE',
  );
});

test('not: flips TRUE/FALSE, leaves UNKNOWN as UNKNOWN', () => {
  const trueNode = { op: 'trait', key: 'x', cmp: 'exists' };
  assert.equal(evaluateRule({ op: 'not', child: trueNode }, { x: { known: true, value: 1 } }).result, 'FALSE');
  assert.equal(evaluateRule({ op: 'not', child: trueNode }, {}).result, 'UNKNOWN');
});

test('all (AND): FALSE dominates, then UNKNOWN, else TRUE — Kleene strong logic', () => {
  const t = { op: 'trait', key: 't', cmp: 'exists' };
  const f = { op: 'trait', key: 'f', cmp: 'exists' };
  const u = { op: 'trait', key: 'u', cmp: 'exists' };
  const traits = { t: { known: true, value: 1 }, f: { known: true, value: null } };

  assert.equal(evaluateRule({ op: 'all', children: [t, t] }, traits).result, 'TRUE');
  assert.equal(evaluateRule({ op: 'all', children: [t, f] }, traits).result, 'FALSE');
  assert.equal(evaluateRule({ op: 'all', children: [t, u] }, traits).result, 'UNKNOWN');
  // FALSE dominates even when another child is UNKNOWN.
  assert.equal(evaluateRule({ op: 'all', children: [f, u] }, traits).result, 'FALSE');
});

test('any (OR): TRUE dominates, then UNKNOWN, else FALSE — Kleene strong logic', () => {
  const t = { op: 'trait', key: 't', cmp: 'exists' };
  const f = { op: 'trait', key: 'f', cmp: 'exists' };
  const u = { op: 'trait', key: 'u', cmp: 'exists' };
  const traits = { t: { known: true, value: 1 }, f: { known: true, value: null } };

  assert.equal(evaluateRule({ op: 'any', children: [f, f] }, traits).result, 'FALSE');
  assert.equal(evaluateRule({ op: 'any', children: [t, f] }, traits).result, 'TRUE');
  assert.equal(evaluateRule({ op: 'any', children: [f, u] }, traits).result, 'UNKNOWN');
  // TRUE dominates even when another child is UNKNOWN.
  assert.equal(evaluateRule({ op: 'any', children: [t, u] }, traits).result, 'TRUE');
});

test('history/date nodes evaluate to UNKNOWN and are tagged notImplemented', () => {
  const historyResult = evaluateRule({ op: 'history', event: 'MAINTENANCE_TASK_COMPLETED', withinDays: 30 }, {});
  assert.equal(historyResult.result, 'UNKNOWN');
  assert.equal(historyResult.evidence[0].notImplemented, true);

  const dateResult = evaluateRule({ op: 'date', field: 'property.purchaseDate', cmp: 'before', value: '2020-01-01' }, {});
  assert.equal(dateResult.result, 'UNKNOWN');
  assert.equal(dateResult.evidence[0].notImplemented, true);
});

test('fact op: TRUE/FALSE when the comparison matches/does not match a known fact', () => {
  const node = { op: 'fact', path: 'property.yearBuilt', cmp: 'lte', value: 1980 };
  const facts = { 'property.yearBuilt': { known: true, value: 1975 } };
  assert.equal(evaluateRule(node, {}, facts).result, 'TRUE');

  const facts2 = { 'property.yearBuilt': { known: true, value: 2015 } };
  assert.equal(evaluateRule(node, {}, facts2).result, 'FALSE');
});

test('fact op: UNKNOWN when the fact is missing/not known, never treated as eligible', () => {
  const node = { op: 'fact', path: 'property.yearBuilt', cmp: 'lte', value: 1980 };
  assert.equal(evaluateRule(node, {}, {}).result, 'UNKNOWN');
  assert.equal(evaluateRule(node, {}, { 'property.yearBuilt': { known: false } }).result, 'UNKNOWN');
});

test('fact op is not tagged notImplemented (only history/date are)', () => {
  const node = { op: 'fact', path: 'property.zipCode', cmp: 'exists' };
  const result = evaluateRule(node, {}, { 'property.zipCode': { known: true, value: '02139' } });
  assert.equal(result.evidence[0].notImplemented, undefined);
});

test('trait and fact ops combine correctly through all/any', () => {
  const node = {
    op: 'all',
    children: [
      { op: 'trait', key: 'hvacFilterReplacementOverdue', cmp: 'eq', value: true },
      { op: 'fact', path: 'property.zipCode', cmp: 'in', value: ['02139', '02138'] },
    ],
  };
  const result = evaluateRule(
    node,
    { hvacFilterReplacementOverdue: { known: true, value: true } },
    { 'property.zipCode': { known: true, value: '02139' } },
  );
  assert.equal(result.result, 'TRUE');
  assert.equal(result.evidence.length, 2);
});

test('evidence collects one entry per leaf node in a nested tree', () => {
  const node = {
    op: 'all',
    children: [
      { op: 'trait', key: 'a', cmp: 'exists' },
      { op: 'not', child: { op: 'trait', key: 'b', cmp: 'exists' } },
    ],
  };
  const result = evaluateRule(node, { a: { known: true, value: 1 } });
  assert.equal(result.evidence.length, 2);
  assert.ok(result.evidence.every((e) => e.op === 'trait'));
});

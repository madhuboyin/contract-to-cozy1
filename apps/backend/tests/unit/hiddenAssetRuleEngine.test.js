const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildPropertyAttributeMap,
  evaluateProgram,
  isSupportedEligibilityAttribute,
} = require('../../src/services/hiddenAssets/ruleEngine.ts');
const { deriveRegionPairs } = require('../../src/services/hiddenAssets.service.ts');

const BASE_PROPERTY = {
  state: 'NJ',
  city: 'Trenton',
  zipCode: '08608',
  yearBuilt: 1990,
};

function rule(overrides) {
  return {
    id: overrides.id ?? 'rule-1',
    attribute: overrides.attribute,
    operator: overrides.operator,
    value: overrides.value,
    sortOrder: overrides.sortOrder ?? 0,
    kind: overrides.kind ?? 'MANDATORY',
    groupKey: overrides.groupKey ?? null,
  };
}

const CONTEXT = { category: 'TAX_EXEMPTION', lastVerifiedAt: new Date() };

test('county flows from Property into region pairs and the attribute map', () => {
  const pairs = deriveRegionPairs({ ...BASE_PROPERTY, county: 'Mercer' });
  assert.deepEqual(
    pairs.find((p) => p.regionType === 'COUNTY'),
    { regionType: 'COUNTY', regionValue: 'Mercer' },
  );

  const attrs = buildPropertyAttributeMap({ ...BASE_PROPERTY, county: 'Mercer' });
  assert.equal(attrs.county, 'Mercer');
});

test('no county on the property omits the COUNTY region pair', () => {
  const pairs = deriveRegionPairs(BASE_PROPERTY);
  assert.equal(pairs.some((p) => p.regionType === 'COUNTY'), false);
});

test('authoring only accepts attributes the evaluator can actually resolve', () => {
  assert.equal(isSupportedEligibilityAttribute('state'), true);
  assert.equal(isSupportedEligibilityAttribute('property.state'), true);
  assert.equal(isSupportedEligibilityAttribute('income'), true);
  assert.equal(isSupportedEligibilityAttribute('householdIncome'), true);
  assert.equal(isSupportedEligibilityAttribute('hasSolarInstalled'), false);
  assert.equal(isSupportedEligibilityAttribute('unknownFutureField'), false);
});

test('a definitively failed mandatory rule excludes the program', () => {
  const attrs = buildPropertyAttributeMap(BASE_PROPERTY);
  const program = {
    id: 'prog-1',
    benefitEstimateMin: null,
    benefitEstimateMax: null,
    rules: [rule({ attribute: 'state', operator: 'EQUALS', value: 'CA', kind: 'MANDATORY' })],
  };
  const result = evaluateProgram(attrs, program, CONTEXT);
  assert.equal(result.matched, false);
  assert.equal(result.confidenceLevel, null);
});

test('an unresolved mandatory rule keeps the program a LOW-confidence candidate with a caveat', () => {
  const attrs = buildPropertyAttributeMap(BASE_PROPERTY); // hasSolarInstalled is unmodeled -> unknown
  const program = {
    id: 'prog-2',
    benefitEstimateMin: null,
    benefitEstimateMax: null,
    rules: [
      rule({ attribute: 'state', operator: 'EQUALS', value: 'NJ', kind: 'MANDATORY' }),
      rule({ id: 'rule-2', attribute: 'hasSolarInstalled', operator: 'BOOLEAN_IS', value: 'true', kind: 'MANDATORY' }),
    ],
  };
  const result = evaluateProgram(attrs, program, CONTEXT);
  assert.equal(result.matched, true);
  assert.equal(result.confidenceLevel, 'LOW');
  assert.ok(result.matchReasons.some((r) => r.includes('still needs verification')));
});

test('a satisfied disqualifying rule excludes the program even when mandatory criteria are met', () => {
  const attrs = buildPropertyAttributeMap({ ...BASE_PROPERTY, primaryHeatingFuel: 'OIL' });
  const program = {
    id: 'prog-3',
    benefitEstimateMin: null,
    benefitEstimateMax: null,
    rules: [
      rule({ attribute: 'state', operator: 'EQUALS', value: 'NJ', kind: 'MANDATORY' }),
      rule({
        id: 'rule-2',
        attribute: 'primaryHeatingFuel',
        operator: 'EQUALS',
        value: 'OIL',
        kind: 'DISQUALIFYING',
      }),
    ],
  };
  const result = evaluateProgram(attrs, program, CONTEXT);
  assert.equal(result.matched, false);
  assert.equal(result.confidenceLevel, null);
});

test('an OR group of mandatory rules is satisfied when any member matches', () => {
  const attrs = buildPropertyAttributeMap({ ...BASE_PROPERTY, heatingType: 'HEAT_PUMP' });
  const program = {
    id: 'prog-4',
    benefitEstimateMin: null,
    benefitEstimateMax: null,
    rules: [
      rule({ attribute: 'state', operator: 'EQUALS', value: 'NJ', kind: 'MANDATORY' }),
      rule({
        id: 'rule-2',
        attribute: 'hvacType',
        operator: 'EQUALS',
        value: 'HEAT_PUMP',
        kind: 'MANDATORY',
        groupKey: 'equipment',
      }),
      rule({
        id: 'rule-3',
        attribute: 'waterHeaterType',
        operator: 'EQUALS',
        value: 'HEAT_PUMP',
        kind: 'MANDATORY',
        groupKey: 'equipment',
      }),
    ],
  };
  const result = evaluateProgram(attrs, program, CONTEXT);
  assert.equal(result.matched, true);
  assert.equal(result.confidenceLevel, 'HIGH');
});

test('optional rules only raise/lower confidence and never exclude the program', () => {
  const attrs = buildPropertyAttributeMap(BASE_PROPERTY);
  const program = {
    id: 'prog-5',
    benefitEstimateMin: null,
    benefitEstimateMax: null,
    rules: [
      rule({ attribute: 'state', operator: 'EQUALS', value: 'NJ', kind: 'MANDATORY' }),
      rule({ id: 'rule-2', attribute: 'hasSecuritySystem', operator: 'BOOLEAN_IS', value: 'true', kind: 'OPTIONAL' }),
    ],
  };
  const result = evaluateProgram(attrs, program, CONTEXT);
  assert.equal(result.matched, true);
  assert.equal(result.confidenceLevel, 'MEDIUM');
});

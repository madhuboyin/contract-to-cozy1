const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const {
  evaluatePlantAdvisorApplicability,
} = require('../../src/services/plantAdvisor/applicabilityPolicy.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'test',
    generatedAt: NOW.toISOString(),
    scopes: [],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

test('indoor Plant Advisor remains available without outdoor facts', () => {
  const decision = evaluatePlantAdvisorApplicability(snapshot({}), 'INDOOR');
  assert.equal(decision.status, 'APPLICABLE');
  assert.deepEqual(decision.missingFactKeys, []);
});

test('confirmed absence of private outdoor space suppresses garden planning', () => {
  const decision = evaluatePlantAdvisorApplicability(snapshot({
    'exterior.hasPrivateOutdoorSpace': false,
  }), 'OUTDOOR');
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['NO_PRIVATE_OUTDOOR_SPACE']);
});

test('unknown outdoor space requests context instead of assuming absence or presence', () => {
  const decision = evaluatePlantAdvisorApplicability(snapshot({
    'exterior.hasPrivateOutdoorSpace': null,
  }), 'OUTDOOR');
  assert.equal(decision.status, 'UNKNOWN');
  assert.deepEqual(decision.missingFactKeys, ['exterior.hasPrivateOutdoorSpace']);
});

test('association-managed landscaping suppresses outdoor recommendations', () => {
  const decision = evaluatePlantAdvisorApplicability(snapshot({
    'exterior.hasPrivateOutdoorSpace': true,
    'responsibility.landscaping': 'ASSOCIATION',
  }), 'OUTDOOR');
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['ASSOCIATION_RESPONSIBLE']);
});

test('private owner-managed outdoor space enables garden planning', () => {
  const decision = evaluatePlantAdvisorApplicability(snapshot({
    'exterior.hasPrivateOutdoorSpace': true,
    'responsibility.landscaping': 'OWNER',
  }), 'OUTDOOR');
  assert.equal(decision.status, 'APPLICABLE');
});

test('Plant Advisor uses context policy for reads and outdoor writes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/services/plantCarePlanner.service.ts'), 'utf8');
  assert.match(source, /evaluatePlantAdvisorApplicability/);
  assert.match(source, /assertOutdoorApplicable/);
  assert.doesNotMatch(source, /property\.hasIrrigation/);
});

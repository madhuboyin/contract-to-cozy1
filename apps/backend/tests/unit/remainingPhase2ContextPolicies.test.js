const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateEnvironmentApplicability } = require('../../src/services/environment/applicabilityPolicy.ts');
const { evaluateEnergyApplicability } = require('../../src/services/energy/applicabilityPolicy.ts');
const { evaluateHomeModificationApplicability } = require('../../src/services/homeModification/applicabilityPolicy.ts');
const { evaluateDiyApplicability } = require('../../src/services/diy/applicabilityPolicy.ts');
const { evaluateEmergencyContext } = require('../../src/services/emergency/applicabilityPolicy.ts');

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

test('Environment Report exposes unknown location without assuming a usable address', () => {
  const result = evaluateEnvironmentApplicability(snapshot({}));
  assert.equal(result.feature.status, 'UNKNOWN');
  assert.ok(result.feature.missingFactKeys.includes('location.zipCode'));
});

test('Environment HVAC capture is suppressed when an association owns the system work', () => {
  const result = evaluateEnvironmentApplicability(snapshot({
    'location.zipCode': '10001',
    'systems.heatingType': 'HVAC',
    'systems.coolingType': 'CENTRAL_AC',
    'systems.installedItemTypes': ['HVAC'],
    'responsibility.hvac': 'ASSOCIATION',
  }));
  assert.equal(result.hvacFilterMaintenance.status, 'NOT_APPLICABLE');
  assert.deepEqual(result.hvacFilterMaintenance.reasonCodes, ['ASSOCIATION_RESPONSIBLE']);
});

test('Energy Audit requires a canonical location and property size baseline', () => {
  const result = evaluateEnergyApplicability(snapshot({ 'location.state': 'NY' }));
  assert.equal(result.feature.status, 'UNKNOWN');
  assert.ok(result.feature.missingFactKeys.includes('core.propertySizeSqFt'));
});

test('Energy Audit distinguishes absent pool recommendations from an unknown pool fact', () => {
  const result = evaluateEnergyApplicability(snapshot({
    'location.state': 'NY',
    'core.propertySizeSqFt': 1600,
    'exterior.hasPoolOrSpa': false,
  }));
  assert.equal(result.feature.status, 'APPLICABLE');
  assert.equal(result.poolRecommendations.status, 'NOT_APPLICABLE');
});

test('Home Upgrades removes outdoor projects for a property without private outdoor space', () => {
  const result = evaluateHomeModificationApplicability(snapshot({
    'core.dwellingType': 'CONDO',
    'exterior.hasPrivateOutdoorSpace': false,
  }));
  assert.equal(result.feature.status, 'APPLICABLE');
  assert.equal(result.outdoor.status, 'NOT_APPLICABLE');
});

test('DIY property applicability is separate from skill and blocks landlord landscaping work', () => {
  const result = evaluateDiyApplicability(snapshot({
    'exterior.hasPrivateOutdoorSpace': true,
    'responsibility.landscaping': 'LANDLORD',
  }), 'LANDSCAPING');
  assert.equal(result.status, 'NOT_APPLICABLE');
  assert.deepEqual(result.reasonCodes, ['LANDLORD_RESPONSIBLE']);
});

test('DIY does not infer HVAC presence from missing system facts', () => {
  const result = evaluateDiyApplicability(snapshot({
    'responsibility.hvac': 'OWNER',
  }), 'HVAC');
  assert.equal(result.status, 'UNKNOWN');
});

test('Emergency Help preserves the safety floor when all property facts are unknown', () => {
  const result = evaluateEmergencyContext(snapshot({}));
  assert.equal(result.applicability.status, 'APPLICABLE');
  assert.deepEqual(result.applicability.reasonCodes, ['SAFETY_CONTEXT_PARTIAL']);
  assert.match(result.promptContext, /Do not assume/);
});

test('remaining Phase 2 generation and persistence paths call their context policies', () => {
  const sources = [
    '../../src/services/environmentReport.service.ts',
    '../../src/routes/energyAuditor.routes.ts',
    '../../src/services/homeModificationAdvisor.service.ts',
    '../../src/services/diy.service.ts',
    '../../src/services/diyAiGuide.service.ts',
    '../../src/routes/emergency.routes.ts',
  ].map((relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8'));
  assert.match(sources[0], /evaluateEnvironmentApplicability/);
  assert.match(sources[1], /evaluateEnergyApplicability/);
  assert.match(sources[2], /applicability\.outdoor/);
  assert.match(sources[3], /evaluateDiyApplicability/);
  assert.match(sources[4], /evaluateDiyApplicability/);
  assert.match(sources[5], /evaluateEmergencyContext/);
  assert.doesNotMatch(sources[5], /getPropertyContextForAI/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  computeRadarImpact,
  RADAR_IMPACT_DRIVER_CODES,
  RADAR_IMPACT_RULE_VERSION,
} = require('../../src/modules/homeEventRadar/domain/radarImpactRules');

const EVALUATED_AT = new Date('2026-07-26T12:00:00.000Z');

function property(overrides = {}) {
  return {
    id: 'property-1',
    yearBuilt: 1950,
    roofType: 'SHINGLE',
    roofReplacementYear: null,
    heatingType: 'FURNACE',
    coolingType: 'CENTRAL_AC',
    hvacInstallYear: null,
    waterHeaterType: 'TANKLESS',
    waterHeaterInstallYear: null,
    hasIrrigation: false,
    hasDrainageIssues: false,
    hasSumpPump: false,
    hasSumpPumpBackup: null,
    primaryHeatingFuel: 'gas',
    hasSecondaryHeat: true,
    foundationType: 'SLAB',
    propertySize: 2200,
    dwellingType: 'SINGLE_FAMILY',
    zipCode: '08536',
    city: 'Plainsboro',
    state: 'NJ',
    responsibilities: [],
    ...overrides,
  };
}

function event(eventType, severity = 'medium') {
  return { eventType, eventSubType: null, severity };
}

function driverCodes(result) {
  return result.impactFactorsJson.drivers.map((driver) => driver.code);
}

function missingCodes(result) {
  return result.impactFactorsJson.missingFacts.map((fact) => fact.reasonCode);
}

test('construction year is never substituted for an explicit roof installation year', () => {
  const unknownRoofAge = computeRadarImpact(event('hail'), property(), EVALUATED_AT);
  assert.equal(unknownRoofAge.matchScore, 0.45);
  assert.doesNotMatch(unknownRoofAge.impactSummary, /1950|76-year|older roof/i);
  assert.deepEqual(driverCodes(unknownRoofAge), []);
  assert.ok(missingCodes(unknownRoofAge).includes('ROOF_REPLACEMENT_YEAR_UNKNOWN'));

  const confirmedOlderRoof = computeRadarImpact(
    event('hail'),
    property({ roofReplacementYear: 2005 }),
    EVALUATED_AT,
  );
  assert.equal(confirmedOlderRoof.matchScore, 0.6);
  assert.deepEqual(driverCodes(confirmedOlderRoof), ['OLDER_ROOF']);
  assert.deepEqual(
    confirmedOlderRoof.impactFactorsJson.drivers[0].factKeys,
    ['property.roofReplacementYear'],
  );
});

test('construction year is not reused for HVAC or water-heater age', () => {
  const result = computeRadarImpact(
    event('freeze'),
    property({
      yearBuilt: 1920,
      waterHeaterType: 'TANK',
      waterHeaterInstallYear: null,
      hvacInstallYear: null,
      hasSecondaryHeat: true,
    }),
    EVALUATED_AT,
  );
  assert.equal(result.matchScore, 0.45);
  assert.ok(!driverCodes(result).includes('AGING_HVAC'));
  assert.ok(!driverCodes(result).includes('AGING_TANK_WATER_HEATER'));
  assert.ok(missingCodes(result).includes('HVAC_INSTALL_YEAR_UNKNOWN'));
  assert.ok(missingCodes(result).includes('WATER_HEATER_INSTALL_YEAR_UNKNOWN'));
});

test('unknown cooling is missing evidence, not a confirmed vulnerability', () => {
  const result = computeRadarImpact(
    event('heat_wave'),
    property({ coolingType: 'UNKNOWN', hvacInstallYear: 2000 }),
    EVALUATED_AT,
  );
  assert.equal(result.matchScore, 0.45);
  assert.ok(missingCodes(result).includes('COOLING_TYPE_UNKNOWN'));
  assert.ok(!driverCodes(result).includes('AGING_HVAC'));
  assert.ok(
    result.recommendedActionsJson.actions.some(
      (action) => action.code === 'VERIFY_COOLING',
    ),
  );
});

test('unknown, false, and true boolean facts have distinct freeze outcomes', () => {
  const common = {
    hasIrrigation: false,
    waterHeaterType: 'TANKLESS',
    hvacInstallYear: 2020,
  };
  const unknown = computeRadarImpact(
    event('freeze'),
    property({ ...common, hasSecondaryHeat: null }),
    EVALUATED_AT,
  );
  const confirmedAbsent = computeRadarImpact(
    event('freeze'),
    property({ ...common, hasSecondaryHeat: false }),
    EVALUATED_AT,
  );
  const confirmedPresent = computeRadarImpact(
    event('freeze'),
    property({ ...common, hasSecondaryHeat: true }),
    EVALUATED_AT,
  );

  assert.equal(unknown.matchScore, 0.45);
  assert.ok(missingCodes(unknown).includes('SECONDARY_HEAT_PRESENCE_UNKNOWN'));
  assert.ok(!driverCodes(unknown).includes('NO_SECONDARY_HEAT'));

  assert.equal(confirmedAbsent.matchScore, 0.55);
  assert.ok(driverCodes(confirmedAbsent).includes('NO_SECONDARY_HEAT'));
  assert.ok(!missingCodes(confirmedAbsent).includes('SECONDARY_HEAT_PRESENCE_UNKNOWN'));

  assert.equal(confirmedPresent.matchScore, 0.45);
  assert.ok(!driverCodes(confirmedPresent).includes('NO_SECONDARY_HEAT'));
  assert.ok(!missingCodes(confirmedPresent).includes('SECONDARY_HEAT_PRESENCE_UNKNOWN'));
});

test('sump-pump backup risk only applies to a confirmed pump without backup', () => {
  const unknownPump = computeRadarImpact(
    event('flood_risk'),
    property({ hasSumpPump: null, hasSumpPumpBackup: false }),
    EVALUATED_AT,
  );
  const noPump = computeRadarImpact(
    event('flood_risk'),
    property({ hasSumpPump: false, hasSumpPumpBackup: false }),
    EVALUATED_AT,
  );
  const unprotectedPump = computeRadarImpact(
    event('flood_risk'),
    property({ hasSumpPump: true, hasSumpPumpBackup: false }),
    EVALUATED_AT,
  );

  assert.ok(!driverCodes(unknownPump).includes('NO_SUMP_BACKUP'));
  assert.ok(missingCodes(unknownPump).includes('SUMP_PUMP_PRESENCE_UNKNOWN'));
  assert.ok(!driverCodes(noPump).includes('NO_SUMP_BACKUP'));
  assert.ok(driverCodes(unprotectedPump).includes('NO_SUMP_BACKUP'));
  assert.equal(unprotectedPump.matchScore, 0.55);
});

test('confirmed responsibility redirects actions without reducing property impact', () => {
  const owner = computeRadarImpact(
    event('wind', 'high'),
    property({
      roofReplacementYear: 2000,
      responsibilities: [{ scope: 'ROOF', party: 'OWNER' }],
    }),
    EVALUATED_AT,
  );
  const association = computeRadarImpact(
    event('wind', 'high'),
    property({
      roofReplacementYear: 2000,
      responsibilities: [{ scope: 'ROOF', party: 'ASSOCIATION' }],
    }),
    EVALUATED_AT,
  );

  assert.equal(owner.matchScore, association.matchScore);
  const ownerRoofAction = owner.recommendedActionsJson.actions.find(
    (action) => action.code === 'INSPECT_ROOF',
  );
  const associationRoofAction = association.recommendedActionsJson.actions.find(
    (action) => action.code === 'INSPECT_ROOF',
  );
  assert.equal(ownerRoofAction.applicability, 'owner_action');
  assert.equal(ownerRoofAction.responsibleParty, 'OWNER');
  assert.equal(associationRoofAction.applicability, 'coordinate');
  assert.equal(associationRoofAction.responsibleParty, 'ASSOCIATION');
  assert.match(associationRoofAction.label, /^Contact your association to /);
  assert.deepEqual(
    association.impactFactorsJson.responsibilityDecisions.find(
      (decision) => decision.scope === 'ROOF',
    ),
    { scope: 'ROOF', party: 'ASSOCIATION', decision: 'coordinate' },
  );
});

test('outputs are deterministic, rule-versioned, and trace every fact used', () => {
  const input = property({
    coolingType: 'CENTRAL_AC',
    hvacInstallYear: 2008,
    responsibilities: [{ scope: 'HVAC', party: 'SHARED' }],
  });
  const first = computeRadarImpact(event('heat_wave'), input, EVALUATED_AT);
  const replay = computeRadarImpact(event('heat_wave'), input, EVALUATED_AT);

  assert.deepEqual(replay, first);
  assert.equal(first.ruleVersion, RADAR_IMPACT_RULE_VERSION);
  assert.equal(first.impactFactorsJson.ruleVersion, RADAR_IMPACT_RULE_VERSION);
  assert.equal(first.impactFactorsJson.evaluatedAt, EVALUATED_AT.toISOString());
  assert.deepEqual(
    first.impactFactorsJson.inputFacts.map((fact) => fact.factKey),
    [
      'event.eventSubType',
      'event.eventType',
      'event.severity',
      'property.coolingType',
      'property.hvacInstallYear',
      'responsibility.BUILDING_EXTERIOR',
      'responsibility.HVAC',
    ],
  );
  assert.ok(driverCodes(first).includes('AGING_HVAC'));
});

test('driver-code registry is stable and duplicate-free', () => {
  assert.deepEqual(RADAR_IMPACT_DRIVER_CODES, [
    'OLDER_ROOF',
    'FREEZE_EXPOSURE_IRRIGATION',
    'AGING_TANK_WATER_HEATER',
    'NO_SECONDARY_HEAT',
    'AGING_HVAC',
    'KNOWN_DRAINAGE_ISSUES',
    'NO_SUMP_BACKUP',
    'BELOW_GRADE_FOUNDATION',
    'ELECTRIC_DEPENDENT_HEATING',
  ]);
  assert.equal(new Set(RADAR_IMPACT_DRIVER_CODES).size, RADAR_IMPACT_DRIVER_CODES.length);
});

test('pure impact rule module has no database or service dependency', () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../src/modules/homeEventRadar/domain/radarImpactRules.ts',
    ),
    'utf8',
  );
  assert.doesNotMatch(source, /from ['"].*(prisma|service|repository|client)/i);
  assert.doesNotMatch(source, /\bprisma\b|\$queryRaw|findMany|findUnique/);
});

test('database matcher delegates impact decisions and loads canonical responsibilities', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/homeEventRadarMatcher.service.ts'),
    'utf8',
  );
  assert.match(source, /computeRadarImpact\(event, property, evaluatedAt\)/);
  assert.match(source, /responsibilities:\s*\{\s*select:\s*\{\s*scope: true,\s*party: true/s);
  assert.match(
    source,
    /matcherVersion = `\$\{matchExplanation\.matcherVersion\}\+\$\{impact\.ruleVersion\}`/,
  );
  assert.doesNotMatch(source, /function computeWeather|function computeImpact/);
});

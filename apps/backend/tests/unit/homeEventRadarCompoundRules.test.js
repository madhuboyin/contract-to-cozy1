const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  evaluateRadarCompoundRules,
  RADAR_COMPOUND_RULE_VERSION,
} = require('../../src/modules/homeEventRadar/domain/radarCompoundRules');

const NOW = new Date('2026-07-27T12:00:00.000Z');

function event(eventType, overrides = {}) {
  return {
    matchId: `match-${eventType}`,
    eventId: `event-${eventType}`,
    eventType,
    eventSubType: null,
    severity: 'high',
    effectiveAt: '2026-07-27T10:00:00.000Z',
    expiresAt: '2026-07-28T10:00:00.000Z',
    lifecycleStatus: 'now',
    sourceFreshnessStatus: 'fresh',
    sourceDefinitionId: `source-${eventType}`,
    sourceName: `${eventType} source`,
    provider: `${eventType} provider`,
    canonicalUrl: `https://example.gov/${eventType}`,
    ...overrides,
  };
}

function facts(overrides = {}) {
  return {
    hasSumpPump: false,
    hasSumpPumpBackup: null,
    primaryHeatingFuel: 'gas',
    hvacFilterState: 'current',
    unresolvedRoofIssue: false,
    ...overrides,
  };
}

function evaluate(events, propertyFacts = facts()) {
  return evaluateRadarCompoundRules({
    propertyId: 'property-1',
    events,
    facts: propertyFacts,
    evaluatedAt: NOW,
  });
}

test('rain, outage, and unconfirmed sump backup produce deterministic source-preserving insight', () => {
  const rain = event('heavy_rain', { severity: 'medium' });
  const outage = event('utility_outage', { severity: 'critical' });
  const first = evaluate(
    [rain, outage],
    facts({ hasSumpPump: true, hasSumpPumpBackup: null }),
  );
  const replay = evaluate(
    [outage, rain],
    facts({ hasSumpPump: true, hasSumpPumpBackup: null }),
  );

  assert.equal(first.length, 1);
  assert.equal(first[0].ruleCode, 'HEAVY_RAIN_OUTAGE_SUMP_BACKUP');
  assert.equal(first[0].ruleVersion, RADAR_COMPOUND_RULE_VERSION);
  assert.equal(first[0].correlationKey, replay[0].correlationKey);
  assert.equal(first[0].derivedSeverity, null);
  assert.equal(first[0].severityPolicy, 'preserve_constituent_severity');
  assert.deepEqual(
    first[0].sourceEvidence.map((source) => source.severity).sort(),
    ['critical', 'medium'],
  );
  assert.deepEqual(first[0].recommendedActions.map((action) => action.code), [
    'INSPECT_SUMP_PUMP',
  ]);
  assert.equal(
    first[0].factEvidence.find((fact) => fact.factKey === 'property.hasSumpPumpBackup').state,
    'unknown',
  );
});

test('rain and outage do not infer a sump vulnerability when no pump is confirmed', () => {
  assert.deepEqual(
    evaluate(
      [event('heavy_rain'), event('utility_outage')],
      facts({ hasSumpPump: false, hasSumpPumpBackup: false }),
    ),
    [],
  );
});

test('stale, terminal, and non-overlapping constituents fail closed', () => {
  const rain = event('heavy_rain');
  const propertyFacts = facts({ hasSumpPump: true, hasSumpPumpBackup: false });
  assert.deepEqual(
    evaluate([
      rain,
      event('utility_outage', { sourceFreshnessStatus: 'stale' }),
    ], propertyFacts),
    [],
  );
  assert.deepEqual(
    evaluate([
      rain,
      event('utility_outage', { lifecycleStatus: 'recently_ended' }),
    ], propertyFacts),
    [],
  );
  assert.deepEqual(
    evaluate([
      rain,
      event('utility_outage', {
        effectiveAt: '2026-07-29T10:00:00.000Z',
        expiresAt: '2026-07-30T10:00:00.000Z',
        lifecycleStatus: 'upcoming',
      }),
    ], propertyFacts),
    [],
  );
});

test('freeze plus outage applies only to confirmed electric primary heat', () => {
  const events = [event('freeze'), event('utility_outage')];
  assert.deepEqual(evaluate(events, facts({ primaryHeatingFuel: null })), []);
  assert.deepEqual(evaluate(events, facts({ primaryHeatingFuel: 'gas' })), []);

  const result = evaluate(events, facts({ primaryHeatingFuel: 'electric' }));
  assert.equal(result.length, 1);
  assert.equal(result[0].ruleCode, 'FREEZE_OUTAGE_ELECTRIC_HEAT');
  assert.deepEqual(result[0].recommendedActions.map((action) => action.code), [
    'PREPARE_BACKUP_HEAT',
  ]);
});

test('upcoming freeze inside the reviewed horizon can correlate with an active outage', () => {
  const result = evaluate(
    [
      event('freeze', {
        effectiveAt: '2026-07-29T00:00:00.000Z',
        lifecycleStatus: 'upcoming',
      }),
      event('utility_outage', {
        expiresAt: '2026-07-30T10:00:00.000Z',
      }),
    ],
    facts({ primaryHeatingFuel: 'electric' }),
  );
  assert.equal(result[0].ruleCode, 'FREEZE_OUTAGE_ELECTRIC_HEAT');
});

test('smoke insight distinguishes due, unknown, and current filter evidence', () => {
  const smoke = [event('wildfire_smoke')];
  const due = evaluate(smoke, facts({ hvacFilterState: 'due' }));
  const unknown = evaluate(smoke, facts({ hvacFilterState: 'unknown' }));
  const current = evaluate(smoke, facts({ hvacFilterState: 'current' }));

  assert.equal(due[0].ruleCode, 'SMOKE_HVAC_FILTER');
  assert.equal(due[0].factEvidence[0].state, 'due');
  assert.equal(unknown[0].factEvidence[0].state, 'unknown');
  assert.deepEqual(current, []);
});

test('open roof issue correlates only with provider-reported severe weather', () => {
  const mediumWind = evaluate(
    [event('wind', { severity: 'medium' })],
    facts({ unresolvedRoofIssue: true }),
  );
  const highWind = evaluate(
    [event('wind', { severity: 'high' })],
    facts({ unresolvedRoofIssue: true }),
  );
  const highEarthquake = evaluate(
    [event('earthquake', { severity: 'high' })],
    facts({ unresolvedRoofIssue: true }),
  );

  assert.deepEqual(mediumWind, []);
  assert.equal(highWind[0].ruleCode, 'SEVERE_WEATHER_OPEN_ROOF_ISSUE');
  assert.equal(highWind[0].sourceEvidence[0].severity, 'high');
  assert.deepEqual(highEarthquake, []);
});

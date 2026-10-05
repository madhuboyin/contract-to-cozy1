const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { evaluateSeasonalTemplateApplicability } = require('../../src/services/seasonal/applicabilityPolicy.ts');
const { evaluateRadarCompoundRules } = require('../../src/modules/homeEventRadar/domain/radarCompoundRules.ts');

// ASK_COZY_EXACT_FOUR_REGISTRY_PACKET D2: executed proof that a candidate profile fact CHANGES a live consumer's decision. This is
// evidence for the consumer matrix only; it does not prove the fact is asked, captured or weighted correctly.

const known = (value) => ({ value, state: 'KNOWN', validUntil: null });
const snapshot = (facts) => ({ propertyId: 'p1', facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, known(v)])) });
const decide = (facts, template) => evaluateSeasonalTemplateApplicability(snapshot(facts), { priority: 'MEDIUM', requiredAssetCheck: null, requiredAssetType: null, ...template });

// [fact, value that flips the decision, template, expected status when absent/false, expected reason]
const SEASONAL_PRESENCE = [
  ['exterior.hasLawn', false, { taskKey: 'FALL_LAWN_AERATE', requiredAssetCheck: 'has_lawn' }, 'LAWN_NOT_PRESENT'],
  ['exterior.hasPoolOrSpa', false, { taskKey: 'POOL_CLOSE', requiredAssetCheck: 'has_pool' }, 'POOL_SPA_NOT_PRESENT'],
  ['exterior.hasDriveway', false, { taskKey: 'DRIVEWAY_SEAL', requiredAssetCheck: 'has_driveway' }, 'DRIVEWAY_NOT_PRESENT'],
  ['exterior.hasIrrigation', false, { taskKey: 'WINTERIZE_SPRINKLERS', requiredAssetCheck: 'has_sprinkler_system' }, 'IRRIGATION_NOT_PRESENT'],
  ['location.isCoastal', false, { taskKey: 'SALT_SPRAY_RINSE', requiredAssetCheck: 'is_coastal' }, 'NOT_COASTAL'],
  ['exterior.hasOutdoorFaucets', false, { taskKey: 'SHUT_OFF_OUTDOOR_FAUCETS' }, 'OUTDOOR_FAUCET_NOT_PRESENT'],
  ['exterior.hasTreesOrShrubs', false, { taskKey: 'TREE_TRIM' }, 'TREES_SHRUBS_NOT_PRESENT'],
  ['safety.hasCoDetectors', false, { taskKey: 'TEST_CO_DETECTOR' }, 'CO_DETECTOR_NOT_PRESENT'],
];

for (const [factKey, value, template, reason] of SEASONAL_PRESENCE) {
  test(`seasonal applicability consumes ${factKey}: unknown asks, false removes the task, true keeps it`, () => {
    const unknown = decide({}, template);
    assert.equal(unknown.status, 'UNKNOWN', `${factKey} unknown`);
    assert.ok(unknown.missingFactKeys.includes(factKey));
    const absent = decide({ [factKey]: value }, template);
    assert.equal(absent.status, 'NOT_APPLICABLE');
    assert.ok(absent.reasonCodes.includes(reason));
    // Once present, the task falls through to the responsibility check, which still needs its own fact.
    const present = decide({ [factKey]: !value, 'responsibility.landscaping': 'OWNER', 'responsibility.roof': 'OWNER', 'responsibility.treesShrubs': 'OWNER', 'responsibility.plumbing': 'OWNER' }, template);
    assert.notEqual(present.status, 'NOT_APPLICABLE');
  });
}

test('seasonal applicability: outdoorSpaceTypes and hasPrivateOutdoorSpace decide whether a deck task applies (prerequisite pair)', () => {
  const deck = { taskKey: 'DECK_STAIN', requiredAssetCheck: 'has_deck' };
  assert.equal(decide({}, deck).status, 'UNKNOWN');
  assert.equal(decide({ 'exterior.hasPrivateOutdoorSpace': false }, deck).status, 'NOT_APPLICABLE');
  assert.equal(decide({ 'exterior.hasPrivateOutdoorSpace': true, 'exterior.outdoorSpaceTypes': ['PATIO'] }, deck).status, 'NOT_APPLICABLE');
  assert.notEqual(decide({ 'exterior.outdoorSpaceTypes': ['DECK'], 'responsibility.deckPatioBalcony': 'OWNER' }, deck).status, 'NOT_APPLICABLE');
});

test('seasonal applicability: responsibility.treesShrubs and responsibility.snowIce gate their tasks (ASSOCIATION or LANDLORD removes them)', () => {
  const tree = { taskKey: 'TREE_TRIM' };
  const snow = { taskKey: 'SNOW_REMOVAL_PREP' };
  assert.equal(decide({ 'exterior.hasTreesOrShrubs': true }, tree).status, 'UNKNOWN');
  assert.equal(decide({ 'exterior.hasTreesOrShrubs': true, 'responsibility.treesShrubs': 'ASSOCIATION' }, tree).status, 'NOT_APPLICABLE');
  assert.equal(decide({ 'exterior.hasTreesOrShrubs': true, 'responsibility.treesShrubs': 'OWNER' }, tree).status, 'APPLICABLE');
  assert.equal(decide({}, snow).status, 'UNKNOWN');
  assert.equal(decide({ 'responsibility.snowIce': 'LANDLORD' }, snow).status, 'NOT_APPLICABLE');
  assert.equal(decide({ 'responsibility.snowIce': 'OWNER' }, snow).status, 'APPLICABLE');
});

const rain = { matchId: 'm1', eventId: 'e1', eventType: 'heavy_rain', severity: 'high', effectiveAt: '2026-10-04T10:00:00Z', expiresAt: '2026-10-04T20:00:00Z', lifecycleStatus: 'now', sourceFreshnessStatus: 'fresh' };
const outage = { ...rain, matchId: 'm2', eventId: 'e2', eventType: 'utility_outage' };
const radar = (facts) => evaluateRadarCompoundRules({
  propertyId: 'p1', events: [rain, outage], evaluatedAt: new Date('2026-10-04T12:00:00Z'),
  facts: { hasSumpPump: null, hasSumpPumpBackup: null, primaryHeatingFuel: null, hvacFilterState: 'unknown', unresolvedRoofIssue: null, unresolvedGutterOrDrainageIssue: null, ...facts },
});

test('Home Event Radar compound rules consume safety.hasSumpPump and hasSumpPumpBackup', () => {
  assert.equal(radar({}).filter((i) => i.ruleCode === 'HEAVY_RAIN_OUTAGE_SUMP_BACKUP').length, 0, 'sump presence unknown: no insight');
  assert.equal(radar({ hasSumpPump: false }).filter((i) => i.ruleCode === 'HEAVY_RAIN_OUTAGE_SUMP_BACKUP').length, 0, 'no sump pump: not relevant');
  assert.equal(radar({ hasSumpPump: true, hasSumpPumpBackup: true }).filter((i) => i.ruleCode === 'HEAVY_RAIN_OUTAGE_SUMP_BACKUP').length, 0, 'backup present: not relevant');
  assert.equal(radar({ hasSumpPump: true, hasSumpPumpBackup: false }).filter((i) => i.ruleCode === 'HEAVY_RAIN_OUTAGE_SUMP_BACKUP').length, 1, 'sump without backup: insight');
  assert.equal(radar({ hasSumpPump: true, hasSumpPumpBackup: null }).filter((i) => i.ruleCode === 'HEAVY_RAIN_OUTAGE_SUMP_BACKUP').length, 1, 'backup unknown still raises it');
});

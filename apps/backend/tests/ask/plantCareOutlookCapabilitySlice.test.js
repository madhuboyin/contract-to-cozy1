const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.55: PLANT_CARE_OUTLOOK (Plant Advisor care outlook), the seventh new Ask operation for
// a capability the Appendix D audit found with none. getOutlook is stubbed for the answer tests; the sourceStatus tests
// run the real getOutlook against a fake prisma and stubbed weather, air-quality, drought and hardiness lookups.

const prismaModule = require('../../src/lib/prisma.ts');
const { plantCareOutlookFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { PlantCarePlannerService } = require('../../src/services/plantCarePlanner.service.ts');
const weatherModule = require('../../src/services/environment/weatherReport.service.ts');
const airModule = require('../../src/services/environment/airQuality.service.ts');
const droughtModule = require('../../src/services/environment/drought.service.ts');
const hardinessModule = require('../../src/services/environment/hardinessZone.service.ts');
const fipsModule = require('../../src/services/environment/fipsResolver.service.ts');

const PAGE = '/dashboard/properties/p1/tools/plant-advisor';
const NOTE = 'Bought from the corner nursery, keep away from the cat';
const originals = {
  prisma: prismaModule.prisma,
  getOutlook: PlantCarePlannerService.prototype.getOutlook,
  getContext: PlantCarePlannerService.prototype.getContext,
  weather: weatherModule.getWeatherReport, air: airModule.getAirQuality, drought: droughtModule.getDrought,
  hardiness: hardinessModule.getHardinessZone, fips: fipsModule.resolveCountyFips,
};
let calls;

const applicable = (status = 'APPLICABLE', reasonCodes = ['PRIVATE_OUTDOOR_SPACE_CONFIRMED']) => ({ status, reasonCodes, usedFactKeys: [], missingFactKeys: [], conflictedFactKeys: [], validUntil: null });
const allOk = { weather: 'OK', airQuality: 'OK', drought: 'OK', hardiness: 'OK' };
const outlook = (overrides = {}) => ({
  applicability: { feature: applicable(), indoor: applicable(), outdoor: applicable() },
  signals: { heat: true, freeze: false, storm: false, lowHumidity: false, poorAirQuality: false, heavyRain: false, droughtCategory: null },
  sourceStatus: allOk,
  hardinessZone: '7b',
  plants: [{ id: 'fern', name: 'Boston fern', notes: NOTE }, { id: 'cactus', name: 'Cactus', notes: NOTE }],
  zones: [{ id: 'z1', name: 'Front bed' }],
  careRecommendations: [
    { id: 'cactus:heat', homePlantId: 'cactus', plantName: 'Cactus', locationName: 'Office', priority: 'SOON', title: 'Adjust care for heat', guidance: 'Check soil moisture more often.', wateringCadenceDays: 14, adjustedCheckCadenceDays: 11, placementWarning: null, triggers: ['heat'] },
    { id: 'fern:heat', homePlantId: 'fern', plantName: 'Boston fern', locationName: 'Living room', priority: 'NOW', title: 'Adjust care for heat', guidance: 'Watering was recorded 6 days ago.', wateringCadenceDays: 7, adjustedCheckCadenceDays: 5, placementWarning: 'Watch for leaf stress near hot windows.', triggers: ['heat', 'low_humidity'] },
  ],
  gardenRecommendations: [
    { id: 'z1:SUMMER:SEASONAL', gardenZoneId: 'z1', zoneName: 'Front bed', title: 'Summer plan for Front bed', guidance: 'Seasonal', priority: 'SEASONAL', season: 'SUMMER', hardinessZone: '7b', actions: ['Inspect mulch depth.'] },
  ],
  ...overrides,
});

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  PlantCarePlannerService.prototype.getOutlook = async function (...args) { calls.push(args); return outlook(); };
}

function restore() {
  prismaModule.prisma = originals.prisma;
  PlantCarePlannerService.prototype.getOutlook = originals.getOutlook;
  PlantCarePlannerService.prototype.getContext = originals.getContext;
  weatherModule.getWeatherReport = originals.weather;
  airModule.getAirQuality = originals.air;
  droughtModule.getDrought = originals.drought;
  hardinessModule.getHardinessZone = originals.hardiness;
  fipsModule.resolveCountyFips = originals.fips;
}

test.beforeEach(install);
test.afterEach(restore);

test('the operation reads getOutlook with the asking user, behind the page\'s viewer floor', async () => {
  const envelope = { userId: 'u1', propertyId: 'p1', message: 'Show my plant care outlook' };
  const viewer = await capabilityInvoke('PLANT_CARE_OUTLOOK', envelope, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['p1', 'u1']]);
  assert.equal(viewer.reasonCode, 'PLANT_CARE_OUTLOOK_READY');
});

test('care changes are grouped now, soon, routine, with garden zone plans; plant notes never appear', () => {
  const result = plantCareOutlookFromView(outlook(), 'p1');
  assert.equal(result.blocks[0].title, '2 plant care changes to make now or soon');
  assert.equal(result.blocks[0].body, 'Tracking 2 plants and 1 garden zone. USDA hardiness zone 7b.');
  const list = result.blocks.find((block) => block.id === 'plant-care-items');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((row) => row.title)]), [
    ['Do now', ['Boston fern: Adjust care for heat']],
    ['Do soon', ['Cactus: Adjust care for heat']],
    ['Garden zones', ['Summer plan for Front bed']],
  ]);
  assert.deepEqual(list.sections[0].items[0].meta, ['Living room', 'heat', 'low humidity', 'check every 5 days']);
  assert.equal(list.sections[0].items[0].description, 'Watering was recorded 6 days ago. Watch for leaf stress near hot windows.');
  assert.equal(list.sections[0].items[0].href, PAGE);
  assert.equal(result.blocks.some((block) => block.id === 'plant-care-sources'), false);
  assert.equal(JSON.stringify(result).includes(NOTE), false);
});

test('an unavailable weather source is disclosed, never read as "no care changes"', () => {
  const down = plantCareOutlookFromView(outlook({ careRecommendations: [], sourceStatus: { ...allOk, weather: 'UNAVAILABLE' } }), 'p1');
  assert.equal(down.reasonCode, 'PLANT_CARE_PARTIAL_CONDITIONS');
  assert.match(down.blocks[0].body, /Weather-driven care changes could not be checked\.$/);
  assert.doesNotMatch(JSON.stringify(down), /No weather-driven care changes/);
  assert.equal(down.blocks[0].tone, 'CAUTION');
  assert.equal(down.blocks.find((block) => block.id === 'plant-care-sources').body, 'Weather forecast was unavailable, so care changes that depend on it are not shown. That does not mean none are needed.');
  const clear = plantCareOutlookFromView(outlook({ careRecommendations: [], gardenRecommendations: [] }), 'p1');
  assert.equal(clear.blocks[0].title, 'No urgent plant care changes');
  assert.match(clear.blocks[0].body, /No weather-driven care changes are recommended for your plants right now\.$/);
  const noLocation = plantCareOutlookFromView(outlook({ sourceStatus: { weather: 'NO_LOCATION', airQuality: 'NO_LOCATION', drought: 'NO_LOCATION', hardiness: 'OK' } }), 'p1');
  assert.equal(noLocation.blocks.find((block) => block.id === 'plant-care-sources').body.startsWith('Weather forecast (no map location for this home), air quality (no map location for this home), drought monitor (no map location for this home) were unavailable'), true);
});

test('outdoor care that does not apply is explained; nothing tracked is not an all-clear', () => {
  const indoorOnly = plantCareOutlookFromView(outlook({ applicability: { feature: applicable(), indoor: applicable(), outdoor: applicable('NOT_APPLICABLE', ['ASSOCIATION_RESPONSIBLE']) }, zones: [], gardenRecommendations: [] }), 'p1');
  const outdoor = indoorOnly.blocks.find((block) => block.id === 'plant-care-outdoor');
  assert.equal(outdoor.body, 'Only indoor plants are covered because the association is recorded as responsible for landscaping.');
  assert.equal(outdoor.severity, 'INFO');
  const none = plantCareOutlookFromView(outlook({ plants: [], zones: [], careRecommendations: [], gardenRecommendations: [] }), 'p1');
  assert.equal(none.reasonCode, 'PLANT_CARE_NOTHING_TRACKED');
  assert.equal(none.blocks[0].title, 'No plants or garden zones tracked yet');
  assert.equal(none.blocks.at(-1).title, 'General care guidance, not a plant diagnosis');
});

test('getOutlook reports which condition sources answered', async () => {
  PlantCarePlannerService.prototype.getOutlook = originals.getOutlook;
  PlantCarePlannerService.prototype.getContext = async () => ({ facts: { 'exterior.hasPrivateOutdoorSpace': { state: 'KNOWN', value: true }, 'responsibility.landscaping': { state: 'KNOWN', value: 'OWNER' } } });
  let property = { id: 'p1', latitude: 40, longitude: -75, zipCode: '19103' };
  prismaModule.prisma = {
    property: { findUnique: async () => property },
    homePlant: { findMany: async () => [] },
    gardenZone: { findMany: async () => [] },
  };
  weatherModule.getWeatherReport = async () => ({ status: 'unavailable', reason: 'http_error' });
  airModule.getAirQuality = async () => ({ status: 'ok', data: { current: { aqi: 20 } } });
  fipsModule.resolveCountyFips = async () => '42101';
  droughtModule.getDrought = async () => ({ status: 'ok', data: { current: { dominantCategory: 'None' } } });
  hardinessModule.getHardinessZone = async () => ({ status: 'ok', data: { zone: '7b' } });
  const service = new PlantCarePlannerService();
  assert.deepEqual((await service.getOutlook('p1', 'u1')).sourceStatus, { weather: 'UNAVAILABLE', airQuality: 'OK', drought: 'OK', hardiness: 'OK' });
  property = { id: 'p1', latitude: null, longitude: null, zipCode: null };
  hardinessModule.getHardinessZone = async () => ({ status: 'unavailable', reason: 'no_zip' });
  assert.deepEqual((await service.getOutlook('p1', 'u1')).sourceStatus, { weather: 'NO_LOCATION', airQuality: 'NO_LOCATION', drought: 'NO_LOCATION', hardiness: 'NO_LOCATION' });
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = plantCareOutlookFromView(outlook({ sourceStatus: { ...allOk, drought: 'UNAVAILABLE' } }), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'plant-advisor.care-outlook', operationId: 'PLANT_CARE_OUTLOOK', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-23T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my plant care outlook', operationId: 'PLANT_CARE_OUTLOOK', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'PLANT_CARE_OUTLOOK', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('plant care phrasing routes here; buying plants for a room and a power plant do not', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
  for (const message of ['Show my plant care outlook', 'Do my house plants need anything with this weather?', 'Open my plant advisor', 'How should I care for my garden zones this week?']) {
    assert.equal(route(message), 'PLANT_CARE_OUTLOOK', message);
  }
  // Each of these mentions "my garden"/"our garden", so only the exclusion keeps them off this operation.
  for (const message of ['Which plants should I add to my garden?', 'Recommend plants for my garden', 'What plants would do well in my garden?', 'Is the power plant near our garden a problem?']) {
    assert.notEqual(route(message), 'PLANT_CARE_OUTLOOK', message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('PLANT_CARE_OUTLOOK').id, 'plant-advisor');
  assert.equal(ASK_OPERATION_CAPABILITY.PLANT_CARE_OUTLOOK, 'plant-advisor');
  const launch = capabilityCardLaunch('plant-advisor').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'PLANT_CARE_OUTLOOK');
});

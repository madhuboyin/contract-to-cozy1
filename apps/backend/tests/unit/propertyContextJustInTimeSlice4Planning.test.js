const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getFeatureContextRequirement } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('Neighborhood Radar requires only canonical ZIP for interactive matching', () => {
  const contract = getFeatureContextRequirement('NEIGHBORHOOD_RADAR', 'VIEW_RADAR');
  assert.equal(contract.promptStrategy, 'MINIMUM_PATH');
  assert.deepEqual(contract.required.map((requirement) => requirement.factKey), ['location.zipCode']);
  assert.equal(contract.required[0].classification, 'REQUIRED_APPLICABILITY');
  assert.equal(contract.required[0].captureKey, 'LOCATION_ZIP_CODE');
  assert.deepEqual(contract.enhancements, []);
});

test('Neighborhood Radar replaces its compatibility notice and delays reads until ready', () => {
  const client = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/NeighborhoodChangeRadarClient.tsx');
  assert.match(client, /featureKey="NEIGHBORHOOD_RADAR"/);
  assert.match(client, /operationKey="VIEW_RADAR"/);
  assert.match(client, /enabled: !!propertyId && contextReady/);
  assert.match(client, /onReady=\{\(\) => setContextReady\(true\)\}/);
  assert.doesNotMatch(client, /PropertyContextNotice/);
  assert.doesNotMatch(client, /window\.location\.reload/);
});

test('interactive radar reads enforce shared readiness before canonical queries', () => {
  const controller = read('../../src/neighborhoodIntelligence/neighborhoodIntelligence.controller.ts');
  for (const handler of [
    'getNeighborhoodRadarSummary',
    'getNeighborhoodRadarEvents',
    'getNeighborhoodRadarEventDetail',
    'getNeighborhoodRadarTrends',
  ]) {
    const start = controller.indexOf(`export async function ${handler}`);
    const shared = controller.indexOf('requireInteractiveRadarContext', start);
    const canonical = controller.indexOf('queryService.', shared);
    assert.ok(start >= 0 && shared > start && canonical > shared, `${handler} must enforce readiness before querying`);
  }
  assert.match(controller, /PROPERTY_CONTEXT_INCOMPLETE/);
});

test('cross-tool signals and background recompute remain free of interactive capture gates', () => {
  const controller = read('../../src/neighborhoodIntelligence/neighborhoodIntelligence.controller.ts');
  const signals = controller.slice(
    controller.indexOf('export async function getNeighborhoodSignals'),
    controller.indexOf('// ---------------------------------------------------------------------------\n// POST /api/properties/:propertyId/neighborhood-radar/recompute'),
  );
  const recompute = controller.slice(controller.indexOf('export async function recomputePropertyRadar'));
  assert.doesNotMatch(signals, /requireInteractiveRadarContext/);
  assert.doesNotMatch(recompute, /requireInteractiveRadarContext/);
  assert.match(signals, /signalService\.getSignalsForProperty/);
  assert.match(recompute, /recomputePropertyNeighborhoodRadar/);
});

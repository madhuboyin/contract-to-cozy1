const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

test('standalone climate-risk endpoint is retired and cannot invoke the speculative predictor', () => {
  const route = read('src/routes/climateRisk.routes.ts');
  const predictor = read('src/services/climateRiskPredictor.service.ts');

  assert.match(route, /status\(410\)/);
  assert.match(route, /CLIMATE_RISK_RETIRED/);
  assert.match(route, /environment-report/);
  assert.doesNotMatch(route, /generateClimateReport/);
  assert.doesNotMatch(route, /climateRiskPredictorService/);
  assert.doesNotMatch(predictor, /\d+[-–]\d+% (?:higher )?premiums/);
  assert.doesNotMatch(predictor, /Property values may decrease \d+[-–]\d+%/);
  assert.match(predictor, /No premium or coverage conclusion is available/);
});

test('production replay and neighborhood routes require reviewed source coverage', () => {
  const middleware = read('src/middleware/intelligenceCoverage.middleware.ts');
  const replayRoutes = read('src/routes/homeRiskReplay.routes.ts');
  const neighborhoodRoutes = read('src/neighborhoodIntelligence/neighborhoodIntelligence.routes.ts');
  const productionConfig = read('../../infrastructure/kubernetes/base/configmap.yaml');

  assert.match(middleware, /NODE_ENV === 'production'/);
  assert.match(middleware, /REVIEWED_SOURCE_COVERAGE_REQUIRED/);
  assert.match(middleware, /checkedThrough: null/);
  assert.match(replayRoutes, /requireReviewedIntelligenceCoverage\('HOME_RISK_REPLAY'\)/);
  assert.match(neighborhoodRoutes, /requireReviewedIntelligenceCoverage\('NEIGHBORHOOD_RADAR'\)/);
  assert.match(productionConfig, /HOME_RISK_REPLAY_REVIEWED_COVERAGE_ENABLED: "false"/);
  assert.match(productionConfig, /NEIGHBORHOOD_REVIEWED_COVERAGE_ENABLED: "false"/);
});

test('neighborhood property matching never converts coarse geography into fabricated mileage', () => {
  const matcher = read('src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts');

  assert.doesNotMatch(matcher, /sameCity\s*\?/);
  assert.doesNotMatch(matcher, /distanceMiles:\s*0\.5/);
  assert.match(matcher, /A coarse[\s\S]*is not a distance/);
});

test('zero-result neighborhood narratives explicitly avoid an all-clear claim', () => {
  const queryService = read('src/neighborhoodIntelligence/neighborhoodRadarQueryService.ts');

  assert.match(queryService, /This is not an all-clear/);
  assert.match(queryService, /does not confirm that no neighborhood activity occurred/);
});

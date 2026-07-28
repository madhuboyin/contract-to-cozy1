const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(backendRoot, '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('projection-owned component confirmation endpoint is removed', () => {
  const routes = readRepoFile('apps/backend/src/routes/homeDigitalTwin.routes.ts');
  const controller = readRepoFile('apps/backend/src/controllers/homeDigitalTwin.controller.ts');
  const readiness = readRepoFile('apps/backend/src/services/homeDigitalTwinFactReadiness.service.ts');

  assert.doesNotMatch(routes, /router\.patch\(\s*['"]\/properties\/:propertyId\/home-digital-twin\/components/);
  assert.doesNotMatch(controller, /confirmComponent/);
  assert.doesNotMatch(readiness, /setComponentConfirmed/);
  assert.match(readiness, /'INFERRED'/, 'inferred facts must be included in readiness review');
});

test('Home Record readiness UI only links to canonical correction destinations', () => {
  const card = readRepoFile(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeRecordReadinessCard.tsx',
  );

  assert.doesNotMatch(card, /Looks right/);
  assert.doesNotMatch(card, /confirmHomeDigitalTwinComponent/);
  assert.match(card, /item\.correctionDestination/);
});

test('heuristic scenario UI has no Bottom line treatment', () => {
  const client = readRepoFile(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-twin/HomeDigitalTwinClient.tsx',
  );

  assert.doesNotMatch(client, />\s*Bottom line\s*</);
  assert.match(client, /Input assumptions/);
  assert.match(client, /Planning notes/);
});

test('recommendations do not expose failure scores or derive risk-reduction assumptions', () => {
  const recommendations = readRepoFile(
    'apps/backend/src/services/homeDigitalTwinRecommendations.service.ts',
  );

  assert.doesNotMatch(recommendations, /failureRiskScore/);
  assert.doesNotMatch(recommendations, /failure risk score/i);
  assert.doesNotMatch(recommendations, /riskReductionPercent:/);
  assert.match(recommendations, /Age identifies a planning window, not a probability of failure/);
});

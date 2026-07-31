const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const resolve = (relative) => path.resolve(__dirname, relative);
const read = (relative) => fs.readFileSync(resolve(relative), 'utf8');

test('legacy replay URLs remain authenticated deterministic retirement boundaries', () => {
  const routes = read('../../src/routes/homeRiskReplay.routes.ts');
  assert.match(routes, /router\.use\(authenticate\)/);
  assert.equal((routes.match(/LEGACY_RISK_REPLAY_RETIRED/g) ?? []).length, 1);
  assert.match(routes, /status\(410\)/);
  assert.match(routes, /replacement: '\/api\/properties\/:propertyId\/past-hazard-exposure'/);
  assert.doesNotMatch(routes, /homeRiskReplay\.(?:controller|validators)/);
});

test('retired replay implementation and synthetic worker cannot return accidentally', () => {
  for (const relative of [
    '../../src/controllers/homeRiskReplay.controller.ts',
    '../../src/services/homeRiskReplay.service.ts',
    '../../src/services/homeRiskReplay.engine.ts',
    '../../src/validators/homeRiskReplay.validators.ts',
    '../../../workers/src/jobs/ingestHomeRiskEvents.job.ts',
  ]) {
    assert.equal(fs.existsSync(resolve(relative)), false, relative);
  }

  const worker = read('../../../workers/src/worker.ts');
  const deployment = read('../../../../infrastructure/kubernetes/apps/workers/deployment.yaml');
  assert.doesNotMatch(worker, /HOME_RISK_REPLAY_DUMMY|ingestHomeRiskEventsJob/);
  assert.doesNotMatch(deployment, /HOME_RISK_REPLAY_DUMMY/);
});

test('legacy records stay retained until the governed data gate passes', () => {
  const schema = read('../../prisma/schema.prisma');
  for (const model of ['HomeRiskEvent', 'HomeRiskReplayRun', 'HomeRiskReplayEventMatch']) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
  }

  const runbook = read('../../../../docs/functional/PROPERTY_INTELLIGENCE_LEGACY_RETIREMENT.md');
  assert.match(runbook, /retirementEligible/);
  assert.match(runbook, /Production row counts/);
  assert.match(runbook, /Restore has been tested/);
  assert.match(runbook, /Never delete canonical\s+Timeline history/);
});

test('unused legacy neighborhood frontend client contract is removed', () => {
  const apiClient = read('../../../frontend/src/lib/api/client.ts');
  const types = read('../../../frontend/src/types/index.ts');
  assert.doesNotMatch(apiClient, /getNeighborhoodRadar(?:Summary|Events|EventDetail|Trends)/);
  assert.doesNotMatch(types, /NeighborhoodEventListDTO|NeighborhoodEventDetailDTO/);
  assert.equal(
    fs.existsSync(resolve('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/neighborhoodRadarApi.ts')),
    false,
  );
});

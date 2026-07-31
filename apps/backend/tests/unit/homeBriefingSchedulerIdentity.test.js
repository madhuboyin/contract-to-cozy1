const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

const {
  canonicalWorkerJobKey,
  JOB_REGISTRY,
} = require('../../src/config/workerJobRegistry.ts');

test('Home Briefing owns the canonical registry and queue identity', () => {
  const entry = JOB_REGISTRY.find((candidate) =>
    candidate.key === 'home-briefing-delivery');
  assert.ok(entry);
  assert.equal(entry.name, 'Home Briefing Delivery');
  assert.equal(entry.jobName, 'home-briefing-delivery');
  assert.equal(
    JOB_REGISTRY.some((candidate) => candidate.key === 'home-gazette-generation'),
    false,
  );
  assert.equal(
    canonicalWorkerJobKey('home-gazette-generation'),
    'home-briefing-delivery',
  );
});

test('runtime and deployment manifests use canonical Home Briefing names', () => {
  const worker = read('apps/workers/src/worker.ts');
  const adminService = read('apps/backend/src/services/adminWorkerJobs.service.ts');
  const compose = read('docker-compose.yml');
  const configMap = read('infrastructure/kubernetes/base/configmap.yaml');
  const backendDeployment = read('infrastructure/kubernetes/apps/backend/deployment.yaml');
  const workerDeployment = read('infrastructure/kubernetes/apps/workers/deployment.yaml');

  assert.match(worker, /'home-briefing-delivery'/);
  assert.match(worker, /HOME_BRIEFING_DELIVERY_CRON/);
  assert.match(worker, /canonicalWorkerJobKey\(job\.name\)/);
  assert.match(adminService, /canonicalWorkerJobKey\(jobKey\)/);
  assert.match(adminService, /manual-\$\{canonicalJobKey\}/);
  assert.doesNotMatch(compose, /WORKER_JOB_HOME_GAZETTE_GENERATION_ENABLED/);
  assert.doesNotMatch(configMap, /WORKER_JOB_HOME_GAZETTE_GENERATION_ENABLED/);
  assert.doesNotMatch(backendDeployment, /WORKER_JOB_HOME_GAZETTE_GENERATION_ENABLED/);
  assert.doesNotMatch(workerDeployment, /WORKER_JOB_HOME_GAZETTE_GENERATION_ENABLED/);

  for (const manifest of [compose, configMap, backendDeployment, workerDeployment]) {
    assert.match(manifest, /WORKER_JOB_HOME_BRIEFING_DELIVERY_ENABLED/);
  }
});

test('worker implementation no longer carries the Gazette filename or function name', () => {
  assert.equal(
    fs.existsSync(path.join(repositoryRoot, 'apps/workers/src/jobs/gazetteGeneration.job.ts')),
    false,
  );
  const job = read('apps/workers/src/jobs/homeBriefingDelivery.job.ts');
  assert.match(job, /runHomeBriefingDeliveryJob/);
  assert.match(job, /generateSmokeCorrelationId\('home-briefing-delivery'\)/);
  assert.doesNotMatch(job, /runGazetteGenerationJob|home-gazette-generation/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('RentCast credential is optional and worker-only in Kubernetes manifests', () => {
  const worker = read('infrastructure/kubernetes/apps/workers/deployment.yaml');
  const backend = read('infrastructure/kubernetes/apps/backend/deployment.yaml');
  const frontend = read('infrastructure/kubernetes/apps/frontend/deployment.yaml');
  const secrets = read('infrastructure/kubernetes/base/secrets.yaml.template');

  assert.match(secrets, /RENTCAST_API_KEY:\s*""/);
  assert.match(worker, /name: RENTCAST_API_KEY[\s\S]*?key: RENTCAST_API_KEY[\s\S]*?optional: true/);
  assert.doesNotMatch(backend, /RENTCAST_API_KEY/);
  assert.doesNotMatch(frontend, /RENTCAST_API_KEY/);
});

test('RentCast metrics and alerts use bounded classifications only', () => {
  const metrics = read('apps/workers/src/lib/metrics.ts');
  const job = read('apps/workers/src/jobs/propertyEnrichment.job.ts');
  const alerts = read('infrastructure/kubernetes/monitoring/prometheus/property-enrichment-alert-rules.yaml');

  for (const metric of [
    'property_enrichment_match_outcomes_total',
    'property_enrichment_cache_suppressions_total',
    'property_enrichment_facts_total',
    'rentcast_estimated_billable_requests_total',
  ]) assert.match(metrics, new RegExp(metric));

  for (const metricUse of [
    'propertyEnrichmentMatchOutcomesTotal.inc',
    'propertyEnrichmentCacheSuppressionsTotal.inc',
    'propertyEnrichmentFactsTotal.inc',
    'rentCastEstimatedBillableRequestsTotal.inc',
  ]) assert.match(job, new RegExp(metricUse.replace('.', '\\.')));

  assert.doesNotMatch(metrics, /labelNames:\s*\[[^\]]*(property|address|record|job_id)/i);
  assert.match(alerts, /RentCastAuthenticationFailuresSustained/);
  assert.match(alerts, /RentCastRateLimitRatioHigh/);
  assert.match(alerts, /RentCastProviderFailureRatioHigh/);
});

test('obsolete arbitrary-address lookup seam is retired', () => {
  const routes = read('apps/backend/src/routes/property.routes.ts');
  const controller = read('apps/backend/src/controllers/property.controller.ts');

  assert.doesNotMatch(routes, /router\.get\(['"]\/lookup/);
  assert.doesNotMatch(controller, /externalPropertyDataService|lookupProperty/);
  assert.equal(fs.existsSync(path.join(repoRoot, 'apps/backend/src/services/externalPropertyData.service.ts')), false);
});

test('public disclosure and vendor inventory describe RentCast address transmission', () => {
  const privacy = read('apps/frontend/src/app/privacy/page.tsx');
  const inventory = read('docs/operations/RENTCAST_PROPERTY_ENRICHMENT_OPERATIONS.md');

  assert.match(privacy, /send that residential address[\s\S]*?to RentCast/);
  assert.match(inventory, /\| RentCast \| Residential street address, optional unit, city, state, and ZIP \|/);
  assert.match(inventory, /Raw response, owner\/name and mailing data, sale history/);
});

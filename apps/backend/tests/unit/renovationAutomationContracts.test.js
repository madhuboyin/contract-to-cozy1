const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relative) {
  return fs.readFileSync(path.resolve(__dirname, relative), 'utf8');
}

test('advisor evaluation routes use a dedicated limiter and expose async batch evaluation', () => {
  const routes = read('../../src/homeRenovationAdvisor/homeRenovationAdvisor.routes.ts');
  const limiter = read('../../src/middleware/rateLimiter.middleware.ts');
  assert.match(routes, /sessions\/:id\/evaluate'[\s\S]*renovationEvaluationRateLimiter/);
  assert.match(routes, /sessions\/batch-evaluate'[\s\S]*renovationEvaluationRateLimiter/);
  assert.match(limiter, /new RedisRateLimitStore\('renovation-evaluation'/);
  assert.match(limiter, /RENOVATION_EVALUATION_RATE_LIMITED/);
});

test('advisor sessions receive and enforce an expiry deadline', () => {
  const repository = read('../../src/homeRenovationAdvisor/repository/advisorSession.repository.ts');
  const service = read('../../src/homeRenovationAdvisor/homeRenovationAdvisor.service.ts');
  assert.match(repository, /sessionExpiresAt: sessionExpiryFrom\(\)/);
  assert.match(service, /RENOVATION_ADVISOR_SESSION_EXPIRED/);
  assert.match(service, /await archiveSession\(session\.id\)/);
});

test('HOME_UPGRADES rollout and home-upgrades registry aliases are fully removed', () => {
  const featureFlags = read('../../src/config/featureFlags.ts');
  const lifecycle = read('../../src/services/analytics/toolLifecycle.contract.ts');
  const discovery = read('../../../frontend/src/features/tools/toolDiscoveryRegistry.ts');
  assert.doesNotMatch(featureFlags, /HOME_UPGRADES/);
  assert.doesNotMatch(lifecycle, /['"]home-upgrades['"]/);
  assert.doesNotMatch(discovery, /HOME_UPGRADES/);
  assert.doesNotMatch(discovery, /['"]home-upgrades['"]/);
});

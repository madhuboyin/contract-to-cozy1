const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('personalization API is not gated by percentage enrollment', () => {
  const controller = source('../../src/modules/personalization/api/personalization.controller.ts');
  const flags = source('../../src/config/featureFlags.ts');
  assert.doesNotMatch(controller, /isToolEnabled|ROLLOUT_DISABLED|rolloutPercentage|featureFlag/);
  assert.doesNotMatch(flags, /PERSONALIZATION_ROLLOUT:/);
});

test('guidance is presented by default while household profiling is optional', () => {
  const page = source('../../../frontend/src/app/(dashboard)/dashboard/personalization/page.tsx');
  assert.match(page, /Personalized home guidance/);
  assert.match(page, /Property-based guidance is already available/);
  assert.match(page, /Improve my recommendations/);
  assert.doesNotMatch(page, /Join the rollout|Rollout unavailable|Home guidance rollout/);
});

test('optional household consent and reset use profile-scoped endpoints', () => {
  const routes = source('../../src/routes/personalization.routes.ts');
  const api = source('../../../frontend/src/lib/api/personalizationApi.ts');
  assert.match(routes, /personalization\/profile\/enable/);
  assert.match(routes, /personalization\/profile'/);
  assert.match(api, /personalization\/profile\/enable/);
  assert.match(api, /personalization\/profile`/);
  assert.doesNotMatch(routes, /personalization\/opt-in/);
});

test('paused guidance hides output, blocks new profile writes, and preserves reset control', () => {
  const controller = source('../../src/modules/personalization/api/personalization.controller.ts');
  const page = source('../../../frontend/src/app/(dashboard)/dashboard/personalization/page.tsx');
  assert.match(controller, /rejectPausedWrite/);
  assert.match(controller, /PERSONALIZATION_PAUSED/);
  assert.match(controller, /res\.status\(503\)/);
  assert.match(page, /Guidance temporarily paused/);
  assert.match(page, /still remove optional household details while guidance is paused/);
});

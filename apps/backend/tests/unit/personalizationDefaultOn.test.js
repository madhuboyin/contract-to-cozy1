const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('personalization API is not gated by percentage pilot enrollment', () => {
  const controller = source('../../src/modules/personalization/api/personalizationPilot.controller.ts');
  const flags = source('../../src/config/featureFlags.ts');
  assert.doesNotMatch(controller, /isToolEnabled|PILOT_DISABLED|PERSONALIZATION_PILOT/);
  assert.doesNotMatch(flags, /PERSONALIZATION_PILOT:/);
});

test('guidance is presented by default while household profiling is optional', () => {
  const page = source('../../../frontend/src/app/(dashboard)/dashboard/personalization/page.tsx');
  assert.match(page, /Personalized home guidance/);
  assert.match(page, /Property-based guidance is already available/);
  assert.match(page, /Improve my recommendations/);
  assert.doesNotMatch(page, /Join the pilot|Pilot unavailable|Home guidance pilot/);
});

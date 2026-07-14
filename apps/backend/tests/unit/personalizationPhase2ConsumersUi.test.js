const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function frontend(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '../../../frontend/src', relativePath), 'utf8');
}

const dashboard = frontend('app/(dashboard)/dashboard/page.tsx');
const health = frontend('app/(dashboard)/dashboard/properties/[id]/health-score/page.tsx');
const placement = frontend('components/personalization/PersonalizedReadOnlySuggestions.tsx');
const admin = frontend('app/(dashboard)/dashboard/admin/personalization/page.tsx');
const adminNavigation = frontend('lib/navigation/adminNavigation.ts');

test('Dashboard and Health consume the same centralized recommendation component', () => {
  assert.match(dashboard, /module="DASHBOARD"/);
  assert.match(health, /module="HEALTH"/);
  assert.match(placement, /getModulePersonalizationRecommendations/);
  assert.match(placement, /Review in Maintenance/);
});

test('admin catalog exposes reviewed activation and profile-question controls', () => {
  assert.match(admin, /useAdminGuard/);
  assert.match(admin, /Author admin user ID/);
  assert.match(admin, /Review and activate/);
  assert.match(admin, /activatePersonalizationQuestion/);
  assert.match(admin, /Internal · MFA protected/);
  assert.match(admin, /window\.confirm/);
  assert.match(adminNavigation, /admin-personalization/);
});

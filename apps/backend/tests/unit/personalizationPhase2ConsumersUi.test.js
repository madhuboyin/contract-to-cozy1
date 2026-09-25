const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function frontend(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '../../../frontend/src', relativePath), 'utf8');
}

// The dashboard's Home surface was extracted into UnifiedHomeSurface; the module placement is in the page or that surface.
const dashboard = [frontend('app/(dashboard)/dashboard/page.tsx'), frontend('components/home/UnifiedHomeSurface.tsx')].join('\n');
// The Health placement lives on the health factor focus page (moved from the health-score page).
const health = frontend('app/(dashboard)/dashboard/properties/[id]/focus/health/[factor]/page.tsx');
const placement = frontend('components/personalization/PersonalizedReadOnlySuggestions.tsx');
const OPS_DIR = path.resolve(__dirname, '../../../frontend/src/components/ops/personalization');
const admin = [
  frontend('app/(dashboard)/dashboard/admin/personalization/page.tsx'),
  ...fs.readdirSync(OPS_DIR).map((name) => fs.readFileSync(path.join(OPS_DIR, name), 'utf8')),
].join('\n');
const adminNavigation = frontend('lib/navigation/adminNavigation.ts');
const homeownerNavigation = frontend('lib/navigation/jobsNavigation.ts');
const bottomNavigation = frontend('components/mobile/BottomNav.tsx');

test('Dashboard and Health consume the same centralized recommendation component', () => {
  assert.match(dashboard, /module="DASHBOARD"/);
  assert.match(health, /module="HEALTH"/);
  assert.match(placement, /getModulePersonalizationRecommendations/);
  assert.match(placement, /Review in Maintenance/);
});

test('personalized guidance is reached through unified Home, not a homeowner navigation entry', () => {
  assert.doesNotMatch(homeownerNavigation, /key: 'personalization'/);
  assert.doesNotMatch(homeownerNavigation, /name: 'Personalized Guidance'/);
});

test('admin catalog exposes reviewed activation and profile-question controls', () => {
  assert.match(admin, /useAdminGuard/);
  assert.match(admin, /Review and activate/);
  assert.match(admin, /Activate safety-sensitive rule and content/);
  assert.doesNotMatch(admin, /Author admin/);
  assert.match(admin, /activatePersonalizationQuestion/);
  assert.match(admin, /Internal · MFA protected/);
  assert.match(admin, /window\.confirm/);
  assert.match(adminNavigation, /admin-personalization/);
});

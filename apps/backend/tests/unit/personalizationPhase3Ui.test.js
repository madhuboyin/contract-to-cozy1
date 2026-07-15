const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function frontend(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '../../../frontend/src', relativePath), 'utf8');
}

test('personalization captures bounded explicit feedback reasons with timing treated as temporary dismissal', () => {
  const personalization = frontend('app/(dashboard)/dashboard/personalization/page.tsx');
  assert.match(personalization, /PERSONALIZATION_FEEDBACK_REASONS/);
  assert.match(personalization, /BAD_TIMING[\s\S]*type: 'DISMISSED'/);
  assert.match(personalization, /WRONG_PROFILE/);
  assert.match(personalization, /What made this suggestion less useful\?/);
  assert.match(personalization, /sendRecommendationFeedback\(propertyId!, recommendationId, type, reasonCode\)/);
});

test('admin catalog shows aggregate quality and keeps automatic tuning disabled', () => {
  const admin = frontend('app/(dashboard)/dashboard/admin/personalization/page.tsx');
  const api = frontend('lib/api/personalizationAdminApi.ts');
  assert.match(admin, /Personalization quality snapshot/);
  assert.match(admin, /Homes with default guidance/);
  assert.match(admin, /Optional profiles enabled/);
  assert.doesNotMatch(admin, /Opted-in homes/);
  assert.match(admin, /minimumRequired/);
  assert.match(admin, /never automatic weight changes/);
  assert.match(api, /\/api\/admin\/personalization\/quality/);
  assert.match(api, /onlineTuningAllowed: false/);
});

test('admin catalog contains only supported definitions and valid lifecycle controls', () => {
  const admin = frontend('app/(dashboard)/dashboard/admin/personalization/page.tsx');
  const api = frontend('lib/api/personalizationAdminApi.ts');

  assert.match(admin, /Recommendation catalog/);
  assert.match(admin, /Every activation is MFA-protected and audited/);
  assert.match(admin, /Activate safety-sensitive rule and content/);
  assert.match(admin, /definition\.status === 'ACTIVE' \|\| Boolean\(definition\.pausedAt\)/);
  assert.doesNotMatch(admin, /Plan-only records/);
  assert.doesNotMatch(admin, /NOT IMPLEMENTED/);
  assert.doesNotMatch(admin, /Author admin user ID/);
  assert.doesNotMatch(admin, /Required active ADMIN user ID/);
  assert.doesNotMatch(admin, /Select an active admin author/);
  assert.doesNotMatch(api, /activeAdmins/);
  assert.doesNotMatch(api, /implementationStatus/);
});

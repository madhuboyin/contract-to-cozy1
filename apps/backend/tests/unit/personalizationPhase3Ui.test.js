const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function frontend(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '../../../frontend/src', relativePath), 'utf8');
}

test('pilot captures bounded explicit feedback reasons with timing treated as temporary dismissal', () => {
  const pilot = frontend('app/(dashboard)/dashboard/personalization/page.tsx');
  assert.match(pilot, /PILOT_FEEDBACK_REASONS/);
  assert.match(pilot, /BAD_TIMING[\s\S]*type: 'DISMISSED'/);
  assert.match(pilot, /WRONG_PROFILE/);
  assert.match(pilot, /What made this suggestion less useful\?/);
  assert.match(pilot, /sendPilotFeedback\(propertyId!, recommendationId, type, reasonCode\)/);
});

test('admin catalog shows aggregate quality and keeps automatic tuning disabled', () => {
  const admin = frontend('app/(dashboard)/dashboard/admin/personalization/page.tsx');
  const api = frontend('lib/api/personalizationAdminApi.ts');
  assert.match(admin, /Pilot quality snapshot/);
  assert.match(admin, /minimumRequired/);
  assert.match(admin, /never automatic weight changes/);
  assert.match(api, /\/api\/admin\/personalization\/quality/);
  assert.match(api, /onlineTuningAllowed: false/);
});

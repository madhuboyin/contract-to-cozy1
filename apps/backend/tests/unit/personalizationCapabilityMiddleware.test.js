const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { requirePersonalizationCapability } = require('../../src/modules/personalization/api/personalizationCapability.middleware.ts');

function invoke(role, capability) {
  let statusCode = null;
  let payload = null;
  let nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; },
  };
  requirePersonalizationCapability(capability)(
    { householdRole: role },
    res,
    () => { nextCalled = true; },
  );
  return { statusCode, payload, nextCalled };
}

test('VIEWER can read ordinary recommendations but cannot give feedback', () => {
  assert.equal(invoke('VIEWER', 'canViewOrdinaryRecommendations').nextCalled, true);
  const denied = invoke('VIEWER', 'canGiveFeedback');
  assert.equal(denied.nextCalled, false);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.payload.error.code, 'PERSONALIZATION_CAPABILITY_REQUIRED');
});
test('CONTRIBUTOR can refresh and give feedback but cannot manage profile', () => {
  assert.equal(invoke('CONTRIBUTOR', 'canAct').nextCalled, true);
  assert.equal(invoke('CONTRIBUTOR', 'canGiveFeedback').nextCalled, true);
  assert.equal(invoke('CONTRIBUTOR', 'canManageSensitiveProfile').statusCode, 403);
});

test('OWNER can manage sensitive profile', () => {
  assert.equal(invoke('OWNER', 'canManageSensitiveProfile').nextCalled, true);
});

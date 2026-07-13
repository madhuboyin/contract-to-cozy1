const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { getPersonalizationCapabilities } = require('../../src/modules/personalization/domain/capabilityPolicy.ts');

test('OWNER gets full capabilities', () => {
  const caps = getPersonalizationCapabilities('OWNER');
  assert.deepEqual(caps, {
    canManageSensitiveProfile: true,
    canViewSensitiveEvidence: true,
    canViewOrdinaryRecommendations: true,
    canAct: true,
    canGiveFeedback: true,
  });
});

test('CONTRIBUTOR can read/act/feedback but not manage sensitive profile or see sensitive evidence', () => {
  const caps = getPersonalizationCapabilities('CONTRIBUTOR');
  assert.deepEqual(caps, {
    canManageSensitiveProfile: false,
    canViewSensitiveEvidence: false,
    canViewOrdinaryRecommendations: true,
    canAct: true,
    canGiveFeedback: true,
  });
});

test('VIEWER is read-only: ordinary recommendations only, no act/feedback/sensitive access', () => {
  const caps = getPersonalizationCapabilities('VIEWER');
  assert.deepEqual(caps, {
    canManageSensitiveProfile: false,
    canViewSensitiveEvidence: false,
    canViewOrdinaryRecommendations: true,
    canAct: false,
    canGiveFeedback: false,
  });
});

test('only OWNER can manage sensitive profile or view sensitive evidence', () => {
  for (const role of ['CONTRIBUTOR', 'VIEWER']) {
    const caps = getPersonalizationCapabilities(role);
    assert.equal(caps.canManageSensitiveProfile, false, `${role} should not manage sensitive profile`);
    assert.equal(caps.canViewSensitiveEvidence, false, `${role} should not view sensitive evidence`);
  }
});

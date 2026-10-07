const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  loadSuggestedActionSharedPropertyState,
  SUGGESTED_ACTION_SHARED_PROPERTY_SCOPES,
} = require('../../src/services/ask/suggestedActions/suggestedActionSharedPropertyState.ts');
const { PROPERTY_AREA_CAPTURE_SCOPES } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');

const fact = (value) => ({
  key: 'x', value, state: 'KNOWN', source: 'USER_REPORTED', verified: true,
  confidence: 1, observedAt: null, validUntil: null, correctionPath: null,
});

test('profile completeness and home opportunities derive from one authorized union-scoped snapshot', async () => {
  const contextCalls = [];
  const audienceCalls = [];
  const now = new Date('2026-10-07T12:00:00.000Z');
  const result = await loadSuggestedActionSharedPropertyState(
    { userId: 'u1', propertyId: 'p1' },
    {
      now: () => now,
      loadContext: async (...args) => {
        contextCalls.push(args);
        return {
          propertyId: 'p1', contextVersion: 'ctx-shared', generatedAt: now.toISOString(),
          scopes: [...SUGGESTED_ACTION_SHARED_PROPERTY_SCOPES], warnings: [],
          facts: {
            'financial.upcomingCapitalExposure': fact([{ windowStart: '2026-11-01T00:00:00.000Z', windowEnd: '2026-12-01T00:00:00.000Z' }]),
            'coverage.warranties': fact([]),
            'inspection.openFindings': fact([{ id: 'finding-1' }]),
          },
        };
      },
      loadAudience: async (propertyId) => {
        audienceCalls.push(propertyId);
        return { audiences: [], reasons: [], ok: true };
      },
    },
  );

  assert.equal(contextCalls.length, 1);
  assert.equal(audienceCalls.length, 1);
  assert.deepEqual(contextCalls[0], [
    'p1', { userId: 'u1' },
    { scopes: [...PROPERTY_AREA_CAPTURE_SCOPES, 'FINANCIAL', 'COVERAGE', 'INSPECTION'] },
  ]);
  assert.equal(result.profile.audienceUncertain, false);
  assert.equal(result.opportunities.contextVersion, 'ctx-shared');
  assert.equal(result.opportunities.capitalItemsUpcoming, true);
  assert.equal(result.opportunities.warrantyExpiring, false);
  assert.equal(result.opportunities.openFindings, true);
});

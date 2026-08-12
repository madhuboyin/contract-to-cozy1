const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { compareRecommendationSnapshots } = require('../../../src/services/decisionPlatform/decisionPreferenceService.ts');

function snapshot(overrides = {}) {
  return {
    verdictCode: 'MONITOR',
    reasonCodes: ['NO_RECENT_REPAIR_SPEND'],
    confidenceBreakdown: { label: 'MEDIUM', knownFactors: ['AGE'], unknownFactors: [] },
    engineVersion: '1.0',
    contextContractVersion: '1.0',
    preferenceReferenceIds: [],
    ...overrides,
  };
}

test('an identical snapshot pair is UNCHANGED', () => {
  const previous = snapshot();
  const current = snapshot();
  const diff = compareRecommendationSnapshots(previous, current, []);
  assert.equal(diff.category, 'UNCHANGED');
  assert.deepEqual(diff.changedFactors, []);
});

test('a changed verdict is MATERIAL (FRD §14.3)', () => {
  const diff = compareRecommendationSnapshots(snapshot({ verdictCode: 'REPAIR' }), snapshot({ verdictCode: 'REPLACE' }), ['HVAC_ITEM_FACT_CORRECTED']);
  assert.equal(diff.category, 'MATERIAL');
  assert.equal(diff.previousVerdict, 'REPAIR');
  assert.equal(diff.currentVerdict, 'REPLACE');
});

test('an unchanged verdict with different reason codes or confidence is CONFIDENCE_ONLY, not MATERIAL', () => {
  const diff = compareRecommendationSnapshots(
    snapshot({ reasonCodes: ['NO_RECENT_REPAIR_SPEND'] }),
    snapshot({ reasonCodes: ['NO_RECENT_REPAIR_SPEND', 'ACTIVE_WARRANTY_REDUCES_REPAIR_RISK'] }),
    [],
  );
  assert.equal(diff.category, 'CONFIDENCE_ONLY');
});

test('a changed engine version with no changed facts is SYSTEM_METHOD_ONLY (FRD §14.3: "a changed model or rule version without changed homeowner facts must be disclosed as a system-method change")', () => {
  const diff = compareRecommendationSnapshots(snapshot({ engineVersion: '1.0' }), snapshot({ engineVersion: '1.1' }), []);
  assert.equal(diff.category, 'SYSTEM_METHOD_ONLY');
  assert.ok(diff.changedFactors.includes('ENGINE_VERSION'));
});

test('changed preferenceReferenceIds are reported as a PREFERENCE factor regardless of order', () => {
  const diff = compareRecommendationSnapshots(
    snapshot({ preferenceReferenceIds: ['pref-a', 'pref-b'] }),
    snapshot({ preferenceReferenceIds: ['pref-b', 'pref-a'] }),
    [],
  );
  assert.ok(!diff.changedFactors.includes('PREFERENCE'), 'reordering the same set should not report a change');

  const realChange = compareRecommendationSnapshots(
    snapshot({ preferenceReferenceIds: ['pref-a'] }),
    snapshot({ preferenceReferenceIds: ['pref-a', 'pref-c'] }),
    [],
  );
  assert.ok(realChange.changedFactors.includes('PREFERENCE'));
});

test('a non-empty trigger reason (fact correction) is reported as a CANONICAL_FACT factor', () => {
  const diff = compareRecommendationSnapshots(snapshot(), snapshot({ verdictCode: 'REPLACE' }), ['HVAC_ITEM_FACT_CORRECTED']);
  assert.ok(diff.changedFactors.includes('CANONICAL_FACT'));
});

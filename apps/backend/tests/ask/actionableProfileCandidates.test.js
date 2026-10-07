const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { actionableProfileCandidates } = require('../../src/services/ask/suggestedActions/actionableProfileCandidates.ts');

const state = (areas) => ({
  denominatorVersion: 'actionable-profile-1:BASE', audiences: [], audienceUncertain: false,
  fraction: 0.5, knownWeight: 10, totalWeight: 20, unresolved: [], unresolvedByArea: areas,
});

test('actionable profile producer emits one direct, materiality-ordered candidate per askable area', async () => {
  let reads = 0;
  const candidates = await actionableProfileCandidates({ userId: 'u1', propertyId: 'p1' }, async () => {
    reads += 1;
    return state({
      CORE: { count: 2, maxMateriality: 2, factKeys: ['core.propertyUse'], askNowFactKeys: ['core.propertyUse'] },
      SAFETY: { count: 1, maxMateriality: 3, factKeys: ['safety.hasSmokeDetectors'], askNowFactKeys: ['safety.hasSmokeDetectors'] },
      SYSTEMS: { count: 1, maxMateriality: 3, factKeys: ['systems.coolingType'], askNowFactKeys: [] },
    });
  });
  assert.equal(reads, 1, 'one batched profile read');
  assert.deepEqual(candidates.map((candidate) => candidate.outcomeKey), ['CAPTURE_CORE_DETAILS', 'CAPTURE_SAFETY_DETAILS']);
  assert.ok(candidates.every((candidate) => candidate.slotClass === 'PROFILE_GAP' && candidate.operationId === 'PROPERTY_CONTEXT_AREA_CAPTURE'));
  assert.deepEqual(candidates.map((candidate) => candidate.signals.materiality), [2, 3]);
  assert.ok(candidates.every((candidate) => candidate.entityContext.propertyId === 'p1'));
});

test('actionable profile producer emits nothing when every unresolved fact is governor-blocked', async () => {
  const candidates = await actionableProfileCandidates({ userId: 'u1', propertyId: 'p1' }, async () => state({
    EXTERIOR: { count: 2, maxMateriality: 2, factKeys: ['exterior.outdoorSpaceTypes'], askNowFactKeys: [] },
  }));
  assert.deepEqual(candidates, []);
});

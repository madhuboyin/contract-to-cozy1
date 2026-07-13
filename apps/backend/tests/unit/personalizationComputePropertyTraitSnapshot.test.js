const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createPrismaMock({ property = null, householdLink = null } = {}) {
  const derivedTraitUpserts = [];
  const traitSnapshots = [];

  const prismaMock = {
    property: {
      findUnique: async ({ where }) => {
        if (property && where.id === property.id) return property;
        return null;
      },
    },
    householdProperty: {
      findFirst: async () => householdLink,
    },
    derivedTrait: {
      upsert: async ({ where, create, update }) => {
        derivedTraitUpserts.push({ where, create, update });
        return { id: `dt-${derivedTraitUpserts.length}`, ...create };
      },
    },
    traitSnapshot: {
      create: async ({ data }) => {
        traitSnapshots.push(data);
        return { id: `ts-${traitSnapshots.length}`, ...data };
      },
    },
  };

  return { prismaMock, derivedTraitUpserts, traitSnapshots };
}

function installPrismaMock(prismaMock) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: prismaMock },
  };
}

function loadUseCase() {
  const repoPath = require.resolve('../../src/modules/personalization/infrastructure/traitSnapshotRepository.ts');
  const useCasePath = require.resolve('../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts');
  delete require.cache[repoPath];
  delete require.cache[useCasePath];
  return require('../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts');
}

test('returns FAILED/PROPERTY_NOT_FOUND and persists nothing when the property does not exist', async () => {
  const { prismaMock, derivedTraitUpserts, traitSnapshots } = createPrismaMock({ property: null });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();

  const result = await computePropertyTraitSnapshot('missing-prop');
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'PROPERTY_NOT_FOUND' });
  assert.equal(derivedTraitUpserts.length, 0);
  assert.equal(traitSnapshots.length, 0);
});

test('all traits known: persists a DerivedTrait per trait and one TraitSnapshot with all three', async () => {
  const property = {
    id: 'prop-1',
    hasSmokeDetectors: false,
    roofReplacementYear: 1990,
    homeAssets: [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }],
  };
  const { prismaMock, derivedTraitUpserts, traitSnapshots } = createPrismaMock({
    property,
    householdLink: { householdId: 'hh-1' },
  });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();

  const result = await computePropertyTraitSnapshot('prop-1');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.traits.hvacFilterReplacementOverdue.known, true);
  assert.equal(result.traits.hvacFilterReplacementOverdue.value, true);
  assert.equal(result.traits.smokeDetectorMissing.known, true);
  assert.equal(result.traits.smokeDetectorMissing.value, true);
  assert.equal(result.traits.roofReplacementOverdue.known, true);
  assert.equal(result.traits.roofReplacementOverdue.value, true);

  assert.equal(derivedTraitUpserts.length, 3);
  assert.ok(derivedTraitUpserts.every((u) => u.create.householdId === 'hh-1'));

  assert.equal(traitSnapshots.length, 1);
  assert.equal(traitSnapshots[0].propertyId, 'prop-1');
  assert.equal(traitSnapshots[0].householdId, 'hh-1');
  assert.ok(traitSnapshots[0].traitsHash);
  assert.equal(traitSnapshots[0].traitsJson.hvacFilterReplacementOverdue.value, true);
});

test('unknown traits are excluded from DerivedTrait persistence but included in the snapshot', async () => {
  const property = {
    id: 'prop-2',
    hasSmokeDetectors: null, // unknown
    roofReplacementYear: null, // unknown
    homeAssets: [], // unknown (no HVAC asset)
  };
  const { prismaMock, derivedTraitUpserts, traitSnapshots } = createPrismaMock({
    property,
    householdLink: null,
  });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();

  const result = await computePropertyTraitSnapshot('prop-2');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.traits.hvacFilterReplacementOverdue.known, false);
  assert.equal(result.traits.smokeDetectorMissing.known, false);
  assert.equal(result.traits.roofReplacementOverdue.known, false);

  // Nothing known -> no DerivedTrait rows persisted (absence represents UNKNOWN).
  assert.equal(derivedTraitUpserts.length, 0);

  // Snapshot still records the full (all-unknown) trait set.
  assert.equal(traitSnapshots.length, 1);
  assert.equal(traitSnapshots[0].householdId, null);
  assert.equal(traitSnapshots[0].traitsJson.hvacFilterReplacementOverdue.known, false);
});

test('partial knowledge: only known traits get a DerivedTrait row', async () => {
  const property = {
    id: 'prop-3',
    hasSmokeDetectors: true, // known, not missing
    roofReplacementYear: null, // unknown
    homeAssets: [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }], // known, not overdue
  };
  const { prismaMock, derivedTraitUpserts } = createPrismaMock({ property, householdLink: null });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();

  await computePropertyTraitSnapshot('prop-3');

  assert.equal(derivedTraitUpserts.length, 2);
  const traitKeys = derivedTraitUpserts.map((u) => u.create.traitKey).sort();
  assert.deepEqual(traitKeys, ['hvacFilterReplacementOverdue', 'smokeDetectorMissing']);
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createPrismaMock({ property = null, householdLink = null } = {}) {
  const derivedTraitUpserts = [];
  const derivedTraitDeletes = [];
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
      deleteMany: async ({ where }) => {
        derivedTraitDeletes.push({ where });
        return { count: 1 };
      },
    },
    traitSnapshot: {
      create: async ({ data }) => {
        traitSnapshots.push(data);
        return { id: `ts-${traitSnapshots.length}`, ...data };
      },
      // Reflects the most recently created snapshot's hash, same as a real
      // "most recent for this property" query would — lets the dedup test
      // below prove persistTraitSnapshot actually skips a duplicate insert.
      findFirst: async () => {
        if (traitSnapshots.length === 0) return null;
        return { traitsHash: traitSnapshots[traitSnapshots.length - 1].traitsHash };
      },
    },
  };

  return { prismaMock, derivedTraitUpserts, derivedTraitDeletes, traitSnapshots };
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
  assert.equal(result.traits.hvacFilterDaysSinceServiced.known, true);
  assert.equal(result.traits.hvacFilterDaysSinceServiced.value, 200);

  assert.equal(derivedTraitUpserts.length, 4);
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
  const { prismaMock, derivedTraitUpserts, derivedTraitDeletes, traitSnapshots } = createPrismaMock({
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
  assert.equal(result.traits.smokeDetectorBatteryOverdue.known, false);
  assert.equal(result.traits.dryerVentCleaningOverdue.known, false);

  // Nothing known -> no DerivedTrait rows persisted (absence represents UNKNOWN),
  // but any stale row from a previous known value is actively deleted.
  assert.equal(derivedTraitUpserts.length, 0);
  assert.equal(derivedTraitDeletes.length, 6);
  assert.deepEqual(
    derivedTraitDeletes.map((d) => d.where.traitKey).sort(),
    [
      'dryerVentCleaningOverdue',
      'hvacFilterDaysSinceServiced',
      'hvacFilterReplacementOverdue',
      'roofReplacementOverdue',
      'smokeDetectorBatteryOverdue',
      'smokeDetectorMissing',
    ],
  );

  // Snapshot still records the full (all-unknown) trait set.
  assert.equal(traitSnapshots.length, 1);
  assert.equal(traitSnapshots[0].householdId, null);
  assert.equal(traitSnapshots[0].traitsJson.hvacFilterReplacementOverdue.known, false);
});

test('all traits known: persists a DerivedTrait per trait', async () => {
  const property = {
    id: 'prop-6',
    hasSmokeDetectors: true,
    roofReplacementYear: 1990,
    homeAssets: [
      { assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) },
      { assetType: 'SMOKE_DETECTOR', lastServiced: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) },
      { assetType: 'DRYER', lastServiced: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) },
    ],
  };
  const { prismaMock, derivedTraitUpserts } = createPrismaMock({ property, householdLink: null });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();

  const result = await computePropertyTraitSnapshot('prop-6');
  assert.equal(result.traits.smokeDetectorBatteryOverdue.known, true);
  assert.equal(result.traits.smokeDetectorBatteryOverdue.value, true);
  assert.equal(result.traits.dryerVentCleaningOverdue.known, true);
  assert.equal(result.traits.dryerVentCleaningOverdue.value, true);
  assert.equal(derivedTraitUpserts.length, 6);
});

test('partial knowledge: only known traits get a DerivedTrait row', async () => {
  const property = {
    id: 'prop-3',
    hasSmokeDetectors: true, // known, not missing
    roofReplacementYear: null, // unknown
    homeAssets: [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }], // known, not overdue
  };
  const { prismaMock, derivedTraitUpserts, derivedTraitDeletes } = createPrismaMock({ property, householdLink: null });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();

  await computePropertyTraitSnapshot('prop-3');

  assert.equal(derivedTraitUpserts.length, 3);
  const traitKeys = derivedTraitUpserts.map((u) => u.create.traitKey).sort();
  assert.deepEqual(traitKeys, ['hvacFilterDaysSinceServiced', 'hvacFilterReplacementOverdue', 'smokeDetectorMissing']);

  // roofReplacementOverdue (unset year), smokeDetectorBatteryOverdue (no
  // SMOKE_DETECTOR-type asset, despite hasSmokeDetectors: true), and
  // dryerVentCleaningOverdue (no DRYER-type asset) are all unknown here ->
  // their stale rows get deleted, not skipped.
  assert.equal(derivedTraitDeletes.length, 3);
  assert.deepEqual(
    derivedTraitDeletes.map((d) => d.where.traitKey).sort(),
    ['dryerVentCleaningOverdue', 'roofReplacementOverdue', 'smokeDetectorBatteryOverdue'],
  );
});

test('recomputing with unchanged inputs does not create a duplicate TraitSnapshot', async () => {
  const property = {
    id: 'prop-4',
    hasSmokeDetectors: false,
    roofReplacementYear: 1990,
    homeAssets: [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }],
  };
  const { prismaMock, traitSnapshots } = createPrismaMock({ property, householdLink: null });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();

  await computePropertyTraitSnapshot('prop-4');
  await computePropertyTraitSnapshot('prop-4');

  assert.equal(traitSnapshots.length, 1);
});

test('recomputing with changed inputs still creates a new TraitSnapshot', async () => {
  const propertyBefore = {
    id: 'prop-5',
    hasSmokeDetectors: false,
    roofReplacementYear: 1990,
    homeAssets: [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }],
  };
  const { prismaMock, traitSnapshots } = createPrismaMock({ property: propertyBefore, householdLink: null });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();
  await computePropertyTraitSnapshot('prop-5');

  // Same property row, but smoke detectors now confirmed present -> different trait set/hash.
  prismaMock.property.findUnique = async ({ where }) =>
    where.id === 'prop-5' ? { ...propertyBefore, hasSmokeDetectors: true } : null;
  await computePropertyTraitSnapshot('prop-5');

  assert.equal(traitSnapshots.length, 2);
});

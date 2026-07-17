const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
const { installPersonalizationContextMock } = require('../helpers/installPersonalizationContextMock');

function createPrismaMock({ property = null } = {}) {
  const derivedTraitUpserts = [];
  const derivedTraitDeletes = [];

  const prismaMock = {
    property: {
      findUnique: async ({ where }) => {
        if (property && where.id === property.id) {
          return {
            ...property,
            homeownerProfile: { userId: 'owner-1' },
            inventoryItems: (property.inventoryItems ?? []).map((asset, index) => ({
              name: asset.assetType,
              category: asset.assetType,
              tags: [],
              assetType: asset.assetType,
              lastServicedOn: asset.lastServiced,
              id: `inventory-${index}`,
            })),
          };
        }
        return null;
      },
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
  };

  return { prismaMock, derivedTraitUpserts, derivedTraitDeletes };
}

function installPrismaMock(prismaMock) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: prismaMock },
  };
  installPersonalizationContextMock(prismaMock);
}

function loadUseCase() {
  const repoPath = require.resolve('../../src/modules/personalization/infrastructure/propertyTraitRepository.ts');
  const useCasePath = require.resolve('../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts');
  delete require.cache[repoPath];
  delete require.cache[useCasePath];
  return require('../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts');
}

test('returns FAILED/PROPERTY_NOT_FOUND and persists nothing when the property does not exist', async () => {
  const { prismaMock, derivedTraitUpserts } = createPrismaMock({ property: null });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();

  const result = await computePropertyTraitSnapshot('missing-prop');
  assert.deepEqual(result, { status: 'FAILED', errorCode: 'PROPERTY_NOT_FOUND' });
  assert.equal(derivedTraitUpserts.length, 0);
});

test('all traits known: persists property-owned DerivedTrait rows without household linkage', async () => {
  const property = {
    id: 'prop-1',
    hasSmokeDetectors: false,
    roofReplacementYear: 1990,
    inventoryItems: [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }],
  };
  const { prismaMock, derivedTraitUpserts } = createPrismaMock({ property });
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

  assert.equal(derivedTraitUpserts.length, 5);
  assert.ok(derivedTraitUpserts.every((u) => u.create.propertyId === 'prop-1'));
  assert.ok(derivedTraitUpserts.every((u) => !Object.hasOwn(u.create, 'householdId')));
});

test('unknown traits delete stale DerivedTrait rows instead of persisting unknown values', async () => {
  const property = {
    id: 'prop-2',
    hasSmokeDetectors: null, // unknown
    roofReplacementYear: null, // unknown
    inventoryItems: [], // unknown (no HVAC asset)
  };
  const { prismaMock, derivedTraitUpserts, derivedTraitDeletes } = createPrismaMock({ property });
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
  assert.equal(derivedTraitDeletes.length, 9);
  assert.deepEqual(
    derivedTraitDeletes.map((d) => d.where.traitKey).sort(),
    [
      'dryerVentCleaningOverdue',
      'dryerVentDaysSinceServiced',
      'hvacFilterDaysSinceServiced',
      'hvacFilterReplacementOverdue',
      'roofAgeYears',
      'roofReplacementOverdue',
      'smokeDetectorBatteryDaysSinceServiced',
      'smokeDetectorBatteryOverdue',
      'smokeDetectorMissing',
    ],
  );

});

test('all traits known: persists a DerivedTrait per trait', async () => {
  const property = {
    id: 'prop-6',
    hasSmokeDetectors: true,
    roofReplacementYear: 1990,
    inventoryItems: [
      { assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) },
      { assetType: 'SMOKE_DETECTOR', lastServiced: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) },
      { assetType: 'DRYER', lastServiced: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) },
    ],
  };
  const { prismaMock, derivedTraitUpserts } = createPrismaMock({ property });
  installPrismaMock(prismaMock);
  const { computePropertyTraitSnapshot } = loadUseCase();

  const result = await computePropertyTraitSnapshot('prop-6');
  assert.equal(result.traits.smokeDetectorBatteryOverdue.known, true);
  assert.equal(result.traits.smokeDetectorBatteryOverdue.value, true);
  assert.equal(result.traits.dryerVentCleaningOverdue.known, true);
  assert.equal(result.traits.dryerVentCleaningOverdue.value, true);
  assert.equal(derivedTraitUpserts.length, 9);
});

test('partial knowledge: only known traits get a DerivedTrait row', async () => {
  const property = {
    id: 'prop-3',
    hasSmokeDetectors: true, // known, not missing
    roofReplacementYear: null, // unknown
    inventoryItems: [{ assetType: 'HVAC_FURNACE', lastServiced: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }], // known, not overdue
  };
  const { prismaMock, derivedTraitUpserts, derivedTraitDeletes } = createPrismaMock({ property });
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
  assert.equal(derivedTraitDeletes.length, 6);
  assert.deepEqual(
    derivedTraitDeletes.map((d) => d.where.traitKey).sort(),
    [
      'dryerVentCleaningOverdue',
      'dryerVentDaysSinceServiced',
      'roofAgeYears',
      'roofReplacementOverdue',
      'smokeDetectorBatteryDaysSinceServiced',
      'smokeDetectorBatteryOverdue',
    ],
  );
});

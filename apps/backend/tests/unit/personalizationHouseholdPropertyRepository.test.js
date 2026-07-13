const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createPrismaMock({ links = [] } = {}) {
  const prismaMock = {
    householdProperty: {
      findMany: async ({ where, distinct, select }) => {
        assert.deepEqual(where, { effectiveTo: null });
        assert.deepEqual(distinct, ['propertyId']);
        assert.deepEqual(select, { propertyId: true });
        const active = links.filter((l) => l.effectiveTo === null);
        const seen = new Set();
        const deduped = [];
        for (const l of active) {
          if (seen.has(l.propertyId)) continue;
          seen.add(l.propertyId);
          deduped.push({ propertyId: l.propertyId });
        }
        return deduped;
      },
    },
  };
  return { prismaMock };
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

function loadRepository() {
  const repoPath = require.resolve('../../src/modules/personalization/infrastructure/householdPropertyRepository.ts');
  delete require.cache[repoPath];
  return require('../../src/modules/personalization/infrastructure/householdPropertyRepository.ts');
}

test('returns an empty list when there are no active household links', async () => {
  const { prismaMock } = createPrismaMock({ links: [] });
  installPrismaMock(prismaMock);
  const { listPropertyIdsWithActiveHouseholdLink } = loadRepository();

  const result = await listPropertyIdsWithActiveHouseholdLink();
  assert.deepEqual(result, []);
});

test('filters out links with effectiveTo set (no longer active)', async () => {
  const { prismaMock } = createPrismaMock({
    links: [
      { propertyId: 'prop-1', effectiveTo: null },
      { propertyId: 'prop-2', effectiveTo: new Date() },
    ],
  });
  installPrismaMock(prismaMock);
  const { listPropertyIdsWithActiveHouseholdLink } = loadRepository();

  const result = await listPropertyIdsWithActiveHouseholdLink();
  assert.deepEqual(result, ['prop-1']);
});

test('dedupes propertyId when multiple active links exist for the same property', async () => {
  const { prismaMock } = createPrismaMock({
    links: [
      { propertyId: 'prop-1', effectiveTo: null },
      { propertyId: 'prop-1', effectiveTo: null },
      { propertyId: 'prop-2', effectiveTo: null },
    ],
  });
  installPrismaMock(prismaMock);
  const { listPropertyIdsWithActiveHouseholdLink } = loadRepository();

  const result = await listPropertyIdsWithActiveHouseholdLink();
  assert.deepEqual(result.sort(), ['prop-1', 'prop-2']);
});

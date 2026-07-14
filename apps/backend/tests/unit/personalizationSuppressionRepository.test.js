const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRepository(initial = []) {
  const suppressions = [...initial];
  const find = (propertyId, definitionId) => suppressions.find((row) => row.propertyId === propertyId && row.definitionId === definitionId) || null;
  const prismaMock = {
    recommendationSuppression: {
      findUnique: async ({ where }) => {
        const key = where.propertyId_definitionId;
        return find(key.propertyId, key.definitionId);
      },
      upsert: async ({ where, create, update }) => {
        const key = where.propertyId_definitionId;
        const existing = find(key.propertyId, key.definitionId);
        if (existing) Object.assign(existing, update);
        else suppressions.push({ id: `sup-${suppressions.length + 1}`, ...create });
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };
  const repositoryPath = require.resolve('../../src/modules/personalization/infrastructure/suppressionRepository.ts');
  delete require.cache[repositoryPath];
  return { ...require(repositoryPath), suppressions };
}

test('findActiveSuppression returns false when no row exists', async () => {
  const { findActiveSuppression } = loadRepository();
  assert.equal(await findActiveSuppression('property-1', 'definition-1'), false);
});

test('indefinite and future suppressions are active; expired suppression is ignored', async () => {
  const now = Date.now();
  const { findActiveSuppression } = loadRepository([
    { propertyId: 'property-1', definitionId: 'indefinite', until: null },
    { propertyId: 'property-1', definitionId: 'future', until: new Date(now + 60_000) },
    { propertyId: 'property-1', definitionId: 'expired', until: new Date(now - 60_000) },
  ]);
  assert.equal(await findActiveSuppression('property-1', 'indefinite'), true);
  assert.equal(await findActiveSuppression('property-1', 'future'), true);
  assert.equal(await findActiveSuppression('property-1', 'expired'), false);
});

test('createOrExtendSuppression creates and extends one property-definition row', async () => {
  const earlier = new Date(Date.now() + 60_000);
  const later = new Date(Date.now() + 120_000);
  const { createOrExtendSuppression, suppressions } = loadRepository();
  const base = { propertyId: 'property-1', definitionId: 'definition-1', reason: 'USER_DISMISSED' };
  await createOrExtendSuppression({ ...base, until: earlier });
  await createOrExtendSuppression({ ...base, until: later });
  assert.equal(suppressions.length, 1);
  assert.equal(suppressions[0].until.getTime(), later.getTime());
});

test('indefinite suppression is never shortened and wins over a concrete date', async () => {
  const future = new Date(Date.now() + 60_000);
  const base = { propertyId: 'property-1', definitionId: 'definition-1', reason: 'USER_DISMISSED' };
  const first = loadRepository([{ ...base, until: null }]);
  await first.createOrExtendSuppression({ ...base, until: future });
  assert.equal(first.suppressions[0].until, null);

  const second = loadRepository([{ ...base, until: future }]);
  await second.createOrExtendSuppression({ ...base, until: null });
  assert.equal(second.suppressions[0].until, null);
});

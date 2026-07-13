const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createPrismaMock({ suppressions = [] } = {}) {
  const upserts = [];
  const prismaMock = {
    recommendationSuppression: {
      findMany: async ({ where }) => {
        const scopeKeys = where.OR.map((o) => `${o.scope}:${o.scopeKey}`);
        return suppressions.filter((s) => scopeKeys.includes(`${s.scope}:${s.scopeKey}`) && s.propertyId === where.propertyId);
      },
      findUnique: async ({ where }) => {
        const key = where.propertyId_scope_scopeKey;
        return (
          suppressions.find(
            (s) => s.propertyId === key.propertyId && s.scope === key.scope && s.scopeKey === key.scopeKey,
          ) || null
        );
      },
      upsert: async ({ where, create, update }) => {
        const key = where.propertyId_scope_scopeKey;
        const existingIndex = suppressions.findIndex(
          (s) => s.propertyId === key.propertyId && s.scope === key.scope && s.scopeKey === key.scopeKey,
        );
        const record =
          existingIndex >= 0 ? { ...suppressions[existingIndex], ...update } : { ...create };
        if (existingIndex >= 0) {
          suppressions[existingIndex] = record;
        } else {
          suppressions.push(record);
        }
        upserts.push({ create, update });
        return record;
      },
    },
  };
  return { prismaMock, upserts, suppressions };
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
  const repoPath = require.resolve('../../src/modules/personalization/infrastructure/suppressionRepository.ts');
  delete require.cache[repoPath];
  return require('../../src/modules/personalization/infrastructure/suppressionRepository.ts');
}

const KEYS = { definitionCode: 'hvac_filter_replacement_check_proof', category: 'proof_of_concept', dedupeKey: 'hvac_filter_replacement_check_proof' };

test('findActiveSuppression: returns null when no suppression rows exist', async () => {
  const { prismaMock } = createPrismaMock({ suppressions: [] });
  installPrismaMock(prismaMock);
  const { findActiveSuppression } = loadRepository();

  const result = await findActiveSuppression('prop-1', KEYS);
  assert.equal(result, null);
});

test('findActiveSuppression: an indefinite (until: null) suppression is always active', async () => {
  const { prismaMock } = createPrismaMock({
    suppressions: [{ propertyId: 'prop-1', scope: 'DEFINITION', scopeKey: KEYS.definitionCode, until: null }],
  });
  installPrismaMock(prismaMock);
  const { findActiveSuppression } = loadRepository();

  const result = await findActiveSuppression('prop-1', KEYS);
  assert.deepEqual(result, { scope: 'DEFINITION', scopeKey: KEYS.definitionCode });
});

test('findActiveSuppression: an expired (until in the past) suppression is ignored', async () => {
  const { prismaMock } = createPrismaMock({
    suppressions: [
      { propertyId: 'prop-1', scope: 'DEDUPE_KEY', scopeKey: KEYS.dedupeKey, until: new Date(Date.now() - 1000) },
    ],
  });
  installPrismaMock(prismaMock);
  const { findActiveSuppression } = loadRepository();

  const result = await findActiveSuppression('prop-1', KEYS);
  assert.equal(result, null);
});

test('findActiveSuppression: a not-yet-expired (until in the future) suppression is active', async () => {
  const { prismaMock } = createPrismaMock({
    suppressions: [
      { propertyId: 'prop-1', scope: 'DEDUPE_KEY', scopeKey: KEYS.dedupeKey, until: new Date(Date.now() + 1000 * 60 * 60) },
    ],
  });
  installPrismaMock(prismaMock);
  const { findActiveSuppression } = loadRepository();

  const result = await findActiveSuppression('prop-1', KEYS);
  assert.deepEqual(result, { scope: 'DEDUPE_KEY', scopeKey: KEYS.dedupeKey });
});

test('createOrExtendSuppression: creates a new row when none exists', async () => {
  const { prismaMock, upserts } = createPrismaMock({ suppressions: [] });
  installPrismaMock(prismaMock);
  const { createOrExtendSuppression } = loadRepository();

  const until = new Date(Date.now() + 1000 * 60 * 60);
  await createOrExtendSuppression({
    propertyId: 'prop-1',
    scope: 'DEFINITION',
    scopeKey: KEYS.definitionCode,
    reason: 'USER_DISMISSED',
    until,
  });

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].create.until.getTime(), until.getTime());
});

test('createOrExtendSuppression: extends to the later date when re-suppressed with a further-out until', async () => {
  const earlier = new Date(Date.now() + 1000 * 60 * 60);
  const later = new Date(Date.now() + 1000 * 60 * 60 * 24);
  const { prismaMock, suppressions } = createPrismaMock({
    suppressions: [{ propertyId: 'prop-1', scope: 'DEDUPE_KEY', scopeKey: KEYS.dedupeKey, until: earlier }],
  });
  installPrismaMock(prismaMock);
  const { createOrExtendSuppression } = loadRepository();

  await createOrExtendSuppression({
    propertyId: 'prop-1',
    scope: 'DEDUPE_KEY',
    scopeKey: KEYS.dedupeKey,
    reason: 'USER_DISMISSED',
    until: later,
  });

  assert.equal(suppressions[0].until.getTime(), later.getTime());
});

test('createOrExtendSuppression: existing indefinite (null) suppression is never shortened', async () => {
  const { prismaMock, suppressions } = createPrismaMock({
    suppressions: [{ propertyId: 'prop-1', scope: 'DEFINITION', scopeKey: KEYS.definitionCode, until: null }],
  });
  installPrismaMock(prismaMock);
  const { createOrExtendSuppression } = loadRepository();

  await createOrExtendSuppression({
    propertyId: 'prop-1',
    scope: 'DEFINITION',
    scopeKey: KEYS.definitionCode,
    reason: 'USER_DISMISSED',
    until: new Date(Date.now() + 1000),
  });

  assert.equal(suppressions[0].until, null);
});

test('createOrExtendSuppression: a new indefinite (null) until wins over an existing concrete date', async () => {
  const { prismaMock, suppressions } = createPrismaMock({
    suppressions: [
      { propertyId: 'prop-1', scope: 'DEFINITION', scopeKey: KEYS.definitionCode, until: new Date(Date.now() + 1000) },
    ],
  });
  installPrismaMock(prismaMock);
  const { createOrExtendSuppression } = loadRepository();

  await createOrExtendSuppression({
    propertyId: 'prop-1',
    scope: 'DEFINITION',
    scopeKey: KEYS.definitionCode,
    reason: 'USER_DISMISSED',
    until: null,
  });

  assert.equal(suppressions[0].until, null);
});

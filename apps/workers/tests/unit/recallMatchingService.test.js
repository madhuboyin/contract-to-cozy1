// apps/workers/tests/unit/recallMatchingService.test.js
//
// W3 (recall): model numbers are precise identifiers — the previous
// scorer used naive substring containment (includesEither) for model
// comparison, so a short recall model like "5024" would false-match an
// unrelated asset model like "125024" at 95% confidence. Combined with
// the "verified item + confidencePct >= 90 -> auto APPLICABLE, no
// homeowner confirmation needed" rule downstream (recalls.service.ts),
// this could assert a false recall match as fact. Fixed with
// exactModelMatch() (exact equality after normalization) for model
// comparison; manufacturer matching keeps its looser substring check.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { exactModelMatch, normModel } = require('../../src/recalls/normalize.ts');
const { runRecallMatchingScan } = require('../../src/recalls/recallMatching.service.ts');

test('exactModelMatch requires exact equality, not substring containment', () => {
  assert.equal(exactModelMatch(normModel('5024'), normModel('125024')), false);
  assert.equal(exactModelMatch(normModel('WDT-780'), normModel('wdt780')), true);
  assert.equal(exactModelMatch(normModel(''), normModel('5024')), false);
  assert.equal(exactModelMatch(normModel('5024'), normModel('5024')), true);
});

function fakeDeps({ recalls, inventory }) {
  const createCalls = [];
  const deps = {
    prisma: {
      recallRecord: { findMany: async () => recalls },
      inventoryItem: { findMany: async () => inventory },
      recallMatch: {
        create: async (args) => {
          createCalls.push(args.data);
          return { id: `match-${createCalls.length}` };
        },
      },
    },
  };
  return { deps, getCreateCalls: () => createCalls };
}

function recall(products) {
  return { id: 'recall-1', status: 'ACTIVE', products };
}

function inventoryItem(overrides = {}) {
  return {
    id: 'item-1',
    propertyId: 'property-1',
    manufacturer: 'Acme',
    modelNumber: '5024',
    isVerified: true,
    ...overrides,
  };
}

test('exact manufacturer + exact model on a verified item is a high-confidence OPEN match', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    recalls: [recall([{ manufacturer: 'Acme', model: '5024' }])],
    inventory: [inventoryItem()],
  });

  const result = await runRecallMatchingScan(deps);

  assert.equal(result.createdOpen, 1);
  assert.equal(getCreateCalls()[0].confidencePct, 95);
  assert.equal(getCreateCalls()[0].status, 'OPEN');
});

test('regression guard: a short recall model no longer false-matches as a substring of an unrelated longer asset model', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    recalls: [recall([{ manufacturer: 'Acme', model: '5024' }])],
    inventory: [inventoryItem({ modelNumber: '125024' })], // "5024" is a substring of "125024" but is a different model
  });

  const result = await runRecallMatchingScan(deps);

  assert.equal(result.createdOpen, 0);
  // mfg still matches, so it correctly falls to the lower-confidence,
  // confirmation-required bucket instead of being silently dropped.
  assert.equal(result.createdNeedsConfirm, 1);
  assert.equal(getCreateCalls()[0].confidencePct, 80);
  assert.equal(getCreateCalls()[0].status, 'NEEDS_CONFIRMATION');
});

test('manufacturer-only match (model differs) still requires confirmation, unaffected by the fix', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    recalls: [recall([{ manufacturer: 'Acme', model: '9999' }])],
    inventory: [inventoryItem({ modelNumber: '5024' })],
  });

  const result = await runRecallMatchingScan(deps);

  assert.equal(result.createdOpen, 0);
  assert.equal(result.createdNeedsConfirm, 1);
  assert.equal(getCreateCalls()[0].confidencePct, 80);
});

test('an unverified item never gets an OPEN match even at 95% confidence', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    recalls: [recall([{ manufacturer: 'Acme', model: '5024' }])],
    inventory: [inventoryItem({ isVerified: false })],
  });

  const result = await runRecallMatchingScan(deps);

  assert.equal(result.createdOpen, 0);
  assert.equal(result.createdNeedsConfirm, 1);
  assert.equal(getCreateCalls()[0].confidencePct, 95);
  assert.equal(getCreateCalls()[0].status, 'NEEDS_CONFIRMATION');
});

test('no manufacturer or model match is filtered out entirely (below the v1 threshold)', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    recalls: [recall([{ manufacturer: 'Acme', model: '5024' }])],
    inventory: [inventoryItem({ manufacturer: 'Other Co', modelNumber: '1111' })],
  });

  const result = await runRecallMatchingScan(deps);

  assert.equal(result.createdOpen, 0);
  assert.equal(result.createdNeedsConfirm, 0);
  assert.equal(getCreateCalls().length, 0);
});

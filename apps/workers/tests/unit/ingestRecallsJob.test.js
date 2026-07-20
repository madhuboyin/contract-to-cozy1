// apps/workers/tests/unit/ingestRecallsJob.test.js
//
// W4 item 4: ingestRecallsJob had no dedicated test. Research also found a
// real gap: the per-item $transaction had no error isolation — one bad
// recall (malformed date, constraint violation) aborted the entire run and
// silently dropped every remaining recall for that day. This is a
// safety-relevant feed (fire/injury/death hazard recalls), so that gap
// mattered more than most. Fixed with the same per-item try/catch pattern
// used elsewhere in this project.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function recallItem(overrides = {}) {
  return {
    externalId: 'cpsc-1',
    title: 'Test Recall',
    hazard: 'fire',
    summary: 'a summary',
    remedy: 'stop using',
    recallUrl: 'https://example.com',
    remedyUrl: 'https://example.com/remedy',
    recalledAt: '2026-01-01',
    affectedUnits: 100,
    raw: {},
    manufacturers: ['Acme'],
    models: ['Model 1'],
    ...overrides,
  };
}

function loadJob({ items, upsertShouldFailFor = new Set() }) {
  const calls = { upserts: [] };

  const prismaMock = {
    $transaction: async (fn) => {
      const tx = {
        recallRecord: {
          upsert: async (args) => {
            const externalId = args.where.source_externalId.externalId;
            calls.upserts.push(externalId);
            if (upsertShouldFailFor.has(externalId)) {
              throw new Error(`upsert failed for ${externalId}`);
            }
            return { id: `recall-${externalId}` };
          },
        },
        recallProduct: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async () => ({ count: 0 }),
        },
      };
      return fn(tx);
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const cpscPath = require.resolve('../../src/recalls/cpsc.client.ts');
  require.cache[cpscPath] = {
    id: cpscPath,
    filename: cpscPath,
    loaded: true,
    exports: { fetchCpscRecalls: async () => items },
  };

  const jobPath = require.resolve('../../src/jobs/ingestRecalls.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

test('upserts every fetched recall and reports zero failures on the happy path', async () => {
  const { ingestRecallsJob, calls } = loadJob({
    items: [recallItem({ externalId: 'a' }), recallItem({ externalId: 'b' })],
  });

  const result = await ingestRecallsJob();

  assert.deepEqual(result, { fetched: 2, upserted: 2, failed: 0 });
  assert.deepEqual(calls.upserts, ['a', 'b']);
});

test('one item failing its transaction does not abort the remaining items', async () => {
  const { ingestRecallsJob, calls } = loadJob({
    items: [recallItem({ externalId: 'a' }), recallItem({ externalId: 'b' }), recallItem({ externalId: 'c' })],
    upsertShouldFailFor: new Set(['b']),
  });

  const result = await ingestRecallsJob();

  assert.equal(result.fetched, 3);
  assert.equal(result.upserted, 2, 'a and c must still be upserted');
  assert.equal(result.failed, 1);
  assert.deepEqual(calls.upserts, ['a', 'b', 'c'], 'must still attempt every item, not stop at the failure');
});

test('returns cleanly with zero counts when the feed has no items', async () => {
  const { ingestRecallsJob } = loadJob({ items: [] });

  const result = await ingestRecallsJob();

  assert.deepEqual(result, { fetched: 0, upserted: 0, failed: 0 });
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  PROPERTY_ENRICHMENT_CONTRACT_REPLAY_LIMIT,
  requeueStalePropertyEnrichmentContracts,
} = require('../../src/propertyEnrichment/requeueStaleContracts.ts');

test('selects prior matches and negative contracts and queues current address versions with v3 identity', async () => {
  let query;
  const added = [];
  const result = await requeueStalePropertyEnrichmentContracts(
    { add: async (name, data, options) => { added.push({ name, data, options }); } },
    { findMany: async (args) => {
      query = args;
      return [{ propertyId: 'property-1', property: { addressIdentityVersion: 3 } }];
    } },
  );

  assert.deepEqual(query.where, {
    provider: 'RENTCAST',
    contractVersion: { lt: 3 },
    matchStatus: { in: ['MATCHED', 'NO_MATCH', 'AMBIGUOUS'] },
  });
  assert.equal(query.take, PROPERTY_ENRICHMENT_CONTRACT_REPLAY_LIMIT);
  assert.deepEqual(added, [{
    name: 'rentcast-property-enrichment-v3',
    data: {
      propertyId: 'property-1',
      provider: 'RENTCAST',
      addressVersion: 3,
      contractVersion: 3,
    },
    options: {
      jobId: 'rentcast-property-1-3-v3',
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  }]);
  assert.deepEqual(result, { selected: 1, enqueued: 1, failed: 0 });
});

test('continues the bounded replay when one enqueue fails', async () => {
  let call = 0;
  const result = await requeueStalePropertyEnrichmentContracts(
    { add: async () => { call += 1; if (call === 1) throw new Error('redis unavailable'); } },
    { findMany: async () => [
      { propertyId: 'property-1', property: { addressIdentityVersion: 1 } },
      { propertyId: 'property-2', property: { addressIdentityVersion: 4 } },
    ] },
  );
  assert.deepEqual(result, { selected: 2, enqueued: 1, failed: 1 });
});

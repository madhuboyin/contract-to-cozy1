const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Operations Item #12 (§5.16): hasAcceptedWorkItemForProperty backs the
// NO_ACCEPTED_WORK vs. ALL_CAUGHT_UP distinction in the empty-state reason
// computation — it must reflect whether this property has EVER had work
// accepted, not just currently-accepted rows.

let countArgs = null;
let countResult = 0;

const prismaMock = {
  operationalWorkItem: {
    count: async (args) => {
      countArgs = args;
      return countResult;
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { countAcceptedWorkItemsForProperty } = require('../../src/modules/homeOperations/infrastructure/workItemRepository.ts');
const { hasAcceptedWorkItemForProperty } = require('../../src/modules/homeOperations/application/hasAcceptedWorkItem.usecase.ts');

test('countAcceptedWorkItemsForProperty scopes by propertyId and acceptanceState ACCEPTED', async () => {
  countResult = 2;
  const count = await countAcceptedWorkItemsForProperty('property-1');
  assert.equal(count, 2);
  assert.deepEqual(countArgs, { where: { propertyId: 'property-1', acceptanceState: 'ACCEPTED' } });
});

test('hasAcceptedWorkItemForProperty is true when the count is greater than zero', async () => {
  countResult = 1;
  assert.equal(await hasAcceptedWorkItemForProperty('property-1'), true);
});

test('hasAcceptedWorkItemForProperty is false when the count is zero', async () => {
  countResult = 0;
  assert.equal(await hasAcceptedWorkItemForProperty('property-1'), false);
});

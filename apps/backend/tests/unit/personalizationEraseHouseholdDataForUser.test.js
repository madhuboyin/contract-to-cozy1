const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadUseCase() {
  const path = require.resolve('../../src/modules/personalization/application/eraseHouseholdDataForUser.usecase.ts');
  delete require.cache[path];
  return require('../../src/modules/personalization/application/eraseHouseholdDataForUser.usecase.ts');
}

test('deletes Household rows scoped to ownerUserId, cascading composition data', async () => {
  const deleteManyCalls = [];
  const tx = {
    household: {
      deleteMany: async ({ where }) => {
        deleteManyCalls.push(where);
        return { count: 1 };
      },
    },
  };
  const { eraseHouseholdDataForUser } = loadUseCase();

  await eraseHouseholdDataForUser(tx, 'user-1');

  assert.equal(deleteManyCalls.length, 1);
  assert.deepEqual(deleteManyCalls[0], { ownerUserId: 'user-1' });
});

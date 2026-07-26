const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deleteSavedRefinanceLoanEstimateComparison,
} = require('../../dist/refinanceRadar/refinanceLoanEstimateSnapshot.service');

test('deletes only the comparison scoped to the requested property', async () => {
  let receivedWhere;
  const deleted = await deleteSavedRefinanceLoanEstimateComparison(
    'property-1',
    'comparison-1',
    {
      refinanceLoanEstimateComparisonSnapshot: {
        deleteMany: async ({ where }) => {
          receivedWhere = where;
          return { count: 1 };
        },
      },
    },
  );
  assert.equal(deleted, true);
  assert.deepEqual(receivedWhere, {
    id: 'comparison-1',
    propertyId: 'property-1',
  });
});

test('returns false when no property-scoped comparison is found', async () => {
  const deleted = await deleteSavedRefinanceLoanEstimateComparison(
    'property-1',
    'comparison-other',
    {
      refinanceLoanEstimateComparisonSnapshot: {
        deleteMany: async () => ({ count: 0 }),
      },
    },
  );
  assert.equal(deleted, false);
});

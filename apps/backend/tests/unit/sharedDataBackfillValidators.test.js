const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  runSharedDataBackfillBodySchema,
  sharedSignalHealthQuerySchema,
  sharedDataBackfillScopeQuerySchema,
} = require('../../src/validators/sharedDataBackfill.validators.ts');

test('runSharedDataBackfillBodySchema accepts bounded backfill options', async () => {
  const parsed = await runSharedDataBackfillBodySchema.parseAsync({
    propertyId: '5e41e864-8423-44a0-89bf-4fd660f2db2a',
    dryRun: false,
    limit: 50,
    includePreference: true,
    includeAssumptions: true,
    includeSignals: true,
  });

  assert.equal(parsed.dryRun, false);
  assert.equal(parsed.limit, 50);
});

test('runSharedDataBackfillBodySchema rejects invalid limits', async () => {
  await assert.rejects(
    () =>
      runSharedDataBackfillBodySchema.parseAsync({
        dryRun: true,
        limit: 1000,
      }),
  );
});

test('sharedDataBackfillScopeQuerySchema parses admin scope filters', async () => {
  const parsed = await sharedDataBackfillScopeQuerySchema.parseAsync({
    query: {
      propertyId: '5e41e864-8423-44a0-89bf-4fd660f2db2a',
      limit: '25',
      startAfterPropertyId: '17f48814-5f3a-4d6a-b0d4-30cae0d5ef9f',
    },
  });

  assert.equal(parsed.query.limit, 25);
});

test('sharedSignalHealthQuerySchema parses signal health filters', async () => {
  const parsed = await sharedSignalHealthQuerySchema.parseAsync({
    query: {
      limit: '50',
      lookbackDays: '90',
    },
  });

  assert.equal(parsed.query.limit, 50);
  assert.equal(parsed.query.lookbackDays, 90);
});

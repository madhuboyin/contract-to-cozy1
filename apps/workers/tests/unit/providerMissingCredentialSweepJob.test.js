// apps/workers/tests/unit/providerMissingCredentialSweepJob.test.js
//
// W4 item 4: providerMissingCredentialSweepJob had no dedicated test.
// Research found the worst error-isolation gap of any job surveyed this
// slice — the entire per-provider loop had zero try/catch, so one
// provider's query/update failure aborted the whole weekly sweep, meaning
// every other provider silently got no missing-credential check that week.
// Fixed with the same per-item isolation pattern used elsewhere.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({
  providers,
  openAlertsByProvider = {},
  requirementsByProvider = {},
  credentialsByProvider = {},
  existingAlertByDedupeKey = {},
  providerProfileFindManyShouldThrow = false,
  alertUpdateShouldFailFor = new Set(),
}) {
  const calls = { updates: [], creates: [] };

  const prismaMock = {
    providerProfile: {
      findMany: async () => {
        if (providerProfileFindManyShouldThrow) throw new Error('providerProfile.findMany failed');
        return providers;
      },
    },
    providerComplianceAlert: {
      findMany: async ({ where }) => openAlertsByProvider[where.providerProfileId] ?? [],
      findUnique: async ({ where }) => existingAlertByDedupeKey[where.dedupeKey] ?? null,
      update: async (args) => {
        calls.updates.push(args);
        if (alertUpdateShouldFailFor.has(args.where.id)) {
          throw new Error(`update failed for alert ${args.where.id}`);
        }
        return { id: args.where.id, ...args.data };
      },
      create: async (args) => {
        calls.creates.push(args);
        return { id: `alert-new-${calls.creates.length}`, ...args.data };
      },
    },
    providerCredentialRequirement: {
      findMany: async ({ where }) => requirementsByProvider[where.serviceCategory.in[0]] ?? [],
    },
    providerCredential: {
      findMany: async ({ where }) => credentialsByProvider[where.providerProfileId] ?? [],
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const jobPath = require.resolve('../../src/jobs/providerMissingCredentialSweep.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

test('creates an alert for a provider missing a required credential', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [{ id: 'provider-1', serviceCategories: ['PLUMBING'] }],
    requirementsByProvider: { PLUMBING: [{ serviceCategory: 'PLUMBING', credentialType: 'LICENSE' }] },
    credentialsByProvider: { 'provider-1': [] },
  });

  const result = await providerMissingCredentialSweepJob();

  assert.equal(result.alertsCreated, 1);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].data.dedupeKey, 'provider-1:MISSING_REQUIRED_CREDENTIAL:PLUMBING:LICENSE');
});

test('does not create a duplicate alert when the credential was already submitted', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [{ id: 'provider-1', serviceCategories: ['PLUMBING'] }],
    requirementsByProvider: { PLUMBING: [{ serviceCategory: 'PLUMBING', credentialType: 'LICENSE' }] },
    credentialsByProvider: { 'provider-1': [{ type: 'LICENSE', serviceCategories: ['PLUMBING'] }] },
  });

  const result = await providerMissingCredentialSweepJob();

  assert.equal(result.alertsCreated, 0);
  assert.equal(calls.creates.length, 0);
});

test('resolves every open alert when the provider drops all service categories', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [{ id: 'provider-1', serviceCategories: [] }],
    openAlertsByProvider: {
      'provider-1': [{ id: 'alert-1', dedupeKey: 'provider-1:MISSING_REQUIRED_CREDENTIAL:PLUMBING:LICENSE' }],
    },
  });

  const result = await providerMissingCredentialSweepJob();

  assert.equal(result.alertsResolved, 1);
  assert.equal(calls.updates[0].data.status, 'RESOLVED');
});

test('resolves an open alert once its gap no longer exists', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [{ id: 'provider-1', serviceCategories: ['PLUMBING'] }],
    openAlertsByProvider: {
      'provider-1': [{ id: 'alert-1', dedupeKey: 'provider-1:MISSING_REQUIRED_CREDENTIAL:PLUMBING:LICENSE' }],
    },
    requirementsByProvider: { PLUMBING: [{ serviceCategory: 'PLUMBING', credentialType: 'LICENSE' }] },
    credentialsByProvider: { 'provider-1': [{ type: 'LICENSE', serviceCategories: ['PLUMBING'] }] },
  });

  const result = await providerMissingCredentialSweepJob();

  assert.equal(result.alertsResolved, 1);
  const resolveCall = calls.updates.find((u) => u.where.id === 'alert-1');
  assert.equal(resolveCall.data.status, 'RESOLVED');
});

test('reopens a previously-RESOLVED alert when the gap reappears', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [{ id: 'provider-1', serviceCategories: ['PLUMBING'] }],
    requirementsByProvider: { PLUMBING: [{ serviceCategory: 'PLUMBING', credentialType: 'LICENSE' }] },
    credentialsByProvider: { 'provider-1': [] },
    existingAlertByDedupeKey: {
      'provider-1:MISSING_REQUIRED_CREDENTIAL:PLUMBING:LICENSE': { id: 'alert-1', status: 'RESOLVED' },
    },
  });

  const result = await providerMissingCredentialSweepJob();

  assert.equal(result.alertsCreated, 0, 'reopening an existing alert is not counted as a new create');
  assert.equal(calls.creates.length, 0);
  const reopenCall = calls.updates.find((u) => u.where.id === 'alert-1');
  assert.ok(reopenCall);
  assert.equal(reopenCall.data.status, 'NEW');
});

test('one provider throwing does not abort the sweep for the rest of the batch', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [
      { id: 'provider-1', serviceCategories: ['PLUMBING'] },
      { id: 'provider-2', serviceCategories: ['ELECTRICAL'] },
    ],
    requirementsByProvider: {
      PLUMBING: [{ serviceCategory: 'PLUMBING', credentialType: 'LICENSE' }],
      ELECTRICAL: [{ serviceCategory: 'ELECTRICAL', credentialType: 'LICENSE' }],
    },
    credentialsByProvider: { 'provider-1': [], 'provider-2': [] },
    openAlertsByProvider: {
      'provider-1': [{ id: 'alert-1', dedupeKey: 'provider-1:MISSING_REQUIRED_CREDENTIAL:PLUMBING:CERT' }],
    },
    // provider-1's resolve-attempt on alert-1 throws — provider-2 must still be processed.
    alertUpdateShouldFailFor: new Set(['alert-1']),
  });

  const result = await providerMissingCredentialSweepJob();

  assert.equal(result.providersFailed, 1);
  assert.equal(result.alertsCreated, 1, 'provider-2 must still get its missing-credential alert created');
  assert.ok(calls.creates.some((c) => c.data.providerProfileId === 'provider-2'));
});

test('the whole sweep still throws cleanly if the initial provider query itself fails', async () => {
  const { providerMissingCredentialSweepJob } = loadJob({
    providers: [],
    providerProfileFindManyShouldThrow: true,
  });

  await assert.rejects(() => providerMissingCredentialSweepJob());
});

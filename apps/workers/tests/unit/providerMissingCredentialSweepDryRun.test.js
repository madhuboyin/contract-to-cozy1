// apps/workers/tests/unit/providerMissingCredentialSweepDryRun.test.js
//
// Worker audit follow-up slice: provider-missing-credential-sweep is one of
// the 7 broadSweep/externalProvider jobs wired for dry-run + manual-trigger
// support. Not property-scoped (operates on providers, not properties), so
// unlike the property-scoped jobs in this slice there's no propertyId/
// allowlist path — only dryRun. Covers: dry-run skips all alert writes but
// still counts what would happen; a manual trigger (opts passed at all,
// even with dryRun:false) tags a smokeCorrelationId, mirroring
// mortgage-rate-ingest's "opts presence is the manual-trigger signal"
// convention for non-property-scoped jobs.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

function loadJob({
  providers,
  openAlertsByProvider = {},
  requirementsByProvider = {},
  credentialsByProvider = {},
  existingAlertByDedupeKey = {},
}) {
  const calls = { updates: [], creates: [] };

  const prismaMock = {
    providerProfile: {
      findMany: async () => providers,
    },
    providerComplianceAlert: {
      findMany: async ({ where }) => openAlertsByProvider[where.providerProfileId] ?? [],
      findUnique: async ({ where }) => existingAlertByDedupeKey[where.dedupeKey] ?? null,
      update: async (args) => {
        calls.updates.push(args);
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

function provider(overrides = {}) {
  return { id: 'provider-1', serviceCategories: ['PLUMBING'], ...overrides };
}

test('dry run: examines and counts a new missing-credential alert but creates nothing', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [provider()],
    requirementsByProvider: { PLUMBING: [{ serviceCategory: 'PLUMBING', credentialType: 'LICENSE' }] },
    credentialsByProvider: {},
  });

  const result = await providerMissingCredentialSweepJob({ dryRun: true });

  assert.equal(calls.creates.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(result.alertsCreated, 1);
});

test('dry run: counts a resolvable alert (gap no longer applies) but resolves nothing', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [provider()],
    openAlertsByProvider: {
      'provider-1': [{ id: 'alert-1', dedupeKey: 'provider-1:MISSING_REQUIRED_CREDENTIAL:PLUMBING:LICENSE' }],
    },
    requirementsByProvider: { PLUMBING: [{ serviceCategory: 'PLUMBING', credentialType: 'LICENSE' }] },
    credentialsByProvider: { 'provider-1': [{ type: 'LICENSE', serviceCategories: ['PLUMBING'] }] },
  });

  const result = await providerMissingCredentialSweepJob({ dryRun: true });

  assert.equal(calls.updates.length, 0);
  assert.equal(result.alertsResolved, 1);
});

test('no opts (the weekly cron tick): behaves exactly like a real run', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [provider()],
    requirementsByProvider: { PLUMBING: [{ serviceCategory: 'PLUMBING', credentialType: 'LICENSE' }] },
    credentialsByProvider: {},
  });

  const result = await providerMissingCredentialSweepJob();

  assert.equal(calls.creates.length, 1);
  assert.equal(result.alertsCreated, 1);
  assert.equal(result.smokeCorrelationId, undefined);
});

test('a manual trigger (opts passed, dryRun:false) tags a smokeCorrelationId', async () => {
  const { providerMissingCredentialSweepJob, calls } = loadJob({
    providers: [provider()],
    requirementsByProvider: { PLUMBING: [{ serviceCategory: 'PLUMBING', credentialType: 'LICENSE' }] },
    credentialsByProvider: {},
  });

  const result = await providerMissingCredentialSweepJob({ dryRun: false });

  assert.equal(calls.creates.length, 1);
  assert.match(result.smokeCorrelationId, /^smoke:provider-missing-credential-sweep:/);
});

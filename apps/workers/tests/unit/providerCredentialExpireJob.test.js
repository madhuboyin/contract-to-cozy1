// apps/workers/tests/unit/providerCredentialExpireJob.test.js
//
// W4 item 4: providerCredentialExpireJob had no dedicated test. Research
// also found a real gap: the expiry loop had no per-credential error
// isolation — one bad update aborted the whole batch, leaving every
// remaining expired-but-not-yet-marked credential incorrectly ACTIVE until
// the next run. Fixed with the same per-item try/catch pattern already used
// elsewhere in this project (seasonal checklist generation, recall ingest).

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({ expiredCredentials, updateShouldFailFor = new Set(), recomputeShouldFailFor = new Set() }) {
  const calls = { updates: [], recomputed: [] };

  const prismaMock = {
    providerCredential: {
      findMany: async () => expiredCredentials,
      update: async (args) => {
        calls.updates.push(args);
        if (updateShouldFailFor.has(args.where.id)) {
          throw new Error(`update failed for ${args.where.id}`);
        }
        return { id: args.where.id, ...args.data };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const compliancePath = require.resolve('../../../backend/src/services/providerCompliance.service.ts');
  require.cache[compliancePath] = {
    id: compliancePath,
    filename: compliancePath,
    loaded: true,
    exports: {
      providerComplianceService: {
        recomputeProviderStatus: async (providerProfileId) => {
          calls.recomputed.push(providerProfileId);
          if (recomputeShouldFailFor.has(providerProfileId)) {
            throw new Error(`recompute failed for ${providerProfileId}`);
          }
        },
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/providerCredentialExpire.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

test('expires every credential past its expiryDate and recomputes each affected provider once', async () => {
  const { providerCredentialExpireJob, calls } = loadJob({
    expiredCredentials: [
      { id: 'cred-1', providerProfileId: 'provider-a' },
      { id: 'cred-2', providerProfileId: 'provider-a' },
      { id: 'cred-3', providerProfileId: 'provider-b' },
    ],
  });

  const result = await providerCredentialExpireJob();

  assert.equal(result.expiredCount, 3);
  assert.equal(result.expireFailed, 0);
  assert.equal(result.providersRecomputed, 2);
  assert.equal(calls.updates.length, 3);
  assert.deepEqual(calls.recomputed.sort(), ['provider-a', 'provider-b']);
});

test('one credential update failing does not abort expiry for the rest of the batch', async () => {
  const { providerCredentialExpireJob, calls } = loadJob({
    expiredCredentials: [
      { id: 'cred-1', providerProfileId: 'provider-a' },
      { id: 'cred-2', providerProfileId: 'provider-b' },
      { id: 'cred-3', providerProfileId: 'provider-c' },
    ],
    updateShouldFailFor: new Set(['cred-2']),
  });

  const result = await providerCredentialExpireJob();

  assert.equal(calls.updates.length, 3, 'must still attempt every credential, not stop at the first failure');
  assert.equal(result.expiredCount, 2, 'only successfully-expired credentials are counted');
  assert.equal(result.expireFailed, 1);
  assert.deepEqual(calls.recomputed.sort(), ['provider-a', 'provider-c'], 'the failed credential\'s provider must not be recomputed since its status never actually changed');
});

test('one provider recompute failing does not prevent recompute for other affected providers', async () => {
  const { providerCredentialExpireJob, calls } = loadJob({
    expiredCredentials: [
      { id: 'cred-1', providerProfileId: 'provider-a' },
      { id: 'cred-2', providerProfileId: 'provider-b' },
    ],
    recomputeShouldFailFor: new Set(['provider-a']),
  });

  const result = await providerCredentialExpireJob();

  assert.equal(result.expiredCount, 2);
  assert.equal(result.providersRecomputed, 1, 'only the provider whose recompute succeeded is counted');
  assert.deepEqual(calls.recomputed.sort(), ['provider-a', 'provider-b'], 'both must still be attempted');
});

test('returns zero counts cleanly when nothing has expired', async () => {
  const { providerCredentialExpireJob, calls } = loadJob({ expiredCredentials: [] });

  const result = await providerCredentialExpireJob();

  assert.deepEqual(result, { expiredCount: 0, expireFailed: 0, providersRecomputed: 0 });
  assert.equal(calls.updates.length, 0);
});

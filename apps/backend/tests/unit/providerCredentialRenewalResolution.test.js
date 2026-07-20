// apps/backend/tests/unit/providerCredentialRenewalResolution.test.js
//
// W3 (provider compliance) — automatic resolution: renew() creates a new
// ProviderCredential row (renewalOfCredentialId) rather than mutating the
// expiring one, so approving a renewal previously left the OLD credential's
// EXPIRING_SOON alert and any open homeowner-visible PROVIDER_CREDENTIAL_LAPSE
// incident open until the old credential's real calendar expiry passed —
// days or weeks after the risk was actually fixed. approve() now resolves
// both immediately when the approved credential is a renewal.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ credential, openIncidents = [] }) {
  const alertUpdateManyCalls = [];
  const incidentSetStatusCalls = [];

  const prismaMock = {
    providerCredential: {
      update: async () => credential,
    },
    providerComplianceAlert: {
      updateMany: async (args) => {
        alertUpdateManyCalls.push(args);
        return { count: 1 };
      },
    },
    incident: {
      findMany: async () => openIncidents,
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const compliancePath = require.resolve('../../src/services/providerCompliance.service.ts');
  require.cache[compliancePath] = {
    id: compliancePath,
    filename: compliancePath,
    loaded: true,
    exports: { providerComplianceService: { recomputeProviderStatus: async () => ({}) } },
  };

  const incidentServicePath = require.resolve('../../src/services/incidents/incident.service.ts');
  require.cache[incidentServicePath] = {
    id: incidentServicePath,
    filename: incidentServicePath,
    loaded: true,
    exports: {
      IncidentService: {
        setStatus: async (id, status) => {
          incidentSetStatusCalls.push({ id, status });
        },
      },
    },
  };

  // providerCredential.service.ts imports NotificationService at module
  // scope, which transitively imports JobQueue.service.ts — that opens
  // real BullMQ/Redis connections on import. approve() itself never calls
  // NotificationService, so a stub is enough to avoid the hang.
  const notificationServicePath = require.resolve('../../src/services/notification.service.ts');
  require.cache[notificationServicePath] = {
    id: notificationServicePath,
    filename: notificationServicePath,
    loaded: true,
    exports: { NotificationService: { create: async () => null } },
  };

  const servicePath = require.resolve('../../src/services/providerCredential.service.ts');
  delete require.cache[servicePath];
  return {
    service: require(servicePath).providerCredentialService,
    getAlertUpdateManyCalls: () => alertUpdateManyCalls,
    getIncidentSetStatusCalls: () => incidentSetStatusCalls,
  };
}

function credential(overrides = {}) {
  return {
    id: 'credential-new',
    providerProfileId: 'provider-1',
    renewalOfCredentialId: null,
    ...overrides,
  };
}

test('approving a renewal resolves the superseded credential\'s EXPIRING_SOON alert', async () => {
  const { service, getAlertUpdateManyCalls } = loadService({
    credential: credential({ renewalOfCredentialId: 'credential-old' }),
  });

  await service.approve('credential-new', 'admin-1');

  assert.equal(getAlertUpdateManyCalls().length, 1);
  assert.equal(getAlertUpdateManyCalls()[0].where.credentialId, 'credential-old');
  assert.deepEqual(getAlertUpdateManyCalls()[0].data, { status: 'RESOLVED', resolvedAt: getAlertUpdateManyCalls()[0].data.resolvedAt });
});

test('approving a renewal resolves an open PROVIDER_CREDENTIAL_LAPSE incident tied to the superseded credential', async () => {
  const { service, getIncidentSetStatusCalls } = loadService({
    credential: credential({ renewalOfCredentialId: 'credential-old' }),
    openIncidents: [
      { id: 'incident-1', details: { credentialId: 'credential-old' } },
      { id: 'incident-2', details: { credentialId: 'some-other-credential' } },
    ],
  });

  await service.approve('credential-new', 'admin-1');

  assert.equal(getIncidentSetStatusCalls().length, 1);
  assert.equal(getIncidentSetStatusCalls()[0].id, 'incident-1');
  assert.equal(getIncidentSetStatusCalls()[0].status, 'RESOLVED');
});

test('approving a brand-new (non-renewal) credential does not touch any alert or incident', async () => {
  const { service, getAlertUpdateManyCalls, getIncidentSetStatusCalls } = loadService({
    credential: credential({ renewalOfCredentialId: null }),
    openIncidents: [{ id: 'incident-1', details: { credentialId: 'unrelated' } }],
  });

  await service.approve('credential-new', 'admin-1');

  assert.equal(getAlertUpdateManyCalls().length, 0);
  assert.equal(getIncidentSetStatusCalls().length, 0);
});

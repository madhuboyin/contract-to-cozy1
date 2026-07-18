const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    providerProfiles: [
      {
        id: 'pp-1',
        userId: 'provider-1',
        businessName: 'Mike Inspects',
        businessType: 'LLC',
        status: 'ACTIVE',
        serviceCategories: ['INSPECTION'],
        serviceRadius: 25,
        yearsInBusiness: 8,
        teamSize: 3,
        website: null,
        insuranceVerified: true,
        licenseVerified: true,
        backgroundCheckDate: new Date('2026-01-15'),
        averageRating: 4.8,
        totalReviews: 10,
        totalCompletedJobs: 20,
        createdAt: new Date('2026-01-01'),
        user: { id: 'provider-1', firstName: 'Mike', lastName: 'Provider', email: 'mike@inspect.com', status: 'ACTIVE', lastLoginAt: null },
        credentials: [
          { id: 'cred-1', type: 'LICENSE', status: 'PENDING_REVIEW', issuingAuthority: 'TX', issueDate: null, expiryDate: null, serviceCategories: ['INSPECTION'], reviewedAt: null, rejectionReason: null, createdAt: new Date('2026-02-01') },
          { id: 'cred-2', type: 'INSURANCE', status: 'APPROVED', issuingAuthority: 'Acme', issueDate: null, expiryDate: null, serviceCategories: [], reviewedAt: new Date(), rejectionReason: null, createdAt: new Date('2026-01-10') },
        ],
        complianceAlerts: [
          { id: 'al-1', alertType: 'EXPIRY', severity: 'HIGH', status: 'NEW', title: 'License expiring', summary: null, createdAt: new Date() },
          { id: 'al-2', alertType: 'EXPIRY', severity: 'LOW', status: 'RESOLVED', title: 'Old alert', summary: null, createdAt: new Date() },
        ],
        services: [
          { id: 'svc-1', name: 'Home Inspection', category: 'INSPECTION', isActive: true },
        ],
      },
      {
        id: 'pp-2',
        userId: 'provider-2',
        businessName: 'Fix It Pro',
        status: 'PENDING_APPROVAL',
        serviceCategories: ['HANDYMAN'],
        insuranceVerified: false,
        licenseVerified: false,
        averageRating: 0,
        totalReviews: 0,
        totalCompletedJobs: 0,
        createdAt: new Date('2026-03-01'),
        user: { id: 'provider-2', firstName: 'Tom', lastName: 'Fixer', email: 'tom@fixitpro.com', status: 'ACTIVE', lastLoginAt: null },
        credentials: [],
        complianceAlerts: [],
        services: [],
      },
    ],
    bookings: [
      { id: 'b-1', providerProfileId: 'pp-1', status: 'COMPLETED' },
      { id: 'b-2', providerProfileId: 'pp-1', status: 'COMPLETED' },
      { id: 'b-3', providerProfileId: 'pp-1', status: 'DISPUTED' },
    ],
    reviews: [
      { id: 'rev-1', providerId: 'provider-1', status: 'APPROVED' },
      { id: 'rev-2', providerId: 'provider-1', status: 'PENDING' },
    ],
    serviceUpdateManyCalls: [],
    auditLogs: [],
    ...overrides,
  };

  function matchesProvider(p, where) {
    if (!where) return true;
    if (where.status && p.status !== where.status) return false;
    if (where.OR) {
      return where.OR.some((clause) => {
        if (clause.businessName) {
          return p.businessName.toLowerCase().includes(clause.businessName.contains.toLowerCase());
        }
        if (clause.user) {
          const [field, cond] = Object.entries(clause.user)[0];
          return String(p.user[field] ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
        }
        return false;
      });
    }
    return true;
  }

  function selectDirectoryRow(p, select) {
    const out = {};
    for (const key of Object.keys(select)) {
      if (key === 'user') out.user = { ...p.user };
      else if (key === '_count') {
        out._count = {
          credentials: p.credentials.filter((c) => c.status === 'PENDING_REVIEW').length,
          complianceAlerts: p.complianceAlerts.filter((a) => a.status === 'NEW').length,
        };
      } else if (key === 'credentials') out.credentials = [...p.credentials];
      else if (key === 'complianceAlerts') out.complianceAlerts = p.complianceAlerts.filter((a) => a.status !== 'RESOLVED');
      else if (key === 'services') out.services = [...p.services];
      else out[key] = p[key];
    }
    return out;
  }

  function makeTx() {
    return {
      providerProfile: {
        findMany: async ({ where, select, skip = 0, take }) => {
          let results = state.providerProfiles.filter((p) => matchesProvider(p, where));
          results = [...results].sort((a, b) => b.createdAt - a.createdAt).slice(skip, take ? skip + take : undefined);
          return results.map((p) => selectDirectoryRow(p, select));
        },
        findUnique: async ({ where, select }) => {
          const p = state.providerProfiles.find((x) => x.id === where.id);
          if (!p) return null;
          return select ? selectDirectoryRow(p, select) : { ...p };
        },
        count: async ({ where }) => state.providerProfiles.filter((p) => matchesProvider(p, where)).length,
        update: async ({ where, data }) => {
          const index = state.providerProfiles.findIndex((p) => p.id === where.id);
          if (index < 0) throw new Error('not found');
          state.providerProfiles[index] = { ...state.providerProfiles[index], ...data };
          return { ...state.providerProfiles[index] };
        },
      },
      service: {
        updateMany: async ({ where, data }) => {
          state.serviceUpdateManyCalls.push({ where, data });
          return { count: 1 };
        },
      },
      booking: {
        groupBy: async ({ where }) => {
          const grouped = {};
          for (const b of state.bookings.filter((x) => x.providerProfileId === where.providerProfileId)) {
            grouped[b.status] = (grouped[b.status] || 0) + 1;
          }
          return Object.entries(grouped).map(([status, count]) => ({ status, _count: { _all: count } }));
        },
      },
      review: {
        groupBy: async ({ where }) => {
          const grouped = {};
          for (const r of state.reviews.filter((x) => x.providerId === where.providerId)) {
            grouped[r.status] = (grouped[r.status] || 0) + 1;
          }
          return Object.entries(grouped).map(([status, count]) => ({ status, _count: { _all: count } }));
        },
      },
      auditLog: {
        create: async ({ data }) => {
          const record = { id: `audit-${state.auditLogs.length + 1}`, createdAt: new Date(), ...data };
          state.auditLogs.push(record);
          return record;
        },
      },
    };
  }

  const tx = makeTx();
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma } };

  const loggerPath = require.resolve('../../src/lib/logger.ts');
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: { logger: { info: () => {}, warn: () => {}, error: () => {} }, auditLog: () => {}, redactEmail: (e) => e },
  };

  for (const relativePath of [
    '../../src/services/adminAudit.service.ts',
    '../../src/services/adminProviderOps.service.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const providerOpsService = require('../../src/services/adminProviderOps.service.ts');

  return { state, providerOpsService };
}

test('listProviders searches by business name and surfaces pending-credential/alert counts', async () => {
  const { providerOpsService } = createHarness();
  const result = await providerOpsService.listProviders({ q: 'mike' });
  assert.equal(result.total, 1);
  assert.equal(result.providers[0].id, 'pp-1');
  assert.equal(result.providers[0].pendingCredentialCount, 1);
  assert.equal(result.providers[0].openComplianceAlertCount, 1);
});

test('listProviders filters by status', async () => {
  const { providerOpsService } = createHarness();
  const result = await providerOpsService.listProviders({ status: 'PENDING_APPROVAL' });
  assert.equal(result.total, 1);
  assert.equal(result.providers[0].id, 'pp-2');
});

test('getProviderDetail returns credentials, unresolved alerts only, and booking/review counts', async () => {
  const { providerOpsService } = createHarness();
  const detail = await providerOpsService.getProviderDetail('pp-1');
  assert.equal(detail.credentials.length, 2);
  assert.equal(detail.complianceAlerts.length, 1, 'RESOLVED alerts are excluded');
  assert.equal(detail.bookingCounts.COMPLETED, 2);
  assert.equal(detail.bookingCounts.DISPUTED, 1);
  assert.equal(detail.reviewCounts.APPROVED, 1);

  await assert.rejects(
    () => providerOpsService.getProviderDetail('nope'),
    (err) => err.code === 'PROVIDER_NOT_FOUND'
  );
});

test('changeProviderStatus suspends: deactivates listings, audits; self-action and noop guarded', async () => {
  const { providerOpsService, state } = createHarness();

  await assert.rejects(
    () => providerOpsService.changeProviderStatus({ providerProfileId: 'pp-1', actorId: 'provider-1', status: 'SUSPENDED', reason: 'x' }),
    (err) => err.code === 'SELF_ACTION_FORBIDDEN'
  );

  const noop = await providerOpsService.changeProviderStatus({ providerProfileId: 'pp-1', actorId: 'admin-1', status: 'ACTIVE', reason: 'already active' });
  assert.equal(noop.noop, true);
  assert.equal(state.auditLogs.length, 0, 'noop is not audited');

  const changed = await providerOpsService.changeProviderStatus({ providerProfileId: 'pp-1', actorId: 'admin-1', status: 'SUSPENDED', reason: 'safety complaint' });
  assert.equal(changed.previousStatus, 'ACTIVE');
  assert.equal(state.providerProfiles[0].status, 'SUSPENDED');
  assert.equal(state.serviceUpdateManyCalls.length, 1);
  assert.equal(state.serviceUpdateManyCalls[0].data.isActive, false);

  const audit = state.auditLogs.at(-1);
  assert.equal(audit.action, 'ADMIN_CHANGE_PROVIDER_STATUS');
  assert.deepEqual(audit.newValues, { status: 'SUSPENDED' });
});

test('changeProviderStatus reinstating does not re-enable listings', async () => {
  const { providerOpsService, state } = createHarness();
  state.providerProfiles[0].status = 'SUSPENDED';

  const result = await providerOpsService.changeProviderStatus({ providerProfileId: 'pp-1', actorId: 'admin-1', status: 'ACTIVE', reason: 'appeal approved' });
  assert.equal(result.noop, false);
  assert.equal(state.providerProfiles[0].status, 'ACTIVE');
  assert.equal(state.serviceUpdateManyCalls.length, 0, 'reinstating must not touch service listings');
});

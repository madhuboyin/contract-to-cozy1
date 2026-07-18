const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    // Which capabilities the actor holds — drives which domains are searched.
    grants: [
      { userId: 'admin-1', capability: 'USER_VIEW', revokedAt: null },
      { userId: 'admin-1', capability: 'SUPPORT_CASE_MANAGE', revokedAt: null },
      // admin-2 holds only PROVIDER_VIEW.
      { userId: 'admin-2', capability: 'PROVIDER_VIEW', revokedAt: null },
    ],
    users: [
      { id: 'user-1', email: 'sarah@example.com', firstName: 'Sarah', lastName: 'Homeowner', role: 'HOMEOWNER', status: 'ACTIVE' },
    ],
    providerProfiles: [
      { id: 'pp-1', businessName: 'Sarah & Sons Plumbing', status: 'ACTIVE' },
    ],
    bookings: [
      { id: 'b-1', bookingNumber: 'B-2026-SARAH1', status: 'PENDING', category: 'PLUMBING' },
    ],
    cases: [
      { id: 'case-1', caseNumber: 'CASE-2026-AAAAAA', title: 'Sarah dispute', type: 'DISPUTE', status: 'OPEN' },
    ],
    privacyRequests: [
      { id: 'pr-1', requestNumber: 'PRIV-2026-BBBBBB', userEmail: 'sarah@example.com', type: 'DELETION', status: 'RECEIVED' },
    ],
    ...overrides,
  };

  function contains(haystack, cond) {
    return String(haystack ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
  }

  function matchesOr(row, where) {
    if (where.OR) return where.OR.some((clause) => matchesOr(row, clause));
    const [field, cond] = Object.entries(where)[0];
    return contains(row[field], cond);
  }

  const prisma = {
    adminCapabilityGrant: {
      findMany: async ({ where }) =>
        state.grants
          .filter((g) => g.userId === where.userId && g.revokedAt === null)
          .map((g) => ({ capability: g.capability })),
    },
    user: {
      findMany: async ({ where, take }) => state.users.filter((u) => matchesOr(u, where)).slice(0, take),
    },
    providerProfile: {
      findMany: async ({ where, take }) => state.providerProfiles.filter((p) => matchesOr(p, where)).slice(0, take),
    },
    booking: {
      findMany: async ({ where, take }) => state.bookings.filter((b) => matchesOr(b, where)).slice(0, take),
    },
    adminCase: {
      findMany: async ({ where, take }) => state.cases.filter((c) => matchesOr(c, where)).slice(0, take),
    },
    privacyRequest: {
      findMany: async ({ where, take }) => state.privacyRequests.filter((r) => matchesOr(r, where)).slice(0, take),
    },
  };

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
    '../../src/services/adminCapability.service.ts',
    '../../src/services/adminSearch.service.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const searchService = require('../../src/services/adminSearch.service.ts');

  return { state, searchService };
}

test('globalSearch only returns domains the actor holds view capabilities for', async () => {
  const { searchService } = createHarness();

  // admin-1: USER_VIEW + SUPPORT_CASE_MANAGE — "sarah" matches user, provider,
  // booking, case, and privacy rows, but only user + case may be returned.
  const results = await searchService.globalSearch('admin-1', 'sarah');
  const types = results.map((r) => r.type).sort();
  assert.deepEqual(types, ['CASE', 'USER']);

  const user = results.find((r) => r.type === 'USER');
  assert.equal(user.label, 'Sarah Homeowner');
  assert.equal(user.href, '/dashboard/admin/users');
});

test('globalSearch for a provider-only admin returns only providers', async () => {
  const { searchService } = createHarness();
  const results = await searchService.globalSearch('admin-2', 'sarah');
  assert.equal(results.length, 1);
  assert.equal(results[0].type, 'PROVIDER');
  assert.equal(results[0].label, 'Sarah & Sons Plumbing');
});

test('globalSearch with no capabilities or blank query returns nothing', async () => {
  const { searchService } = createHarness();
  const nothing = await searchService.globalSearch('admin-3', 'sarah');
  assert.deepEqual(nothing, []);

  const blank = await searchService.globalSearch('admin-1', '   ');
  assert.deepEqual(blank, []);
});

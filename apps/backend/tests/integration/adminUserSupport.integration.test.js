const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    users: [
      { id: 'admin-1', email: 'admin@example.com', firstName: 'Ada', lastName: 'Min', role: 'ADMIN', status: 'ACTIVE', createdAt: new Date('2026-01-01'), tokenVersion: 0 },
      { id: 'user-1', email: 'sarah@example.com', firstName: 'Sarah', lastName: 'Homeowner', role: 'HOMEOWNER', status: 'ACTIVE', createdAt: new Date('2026-01-02'), tokenVersion: 0, emailVerified: true, phoneVerified: false, mfaEnabled: false, lastLoginAt: null, tosAcceptedAt: null, tosVersion: null },
      { id: 'provider-1', email: 'mike@inspect.com', firstName: 'Mike', lastName: 'Provider', role: 'PROVIDER', status: 'ACTIVE', createdAt: new Date('2026-01-03'), tokenVersion: 0, emailVerified: true, phoneVerified: false, mfaEnabled: false, lastLoginAt: null, tosAcceptedAt: null, tosVersion: null },
    ],
    refreshTokenSessions: [
      { id: 's-1', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() + 100000) },
      { id: 's-2', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() + 100000) },
    ],
    homeownerProfiles: { 'user-1': { segment: 'EXISTING_OWNER', properties: [{ id: 'p-1' }, { id: 'p-2' }] } },
    providerProfiles: { 'provider-1': { businessName: 'Mike Inspects', businessType: 'LLC', status: 'APPROVED', insuranceVerified: true, licenseVerified: true, averageRating: 4.8, totalReviews: 10, totalCompletedJobs: 20 } },
    providerProfileUpdateManyCalls: [],
    serviceUpdateManyCalls: [],
    auditLogs: [],
    ...overrides,
  };

  function makeTx() {
    return {
      user: {
        findUnique: async ({ where }) => {
          const u = state.users.find((x) => x.id === where.id);
          return u ? { ...u } : null;
        },
        update: async ({ where, data }) => {
          const index = state.users.findIndex((u) => u.id === where.id);
          if (index < 0) throw new Error('User not found');
          const current = state.users[index];
          const next = { ...current };
          for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === 'object' && 'increment' in value) {
              next[key] = (next[key] || 0) + value.increment;
            } else {
              next[key] = value;
            }
          }
          state.users[index] = next;
          return { ...next };
        },
        findMany: async ({ where, select, take, orderBy }) => {
          let results = state.users.filter((u) => {
            if (!where?.OR) return true;
            return where.OR.some((clause) => {
              const [field, cond] = Object.entries(clause)[0];
              const value = String(u[field] ?? '').toLowerCase();
              return value.includes(String(cond.contains).toLowerCase());
            });
          });
          if (orderBy?.createdAt === 'desc') results = [...results].sort((a, b) => b.createdAt - a.createdAt);
          if (take) results = results.slice(0, take);
          return results.map((u) => {
            if (!select) return { ...u };
            const out = {};
            for (const key of Object.keys(select)) out[key] = u[key];
            return out;
          });
        },
      },
      refreshTokenSession: {
        updateMany: async ({ where, data }) => {
          let count = 0;
          state.refreshTokenSessions = state.refreshTokenSessions.map((s) => {
            if (s.userId !== where.userId) return s;
            if (where.revokedAt === null && s.revokedAt !== null) return s;
            count += 1;
            return { ...s, ...data };
          });
          return { count };
        },
        count: async ({ where }) => {
          return state.refreshTokenSessions.filter((s) => {
            if (s.userId !== where.userId) return false;
            if (where.revokedAt === null && s.revokedAt !== null) return false;
            if (where.expiresAt?.gt && !(s.expiresAt > where.expiresAt.gt)) return false;
            return true;
          }).length;
        },
      },
      providerProfile: {
        updateMany: async ({ where, data }) => {
          state.providerProfileUpdateManyCalls.push({ where, data });
          return { count: state.providerProfiles[where.userId] ? 1 : 0 };
        },
      },
      service: {
        updateMany: async ({ where, data }) => {
          state.serviceUpdateManyCalls.push({ where, data });
          return { count: 0 };
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

  const prisma = {
    ...tx,
    $transaction: async (callback) => callback(tx),
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma } };

  const loggerPath = require.resolve('../../src/lib/logger.ts');
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      auditLog: () => {},
      redactEmail: (email) => email,
    },
  };

  for (const relativePath of [
    '../../src/services/adminAudit.service.ts',
    '../../src/controllers/user.controller.ts',
    '../../src/services/adminUserSupport.service.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const userSupportService = require('../../src/services/adminUserSupport.service.ts');

  return { state, userSupportService };
}

test('searchUsers matches by case-insensitive email/name substring', async () => {
  const { userSupportService } = createHarness();
  const results = await userSupportService.searchUsers('sarah');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'user-1');
  assert.equal('passwordHash' in results[0], false);
});

test('getUserSummary returns active session count and homeowner profile summary, throws for missing user', async () => {
  const { userSupportService, state } = createHarness();
  state.users.find((u) => u.id === 'user-1').homeownerProfile = state.homeownerProfiles['user-1'];

  // Patch findUnique used by getUserSummary to include profile relations directly on state for this test.
  const summary = await userSupportService.getUserSummary('user-1');
  assert.equal(summary.id, 'user-1');
  assert.equal(summary.activeSessionCount, 2);

  await assert.rejects(
    () => userSupportService.getUserSummary('does-not-exist'),
    (err) => err.code === 'USER_NOT_FOUND'
  );
});

test('revokeUserSessions blocks self-action, otherwise revokes sessions + bumps tokenVersion + audits', async () => {
  const { userSupportService, state } = createHarness();

  await assert.rejects(
    () => userSupportService.revokeUserSessions({ userId: 'admin-1', actorId: 'admin-1', reason: 'test' }),
    (err) => err.code === 'SELF_ACTION_FORBIDDEN'
  );

  const result = await userSupportService.revokeUserSessions({ userId: 'user-1', actorId: 'admin-1', reason: 'compromised device' });
  assert.equal(result.revokedSessionCount, 2);
  assert.ok(state.refreshTokenSessions.every((s) => s.userId !== 'user-1' || s.revokedAt !== null));
  assert.equal(state.users.find((u) => u.id === 'user-1').tokenVersion, 1);
  assert.equal(state.auditLogs.at(-1).action, 'ADMIN_REVOKE_USER_SESSIONS');
  assert.equal(state.auditLogs.at(-1).userId, 'admin-1');
});

test('changeUserStatus: self-action blocked, no-op for identical status, ACTIVE->SUSPENDED revokes sessions + deactivates provider footprint', async () => {
  const { userSupportService, state } = createHarness();

  await assert.rejects(
    () => userSupportService.changeUserStatus({ userId: 'admin-1', actorId: 'admin-1', status: 'SUSPENDED', reason: 'x' }),
    (err) => err.code === 'SELF_ACTION_FORBIDDEN'
  );

  const noop = await userSupportService.changeUserStatus({ userId: 'user-1', actorId: 'admin-1', status: 'ACTIVE', reason: 'already active' });
  assert.equal(noop.noop, true);

  const changed = await userSupportService.changeUserStatus({ userId: 'provider-1', actorId: 'admin-1', status: 'SUSPENDED', reason: 'policy violation' });
  assert.equal(changed.noop, false);
  assert.equal(changed.previousStatus, 'ACTIVE');
  assert.equal(state.users.find((u) => u.id === 'provider-1').status, 'SUSPENDED');
  assert.equal(state.users.find((u) => u.id === 'provider-1').tokenVersion, 1);
  assert.equal(state.providerProfileUpdateManyCalls.length, 1);
  assert.equal(state.providerProfileUpdateManyCalls[0].data.status, 'INACTIVE');

  const lastAudit = state.auditLogs.at(-1);
  assert.equal(lastAudit.action, 'ADMIN_CHANGE_USER_STATUS');
  assert.deepEqual(lastAudit.oldValues, { status: 'ACTIVE' });
  assert.deepEqual(lastAudit.newValues, { status: 'SUSPENDED' });
});

test('changeUserStatus: reactivating (SUSPENDED->ACTIVE) does not bump tokenVersion or touch provider footprint', async () => {
  const { userSupportService, state } = createHarness();
  state.users.find((u) => u.id === 'provider-1').status = 'SUSPENDED';

  const result = await userSupportService.changeUserStatus({ userId: 'provider-1', actorId: 'admin-1', status: 'ACTIVE', reason: 'appeal approved' });
  assert.equal(result.noop, false);
  assert.equal(state.users.find((u) => u.id === 'provider-1').status, 'ACTIVE');
  assert.equal(state.users.find((u) => u.id === 'provider-1').tokenVersion, 0, 'reactivation should not bump tokenVersion');
  assert.equal(state.providerProfileUpdateManyCalls.length, 0, 'reactivation should not touch provider footprint');
});

test('changeUserStatus rejects a non-governed status', async () => {
  const { userSupportService } = createHarness();
  await assert.rejects(
    () => userSupportService.changeUserStatus({ userId: 'user-1', actorId: 'admin-1', status: 'PENDING_VERIFICATION', reason: 'x' }),
    (err) => err.code === 'INVALID_STATUS'
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness() {
  const state = {
    grants: [],
    auditLogs: [],
    nextGrantId: 1,
  };

  const prisma = {
    adminCapabilityGrant: {
      findFirst: async ({ where }) => {
        const match = state.grants.find((g) => {
          if (where.userId !== undefined && g.userId !== where.userId) return false;
          if (where.capability !== undefined && g.capability !== where.capability) return false;
          if (where.revokedAt === null && g.revokedAt !== null) return false;
          if (where.id !== undefined && g.id !== where.id) return false;
          return true;
        });
        return match ? { ...match } : null;
      },
      findMany: async ({ where, orderBy }) => {
        let results = state.grants.filter((g) => {
          if (where?.userId !== undefined) {
            const inClause = where.userId?.in;
            if (inClause) {
              if (!inClause.includes(g.userId)) return false;
            } else if (g.userId !== where.userId) {
              return false;
            }
          }
          if (where?.revokedAt === null && g.revokedAt !== null) return false;
          return true;
        });
        if (orderBy?.grantedAt === 'desc') {
          results = [...results].sort((a, b) => b.grantedAt - a.grantedAt);
        }
        return results.map((g) => ({ ...g }));
      },
      create: async ({ data }) => {
        const grant = {
          id: `grant-${state.nextGrantId++}`,
          bundleName: null,
          resourceScope: null,
          reason: null,
          revokedAt: null,
          revokedBy: null,
          revokeReason: null,
          grantedAt: new Date(),
          ...data,
        };
        state.grants.push(grant);
        return { ...grant };
      },
      update: async ({ where, data }) => {
        const index = state.grants.findIndex((g) => g.id === where.id);
        if (index < 0) throw new Error('Grant not found');
        state.grants[index] = { ...state.grants[index], ...data };
        return { ...state.grants[index] };
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
    '../../src/services/adminCapability.service.ts',
    '../../src/middleware/adminCapability.middleware.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const capabilityService = require('../../src/services/adminCapability.service.ts');
  const { requireCapability } = require('../../src/middleware/adminCapability.middleware.ts');

  return { state, capabilityService, requireCapability };
}

test('hasCapability auto-passes ADMIN_DASHBOARD_VIEW with zero stored grants', async () => {
  const { capabilityService } = createHarness();
  assert.equal(await capabilityService.hasCapability('user-1', 'ADMIN_DASHBOARD_VIEW'), true);
});

test('hasCapability denies by default when no active grant exists', async () => {
  const { capabilityService } = createHarness();
  assert.equal(await capabilityService.hasCapability('user-1', 'ANALYTICS_VIEW'), false);
});

test('grantCapability creates an active grant, is idempotent, and records an audit event', async () => {
  const { capabilityService, state } = createHarness();

  const grant = await capabilityService.grantCapability({
    userId: 'user-1',
    capability: 'ANALYTICS_VIEW',
    grantedBy: 'admin-2',
    reason: 'onboarding as analyst',
  });
  assert.equal(grant.capability, 'ANALYTICS_VIEW');
  assert.equal(await capabilityService.hasCapability('user-1', 'ANALYTICS_VIEW'), true);
  assert.equal(state.auditLogs.length, 1);
  assert.equal(state.auditLogs[0].action, 'GRANT_CAPABILITY');
  assert.equal(state.auditLogs[0].userId, 'admin-2');

  const again = await capabilityService.grantCapability({
    userId: 'user-1',
    capability: 'ANALYTICS_VIEW',
    grantedBy: 'admin-2',
    reason: 'duplicate call',
  });
  assert.equal(again.id, grant.id, 'should return the existing grant, not create a duplicate');
  assert.equal(state.grants.length, 1);
  assert.equal(state.auditLogs.length, 1, 'no additional audit event for a no-op re-grant');
});

test('grantCapability rejects self-grant and rejects unknown capability names', async () => {
  const { capabilityService } = createHarness();

  await assert.rejects(
    () =>
      capabilityService.grantCapability({
        userId: 'admin-2',
        capability: 'ADMIN_ROLE_MANAGE',
        grantedBy: 'admin-2',
        reason: 'self service',
      }),
    (err) => err.code === 'SELF_GRANT_FORBIDDEN'
  );

  await assert.rejects(
    () =>
      capabilityService.grantCapability({
        userId: 'user-1',
        capability: 'NOT_A_REAL_CAPABILITY',
        grantedBy: 'admin-2',
        reason: 'typo',
      }),
    (err) => err.code === 'UNKNOWN_CAPABILITY'
  );
});

test('grantBundle expands a persona bundle into one grant per capability, tagged with the bundle name', async () => {
  const { capabilityService, state } = createHarness();

  const grants = await capabilityService.grantBundle({
    userId: 'user-1',
    bundleName: 'FINANCE_OPERATIONS_OPERATOR',
    grantedBy: 'admin-2',
    reason: 'new finance ops hire',
  });

  assert.equal(grants.length, 6);
  assert.ok(grants.every((g) => g.bundleName === 'FINANCE_OPERATIONS_OPERATOR'));
  assert.equal(await capabilityService.hasCapability('user-1', 'REFUND_APPROVE'), true);
  assert.equal(await capabilityService.hasCapability('user-1', 'DISPUTE_MANAGE'), true);
  assert.equal(state.auditLogs.length, 6);
});

test('revokeCapability revokes an active grant, records audit, and hasCapability flips to false', async () => {
  const { capabilityService, state } = createHarness();

  await capabilityService.grantCapability({
    userId: 'user-1',
    capability: 'WORKER_JOB_TRIGGER',
    grantedBy: 'admin-2',
    reason: 'ops rotation',
  });
  assert.equal(await capabilityService.hasCapability('user-1', 'WORKER_JOB_TRIGGER'), true);

  const revoked = await capabilityService.revokeCapability({
    userId: 'user-1',
    capability: 'WORKER_JOB_TRIGGER',
    revokedBy: 'admin-3',
    reason: 'rotation ended',
  });

  assert.ok(revoked.revokedAt instanceof Date);
  assert.equal(revoked.revokedBy, 'admin-3');
  assert.equal(await capabilityService.hasCapability('user-1', 'WORKER_JOB_TRIGGER'), false);
  assert.equal(state.auditLogs.at(-1).action, 'REVOKE_CAPABILITY');

  await assert.rejects(
    () =>
      capabilityService.revokeCapability({
        userId: 'user-1',
        capability: 'WORKER_JOB_TRIGGER',
        revokedBy: 'admin-3',
        reason: 'already gone',
      }),
    (err) => err.code === 'GRANT_NOT_FOUND'
  );
});

function createMockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test('requireCapability middleware: 401 without a user, 403 for non-ADMIN, 403 CAPABILITY_DENIED without grant, next() with grant', async () => {
  const { capabilityService, requireCapability } = createHarness();
  const middleware = requireCapability('ANALYTICS_VIEW');

  const unauth = createMockRes();
  let nextCalled = false;
  await middleware({ user: undefined, ip: '127.0.0.1', path: '/x', method: 'GET' }, unauth, () => {
    nextCalled = true;
  });
  assert.equal(unauth.statusCode, 401);
  assert.equal(nextCalled, false);

  const nonAdmin = createMockRes();
  await middleware(
    { user: { userId: 'user-1', role: 'HOMEOWNER' }, ip: '127.0.0.1', path: '/x', method: 'GET' },
    nonAdmin,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nonAdmin.statusCode, 403);
  assert.equal(nextCalled, false);

  const noGrant = createMockRes();
  await middleware(
    { user: { userId: 'admin-1', role: 'ADMIN' }, ip: '127.0.0.1', path: '/x', method: 'GET' },
    noGrant,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(noGrant.statusCode, 403);
  assert.equal(noGrant.body.error.code, 'CAPABILITY_DENIED');
  assert.equal(nextCalled, false);

  await capabilityService.grantCapability({
    userId: 'admin-1',
    capability: 'ANALYTICS_VIEW',
    grantedBy: 'admin-2',
    reason: 'test setup',
  });

  const allowed = createMockRes();
  await middleware(
    { user: { userId: 'admin-1', role: 'ADMIN' }, ip: '127.0.0.1', path: '/x', method: 'GET' },
    allowed,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, true);
  assert.equal(allowed.body, undefined, 'middleware should not write a response when allowing the request through');
});

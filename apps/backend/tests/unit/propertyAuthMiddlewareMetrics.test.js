const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const metricCalls = {
  auth: [],
  scope: [],
};

const prismaMock = {
  householdMember: {
    findUnique: async () => null,
  },
  property: {
    findFirst: async () => null,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const loggerPath = require.resolve('../../src/lib/logger.ts');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    auditLog: () => {},
  },
};

const metricsPath = require.resolve('../../src/lib/metrics.ts');
require.cache[metricsPath] = {
  id: metricsPath,
  filename: metricsPath,
  loaded: true,
  exports: {
    securityAuthDenialsTotal: {
      inc: (labels) => metricCalls.auth.push(labels),
    },
    securityPropertyScopeDenialsTotal: {
      inc: (labels) => metricCalls.scope.push(labels),
    },
  },
};

const { resolvePropertyAccess } = require('../../src/services/propertyAccess.service.ts');
const { propertyAuthMiddleware } = require('../../src/middleware/propertyAuth.middleware.ts');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test('propertyAuthMiddleware increments auth denial metric when unauthenticated', async () => {
  metricCalls.auth.length = 0;
  metricCalls.scope.length = 0;

  const req = {
    params: { propertyId: 'property-1' },
    user: undefined,
  };
  const res = createRes();

  await propertyAuthMiddleware(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload?.message, 'Authentication required.');
  assert.deepEqual(metricCalls.auth, [
    { surface: 'property_auth_middleware', status_code: '401', code: 'AUTH_REQUIRED' },
  ]);
  assert.deepEqual(metricCalls.scope, []);
});

test('propertyAuthMiddleware increments scope denial metric when property ownership check fails', async () => {
  metricCalls.auth.length = 0;
  metricCalls.scope.length = 0;

  prismaMock.property.findFirst = async () => null;

  const req = {
    params: { propertyId: 'property-2' },
    user: { userId: 'user-2' },
  };
  const res = createRes();

  await propertyAuthMiddleware(req, res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.payload?.message, 'Property not found or access denied.');
  assert.deepEqual(metricCalls.auth, []);
  assert.deepEqual(metricCalls.scope, [
    { source: 'property_auth_middleware', status_code: '404' },
  ]);
});

test('propertyAuthMiddleware denies a user with household access to a different property (cross-property access attempt)', async () => {
  metricCalls.auth.length = 0;
  metricCalls.scope.length = 0;

  // user-3 is a household member of property-A only, and is not the owner of
  // property-B — both lookups for property-B must independently miss.
  prismaMock.householdMember.findUnique = async ({ where }) => {
    if (where.propertyId_userId.propertyId === 'property-A') {
      return { role: 'OWNER' };
    }
    return null;
  };
  prismaMock.property.findFirst = async ({ where }) => {
    if (where.id === 'property-A' && where.homeownerProfile.userId === 'user-3') {
      return { id: 'property-A' };
    }
    return null;
  };

  const req = {
    params: { propertyId: 'property-B' },
    user: { userId: 'user-3' },
  };
  const res = createRes();

  await propertyAuthMiddleware(req, res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(res.payload?.message, 'Property not found or access denied.');
  assert.deepEqual(metricCalls.scope, [
    { source: 'property_auth_middleware', status_code: '404' },
  ]);

  // Reset shared mocks back to the denial-by-default state for any later tests.
  prismaMock.householdMember.findUnique = async () => null;
  prismaMock.property.findFirst = async () => null;
});

test('propertyAuthMiddleware grants access to a household collaborator (CONTRIBUTOR) of the correct property', async () => {
  metricCalls.auth.length = 0;
  metricCalls.scope.length = 0;

  // user-4 is a CONTRIBUTOR household member of property-C (not its owner) —
  // this is the exact scenario the owner-only bug used to block.
  prismaMock.householdMember.findUnique = async ({ where }) => {
    if (where.propertyId_userId.propertyId === 'property-C' && where.propertyId_userId.userId === 'user-4') {
      return { role: 'CONTRIBUTOR' };
    }
    return null;
  };

  const req = {
    params: { propertyId: 'property-C' },
    user: { userId: 'user-4' },
  };
  const res = createRes();
  let nextCalled = false;

  await propertyAuthMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.householdRole, 'CONTRIBUTOR');
  assert.deepEqual(req.property, { id: 'property-C' });
  assert.deepEqual(metricCalls.auth, []);
  assert.deepEqual(metricCalls.scope, []);

  // Reset shared mocks back to the denial-by-default state for any later tests.
  prismaMock.householdMember.findUnique = async () => null;
  prismaMock.property.findFirst = async () => null;
});

test('resolvePropertyAccess returns the same access decision propertyAuthMiddleware uses, for direct service/controller callers', async () => {
  prismaMock.householdMember.findUnique = async ({ where }) => {
    if (where.propertyId_userId.propertyId === 'property-D' && where.propertyId_userId.userId === 'user-5') {
      return { role: 'VIEWER' };
    }
    return null;
  };

  const access = await resolvePropertyAccess('user-5', 'property-D');
  assert.deepEqual(access, { propertyId: 'property-D', role: 'VIEWER' });

  const denied = await resolvePropertyAccess('user-5', 'property-E');
  assert.equal(denied, null);

  // Reset shared mocks back to the denial-by-default state for any later tests.
  prismaMock.householdMember.findUnique = async () => null;
  prismaMock.property.findFirst = async () => null;
});

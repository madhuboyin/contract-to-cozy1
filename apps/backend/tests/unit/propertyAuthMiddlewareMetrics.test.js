const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const metricCalls = {
  auth: [],
  scope: [],
};

const prismaMock = {
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

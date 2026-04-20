const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const prismaMock = {
  user: {
    findUnique: async () => null,
  },
};

const jwtUtilMock = {
  verifyAccessToken: () => {
    throw new Error('verifyAccessToken mock not configured');
  },
};

const prismaModulePath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaModulePath] = {
  id: prismaModulePath,
  filename: prismaModulePath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const jwtModulePath = require.resolve('../../src/utils/jwt.util.ts');
require.cache[jwtModulePath] = {
  id: jwtModulePath,
  filename: jwtModulePath,
  loaded: true,
  exports: jwtUtilMock,
};

const { authenticate, requireMfa } = require('../../src/middleware/auth.middleware.ts');

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

test('authenticate rejects token when tokenVersion is stale', async () => {
  jwtUtilMock.verifyAccessToken = () => ({
    userId: 'user-1',
    email: 'homeowner@example.com',
    role: 'HOMEOWNER',
    tokenVersion: 1,
    mfaEnabled: false,
    mfaVerified: false,
  });

  prismaMock.user.findUnique = async () => ({
    id: 'user-1',
    email: 'homeowner@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'HOMEOWNER',
    status: 'ACTIVE',
    emailVerified: true,
    tokenVersion: 2,
    homeownerProfile: { id: 'hp-1' },
    providerProfile: null,
  });

  const req = {
    headers: { authorization: 'Bearer test-token' },
    ip: '127.0.0.1',
    path: '/api/protected',
    method: 'GET',
  };
  const res = createRes();
  let nextCalled = false;

  await authenticate(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload?.error?.code, 'TOKEN_REVOKED');
});

test('requireMfa blocks admin users without MFA challenge completion', () => {
  const req = {
    user: {
      userId: 'admin-1',
      role: 'ADMIN',
      mfaEnabled: true,
      mfaVerified: false,
    },
  };
  const res = createRes();
  let nextCalled = false;

  requireMfa(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload?.error?.code, 'MFA_REQUIRED');
});


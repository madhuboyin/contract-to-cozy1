const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const authenticate = (_req, _res, next) => next();
const authRateLimiter = (_req, _res, next) => next();
const validateBody = () => (_req, _res, next) => next();

const authMiddlewarePath = require.resolve('../../src/middleware/auth.middleware.ts');
require.cache[authMiddlewarePath] = {
  id: authMiddlewarePath,
  filename: authMiddlewarePath,
  loaded: true,
  exports: { authenticate },
};

const rateLimiterPath = require.resolve('../../src/middleware/rateLimiter.middleware.ts');
require.cache[rateLimiterPath] = {
  id: rateLimiterPath,
  filename: rateLimiterPath,
  loaded: true,
  exports: { authRateLimiter },
};

const validatePath = require.resolve('../../src/middleware/validate.middleware.ts');
require.cache[validatePath] = {
  id: validatePath,
  filename: validatePath,
  loaded: true,
  exports: { validateBody },
};

const controllerPath = require.resolve('../../src/controllers/mfa.controller.ts');
require.cache[controllerPath] = {
  id: controllerPath,
  filename: controllerPath,
  loaded: true,
  exports: {
    setupMfa: (_req, _res) => _res,
    verifyMfaSetup: (_req, _res) => _res,
    verifyMfaChallenge: (_req, _res) => _res,
    verifyMfaRecoveryChallenge: (_req, _res) => _res,
    getMfaStatus: (_req, _res) => _res,
    regenerateMfaRecoveryCodes: (_req, _res) => _res,
    disableMfa: (_req, _res) => _res,
  },
};

const router = require('../../src/routes/mfa.routes.ts').default;

function getRoute(path, method) {
  return router.stack
    .filter((layer) => layer.route)
    .find(
      (layer) =>
        layer.route.path === path &&
        Boolean(layer.route.methods?.[method.toLowerCase()]),
    )?.route;
}

test('mfa router exposes setup, challenge, recovery, and disable endpoints', () => {
  const signatures = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
    }));

  assert.deepEqual(signatures, [
    { path: '/auth/mfa/challenge', methods: ['post'] },
    { path: '/auth/mfa/challenge/recovery', methods: ['post'] },
    { path: '/auth/mfa/setup', methods: ['post'] },
    { path: '/auth/mfa/setup/verify', methods: ['post'] },
    { path: '/auth/mfa/status', methods: ['get'] },
    { path: '/auth/mfa/recovery-codes/regenerate', methods: ['post'] },
    { path: '/auth/mfa/disable', methods: ['post'] },
  ]);
});

test('authenticated mfa routes include authenticate middleware', () => {
  const protectedRoutes = [
    { path: '/auth/mfa/setup', method: 'post' },
    { path: '/auth/mfa/setup/verify', method: 'post' },
    { path: '/auth/mfa/status', method: 'get' },
    { path: '/auth/mfa/recovery-codes/regenerate', method: 'post' },
    { path: '/auth/mfa/disable', method: 'post' },
  ];

  for (const { path, method } of protectedRoutes) {
    const route = getRoute(path, method);
    assert.ok(route, `Expected ${method.toUpperCase()} ${path} route`);
    const hasAuthenticate = route.stack.some((entry) => entry.handle === authenticate);
    assert.equal(hasAuthenticate, true, `Expected authenticate middleware on ${method.toUpperCase()} ${path}`);
  }
});

test('public mfa challenge routes do not include authenticate middleware', () => {
  const publicRoutes = [
    { path: '/auth/mfa/challenge', method: 'post' },
    { path: '/auth/mfa/challenge/recovery', method: 'post' },
  ];

  for (const { path, method } of publicRoutes) {
    const route = getRoute(path, method);
    assert.ok(route, `Expected ${method.toUpperCase()} ${path} route`);
    const hasAuthenticate = route.stack.some((entry) => entry.handle === authenticate);
    assert.equal(hasAuthenticate, false, `Did not expect authenticate middleware on ${method.toUpperCase()} ${path}`);
  }
});


const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('application scopes the router-wide MFA limiter to the MFA URL prefix', () => {
  const indexSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/index.ts'),
    'utf8',
  );

  assert.match(
    indexSource,
    /app\.use\('\/api\/auth\/mfa', mfaRoutes\);/,
  );
  assert.doesNotMatch(
    indexSource,
    /app\.use\('\/api', mfaRoutes\);/,
  );
});

test('mfa router exposes setup, challenge, recovery, and disable endpoints', () => {
  const signatures = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
    }));

  assert.deepEqual(signatures, [
    { path: '/challenge', methods: ['post'] },
    { path: '/challenge/recovery', methods: ['post'] },
    { path: '/setup', methods: ['post'] },
    { path: '/setup/verify', methods: ['post'] },
    { path: '/status', methods: ['get'] },
    { path: '/recovery-codes/regenerate', methods: ['post'] },
    { path: '/disable', methods: ['post'] },
  ]);
});

test('authenticated mfa routes include authenticate middleware', () => {
  const protectedRoutes = [
    { path: '/setup', method: 'post' },
    { path: '/setup/verify', method: 'post' },
    { path: '/status', method: 'get' },
    { path: '/recovery-codes/regenerate', method: 'post' },
    { path: '/disable', method: 'post' },
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
    { path: '/challenge', method: 'post' },
    { path: '/challenge/recovery', method: 'post' },
  ];

  for (const { path, method } of publicRoutes) {
    const route = getRoute(path, method);
    assert.ok(route, `Expected ${method.toUpperCase()} ${path} route`);
    const hasAuthenticate = route.stack.some((entry) => entry.handle === authenticate);
    assert.equal(hasAuthenticate, false, `Did not expect authenticate middleware on ${method.toUpperCase()} ${path}`);
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function installAuthMiddlewareStub() {
  const authPath = require.resolve('../../src/middleware/auth.middleware.ts');
  const authenticate = (_req, _res, next) => next();
  const requireRole = (...roles) => {
    const guard = (_req, _res, next) => next();
    guard.__requiredRoles = roles;
    return guard;
  };

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: { authenticate, requireRole },
  };
}

function installControllerStub(controllerPath, exportsObject) {
  const resolved = require.resolve(controllerPath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObject,
  };
}

function loadRouter(routePath) {
  const resolved = require.resolve(routePath);
  delete require.cache[resolved];
  return require(routePath).default;
}

function getRoute(router, path, method) {
  return router.stack
    .filter((layer) => layer.route)
    .find(
      (layer) =>
        layer.route.path === path &&
        Boolean(layer.route.methods?.[method.toLowerCase()]),
    )?.route;
}

function getRouteRoleGuards(route) {
  return route.stack
    .map((entry) => entry.handle)
    .filter((handle) => Array.isArray(handle.__requiredRoles))
    .map((handle) => [...handle.__requiredRoles].sort());
}

test('provider management routes require PROVIDER or ADMIN role', () => {
  installAuthMiddlewareStub();
  installControllerStub('../../src/controllers/provider.controller.ts', {
    ProviderController: {
      getMyServices: () => {},
      createService: () => {},
      updateService: () => {},
      deleteService: () => {},
      searchProviders: () => {},
      getProviderById: () => {},
      getProviderServices: () => {},
      getProviderReviews: () => {},
    },
  });

  const router = loadRouter('../../src/routes/provider.routes.ts');
  const expectedRoles = ['ADMIN', 'PROVIDER'];
  const guardedRoutes = [
    { path: '/services', method: 'get' },
    { path: '/services', method: 'post' },
    { path: '/services/:id', method: 'patch' },
    { path: '/services/:id', method: 'delete' },
  ];

  for (const { path, method } of guardedRoutes) {
    const route = getRoute(router, path, method);
    assert.ok(route, `Expected ${method.toUpperCase()} ${path} route`);
    assert.deepEqual(getRouteRoleGuards(route), [expectedRoles]);
  }
});

test('favorites routes require HOMEOWNER role', () => {
  installAuthMiddlewareStub();
  installControllerStub('../../src/controllers/user.controller.ts', {
    getProfile: () => {},
    updateProfile: () => {},
    deactivateAccount: () => {},
    deleteAccount: () => {},
    listFavorites: () => {},
    addFavorite: () => {},
    removeFavorite: () => {},
  });

  const router = loadRouter('../../src/routes/user.routes.ts');
  const expectedRoles = ['HOMEOWNER'];
  const guardedRoutes = [
    { path: '/favorites', method: 'get' },
    { path: '/favorites', method: 'post' },
    { path: '/favorites/:providerProfileId', method: 'delete' },
  ];

  for (const { path, method } of guardedRoutes) {
    const route = getRoute(router, path, method);
    assert.ok(route, `Expected ${method.toUpperCase()} ${path} route`);
    assert.deepEqual(getRouteRoleGuards(route), [expectedRoles]);
  }
});

test('booking action routes have explicit role guards', () => {
  installAuthMiddlewareStub();
  installControllerStub('../../src/controllers/booking.controller.ts', {
    BookingController: {
      createBooking: () => {},
      listBookings: () => {},
      getBookingById: () => {},
      updateBooking: () => {},
      confirmBooking: () => {},
      startBooking: () => {},
      completeBooking: () => {},
      cancelBooking: () => {},
    },
  });

  const router = loadRouter('../../src/routes/booking.routes.ts');
  const homeownerCreate = getRoute(router, '/', 'post');
  assert.ok(homeownerCreate, 'Expected POST / route');
  assert.deepEqual(getRouteRoleGuards(homeownerCreate), [['HOMEOWNER']]);

  const providerOnlyRoutes = [
    { path: '/:id/confirm', method: 'post' },
    { path: '/:id/start', method: 'post' },
    { path: '/:id/complete', method: 'post' },
  ];

  for (const { path, method } of providerOnlyRoutes) {
    const route = getRoute(router, path, method);
    assert.ok(route, `Expected ${method.toUpperCase()} ${path} route`);
    assert.deepEqual(getRouteRoleGuards(route), [['PROVIDER']]);
  }
});


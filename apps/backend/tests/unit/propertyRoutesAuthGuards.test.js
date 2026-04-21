const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const controllerModulePath = require.resolve('../../src/controllers/property.controller.ts');
require.cache[controllerModulePath] = {
  id: controllerModulePath,
  filename: controllerModulePath,
  loaded: true,
  exports: {
    listProperties: () => {},
    lookupProperty: () => {},
    getPropertyResolutions: () => {},
    createProperty: () => {},
    getProperty: () => {},
    getPropertyDashboardBootstrap: () => {},
    updateProperty: () => {},
    deleteProperty: () => {},
  },
};

const router = require('../../src/routes/property.routes.ts').default;
const { propertyAuthMiddleware } = require('../../src/middleware/propertyAuth.middleware.ts');

function getRoute(path, method) {
  return router.stack
    .filter((layer) => layer.route)
    .find(
      (layer) =>
        layer.route.path === path &&
        Boolean(layer.route.methods?.[method.toLowerCase()]),
    )?.route;
}

function hasMiddleware(route, middleware) {
  return route.stack.some((entry) => entry.handle === middleware);
}

test('property warranties route enforces propertyAuthMiddleware', () => {
  const route = getRoute('/:propertyId/warranties', 'get');
  assert.ok(route, 'Expected /:propertyId/warranties route to exist');
  assert.equal(
    hasMiddleware(route, propertyAuthMiddleware),
    true,
    'Expected propertyAuthMiddleware on warranties route',
  );
});

test('property insurance route enforces propertyAuthMiddleware', () => {
  const route = getRoute('/:propertyId/insurance', 'get');
  assert.ok(route, 'Expected /:propertyId/insurance route to exist');
  assert.equal(
    hasMiddleware(route, propertyAuthMiddleware),
    true,
    'Expected propertyAuthMiddleware on insurance route',
  );
});

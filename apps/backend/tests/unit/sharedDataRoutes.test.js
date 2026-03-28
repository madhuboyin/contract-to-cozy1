const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const router = require('../../src/routes/sharedData.routes.ts').default;
const { propertyAuthMiddleware } = require('../../src/middleware/propertyAuth.middleware.ts');

function routeLayers() {
  return router.stack.filter((layer) => layer.route);
}

test('all shared data routes require propertyAuthMiddleware', () => {
  const layers = routeLayers();
  assert.ok(layers.length > 0, 'Expected shared data routes to be registered');

  for (const layer of layers) {
    const hasPropertyAuth = layer.route.stack.some(
      (stackEntry) => stackEntry.handle === propertyAuthMiddleware,
    );

    assert.equal(
      hasPropertyAuth,
      true,
      `Route ${layer.route.path} is missing propertyAuthMiddleware`,
    );
  }
});

// tests/unit/roomPlantAdvisorRoutes.test.js
//
// Route-level access-control guardrail checks for Plant Advisor endpoints.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const router = require('../../src/routes/roomPlantAdvisor.routes.ts').default;
const { propertyAuthMiddleware } = require('../../src/middleware/propertyAuth.middleware.ts');

function routeLayers() {
  return router.stack.filter((layer) => layer.route);
}

test('all Plant Advisor routes require propertyAuthMiddleware', () => {
  const layers = routeLayers();
  assert.ok(layers.length > 0, 'Expected Plant Advisor routes to be registered');

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

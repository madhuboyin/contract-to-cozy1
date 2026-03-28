const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const router = require('../../src/routes/adminSharedData.routes.ts').default;

function routeSignatures() {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
    }));
}

test('admin shared-data routes expose expected endpoints', () => {
  const signatures = routeSignatures();
  assert.deepEqual(signatures, [
    { path: '/admin/shared-data/backfill', methods: ['post'] },
    { path: '/admin/shared-data/readiness', methods: ['get'] },
    { path: '/admin/shared-data/consistency', methods: ['get'] },
    { path: '/admin/shared-data/signals/health', methods: ['get'] },
    { path: '/admin/shared-data/diagnostics', methods: ['get'] },
  ]);
});

test('admin shared-data router has admin scoped middleware mount', () => {
  const hasAdminScopeMount = router.stack.some(
    (layer) => !layer.route && String(layer.regexp || '').includes('admin\\/shared-data'),
  );

  assert.equal(hasAdminScopeMount, true);
});

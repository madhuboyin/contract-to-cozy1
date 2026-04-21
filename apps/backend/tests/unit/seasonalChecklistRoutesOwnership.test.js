const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const controllerModulePath = require.resolve('../../src/controllers/seasonalChecklist.controller.ts');
require.cache[controllerModulePath] = {
  id: controllerModulePath,
  filename: controllerModulePath,
  loaded: true,
  exports: {
    SeasonalChecklistController: {
      getClimateInfo: () => {},
      updateClimateSettings: () => {},
      getPropertyChecklists: () => {},
      getChecklistDetails: () => {},
      generateChecklist: () => {},
      dismissChecklist: () => {},
      addAllCriticalTasks: () => {},
      addTaskToChecklist: () => {},
      addToMaintenance: () => {},
      removeFromMaintenance: () => {},
      dismissTask: () => {},
      snoozeTask: () => {},
    },
  },
};

const router = require('../../src/routes/seasonalChecklist.routes.ts').default;
const {
  requireSeasonalChecklistOwnership,
  requireSeasonalItemOwnership,
} = require('../../src/middleware/seasonalOwnership.middleware.ts');

function getRoute(path, method) {
  return router.stack
    .filter((layer) => layer.route)
    .find(
      (layer) =>
        layer.route.path === path &&
        Boolean(layer.route.methods?.[method.toLowerCase()]),
    )?.route;
}

function assertRouteHasMiddleware(path, method, middleware) {
  const route = getRoute(path, method);
  assert.ok(route, `Expected route ${method.toUpperCase()} ${path} to exist`);
  assert.equal(
    route.stack.some((entry) => entry.handle === middleware),
    true,
    `Expected ${method.toUpperCase()} ${path} to include ownership middleware`,
  );
}

test('seasonal checklist-id routes enforce checklist ownership middleware', () => {
  assertRouteHasMiddleware(
    '/seasonal-checklists/:checklistId',
    'get',
    requireSeasonalChecklistOwnership,
  );
  assertRouteHasMiddleware(
    '/seasonal-checklists/:checklistId/dismiss',
    'post',
    requireSeasonalChecklistOwnership,
  );
  assertRouteHasMiddleware(
    '/seasonal-checklists/:checklistId/add-all-critical',
    'post',
    requireSeasonalChecklistOwnership,
  );
});

test('seasonal item-id routes enforce item ownership middleware', () => {
  assertRouteHasMiddleware(
    '/seasonal-checklist-items/:itemId/add-to-tasks',
    'post',
    requireSeasonalItemOwnership,
  );
  assertRouteHasMiddleware(
    '/seasonal-checklist-items/:itemId/add-to-maintenance',
    'post',
    requireSeasonalItemOwnership,
  );
  assertRouteHasMiddleware(
    '/seasonal-checklist-items/:itemId/remove-from-maintenance',
    'delete',
    requireSeasonalItemOwnership,
  );
  assertRouteHasMiddleware(
    '/seasonal-checklist-items/:itemId/dismiss',
    'post',
    requireSeasonalItemOwnership,
  );
  assertRouteHasMiddleware(
    '/seasonal-checklist-items/:itemId/snooze',
    'post',
    requireSeasonalItemOwnership,
  );
});

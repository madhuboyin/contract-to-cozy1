const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { requireHouseholdRole } = require('../../src/middleware/propertyAuth.middleware.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

// Home Operations Slice 8's write API (assign/watch/transition/duplicate/
// evidence) enforces its role floor entirely at the route layer via
// requireHouseholdRole('CONTRIBUTOR') — the controller/usecase layer below
// it has no role logic of its own (confirmed by reading
// homeOperations.controller.ts: every mutation handler goes straight from
// loadWorkItemForMutation to the usecase call). This was documented in the
// route file's own comment but never had dedicated test coverage.

function invokeRoleFloor(minimumRole, householdRole) {
  const middleware = requireHouseholdRole(minimumRole);
  let statusCode = null;
  let nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json() { return this; },
  };
  middleware({ householdRole }, res, () => { nextCalled = true; });
  return { statusCode, nextCalled };
}

test('requireHouseholdRole(CONTRIBUTOR) blocks viewers and missing roles, passes CONTRIBUTOR and OWNER', () => {
  assert.deepEqual(invokeRoleFloor('CONTRIBUTOR', 'VIEWER'), { statusCode: 403, nextCalled: false });
  assert.deepEqual(invokeRoleFloor('CONTRIBUTOR', undefined), { statusCode: 403, nextCalled: false });
  assert.deepEqual(invokeRoleFloor('CONTRIBUTOR', 'CONTRIBUTOR'), { statusCode: null, nextCalled: true });
  assert.deepEqual(invokeRoleFloor('CONTRIBUTOR', 'OWNER'), { statusCode: null, nextCalled: true });
});

test('every Home Operations write route requires CONTRIBUTOR', () => {
  const routes = read('../../src/routes/homeOperations.routes.ts');
  for (const route of [
    "'/properties/:propertyId/home-operations/work-items/:workItemId/assign',",
    "'/properties/:propertyId/home-operations/work-items/:workItemId/watchers',",
    "'/properties/:propertyId/home-operations/work-items/:workItemId/watchers/:userId',",
    "'/properties/:propertyId/home-operations/work-items/:workItemId/transition',",
    "'/properties/:propertyId/home-operations/work-items/:workItemId/snooze',",
    "'/properties/:propertyId/home-operations/work-items/:workItemId/reschedule',",
    "'/properties/:propertyId/home-operations/work-items/batch-transition',",
    "'/properties/:propertyId/home-operations/work-items/:workItemId/duplicate',",
    "'/properties/:propertyId/home-operations/work-items/:workItemId/evidence',",
  ]) {
    const start = routes.indexOf(route);
    assert.ok(start >= 0, `route registration not found: ${route}`);
    const section = routes.slice(start, start + 220);
    assert.ok(
      section.includes("requireHouseholdRole('CONTRIBUTOR')"),
      `${route} must require CONTRIBUTOR`,
    );
  }
});

test('Home Operations read routes stay available to VIEWERs (no role floor)', () => {
  const routes = read('../../src/routes/homeOperations.routes.ts');

  const listGet = routes.slice(
    routes.indexOf("router.get('/properties/:propertyId/home-operations/work-items',"),
  );
  assert.ok(!listGet.slice(0, 120).includes('requireHouseholdRole'));

  const getOne = routes.slice(
    routes.indexOf("router.get('/properties/:propertyId/home-operations/work-items/:workItemId',"),
  );
  assert.ok(!getOne.slice(0, 120).includes('requireHouseholdRole'));
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// P0 of the stateful GUIDE design (docs/architecture/ASK_COZY_STATEFUL_GUIDE_DESIGN.md E15): the DIY page's project routes used
// propertyAuthMiddleware only, which resolves access but sets no role floor, so a household VIEWER could create, change, complete and abandon
// projects through the API. Every property-scoped DIY route that writes now requires CONTRIBUTOR. This runs the real router's handler chains
// against a stubbed access lookup (no database).

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const router = require('../../src/routes/diy.routes.ts').default;

const originalResolve = propertyAccess.resolvePropertyAccess;
test.after(() => { propertyAccess.resolvePropertyAccess = originalResolve; });

const PREFIX = '/properties/:propertyId/diy';
const routes = router.stack.filter((layer) => layer.route && layer.route.path.startsWith(PREFIX))
  .map((layer) => ({ path: layer.route.path, method: Object.keys(layer.route.methods)[0], handlers: layer.route.stack.map((entry) => entry.handle) }));
const route = (method, path) => {
  const found = routes.find((entry) => entry.method === method && entry.path === path);
  assert.ok(found, `${method} ${path} is registered`);
  return found;
};

// Runs every handler except the last (the controller). Returns what the chain did before reaching the controller.
async function run(entry, role) {
  propertyAccess.resolvePropertyAccess = async (userId, propertyId) => (role ? { role, userId, propertyId } : null);
  const req = { user: { userId: 'u1' }, params: { propertyId: 'p1', projectId: 'proj-1', stepId: 'step-1', guideId: 'g-1' }, body: {}, query: {}, ip: '127.0.0.1', path: entry.path, method: entry.method.toUpperCase() };
  const out = { status: null, body: null, reachedController: false };
  const res = { status(code) { out.status = code; return this; }, json(body) { out.body = body; return this; }, send(body) { out.body = body; return this; } };
  for (let index = 0; index < entry.handlers.length - 1; index += 1) {
    let advanced = false;
    await entry.handlers[index](req, res, (error) => { advanced = !error; if (error) out.body = error; });
    if (!advanced) return out;
  }
  out.reachedController = true;
  return out;
}

const MUTATIONS = [
  ['post', `${PREFIX}/projects`],
  ['patch', `${PREFIX}/projects/:projectId`],
  ['patch', `${PREFIX}/projects/:projectId/steps/:stepId`],
  ['post', `${PREFIX}/projects/:projectId/complete`],
  ['post', `${PREFIX}/projects/:projectId/abandon`],
  ['post', `${PREFIX}/ai-guide`],
];

for (const [method, path] of MUTATIONS) {
  test(`${method.toUpperCase()} ${path}: a viewer is refused with 403 before validation or the controller`, async () => {
    const out = await run(route(method, path), 'VIEWER');
    assert.equal(out.status, 403);
    assert.match(out.body.message, /requires the CONTRIBUTOR role/);
    assert.equal(out.reachedController, false);
  });

  test(`${method.toUpperCase()} ${path}: contributors and owners are not refused by the role floor`, async () => {
    for (const role of ['CONTRIBUTOR', 'OWNER']) {
      const out = await run(route(method, path), role);
      assert.notEqual(out.status, 403, `${role} must pass the floor (a 400 from body validation is fine)`);
    }
  });
}

test('someone without property access is still refused (404) before the role floor', async () => {
  const out = await run(route('post', `${PREFIX}/projects/:projectId/complete`), null);
  assert.equal(out.status, 404);
});

test('reads stay open to viewers: project list, project detail, AI-guide detail and the decision scorer', async () => {
  for (const [method, path] of [['get', `${PREFIX}/projects`], ['get', `${PREFIX}/projects/:projectId`], ['get', `${PREFIX}/ai-guide/:guideId`], ['post', `${PREFIX}/decision`]]) {
    const out = await run(route(method, path), 'VIEWER');
    assert.notEqual(out.status, 403, `${method} ${path}`);
    assert.notEqual(out.status, 404, `${method} ${path}`);
  }
});

test('guard: every property-scoped DIY route that is not a read refuses a viewer, so a future write route cannot ship without the floor', async () => {
  const READS = new Set([`${PREFIX}/decision`]);
  const writes = routes.filter((entry) => entry.method !== 'get' && !READS.has(entry.path));
  assert.ok(writes.length >= MUTATIONS.length, 'the router still has the known write routes');
  for (const entry of writes) {
    const out = await run(entry, 'VIEWER');
    assert.equal(out.status, 403, `${entry.method.toUpperCase()} ${entry.path} must require CONTRIBUTOR`);
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 2b: the DIY step, complete and abandon requests must carry the version they are based on (docs/architecture/ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md).
const { UpdateStepSchema, CompleteProjectSchema, AbandonProjectSchema } = require('../../src/validators/diy.validators.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const router = require('../../src/routes/diy.routes.ts').default;

const TOKEN = '2026-10-06T12:00:00.123Z';

test('the version is required on all three requests, and must be an ISO timestamp', () => {
  const cases = [[UpdateStepSchema, { status: 'COMPLETED' }], [CompleteProjectSchema, { actualMinutes: 30 }], [AbandonProjectSchema, { hireOut: true }]];
  for (const [schema, base] of cases) {
    assert.equal(schema.safeParse(base).success, false, 'missing token');
    assert.equal(schema.safeParse({ ...base, expectedUpdatedAt: 'yesterday' }).success, false, 'not a timestamp');
    assert.equal(schema.safeParse({ ...base, expectedUpdatedAt: 12345 }).success, false, 'not a string');
    assert.equal(schema.safeParse({ ...base, expectedUpdatedAt: TOKEN }).success, true, 'a valid token');
  }
  assert.equal(UpdateStepSchema.parse({ status: 'COMPLETED', notes: 'n', expectedUpdatedAt: TOKEN }).expectedUpdatedAt, TOKEN);
  assert.equal(AbandonProjectSchema.parse({ expectedUpdatedAt: TOKEN }).hireOut, false, 'hireOut still defaults to false');
});

// The real route chains, up to the controller, with a stubbed access lookup.
const originalResolve = propertyAccess.resolvePropertyAccess;
test.after(() => { propertyAccess.resolvePropertyAccess = originalResolve; });
const route = (method, path) => router.stack.find((layer) => layer.route && layer.route.path === path && layer.route.methods[method]).route.stack.map((entry) => entry.handle);
async function run(handlers, body) {
  propertyAccess.resolvePropertyAccess = async (userId, propertyId) => ({ role: 'CONTRIBUTOR', userId, propertyId });
  const req = { user: { userId: 'u1' }, params: { propertyId: 'p1', projectId: 'proj', stepId: 'step' }, body, query: {}, ip: '127.0.0.1', path: '/x', method: 'PATCH' };
  const out = { status: null, body: null, reachedController: false };
  const res = { status(code) { out.status = code; return this; }, json(value) { out.body = value; return this; }, send(value) { out.body = value; return this; } };
  for (let index = 0; index < handlers.length - 1; index += 1) {
    let advanced = false;
    await handlers[index](req, res, (error) => { advanced = !error; if (error) out.body = error; });
    if (!advanced) return out;
  }
  out.reachedController = true;
  return out;
}

const PREFIX = '/properties/:propertyId/diy/projects/:projectId';
const ROUTES = [['patch', `${PREFIX}/steps/:stepId`, { status: 'COMPLETED' }], ['post', `${PREFIX}/complete`, {}], ['post', `${PREFIX}/abandon`, { hireOut: false }]];

for (const [method, path, body] of ROUTES) {
  test(`${method.toUpperCase()} ${path}: a request without the version never reaches the controller; with it, it does`, async () => {
    const without = await run(route(method, path), body);
    assert.equal(without.status, 400);
    assert.equal(without.reachedController, false);
    assert.match(JSON.stringify(without.body), /expectedUpdatedAt/);
    const withToken = await run(route(method, path), { ...body, expectedUpdatedAt: TOKEN });
    assert.equal(withToken.reachedController, true);
  });
}

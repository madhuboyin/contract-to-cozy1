const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
require('ts-node/register');

// D-R1 follow-up: GET /coverage-comparison and GET /coverage-review used to create and update records on a plain page view. Both GETs are now strictly
// read-only for every role; creating a comparison and generating a review are explicit POSTs with a CONTRIBUTOR floor. This test runs the REAL
// controllers and services against a recording prisma and proves repeated reads write nothing (no insert, update, delete, transaction or analytics
// event), and that the POST routes carry the floor at the router.

const calls = [];
const analytics = [];
const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', '$transaction', '$executeRaw', '$queryRaw']);
const fixtures = {
  property: { id: 'prop-1', updatedAt: new Date('2026-01-01T00:00:00Z') },
  insurancePolicyTerm: {
    id: 'term-1', insurancePolicyId: 'pol-1', updatedAt: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'VERIFIED',
    termStart: new Date('2026-01-01T00:00:00Z'), termEnd: null, facts: [], sourceDocumentId: null,
    insurancePolicy: { id: 'pol-1', carrierName: 'Acme', policyNumber: 'P1' },
  },
};
let existingReview = null;
let existingComparison = null;
const recording = new Proxy({}, {
  get: (_t, model) => {
    if (typeof model !== 'string' || model === 'then') return undefined;
    if (model.startsWith('$')) return async () => { calls.push({ model: 'prisma', op: model }); return undefined; };
    return new Proxy({}, {
      get: (_m, op) => async (args) => {
        calls.push({ model, op, args });
        // A review lookup for the present facts asks for status READY; an "older review" lookup does not.
        if (model === 'coverageReview' && (op === 'findFirst' || op === 'findUnique')) {
          return args?.where?.status === 'READY' && existingReview?.status !== 'READY' ? null : existingReview;
        }
        if (model === 'coverageComparison' && (op === 'findFirst' || op === 'findUnique')) return existingComparison;
        if (op === 'findFirst' || op === 'findUnique') return fixtures[model] ?? null;
        if (op === 'findMany') return [];
        if (op === 'count') return 0;
        return {};
      },
    });
  },
});
require('../../src/lib/prisma.ts').prisma = recording;
const analyticsModule = require('../../src/services/analytics');
analyticsModule.analyticsEmitter.track = (event) => { analytics.push(event); };

const controller = require('../../src/controllers/coverageAnalysis.controller.ts');
const writes = () => calls.filter((c) => WRITE_OPS.has(c.op));

function res() {
  return { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
}
async function get(handler, query = {}, role = 'VIEWER') {
  const response = res();
  await handler({ params: { propertyId: 'prop-1' }, query, body: {}, user: { userId: 'user-1' }, householdRole: role }, response);
  return response;
}

const REVIEW = { id: 'rev-1', status: 'READY', questions: [] };
const COMPARISON = { id: 'cmp-1', status: 'DRAFT', sourceActionId: null, guidanceJourneyId: null, guidanceStepKey: null, options: [], decisions: [] };

test('GET coverage-review: repeated reads write nothing whether or not a review exists', async () => {
  for (const [label, review] of [['no review yet', null], ['a current review', REVIEW]]) {
    existingReview = review;
    for (let i = 0; i < 3; i += 1) {
      calls.length = 0; analytics.length = 0;
      const response = await get(controller.getCoverageReview, { triggerType: 'WORKSPACE_OPEN', triggerEntityId: 'item-1' });
      assert.equal(response.statusCode, 200, label);
      assert.deepEqual(writes(), [], `${label}: no write on read #${i + 1}`);
      assert.deepEqual(analytics, [], `${label}: no analytics event on read`);
    }
  }
  existingReview = null;
  const none = await get(controller.getCoverageReview);
  assert.equal(none.body.data.review, null);
  assert.equal(none.body.data.isCurrent, false);
});

test('GET coverage-review: a review that is not current is returned as out of date, still without writing', async () => {
  existingReview = { ...REVIEW, status: 'STALE' };
  for (let i = 0; i < 2; i += 1) {
    calls.length = 0;
    const response = await get(controller.getCoverageReview);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.review.id, 'rev-1');
    assert.equal(response.body.data.isCurrent, false);
    assert.deepEqual(writes(), [], 'reading a stale review must not refresh or expire anything');
  }
  existingReview = REVIEW;
  const current = await get(controller.getCoverageReview);
  assert.equal(current.body.data.isCurrent, true);
  existingReview = null;
});

test('GET coverage-comparison: repeated reads create nothing and do not back-fill guidance links', async () => {
  for (const [label, comparison] of [['not started', null], ['started without guidance links', COMPARISON]]) {
    existingComparison = comparison;
    for (let i = 0; i < 3; i += 1) {
      calls.length = 0; analytics.length = 0;
      const response = await get(controller.getCoverageComparisonWorkspace, { guidanceJourneyId: 'j-1', guidanceStepKey: 's-1', sourceActionId: 'a-1' });
      assert.equal(response.statusCode, 200, label);
      assert.deepEqual(writes(), [], `${label}: no write on read #${i + 1}`);
      assert.deepEqual(analytics, []);
    }
  }
  existingComparison = null;
  const notStarted = await get(controller.getCoverageComparisonWorkspace);
  assert.equal(notStarted.body.data.state, 'NOT_STARTED');
  assert.equal(notStarted.body.data.comparison, null);
});

test('GET coverage-comparison without a verified baseline reports it and writes nothing', async () => {
  const saved = fixtures.insurancePolicyTerm;
  fixtures.insurancePolicyTerm = null;
  calls.length = 0;
  const response = await get(controller.getCoverageComparisonWorkspace);
  fixtures.insurancePolicyTerm = saved;
  assert.equal(response.body.data.state, 'BASELINE_REQUIRED');
  assert.deepEqual(writes(), []);
});

test('the explicit POSTs do write (so the GET fix is not simply a disabled feature)', async () => {
  existingComparison = null;
  calls.length = 0;
  const started = res();
  await controller.startCoverageComparison({ params: { propertyId: 'prop-1' }, query: {}, body: { guidanceJourneyId: 'j-1' }, user: { userId: 'user-1' }, householdRole: 'CONTRIBUTOR' }, started);
  assert.ok(writes().some((c) => c.model === 'coverageComparison' && c.op === 'create'), 'POST creates the comparison');

  existingReview = null;
  calls.length = 0;
  const generated = res();
  await controller.generateCoverageReview({ params: { propertyId: 'prop-1' }, query: {}, body: { triggerType: 'MANUAL' }, user: { userId: 'user-1' }, householdRole: 'CONTRIBUTOR' }, generated);
  assert.ok(calls.some((c) => c.op === '$transaction' || (c.model === 'coverageReview' && c.op === 'create')), 'POST generates the review');
});

// ── router: the POSTs carry a CONTRIBUTOR floor, the GETs stay open to a viewer ───────────────────────────────────────────────────────────────
const authMiddleware = require('../../src/middleware/auth.middleware.ts');
const propertyAuth = require('../../src/middleware/propertyAuth.middleware.ts');
const rateLimiter = require('../../src/middleware/rateLimiter.middleware.ts');
test('router: POST coverage-comparison and POST coverage-review reject a viewer; GETs are open to a viewer', async () => {
  authMiddleware.authenticate = (req, _rs, next) => { req.user = { userId: 'user-1' }; next(); };
  for (const [name, value] of Object.entries(rateLimiter)) if (typeof value === 'function' && /limiter/i.test(name)) rateLimiter[name] = (_rq, _rs, next) => next();
  propertyAuth.propertyAuthMiddleware = (req, _rs, next) => { req.householdRole = req.header('x-test-role') || undefined; req.property = { id: req.params.propertyId }; next(); };
  const resolved = require.resolve('../../src/controllers/coverageAnalysis.controller.ts');
  const stub = new Proxy({}, { get: (_t, n) => (n === '__esModule' ? true : (typeof n === 'string' ? (_rq, rs) => rs.status(200).json({ handled: n }) : undefined)) });
  const real = require.cache[resolved];
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: stub, children: [], paths: [] };
  delete require.cache[require.resolve('../../src/routes/coverageAnalysis.routes.ts')];
  const router = require('../../src/routes/coverageAnalysis.routes.ts').default;
  require.cache[resolved] = real;
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = '/properties/11111111-1111-4111-8111-111111111111';
  const status = async (method, path, role) => (await fetch(`${origin}${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) }, body: method === 'POST' ? '{}' : undefined })).status;
  try {
    for (const path of ['/coverage-comparison', '/coverage-review']) {
      assert.equal(await status('POST', path, 'VIEWER'), 403, `POST ${path}: viewer`);
      assert.equal(await status('POST', path, undefined), 403, `POST ${path}: no role`);
      assert.equal(await status('POST', path, 'CONTRIBUTOR'), 200, `POST ${path}: contributor`);
      assert.equal(await status('GET', path, 'VIEWER'), 200, `GET ${path}: viewer`);
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
});

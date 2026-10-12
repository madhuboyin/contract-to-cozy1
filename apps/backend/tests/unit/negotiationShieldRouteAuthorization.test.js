const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

require('ts-node/register');

// Runtime authorization test for the Negotiation Shield router. The router, its validators and the real requireHouseholdRole run; only
// authentication, the membership lookup (it sets req.householdRole from a header), the rate limiter and the controllers are replaced, so no
// database or token is needed. Controllers answer 200 { handled } so "reached the controller" is observable.

const authMiddleware = require('../../src/middleware/auth.middleware.ts');
const propertyAuth = require('../../src/middleware/propertyAuth.middleware.ts');
const rateLimiter = require('../../src/middleware/rateLimiter.middleware.ts');

authMiddleware.authenticate = (req, _res, next) => { req.user = { userId: 'user-1' }; next(); };
rateLimiter.apiRateLimiter = (_req, _res, next) => next();
const realFloor = propertyAuth.requireHouseholdRole;
propertyAuth.propertyAuthMiddleware = (req, _res, next) => {
  const role = req.header('x-test-role');
  req.householdRole = role || undefined;
  req.property = { id: req.params.propertyId };
  next();
};
const handled = [];
// The real controller pulls in the document-parsing and OCR stack (sharp), which this test neither needs nor should load. Put a stand-in for
// the module in the require cache under its real path, exporting exactly the handlers the router imports.
const CONTROLLER_EXPORTS = [
  'analyzeNegotiationShieldCase', 'attachNegotiationShieldDocumentMetadata', 'createNegotiationShieldCase', 'getNegotiationShieldCaseDetail',
  'listNegotiationShieldCases', 'parseNegotiationShieldDocument', 'recordBuyerNegotiationOutcome', 'saveNegotiationShieldManualInput',
  'startBuyerNegotiation', 'trackNegotiationShieldEvent',
];
const controllerPath = require.resolve('../../src/controllers/negotiationShield.controller.ts');
const fakeControllers = Object.fromEntries(CONTROLLER_EXPORTS.map((name) => [name, (req, res) => { handled.push(name); res.status(200).json({ success: true, handled: name }); }]));
require.cache[controllerPath] = { id: controllerPath, filename: controllerPath, loaded: true, exports: fakeControllers, children: [], paths: [] };

const express = require('express');
const router = require('../../src/routes/negotiationShield.routes.ts').default;
assert.equal(propertyAuth.requireHouseholdRole, realFloor, 'the real role floor is under test');

const P = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const D = '33333333-3333-4333-8333-333333333333';
const F = '44444444-4444-4444-8444-444444444444';
const base = `/properties/${P}/negotiation-shield`;

const MUTATIONS = [
  ['start buyer negotiation', 'POST', `${base}/buyer-cases`, { findingId: F }, 'startBuyerNegotiation'],
  ['record buyer outcome', 'PUT', `${base}/cases/${C}/buyer-outcome`, { findingId: F, sellerResponse: 'ACCEPTED', outcome: 'ACCEPTED_REPAIR' }, 'recordBuyerNegotiationOutcome'],
  ['create a case', 'POST', `${base}/cases`, { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'Roof quote', sourceType: 'MANUAL' }, 'createNegotiationShieldCase'],
  ['save input', 'PUT', `${base}/cases/${C}/input`, { inputType: 'CONTRACTOR_QUOTE', structuredData: { quoteAmount: 1000 } }, 'saveNegotiationShieldManualInput'],
  ['attach a document', 'POST', `${base}/cases/${C}/documents`, { documentType: 'QUOTE', documentId: D }, 'attachNegotiationShieldDocumentMetadata'],
  ['parse a document', 'POST', `${base}/cases/${C}/documents/${D}/parse`, undefined, 'parseNegotiationShieldDocument'],
  ['run the analysis', 'POST', `${base}/cases/${C}/analyze`, undefined, 'analyzeNegotiationShieldCase'],
];
const READS = [
  ['list cases', 'GET', `${base}/cases`, undefined, 'listNegotiationShieldCases'],
  ['read one case', 'GET', `${base}/cases/${C}`, undefined, 'getNegotiationShieldCaseDetail'],
  ['report tool analytics', 'POST', `${base}/events`, { event: 'tool_opened' }, 'trackNegotiationShieldEvent'],
];

let server;
let origin;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, path, body, role) {
  handled.length = 0;
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, handled: [...handled] };
}

test('every mutating route rejects a viewer before the controller runs', async () => {
  for (const [name, method, path, body, fn] of MUTATIONS) {
    const result = await call(method, path, body, 'VIEWER');
    assert.equal(result.status, 403, `${name}: viewer`);
    assert.deepEqual(result.handled, [], `${name}: controller not reached`);
  }
});

test('every mutating route rejects a caller with no household role', async () => {
  for (const [name, method, path, body] of MUTATIONS) {
    const result = await call(method, path, body, undefined);
    assert.equal(result.status, 403, `${name}: no role`);
    assert.deepEqual(result.handled, [], `${name}: controller not reached`);
  }
});

test('every mutating route accepts a contributor and an owner', async () => {
  for (const role of ['CONTRIBUTOR', 'OWNER']) {
    for (const [name, method, path, body, fn] of MUTATIONS) {
      const result = await call(method, path, body, role);
      assert.equal(result.status, 200, `${name}: ${role}`);
      assert.deepEqual(result.handled, [fn], `${name}: ${role} reached ${fn}`);
    }
  }
});

test('reads and the analytics report stay open to a viewer', async () => {
  for (const [name, method, path, body, fn] of READS) {
    const result = await call(method, path, body, 'VIEWER');
    assert.equal(result.status, 200, `${name}: viewer`);
    assert.deepEqual(result.handled, [fn], `${name}: viewer reached ${fn}`);
  }
});

test('the role floor does not replace validation: a contributor with a bad body is still rejected', async () => {
  const result = await call('POST', `${base}/cases`, { scenarioType: 'NOT_A_SCENARIO', title: '' }, 'CONTRIBUTOR');
  assert.equal(result.status, 400);
  assert.deepEqual(result.handled, []);
});

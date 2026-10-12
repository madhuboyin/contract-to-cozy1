const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

require('ts-node/register');

// Router-level role floors for the Permit Tracker, Price Finalization and Financing routes (docs/architecture/ASK_COZY_FINANCING_PERMITS_PRICE_FINALIZATION_DESIGN.md).
// These routers had propertyAuthMiddleware (membership only) and no household-role floor, so a read-only member could create and delete permits, finalize
// a price, edit the financing profile and delete scenarios over HTTP. Same harness as the Negotiation Shield test: the real routers and the real
// requireHouseholdRole run; only authentication, the membership lookup, the rate limiters and the controllers are replaced. A contributor is asserted to
// get PAST the floor (not 403): a body that fails validation answers 400, which is the validator working, not the floor.

const authMiddleware = require('../../src/middleware/auth.middleware.ts');
const propertyAuth = require('../../src/middleware/propertyAuth.middleware.ts');
const rateLimiter = require('../../src/middleware/rateLimiter.middleware.ts');

authMiddleware.authenticate = (req, _res, next) => { req.user = { userId: 'user-1' }; next(); };
for (const [name, value] of Object.entries(rateLimiter)) {
  if (typeof value === 'function' && /limiter/i.test(name)) rateLimiter[name] = (_req, _res, next) => next();
}
const realFloor = propertyAuth.requireHouseholdRole;
propertyAuth.propertyAuthMiddleware = (req, _res, next) => {
  const role = req.header('x-test-role');
  req.householdRole = role || undefined;
  req.property = { id: req.params.propertyId };
  next();
};

// The real controllers load services (OCR, finance adapters) this test neither needs nor should load: stand in for each controller module under its real
// path, answering every handler the router asks for.
const handled = [];
function fakeController(relativePath) {
  const resolved = require.resolve(relativePath);
  const handlers = new Map();
  const proxy = new Proxy({}, {
    get: (_target, name) => {
      if (name === '__esModule') return true;
      if (typeof name !== 'string') return undefined;
      if (!handlers.has(name)) handlers.set(name, (req, res) => { handled.push(name); res.status(200).json({ success: true, handled: name }); });
      return handlers.get(name);
    },
  });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: proxy, children: [], paths: [] };
}
fakeController('../../src/controllers/permitTracker.controller.ts');
fakeController('../../src/controllers/priceFinalization.controller.ts');
fakeController('../../src/controllers/financing.controller.ts');

const express = require('express');
const permitRouter = require('../../src/routes/permitTracker.routes.ts').default;
const priceRouter = require('../../src/routes/priceFinalization.routes.ts').default;
const financingRouter = require('../../src/routes/financing.routes.ts').default;
assert.equal(propertyAuth.requireHouseholdRole, realFloor, 'the real role floor is under test');

const P = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const M = '33333333-3333-4333-8333-333333333333';
const base = `/properties/${P}`;

const TOOLS = [
  {
    name: 'Permit Tracker', router: permitRouter,
    mutations: [
      ['POST', `${base}/permits/fetch`], ['POST', `${base}/permits`], ['PATCH', `${base}/permits/${ID}`], ['POST', `${base}/permits/${ID}/official-status`],
      ['DELETE', `${base}/permits/${ID}`], ['POST', `${base}/permits/${ID}/inspections`], ['PATCH', `${base}/permits/${ID}/inspections/${M}`],
      ['DELETE', `${base}/permits/${ID}/inspections/${M}`], ['POST', `${base}/permits/${ID}/inspections/${M}/readiness-checks`],
      ['POST', `${base}/permits/flags/scan`], ['POST', `${base}/permits/flags`], ['PATCH', `${base}/permits/flags/${ID}`],
      ['POST', `${base}/permits/flags/${ID}/remediation-case`], ['POST', `${base}/permits/disclosure`],
    ],
    reads: [
      ['GET', `${base}/permits/fetch/status`], ['GET', `${base}/permits/summary`], ['GET', `${base}/permits`], ['GET', `${base}/permits/${ID}`],
      ['GET', `${base}/permits/${ID}/inspections`], ['GET', `${base}/permits/${ID}/inspections/${M}/readiness-checks`],
      ['GET', `${base}/permits/flags/${ID}`], ['GET', `${base}/permits/disclosure`], ['GET', `${base}/permits/disclosure/${ID}`],
    ],
  },
  {
    name: 'Price Finalization', router: priceRouter,
    mutations: [['POST', `${base}/price-finalizations`], ['PUT', `${base}/price-finalizations/${ID}`], ['POST', `${base}/price-finalizations/${ID}/finalize`]],
    reads: [['GET', `${base}/price-finalizations`], ['GET', `${base}/price-finalizations/${ID}`]],
  },
  {
    name: 'Financing', router: financingRouter,
    mutations: [
      ['PUT', `${base}/financing/profile`], ['POST', `${base}/financing/equity/refresh`], ['POST', `${base}/financing/scenarios`],
      ['PATCH', `${base}/financing/scenarios/${ID}`], ['DELETE', `${base}/financing/scenarios/${ID}`],
    ],
    // POST /financing/calculate is a stateless calculator: it persists nothing, so a viewer may use it.
    reads: [
      ['GET', `${base}/financing/profile`], ['GET', `${base}/financing/equity`], ['GET', `${base}/financing/equity/history`],
      ['GET', `${base}/financing/scenarios`], ['GET', `${base}/financing/scenarios/${ID}`], ['POST', `${base}/financing/calculate`],
    ],
  },
];

const servers = [];
test.before(async () => {
  for (const tool of TOOLS) {
    const app = express();
    app.use(express.json());
    app.use('/', tool.router);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    tool.origin = `http://127.0.0.1:${server.address().port}`;
    servers.push(server);
  }
});
test.after(() => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))));

async function call(tool, method, path, role) {
  const response = await fetch(`${tool.origin}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ projectCostCents: 100000 }),
  });
  return response.status;
}

for (const tool of TOOLS) {
  test(`${tool.name}: every writing route rejects a viewer and a caller with no role`, async () => {
    for (const [method, path] of tool.mutations) {
      assert.equal(await call(tool, method, path, 'VIEWER'), 403, `${method} ${path}: viewer`);
      assert.equal(await call(tool, method, path, undefined), 403, `${method} ${path}: no role`);
    }
  });

  test(`${tool.name}: a contributor and an owner get past the floor on every writing route`, async () => {
    for (const role of ['CONTRIBUTOR', 'OWNER']) {
      for (const [method, path] of tool.mutations) {
        assert.notEqual(await call(tool, method, path, role), 403, `${method} ${path}: ${role}`);
      }
    }
  });

  test(`${tool.name}: reads (and the stateless calculator) stay open to a viewer`, async () => {
    for (const [method, path] of tool.reads) {
      assert.notEqual(await call(tool, method, path, 'VIEWER'), 403, `${method} ${path}: viewer`);
    }
  });
}

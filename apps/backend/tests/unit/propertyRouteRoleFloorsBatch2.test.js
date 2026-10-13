const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
require('ts-node/register');

// D-R1 batch 1 (docs/architecture/ASK_COZY_FINANCING_PERMITS_PRICE_FINALIZATION_DESIGN.md, register "Open items by kind"): a router-level, VERIFIED role-floor
// audit for projectTracker, quoteComparison, materialSpec, inventory and claims. Same harness as propertyRouteRoleFloors.test.js: the real routers and the
// real requireHouseholdRole run; only authentication, the membership lookup, the rate limiters and the controllers are replaced.
//
// The mutating routes are ENUMERATED from the real router stack, not typed in: every non-GET route must be classified below, so a route added later
// without a floor fails here instead of shipping open. Classification:
//   - default            property-scoped mutation that needs CONTRIBUTOR (viewer and no-role get 403, contributor and owner get past)
//   - VIEWER_CAPABLE     deliberately open to a viewer, with the reason
//   - OWNER_ONLY         needs OWNER (a contributor gets 403), with the reason
// homeBuyerTask is NOT here: its router has no propertyAuthMiddleware and each service method enforces its own role (asserted in
// tests/unit/buyerServiceRoleEnforcement.test.js).

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

// The inventory and claims routers pull in image tooling (sharp) this test neither needs nor can load on every host.
try {
  const sharpPath = require.resolve('sharp');
  require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => ({}), children: [], paths: [] };
} catch { /* sharp not installed: nothing to stub */ }

const ROUTES_DIR = path.join(__dirname, '../../src/routes');
const ROUTER_FILES = ['incidents', 'guidance', 'inspectionHub', 'homeHabitCoach', 'roomPlantAdvisor'];

// Stand in for every controller module a router imports, answering whichever handler is asked for. A handler is also a namespace, so class-style
// controllers (ClaimsController.list) resolve too.
function fakeHandler(name) {
  // Called with a string it is a middleware factory (uploadSingleFile('file')), which the claims router invokes at load time.
  const handler = (req, res) => {
    if (typeof req === 'string') return (_rq, _rs, next) => next();
    return res.status(200).json({ success: true, handled: name });
  };
  return new Proxy(handler, {
    get: (target, prop) => (prop in target || typeof prop !== 'string' ? target[prop] : fakeHandler(`${name}.${prop}`)),
  });
}
function fakeController(resolved) {
  const handlers = new Map();
  const proxy = new Proxy({}, {
    get: (_target, name) => {
      if (name === '__esModule') return true;
      if (typeof name !== 'string') return undefined;
      if (!handlers.has(name)) handlers.set(name, fakeHandler(name));
      return handlers.get(name);
    },
  });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: proxy, children: [], paths: [] };
}
for (const file of ROUTER_FILES) {
  const source = fs.readFileSync(path.join(ROUTES_DIR, `${file}.routes.ts`), 'utf8');
  for (const match of source.matchAll(/from '(\.\.\/controllers\/[^']+)'/g)) {
    fakeController(require.resolve(path.join(ROUTES_DIR, match[1])));
  }
}

const express = require('express');
assert.equal(propertyAuth.requireHouseholdRole, realFloor, 'the real role floor is under test');

// key = "METHOD /path-after-/properties/:propertyId"
// Owner rule: a viewer may change only state scoped exclusively to their own account; anything that changes the household record or another member's
// experience needs CONTRIBUTOR. The routes below are the only viewer-capable writes, and
// tests/unit/viewerCapableMutationsAreCallerScoped.test.js proves each one touches only the authenticated user's row.
const VIEWER_CAPABLE = {
  incidents: {
    'PATCH /incidents/:incidentId/preferences': "caller's own pin/archive preference (incidentUserPreference keyed by incident + caller)",
    'POST /incidents/:incidentId/archive': "caller's own archive flag",
    'POST /incidents/:incidentId/restore': "caller's own archive flag",
    'POST /incidents/:incidentId/auto-resolution/cancel': 'cancels only notifications addressed to the caller',
  },
  homeHabitCoach: {
    'POST /home-habits/:habitId/viewed': "a VIEWED action row stored under the caller and debounced per caller",
  },
};
const OWNER_ONLY = {};

function enumerateMutations(router) {
  const found = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      if (!layer.route.methods[method] || method === 'get' || method === 'head') continue;
      found.push({ method: method.toUpperCase(), path: layer.route.path });
    }
  }
  return found;
}
const key = (m) => `${m.method} ${m.path.replace('/properties/:propertyId', '')}`;
const concrete = (routePath) => routePath
  .replace(':propertyId', '11111111-1111-4111-8111-111111111111')
  .replace(/:[A-Za-z]+/g, '22222222-2222-4222-8222-222222222222');

const TOOLS = ROUTER_FILES.map((name) => {
  const router = require(path.join(ROUTES_DIR, `${name}.routes.ts`)).default;
  const mutations = enumerateMutations(router);
  const viewerCapable = VIEWER_CAPABLE[name] ?? {};
  const ownerOnly = OWNER_ONLY[name] ?? {};
  return {
    name, router, mutations, viewerCapable, ownerOnly,
    floored: mutations.filter((m) => !(key(m) in viewerCapable) && !(key(m) in ownerOnly)),
    ownerRoutes: mutations.filter((m) => key(m) in ownerOnly),
  };
});

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

async function call(tool, method, routePath, role) {
  const response = await fetch(`${tool.origin}${concrete(routePath)}`, {
    method, headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
    body: method === 'DELETE' ? undefined : JSON.stringify({ code: '' }),
  });
  return response.status;
}

for (const tool of TOOLS) {
  test(`${tool.name}: classification entries all name a real mutating route`, () => {
    const keys = new Set(tool.mutations.map(key));
    for (const k of [...Object.keys(tool.viewerCapable), ...Object.keys(tool.ownerOnly)]) assert.ok(keys.has(k), `${k} is not a mutating route of ${tool.name}`);
  });

  test(`${tool.name}: every writing route rejects a viewer and a caller with no role`, async () => {
    assert.ok(tool.floored.length > 0);
    const open = [];
    for (const m of tool.floored) {
      if ((await call(tool, m.method, m.path, 'VIEWER')) !== 403) open.push(`${key(m)}: viewer`);
      if ((await call(tool, m.method, m.path, undefined)) !== 403) open.push(`${key(m)}: no role`);
    }
    assert.deepEqual(open, [], `${open.length} writing route(s) of ${tool.name} are open to a caller below CONTRIBUTOR`);
  });

  test(`${tool.name}: a contributor and an owner get past the floor on every writing route`, async () => {
    const blocked = [];
    for (const role of ['CONTRIBUTOR', 'OWNER']) {
      for (const m of tool.floored) if ((await call(tool, m.method, m.path, role)) === 403) blocked.push(`${key(m)}: ${role}`);
    }
    assert.deepEqual(blocked, []);
  });

  test(`${tool.name}: OWNER-only routes reject a contributor and accept an owner`, async () => {
    const wrong = [];
    for (const m of tool.ownerRoutes) {
      for (const role of ['VIEWER', 'CONTRIBUTOR', undefined]) if ((await call(tool, m.method, m.path, role)) !== 403) wrong.push(`${key(m)}: ${role ?? 'no role'} got in`);
      if ((await call(tool, m.method, m.path, 'OWNER')) === 403) wrong.push(`${key(m)}: owner refused`);
    }
    assert.deepEqual(wrong, []);
  });

  test(`${tool.name}: viewer-capable routes stay open to a viewer`, async () => {
    for (const m of tool.mutations.filter((x) => key(x) in tool.viewerCapable)) {
      assert.notEqual(await call(tool, m.method, m.path, 'VIEWER'), 403, `${key(m)}: viewer`);
    }
  });
}


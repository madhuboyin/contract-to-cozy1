// apps/backend/tests/unit/homeReportExportDuplicateGuard.test.js
//
// W3 (exports — "concurrent duplicate requests"): createHomeReportExport
// used to create a new PENDING row unconditionally, unlike
// materialSpec.service.ts#requestExport, which already guards against a
// second in-flight request for the same property. A double-click (or two
// open tabs) triggered two full generations and two S3 uploads for the
// same property. Now guarded the same way.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadController({ inFlightRecord = null, contextApplicable = true }) {
  const createCalls = [];

  const prismaMock = {
    homeReportExport: {
      findFirst: async () => inFlightRecord,
      create: async (args) => {
        createCalls.push(args);
        return { id: 'export-new', status: 'PENDING', type: args.data.type };
      },
    },
    homeReportExportEvent: {
      create: async () => ({}),
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const contextPath = require.resolve('../../src/services/aggregationContext/context.ts');
  require.cache[contextPath] = {
    id: contextPath,
    filename: contextPath,
    loaded: true,
    exports: {
      getAggregationContextEnvelope: async () => ({
        decision: { status: contextApplicable ? 'APPLICABLE' : 'NOT_APPLICABLE' },
      }),
    },
  };

  // analyticsEmitter.track() is fire-and-forget (not awaited by the
  // controller) but transitively opens a real ioredis connection that
  // retries indefinitely when Redis isn't reachable — exactly the
  // transitive-connection hang trap documented elsewhere in this test
  // suite (see reserveFundReconciliationJob.test.js), just via analytics
  // instead of NotificationService this time. Stub it before requiring the
  // controller so `node --test` can actually exit.
  const analyticsPath = require.resolve('../../src/services/analytics/index.ts');
  require.cache[analyticsPath] = {
    id: analyticsPath,
    filename: analyticsPath,
    loaded: true,
    exports: {
      analyticsEmitter: { track: () => {} },
      AnalyticsEvent: new Proxy({}, { get: (_t, prop) => prop }),
      AnalyticsModule: new Proxy({}, { get: (_t, prop) => prop }),
      AnalyticsFeature: new Proxy({}, { get: (_t, prop) => prop }),
    },
  };

  const controllerPath = require.resolve('../../src/controllers/homeReportExport.controller.ts');
  delete require.cache[controllerPath];
  return { controller: require(controllerPath), getCreateCalls: () => createCalls };
}

function mockReq(overrides = {}) {
  return {
    params: { propertyId: 'property-1' },
    body: {},
    headers: {},
    user: { userId: 'user-1' },
    ...overrides,
  };
}

function mockRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test('creates a new export when none is in flight for the property', async () => {
  const { controller, getCreateCalls } = loadController({ inFlightRecord: null });
  const res = mockRes();

  await controller.createHomeReportExport(mockReq(), res);

  assert.equal(res.statusCode, 202);
  assert.equal(getCreateCalls().length, 1);
});

test('rejects with 409 when a PENDING/GENERATING export already exists for the property', async () => {
  const { controller, getCreateCalls } = loadController({
    inFlightRecord: { id: 'export-existing' },
  });
  const res = mockRes();

  await controller.createHomeReportExport(mockReq(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data.exportId, 'export-existing');
  assert.equal(getCreateCalls().length, 0, 'must not create a second export while one is in flight');
});

test('still blocks on NOT_APPLICABLE property context before even checking for an in-flight export', async () => {
  const { controller, getCreateCalls } = loadController({ contextApplicable: false });
  const res = mockRes();

  await controller.createHomeReportExport(mockReq(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(getCreateCalls().length, 0);
});

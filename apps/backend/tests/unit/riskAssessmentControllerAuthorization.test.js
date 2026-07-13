const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ============================================================================
// Mocks
//
// The route-param handlers (getRiskReportSummary, generateRiskReportPdf,
// triggerRecalculation) are gated by propertyAuthMiddleware at the route
// level (risk.routes.ts) and no longer re-check ownership inside the
// controller, so no propertyAuth mock is needed for them here — only
// getPrimaryPropertyRiskSummary calls resolvePropertyAccess directly (it has
// no route-param propertyId), so that's what's mocked below.
// ============================================================================

let resolvePropertyAccessImpl = async () => null;

const propertyAuthPath = require.resolve('../../src/middleware/propertyAuth.middleware.ts');
require.cache[propertyAuthPath] = {
  id: propertyAuthPath,
  filename: propertyAuthPath,
  loaded: true,
  exports: {
    resolvePropertyAccess: (...args) => resolvePropertyAccessImpl(...args),
  },
};

const trackedEvents = [];
const analyticsPath = require.resolve('../../src/services/analytics');
require.cache[analyticsPath] = {
  id: analyticsPath,
  filename: analyticsPath,
  loaded: true,
  exports: {
    analyticsEmitter: { track: (event) => { trackedEvents.push(event); } },
    AnalyticsEvent: { TOOL_USED: 'TOOL_USED', ACTION_COMPLETED: 'ACTION_COMPLETED' },
    AnalyticsModule: { RISK: 'RISK' },
    AnalyticsFeature: { RISK_ASSESSMENT: 'RISK_ASSESSMENT' },
  },
};

let riskReportResult = {
  propertyId: 'property-1',
  riskScore: 42,
  financialExposureTotal: { toNumber: () => 1200 },
  lastCalculatedAt: new Date('2026-01-01'),
};
const riskServicePath = require.resolve('../../src/services/RiskAssessment.service.ts');
require.cache[riskServicePath] = {
  id: riskServicePath,
  filename: riskServicePath,
  loaded: true,
  exports: {
    __esModule: true,
    default: {
      getOrCreateRiskReport: async () => riskReportResult,
      calculateAndSaveReport: async () => riskReportResult,
      generateRiskReportPdf: async () => Buffer.from('pdf'),
    },
  },
};

for (const [mod, fn] of [
  ['../../src/services/coverageAnalysis.service.ts', 'markCoverageAnalysisStale'],
  ['../../src/services/riskPremiumOptimizer.service.ts', 'markRiskPremiumOptimizerStale'],
  ['../../src/services/doNothingSimulator.service.ts', 'markDoNothingRunsStale'],
]) {
  const p = require.resolve(mod);
  const exports = { [fn]: async () => {} };
  if (fn === 'markCoverageAnalysisStale') exports.markItemCoverageAnalysesStale = async () => {};
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

const propertyMock = { id: 'property-1', name: 'The Smith House' };
const prismaMock = {
  property: { findUnique: async () => propertyMock },
};
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const RiskAssessmentController = require('../../src/controllers/riskAssessment.controller.ts').default;

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
    send(payload) { this.payload = payload; return this; },
  };
}

test('getRiskReportSummary: a household collaborator admitted by propertyAuthMiddleware is not re-blocked, and analytics gets a real userId', async () => {
  trackedEvents.length = 0;
  const req = {
    params: { propertyId: 'property-1' },
    user: { userId: 'contributor-1' },
  };
  const res = createRes();

  await RiskAssessmentController.getRiskReportSummary(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, riskReportResult);
  assert.equal(trackedEvents.length, 1);
  assert.equal(trackedEvents[0].userId, 'contributor-1');
});

test('getPrimaryPropertyRiskSummary: household collaborator (not owner) is granted access via resolvePropertyAccess', async () => {
  resolvePropertyAccessImpl = async (userId, propertyId) => {
    if (userId === 'contributor-1' && propertyId === 'property-1') return { propertyId, role: 'CONTRIBUTOR' };
    return null;
  };

  const req = {
    query: { propertyId: 'property-1' },
    user: { userId: 'contributor-1' },
  };
  const res = createRes();

  await RiskAssessmentController.getPrimaryPropertyRiskSummary(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
});

test('getPrimaryPropertyRiskSummary: a non-member is denied with 404, not a leak of property existence', async () => {
  resolvePropertyAccessImpl = async () => null;

  const req = {
    query: { propertyId: 'property-1' },
    user: { userId: 'stranger-1' },
  };
  const res = createRes();

  await RiskAssessmentController.getPrimaryPropertyRiskSummary(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 404);
});

test('triggerRecalculation: analytics receives the real authenticated userId, not undefined', async () => {
  trackedEvents.length = 0;
  const req = {
    params: { propertyId: 'property-1' },
    user: { userId: 'owner-1' },
  };
  const res = createRes();

  await RiskAssessmentController.triggerRecalculation(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(trackedEvents.length, 1);
  assert.equal(trackedEvents[0].userId, 'owner-1');
});

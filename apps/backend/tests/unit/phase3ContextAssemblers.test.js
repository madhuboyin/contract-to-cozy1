const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const calls = [];
const prismaMock = {
  inspectionReport: {
    findMany: async (args) => {
      calls.push(['inspectionReport', args]);
      return [{
        id: 'report-1', reportType: 'GENERAL', inspectionDate: new Date('2026-06-01T00:00:00.000Z'),
        totalFindings: 2, openFindings: 1, safetyFindings: 1, majorFindings: 0,
        confirmedAt: new Date('2026-06-03T00:00:00.000Z'),
      }];
    },
  },
  inspectionFinding: {
    findMany: async (args) => {
      calls.push(['inspectionFinding', args]);
      return [{
        id: 'finding-1', reportId: 'report-1', homeSystem: 'ELECTRICAL', conditionRating: 'SAFETY_CONCERN',
        severity: 'SAFETY', inspectorRecommendation: 'REPAIR', estimatedCostCentsLow: 10000,
        estimatedCostCentsHigh: 30000, inventoryItemId: null, recallMatchId: null,
        updatedAt: new Date('2026-06-03T00:00:00.000Z'),
      }];
    },
  },
  insurancePolicy: {
    findMany: async (args) => { calls.push(['insurance', args]); return []; },
  },
  warranty: {
    findMany: async (args) => { calls.push(['warranty', args]); return []; },
  },
  claim: {
    findMany: async (args) => { calls.push(['claim', args]); return []; },
  },
  riskAssessmentReport: {
    findUnique: async () => ({
      id: 'risk-1', riskScore: 64, financialExposureTotal: { toNumber: () => 12500 }, details: [],
      lastCalculatedAt: new Date('2026-07-16T11:50:00.000Z'),
    }),
  },
  incident: {
    findMany: async (args) => { calls.push(['incident', args]); return []; },
  },
  recallMatch: {
    findMany: async (args) => { calls.push(['recall', args]); return []; },
  },
  guidanceSignal: {
    findMany: async (args) => { calls.push(['guidance', args]); return []; },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const {
  inspectionAssembler,
  coverageAssembler,
  riskAssembler,
  recallsAssembler,
  guidanceStateAssembler,
} = require('../../src/modules/propertyContext/infrastructure/prismaAssemblers.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

function byKey(facts) {
  return Object.fromEntries(facts.map((fact) => [fact.key, fact]));
}

test('INSPECTION exposes only confirmed reports and open confirmed findings', async () => {
  const facts = byKey(await inspectionAssembler.assemble('property-1', NOW));
  assert.equal(facts['inspection.confirmedReports'].value[0].inspectionDate, '2026-06-01T00:00:00.000Z');
  assert.equal(facts['inspection.openFindings'].value[0].severity, 'SAFETY');
  assert.equal(calls.find(([name]) => name === 'inspectionReport')[1].where.status, 'CONFIRMED');
  assert.equal(calls.find(([name]) => name === 'inspectionFinding')[1].where.report.status, 'CONFIRMED');
});

test('COVERAGE treats queried empty policy, warranty, and claim sets as known', async () => {
  const facts = byKey(await coverageAssembler.assemble('property-1', NOW));
  assert.equal(facts['coverage.insurancePolicies'].state, 'KNOWN');
  assert.deepEqual(facts['coverage.insurancePolicies'].value, []);
  assert.deepEqual(facts['coverage.warranties'].value, []);
  assert.deepEqual(facts['coverage.activeClaims'].value, []);
});

test('RISK marks the derived report stale after its validity window and keeps active incidents bounded', async () => {
  const fresh = byKey(await riskAssembler.assemble('property-1', NOW));
  assert.equal(fresh['risk.report'].state, 'KNOWN');
  assert.equal(fresh['risk.report'].value.financialExposureTotal, 12500);
  const stale = byKey(await riskAssembler.assemble('property-1', new Date('2026-07-16T12:21:00.000Z')));
  assert.equal(stale['risk.report'].state, 'STALE');
  assert.deepEqual(stale['risk.activeIncidents'].value, []);
});

test('RECALLS and GUIDANCE_STATE include unresolved, active, unexpired records only', async () => {
  const recalls = byKey(await recallsAssembler.assemble('property-1', NOW));
  const guidance = byKey(await guidanceStateAssembler.assemble('property-1', NOW));
  assert.deepEqual(recalls['recalls.unresolvedMatches'].value, []);
  assert.deepEqual(guidance['guidance.activeSignals'].value, []);
  assert.deepEqual(calls.find(([name]) => name === 'recall')[1].where.status.in, ['OPEN', 'NEEDS_CONFIRMATION']);
  assert.equal(calls.find(([name]) => name === 'guidance')[1].where.status, 'ACTIVE');
});

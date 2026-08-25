const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const calls = [];
let warrantyRowsOverride = [];
let pendingPolicyTermsOverride = [];
let confirmedPolicyFactsOverride = [];
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
    findMany: async (args) => { calls.push(['warranty', args]); return warrantyRowsOverride; },
  },
  claim: {
    findMany: async (args) => { calls.push(['claim', args]); return []; },
  },
  insurancePolicyTerm: {
    findMany: async (args) => { calls.push(['insurancePolicyTerm', args]); return pendingPolicyTermsOverride; },
  },
  insurancePolicyFact: {
    findMany: async (args) => { calls.push(['insurancePolicyFact', args]); return confirmedPolicyFactsOverride; },
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
  propertyClimateSetting: {
    findUnique: async (args) => {
      calls.push(['climate', args]);
      return {
        climateRegion: 'HUMID_SUBTROPICAL', climateRegionSource: 'AUTO_DETECTED',
        notificationEnabled: true, updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      };
    },
  },
  propertyRadarMatch: {
    findMany: async (args) => { calls.push(['radar', args]); return []; },
  },
  homeEvent: {
    findMany: async (args) => { calls.push(['homeEvent', args]); return []; },
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
  environmentAssembler,
  eventsAssembler,
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

// HI-DOC-004 remediation (Home Intelligence FRD §15 Phase 5 remediation item
// 3): a newly-extracted, unconfirmed policy fact that disagrees with an
// already-confirmed one for the same policy means coverage.insurancePolicies
// cannot be trusted as a single value — CONFLICTED, not KNOWN. This is the
// same detection coverageConflict.service.ts's shared function already
// verifies for the advisory Home Action in
// homeActionInsurancePolicyFactConflictPromotion.test.js — here it's
// asserted against Property Context's own snapshot, since that's the
// surface evaluateFeatureContext (and therefore feature-gated consumers
// like CLAIMS: FILE_INSURANCE_CLAIM) actually reads.
test('COVERAGE reports coverage.insurancePolicies as CONFLICTED when a pending policy fact disagrees with a confirmed one', async () => {
  pendingPolicyTermsOverride = [{
    id: 'term-pending-1',
    insurancePolicyId: 'policy-1',
    createdAt: new Date('2026-07-15T00:00:00.000Z'),
    updatedAt: new Date('2026-07-15T00:00:00.000Z'),
    insurancePolicy: { id: 'policy-1', carrierName: 'Acme Insurance' },
    facts: [{
      id: 'fact-pending-1', factKey: 'ANNUAL_PREMIUM', valueType: 'AMOUNT',
      amountValue: 2400, textValue: null, booleanValue: null, jsonValue: null,
      confidence: 0.8, confirmedAt: null,
      createdAt: new Date('2026-07-15T00:00:00.000Z'), updatedAt: new Date('2026-07-15T00:00:00.000Z'),
    }],
  }];
  confirmedPolicyFactsOverride = [{
    id: 'fact-confirmed-1', factKey: 'ANNUAL_PREMIUM', valueType: 'AMOUNT',
    amountValue: 1800, textValue: null, booleanValue: null, jsonValue: null,
    confidence: 1, confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    policyTerm: { insurancePolicyId: 'policy-1', termStart: new Date('2026-01-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z') },
  }];

  const facts = byKey(await coverageAssembler.assemble('property-1', NOW));
  assert.equal(facts['coverage.insurancePolicies'].state, 'CONFLICTED');
  // coverage.warranties is a separate fact key — an insurance conflict must
  // not bleed into it.
  assert.equal(facts['coverage.warranties'].state, 'KNOWN');

  pendingPolicyTermsOverride = [];
  confirmedPolicyFactsOverride = [];
});

test('COVERAGE reports coverage.warranties as CONFLICTED when two active warranties in the same category disagree on provider', async () => {
  warrantyRowsOverride = [
    { id: 'warranty-1', category: 'HVAC', providerName: 'CoolAir Warranty Co.', expiryDate: new Date('2027-01-01T00:00:00.000Z'), updatedAt: new Date('2026-07-01T00:00:00.000Z') },
    { id: 'warranty-2', category: 'HVAC', providerName: 'Other Provider Inc.', expiryDate: new Date('2027-01-01T00:00:00.000Z'), updatedAt: new Date('2026-07-01T00:00:00.000Z') },
  ];

  const facts = byKey(await coverageAssembler.assemble('property-1', NOW));
  assert.equal(facts['coverage.warranties'].state, 'CONFLICTED');
  assert.equal(facts['coverage.insurancePolicies'].state, 'KNOWN');

  warrantyRowsOverride = [];
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

test('ENVIRONMENT and EVENTS expose bounded current property state', async () => {
  const environment = byKey(await environmentAssembler.assemble('property-1', NOW));
  const events = byKey(await eventsAssembler.assemble('property-1', NOW));
  assert.equal(environment['environment.climateSetting'].value.climateRegion, 'HUMID_SUBTROPICAL');
  assert.deepEqual(events['events.activeRadarMatches'].value, []);
  assert.deepEqual(events['events.recentHomeEvents'].value, []);
  const radarWhere = calls.find(([name]) => name === 'radar')[1].where;
  assert.equal(radarWhere.isVisible, true);
  assert.equal(radarWhere.radarEvent.status, 'active');
  assert.ok(radarWhere.AND);
  const homeEventWhere = calls.find(([name]) => name === 'homeEvent')[1].where;
  assert.equal(homeEventWhere.occurredAt.lte.toISOString(), NOW.toISOString());
});

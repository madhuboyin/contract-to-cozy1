const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateProtectionContext } = require('../../src/services/protection/applicabilityPolicy.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

function snapshot(values, overrides = {}) {
  const facts = Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    createPropertyFact(key, value, undefined, NOW),
  ]));
  return {
    propertyId: 'property-1', contextVersion: 'test', generatedAt: NOW.toISOString(), scopes: [],
    facts: { ...facts, ...overrides }, warnings: [],
  };
}

test('Risk Assessment does not generate from missing size or year-built facts', () => {
  const decisions = evaluateProtectionContext(snapshot({ 'core.propertySizeSqFt': 1800 }));
  assert.equal(decisions.riskAssessment.status, 'UNKNOWN');
  assert.ok(decisions.riskAssessment.missingFactKeys.includes('core.yearBuilt'));
});

test('known risk baseline is applicable without assuming missing safety equipment', () => {
  const decisions = evaluateProtectionContext(snapshot({
    'core.propertySizeSqFt': 1800,
    'core.yearBuilt': 1998,
    'coverage.insurancePolicies': [],
    'inspection.openFindings': [],
    'recalls.unresolvedMatches': [],
    'guidance.activeSignals': [],
  }));
  assert.equal(decisions.riskAssessment.status, 'APPLICABLE');
  assert.equal(decisions.coverageEvidence.status, 'APPLICABLE');
});

test('a stale risk report is not presented as a current authoritative output', () => {
  const staleRiskFact = {
    ...createPropertyFact('risk.report', { riskScore: 40 }, undefined, NOW),
    state: 'STALE',
  };
  const decisions = evaluateProtectionContext(snapshot({}, { 'risk.report': staleRiskFact }));
  assert.equal(decisions.currentRiskOutput.status, 'UNKNOWN');
});

test('remaining protection tools return explicit applicability from shared context', () => {
  const decisions = evaluateProtectionContext(snapshot({
    'core.propertySizeSqFt': 1800,
    'core.yearBuilt': 1998,
    'location.state': 'NJ',
    'location.zipCode': '07030',
    'inventory.items': [{ id: 'item-1', category: 'APPLIANCE' }],
    'coverage.insurancePolicies': [{
      startDate: '2026-01-01T00:00:00.000Z',
      expiryDate: '2027-01-01T00:00:00.000Z',
    }],
    'events.activeRadarMatches': [],
    'events.recentHomeEvents': [],
  }));
  assert.equal(decisions.riskPremiumOptimizer.status, 'APPLICABLE');
  assert.equal(decisions.applianceOracle.status, 'APPLICABLE');
  assert.equal(decisions.climateRisk.status, 'APPLICABLE');
  assert.equal(decisions.eventRadar.status, 'APPLICABLE');
  assert.equal(decisions.riskReplay.status, 'APPLICABLE');
  assert.deepEqual(decisions.visualInspector.reasonCodes, ['VISUAL_OUTPUT_PROVISIONAL']);
});

test('expired policy and incomplete location do not masquerade as current protection context', () => {
  const decisions = evaluateProtectionContext(snapshot({
    'location.state': 'NJ',
    'coverage.insurancePolicies': [{
      startDate: '2025-01-01T00:00:00.000Z',
      expiryDate: '2026-01-01T00:00:00.000Z',
    }],
  }));
  assert.equal(decisions.riskPremiumOptimizer.status, 'NOT_APPLICABLE');
  assert.equal(decisions.climateRisk.status, 'UNKNOWN');
});

test('non-appliance inventory does not enable Appliance Oracle', () => {
  const decisions = evaluateProtectionContext(snapshot({
    'inventory.items': [{ id: 'item-1', category: 'FURNITURE' }],
  }));
  assert.equal(decisions.applianceOracle.status, 'NOT_APPLICABLE');
  assert.deepEqual(decisions.applianceOracle.reasonCodes, ['NO_INSTALLED_APPLIANCES']);
});

test('phase-three generation and aggregation paths reuse the context boundary', () => {
  const riskSource = fs.readFileSync(path.resolve(__dirname, '../../src/services/RiskAssessment.service.ts'), 'utf8');
  const homeScoreSource = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/homeScoreReport.controller.ts'), 'utf8');
  const statusSource = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/homeStatusBoard.controller.ts'), 'utf8');
  const guidanceSource = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/guidance.controller.ts'), 'utf8');
  const optimizerSource = fs.readFileSync(path.resolve(__dirname, '../../src/services/riskPremiumOptimizer.service.ts'), 'utf8');
  const climateSource = fs.readFileSync(path.resolve(__dirname, '../../src/services/climateRiskPredictor.service.ts'), 'utf8');
  const oracleSource = fs.readFileSync(path.resolve(__dirname, '../../src/services/applianceOracle.service.ts'), 'utf8');
  const visualSource = fs.readFileSync(path.resolve(__dirname, '../../src/services/visualInspector.service.ts'), 'utf8');
  const replaySource = fs.readFileSync(path.resolve(__dirname, '../../src/services/homeRiskReplay.service.ts'), 'utf8');
  assert.match(riskSource, /await this\.requireApplicableContext\(propertyId, actorUserId\)/);
  assert.match(riskSource, /evaluateProtectionContext/);
  assert.match(homeScoreSource, /getProtectionContextDecisions/);
  assert.match(statusSource, /getProtectionContextDecisions/);
  assert.match(guidanceSource, /getProtectionContextDecisions/);
  assert.match(optimizerSource, /getProtectionContextDecisions/);
  assert.match(climateSource, /getProtectionContextDecisions/);
  assert.match(oracleSource, /getProtectionContextDecisions/);
  assert.match(visualSource, /getProtectionContextDecisions/);
  assert.match(replaySource, /propertyContextVersion/);
});

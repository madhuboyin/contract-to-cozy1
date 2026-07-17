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

test('risk generation, workers, Home Score, Status Board, and Guidance reuse the context boundary', () => {
  const riskSource = fs.readFileSync(path.resolve(__dirname, '../../src/services/RiskAssessment.service.ts'), 'utf8');
  const homeScoreSource = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/homeScoreReport.controller.ts'), 'utf8');
  const statusSource = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/homeStatusBoard.controller.ts'), 'utf8');
  const guidanceSource = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/guidance.controller.ts'), 'utf8');
  assert.match(riskSource, /await this\.requireApplicableContext\(propertyId, actorUserId\)/);
  assert.match(riskSource, /evaluateProtectionContext/);
  assert.match(homeScoreSource, /getProtectionContextDecisions/);
  assert.match(statusSource, /getProtectionContextDecisions/);
  assert.match(guidanceSource, /getProtectionContextDecisions/);
});

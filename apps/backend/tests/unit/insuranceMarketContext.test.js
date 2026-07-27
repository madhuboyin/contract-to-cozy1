const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  evaluateInsuranceMarketContext,
} = require('../../src/services/insuranceMarketContext.service');

const NOW = new Date('2026-07-27T12:00:00.000Z');

function candidate(overrides = {}) {
  return {
    releaseId: 'release-current',
    releaseVersion: '2026-Q2',
    releaseStatus: 'APPROVED',
    observationStart: new Date('2026-04-01T00:00:00.000Z'),
    observationEnd: new Date('2026-06-30T23:59:59.000Z'),
    retrievedAt: new Date('2026-07-15T00:00:00.000Z'),
    expiresAt: new Date('2027-01-15T00:00:00.000Z'),
    coverageBasis: {
      label: 'Owner-occupied HO-3 detached homes',
      policyForms: ['HO-3'],
      dwellingTypes: ['SINGLE_FAMILY'],
      limitations: ['Period aggregate; individual underwriting factors are excluded.'],
    },
    methodologySummary: 'Observed written premium for the stated period and basis.',
    source: {
      sourceKey: 'reviewed-source',
      name: 'Reviewed market source',
      ownerName: 'Source owner',
      sourceUrl: 'https://example.com/methodology',
      rightsStatus: 'APPROVED',
      domainReviewStatus: 'APPROVED',
      isActive: true,
    },
    observation: {
      geographyType: 'STATE',
      geographyCode: 'TN',
      metricKey: 'ANNUAL_PREMIUM',
      value: 2400,
      currency: 'USD',
      sampleSize: 1200,
      observationNotes: null,
    },
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return evaluateInsuranceMarketContext({
    enabled: true,
    jurisdictionCode: 'TN',
    policyForm: 'HO-3',
    dwellingType: 'SINGLE_FAMILY',
    candidates: [candidate()],
    now: NOW,
    ...overrides,
  });
}

test('fails closed when market context is disabled', () => {
  const result = evaluate({ enabled: false });
  assert.equal(result.state, 'DISABLED');
  assert.equal(result.classification, 'OBSERVED_MARKET_CONTEXT_NOT_A_QUOTE');
  assert.equal('current' in result, false);
});

test('rejects sources without both rights and domain approval', () => {
  for (const sourceChange of [
    { rightsStatus: 'PENDING' },
    { domainReviewStatus: 'PENDING' },
    { isActive: false },
  ]) {
    const result = evaluate({
      candidates: [candidate({ source: { ...candidate().source, ...sourceChange } })],
    });
    assert.equal(result.state, 'SOURCE_UNAVAILABLE');
    assert.equal('current' in result, false);
  }
});

test('returns explicit unsupported geography and coverage-basis states', () => {
  assert.equal(evaluate({ jurisdictionCode: 'CA' }).state, 'UNSUPPORTED_GEOGRAPHY');
  assert.equal(evaluate({ policyForm: 'HO-5' }).state, 'UNSUPPORTED_COVERAGE_BASIS');
  assert.equal(evaluate({ dwellingType: 'CONDO' }).state, 'UNSUPPORTED_COVERAGE_BASIS');
});

test('withholds an expired matching release', () => {
  const result = evaluate({
    candidates: [candidate({ expiresAt: new Date('2026-07-01T00:00:00.000Z') })],
  });
  assert.equal(result.state, 'STALE');
  assert.equal('current' in result, false);
  assert.equal(result.source.name, 'Reviewed market source');
});

test('returns qualified current and prior observations with provenance', () => {
  const previous = candidate({
    releaseId: 'release-previous',
    releaseVersion: '2025-Q2',
    observationStart: new Date('2025-04-01T00:00:00.000Z'),
    observationEnd: new Date('2025-06-30T23:59:59.000Z'),
    expiresAt: new Date('2026-01-15T00:00:00.000Z'),
    observation: { ...candidate().observation, value: 2000, sampleSize: 1100 },
  });
  const result = evaluate({ candidates: [previous, candidate()] });

  assert.equal(result.state, 'READY');
  assert.equal(result.current.value, 2400);
  assert.equal(result.previous.value, 2000);
  assert.equal(result.change.absolute, 400);
  assert.equal(result.change.percent, 20);
  assert.equal(result.current.source.url, 'https://example.com/methodology');
  assert.equal(result.current.coverageBasis.limitations.length, 1);
  assert.match(result.message, /not a personal quote/i);
});

test('ingestion is gated and requires explicit rights and domain attestations', () => {
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/insuranceMarketContext.routes.ts'),
    'utf8',
  );
  assert.match(routes, /requireMfa/);
  assert.match(routes, /requireRole\(UserRole\.ADMIN\)/);
  assert.match(routes, /requireCapability\('INTEGRATION_MANAGE'\)/);
  assert.match(routes, /rightsApproved: z\.literal\(true\)/);
  assert.match(routes, /domainReviewApproved: z\.literal\(true\)/);
});

test('renewal UI identifies market data as context, never as a personal quote', () => {
  const panel = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../frontend/src/components/coverage/InsuranceMarketContextPanel.tsx',
    ),
    'utf8',
  );
  assert.match(panel, /Observed market context — not a quote/);
  assert.match(panel, /not a personal insurance quote or carrier offer/);
  assert.match(panel, /Method and limitations/);
  assert.doesNotMatch(panel, /you are overpaying|fair premium|best price/i);
});

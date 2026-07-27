const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  compareVerifiedPolicyTerms,
  OBSERVED_POLICY_CHANGE_KEYS,
} = require('../../src/services/policyTermComparison');
const {
  buildRenewalAction,
} = require('../../src/services/insurancePolicyHistory.service');

const NOW = new Date('2026-07-27T12:00:00.000Z');

function fact(id, factKey, value, overrides = {}) {
  const base = {
    id,
    factKey,
    valueType: typeof value === 'number' ? 'AMOUNT' : 'TEXT',
    amountValue: typeof value === 'number' ? value : null,
    textValue: typeof value === 'string' ? value : null,
    booleanValue: null,
    jsonValue: null,
    currency: typeof value === 'number' ? 'USD' : null,
    confirmationStatus: 'CONFIRMED',
    sourceDocumentId: `document-${id}`,
    sourcePage: 1,
    extractionMethod: 'DOCUMENT_AI',
    confirmedAt: new Date('2026-07-01T00:00:00.000Z'),
  };
  return { ...base, ...overrides };
}

function term(id, facts, overrides = {}) {
  return {
    id,
    insurancePolicyId: 'policy-1',
    termStart: new Date('2026-01-01T00:00:00.000Z'),
    termEnd: new Date('2027-01-01T00:00:00.000Z'),
    verificationStatus: 'VERIFIED',
    sourceDocumentId: `document-${id}`,
    facts,
    ...overrides,
  };
}

test('compares confirmed premium, deductible, limits, form, and endorsements', () => {
  const from = term('term-1', [
    fact('old-premium', 'ANNUAL_PREMIUM', 2000),
    fact('old-deductible', 'ALL_PERIL_DEDUCTIBLE', 2500),
    fact('old-dwelling', 'DWELLING_LIMIT', 450000),
    fact('old-liability', 'LIABILITY_LIMIT', 300000),
    fact('old-form', 'POLICY_FORM', 'HO-3'),
    fact('old-endorsements', 'ENDORSEMENTS', 'Water backup'),
  ]);
  const to = term('term-2', [
    fact('new-premium', 'ANNUAL_PREMIUM', 2300),
    fact('new-deductible', 'ALL_PERIL_DEDUCTIBLE', 5000),
    fact('new-dwelling', 'DWELLING_LIMIT', 500000),
    fact('new-liability', 'LIABILITY_LIMIT', 500000),
    fact('new-form', 'POLICY_FORM', 'HO-5'),
    fact('new-endorsements', 'ENDORSEMENTS', 'Water backup; equipment breakdown'),
  ]);

  const changes = compareVerifiedPolicyTerms(from, to);
  assert.deepEqual(
    changes.map((change) => change.changeKey),
    [
      'ANNUAL_PREMIUM',
      'ALL_PERIL_DEDUCTIBLE',
      'DWELLING_LIMIT',
      'LIABILITY_LIMIT',
      'POLICY_FORM',
      'ENDORSEMENTS',
    ],
  );
  for (const change of changes) {
    assert.equal(change.sourceEvidence.from.confirmationStatus, 'CONFIRMED');
    assert.equal(change.sourceEvidence.to.confirmationStatus, 'CONFIRMED');
    assert.ok(change.sourceEvidence.from.factId);
    assert.ok(change.sourceEvidence.to.factId);
  }
});

test('does not treat missing or unconfirmed values as observed changes', () => {
  const from = term('term-1', [
    fact('old-premium', 'ANNUAL_PREMIUM', 2000),
    fact('old-form', 'POLICY_FORM', 'HO-3'),
  ]);
  const to = term('term-2', [
    fact('new-premium', 'ANNUAL_PREMIUM', 2300, { confirmationStatus: 'PENDING' }),
  ]);

  assert.deepEqual(compareVerifiedPolicyTerms(from, to), []);
});

test('does not compare unverified terms or different policy identities', () => {
  const verified = term('term-1', [fact('premium-1', 'ANNUAL_PREMIUM', 2000)]);
  const unverified = term(
    'term-2',
    [fact('premium-2', 'ANNUAL_PREMIUM', 2300)],
    { verificationStatus: 'UNVERIFIED' },
  );
  const otherPolicy = term(
    'term-3',
    [fact('premium-3', 'ANNUAL_PREMIUM', 2300)],
    { insurancePolicyId: 'policy-2' },
  );
  assert.deepEqual(compareVerifiedPolicyTerms(verified, unverified), []);
  assert.deepEqual(compareVerifiedPolicyTerms(verified, otherPolicy), []);
});

test('renewal reminder timing is based on the observed term end date', () => {
  assert.equal(buildRenewalAction(null, NOW).status, 'DATE_UNKNOWN');
  assert.equal(buildRenewalAction(new Date('2026-07-20T00:00:00.000Z'), NOW).status, 'OVERDUE');
  assert.equal(buildRenewalAction(new Date('2026-08-20T00:00:00.000Z'), NOW).status, 'DUE');
  assert.equal(buildRenewalAction(new Date('2026-11-01T00:00:00.000Z'), NOW).status, 'UPCOMING');
  assert.equal(buildRenewalAction(new Date('2027-03-01T00:00:00.000Z'), NOW).status, 'LATER');
});

test('homeowner renewal UI contains no heuristic trend request or estimated series', () => {
  const client = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/InsuranceTrendClient.tsx',
    ),
    'utf8',
  );
  assert.match(client, /getInsurancePolicyHistory/);
  assert.match(client, /Observed confirmed annual premium/);
  assert.match(client, /ONE_CONFIRMED_TERM/);
  assert.doesNotMatch(client, /getInsuranceTrend|insuranceTrendApi|Modeled home estimate|Modeled state baseline/);

  const retiredController = fs.readFileSync(
    path.resolve(__dirname, '../../src/controllers/insuranceCostTrend.controller.ts'),
    'utf8',
  );
  assert.match(retiredController, /HEURISTIC_INSURANCE_TREND_RETIRED/);
  assert.match(retiredController, /res\.status\(410\)/);
  assert.doesNotMatch(retiredController, /service\.estimate|InsuranceCostTrendService/);
});

test('the comparison allowlist covers every Slice 4 material change class', () => {
  for (const key of [
    'ANNUAL_PREMIUM',
    'ALL_PERIL_DEDUCTIBLE',
    'DWELLING_LIMIT',
    'PERSONAL_PROPERTY_LIMIT',
    'LIABILITY_LIMIT',
    'POLICY_FORM',
    'VALUATION_BASIS',
    'ENDORSEMENTS',
  ]) {
    assert.ok(OBSERVED_POLICY_CHANGE_KEYS.includes(key));
  }
});

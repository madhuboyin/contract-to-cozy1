const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  evaluateCoverageEquivalence,
  MATERIAL_COVERAGE_FACT_KEYS,
} = require('../../src/services/coverageComparison.service');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function amount(factKey, amountValue, confirmationStatus = 'CONFIRMED') {
  return {
    factKey,
    valueType: 'AMOUNT',
    amountValue,
    currency: 'USD',
    confirmationStatus,
    sourceDocumentId: `document-${factKey}`,
    sourcePage: 1,
  };
}

function text(factKey, textValue, confirmationStatus = 'CONFIRMED') {
  return {
    factKey,
    valueType: 'TEXT',
    textValue,
    confirmationStatus,
    sourceDocumentId: `document-${factKey}`,
    sourcePage: 1,
  };
}

function json(factKey, jsonValue, confirmationStatus = 'CONFIRMED') {
  return {
    factKey,
    valueType: 'JSON',
    jsonValue,
    confirmationStatus,
    sourceDocumentId: `document-${factKey}`,
    sourcePage: 1,
  };
}

function completeFacts(overrides = {}) {
  const facts = {
    ALL_PERIL_DEDUCTIBLE: amount('ALL_PERIL_DEDUCTIBLE', 2500),
    DWELLING_LIMIT: amount('DWELLING_LIMIT', 500000),
    PERSONAL_PROPERTY_LIMIT: amount('PERSONAL_PROPERTY_LIMIT', 250000),
    LIABILITY_LIMIT: amount('LIABILITY_LIMIT', 500000),
    POLICY_FORM: text('POLICY_FORM', 'HO-3'),
    VALUATION_BASIS: text('VALUATION_BASIS', 'Replacement cost'),
    ENDORSEMENTS: json('ENDORSEMENTS', ['Water backup', 'Service line']),
    ...overrides,
  };
  return Object.values(facts);
}

test('equivalence requires every confirmed material fact and excludes premium', () => {
  const baseline = [
    ...completeFacts(),
    amount('ANNUAL_PREMIUM', 2200),
  ];
  const option = [
    ...completeFacts(),
    amount('ANNUAL_PREMIUM', 1700),
  ];

  const result = evaluateCoverageEquivalence(baseline, option);
  assert.equal(result.equivalenceStatus, 'EQUIVALENT');
  assert.equal(result.recommendationAllowed, true);
  assert.equal(result.method.premiumExcludedFromEquivalence, true);
  assert.deepEqual(result.materialUnknowns, []);
  assert.deepEqual(result.tradeoffs, []);
});

test('a known material difference is unmistakably non-equivalent', () => {
  const result = evaluateCoverageEquivalence(
    completeFacts(),
    completeFacts({
      ALL_PERIL_DEDUCTIBLE: amount('ALL_PERIL_DEDUCTIBLE', 5000),
      ENDORSEMENTS: json('ENDORSEMENTS', ['Service line']),
    }),
  );

  assert.equal(result.equivalenceStatus, 'NON_EQUIVALENT');
  assert.equal(result.recommendationAllowed, false);
  assert.deepEqual(
    result.tradeoffs.map((tradeoff) => tradeoff.factKey),
    ['ALL_PERIL_DEDUCTIBLE', 'ENDORSEMENTS'],
  );
});

test('missing or pending facts keep equivalence indeterminate', () => {
  const option = completeFacts({
    LIABILITY_LIMIT: amount('LIABILITY_LIMIT', 500000, 'PENDING'),
  }).filter((fact) => fact.factKey !== 'VALUATION_BASIS');
  const result = evaluateCoverageEquivalence(completeFacts(), option);

  assert.equal(result.equivalenceStatus, 'INDETERMINATE');
  assert.equal(result.recommendationAllowed, false);
  assert.deepEqual(
    result.materialUnknowns.map((unknown) => unknown.factKey),
    ['LIABILITY_LIMIT', 'VALUATION_BASIS'],
  );
});

test('the reviewed equivalence set covers material protection classes', () => {
  assert.deepEqual(MATERIAL_COVERAGE_FACT_KEYS, [
    'ALL_PERIL_DEDUCTIBLE',
    'DWELLING_LIMIT',
    'PERSONAL_PROPERTY_LIMIT',
    'LIABILITY_LIMIT',
    'POLICY_FORM',
    'VALUATION_BASIS',
    'ENDORSEMENTS',
  ]);
  assert.equal(MATERIAL_COVERAGE_FACT_KEYS.includes('ANNUAL_PREMIUM'), false);
});

test('comparison UI and service preserve decision, evidence, and advice boundaries', () => {
  const ui = read('apps/frontend/src/components/coverage/CoverageComparisonPanel.tsx');
  const service = read('apps/backend/src/services/coverageComparison.service.ts');
  const controller = read('apps/backend/src/controllers/coverageAnalysis.controller.ts');
  const definition = read(
    'apps/backend/src/productFramework/capabilities/definitions/saveOptimize.ts',
  );

  assert.match(ui, /Compare protection before price/);
  assert.match(ui, /Unknown material facts/);
  assert.match(ui, /Not coverage-equivalent/);
  assert.match(ui, /Saved to the Home Record and Home Timeline/);
  assert.doesNotMatch(ui, /best option|cheapest option|recommended carrier/i);

  assert.match(service, /COVERAGE_DECISION_RECORDED/);
  assert.match(service, /coverage_decision_recorded/);
  assert.match(service, /TRADEOFF_ACKNOWLEDGEMENT_REQUIRED/);
  assert.match(service, /sourceDocumentId/);

  assert.match(controller, /completionKind: 'DECISION_RECORDED'/);
  assert.match(controller, /outputEntityType: 'COVERAGE_DECISION'/);
  assert.match(definition, /id === 'coverage-intelligence' \? 'DECISION_RECORDED'/);
});

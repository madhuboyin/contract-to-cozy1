const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRefinanceProgramGuidance,
} = require('../../dist/refinanceRadar/refinanceProgramGuidance');

function build(overrides = {}) {
  return buildRefinanceProgramGuidance({
    loanType: 'FIXED_30',
    occupancyStatus: 'OWNER_OCCUPIED',
    firstLienLtvPct: 70,
    combinedLtvPct: 70,
    hasMortgageInsurance: false,
    hasSecondMortgage: false,
    secondMortgageBalanceUsd: null,
    conformingContext: 'WITHIN_CONFIGURED_LIMIT',
    ...overrides,
  });
}

test('offers FHA streamline guidance only for a confirmed FHA loan', () => {
  const pathways = build({ loanType: 'FHA_30', hasMortgageInsurance: true });
  assert.ok(pathways.some((item) => item.program === 'FHA_STREAMLINE'));
  assert.ok(pathways.some((item) => item.program === 'PMI_REVIEW'));
  assert.ok(pathways.every((item) => item.planningOnly));
  assert.equal(
    pathways.some((item) => item.program === 'VA_IRRRL'),
    false,
  );
});

test('offers VA IRRRL guidance only for a confirmed VA loan', () => {
  const pathways = build({ loanType: 'VA_30' });
  const va = pathways.find((item) => item.program === 'VA_IRRRL');
  assert.equal(va.relevance, 'CURRENT_LOAN_PATH');
  assert.match(va.cautions.join(' '), /funding fee/i);
});

test('adds ARM rate-risk and second-lien coordination pathways', () => {
  const pathways = build({
    loanType: 'ARM_5',
    hasSecondMortgage: true,
    secondMortgageBalanceUsd: 45_000,
    combinedLtvPct: 79,
  });
  assert.ok(pathways.some((item) => item.program === 'ARM_TO_FIXED'));
  assert.ok(pathways.some((item) => item.program === 'SECOND_LIEN_COORDINATION'));
});

test('uses configured conforming context without inventing a county limit', () => {
  const pathways = build({
    loanType: 'FIXED_30',
    conformingContext: 'ABOVE_CONFIGURED_LIMIT',
  });
  const jumbo = pathways.find((item) => item.program === 'JUMBO_REFINANCE');
  assert.equal(jumbo.relevance, 'CONDITIONAL');
  assert.match(jumbo.requirementsToConfirm.join(' '), /county/i);
});

test('adds occupancy caution when owner occupancy is not confirmed', () => {
  const pathways = build({ occupancyStatus: 'TENANT_OCCUPIED' });
  assert.ok(pathways.every((item) =>
    item.cautions.some((caution) => /occupancy/i.test(caution)),
  ));
});

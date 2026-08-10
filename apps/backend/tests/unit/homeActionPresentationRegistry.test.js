const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  evaluateHomeActionPresentationEligibility,
  requiredHomeActionLaunchParams,
} = require('../../src/productFramework/homeActionPresentationRegistry.ts');

function action(overrides = {}) {
  return {
    presentation: {
      variant: 'FINANCIAL_EXPOSURE',
      subject: { kind: 'GUIDANCE_JOURNEY', id: 'journey-1', label: 'Furnace replacement' },
      headline: 'Potential $8,400 exposure for furnace replacement',
      summary: 'The replacement window is open.',
      whyNow: 'The replacement window is open and coverage is not confirmed.',
      keyFacts: [
        { label: 'Subject', value: 'Furnace replacement' },
        { label: 'Exposure', value: '$8,400' },
        { label: 'Coverage', value: 'Not yet confirmed' },
        { label: 'Confidence', value: 'medium' },
      ],
      factGroups: [],
      detailLabel: 'See evidence',
      group: null,
    },
    evidence: [{ observedAt: '2026-08-09T12:00:00.000Z', freshness: 'CURRENT' }],
    timing: { windowStart: null, windowEnd: null },
    expectedOutcome: 'Clarify the financial decision.',
    primaryCta: { kind: 'REVIEW', label: 'Review furnace exposure', href: '/guidance' },
    secondaryCtas: [],
    governance: { safetyTier: 'MATERIAL_FINANCIAL' },
    ...overrides,
  };
}

test('financial presentations require category facts and observed evidence', () => {
  assert.equal(evaluateHomeActionPresentationEligibility(action()).eligible, true);

  const missingCoverage = action({
    presentation: {
      ...action().presentation,
      keyFacts: action().presentation.keyFacts.filter((fact) => fact.label !== 'Coverage'),
    },
  });
  assert.deepEqual(
    evaluateHomeActionPresentationEligibility(missingCoverage).reasons,
    ['MISSING_FACT:Coverage'],
  );

  assert.deepEqual(
    evaluateHomeActionPresentationEligibility(action({ evidence: [{ observedAt: null, freshness: 'UNKNOWN' }] })).reasons,
    ['MISSING_OBSERVATION_DATE'],
  );
});

test('sale presentations suppress terminal cases', () => {
  const sale = action({
    presentation: {
      ...action().presentation,
      variant: 'SALE_PREPARATION',
      subject: { kind: 'SALE_READINESS_ITEM', id: 'item-1', label: 'Repair cabinet' },
      keyFacts: [
        { label: 'Sale stage', value: 'closed' },
        { label: 'Item', value: 'Repair cabinet' },
        { label: 'Source', value: 'Your Sale Readiness answers' },
        { label: 'Category', value: 'presentation' },
      ],
    },
  });
  assert.deepEqual(evaluateHomeActionPresentationEligibility(sale).reasons, ['INACTIVE_SALE_CASE']);
});

test('Home fact presentations require a correction destination', () => {
  const factReview = action({
    presentation: {
      ...action().presentation,
      variant: 'HOME_FACT_REVIEW',
      subject: { kind: 'PROPERTY', id: 'property-1', label: 'Roof age' },
      keyFacts: [{ label: 'Roof · install year', value: 'Needs confirmation · inferred' }],
      whyNow: 'This inferred fact affects the roof replacement forecast.',
    },
    primaryCta: { kind: 'REVIEW', label: 'Review roof fact', href: '/property' },
    secondaryCtas: [],
  });
  assert.deepEqual(
    evaluateHomeActionPresentationEligibility(factReview).reasons,
    ['MISSING_CORRECTION_DESTINATION'],
  );
});

test('accepted work requires a real work item and non-terminal state', () => {
  const accepted = action({
    presentation: {
      ...action().presentation,
      variant: 'ACCEPTED_WORK',
      subject: { kind: 'WORK_ITEM', id: 'work-1', label: 'Service the furnace' },
      keyFacts: [
        { label: 'Task', value: 'Service the furnace' },
        { label: 'Work state', value: 'in progress' },
        { label: 'Execution', value: 'maintenance · plan-1' },
      ],
    },
  });
  assert.equal(evaluateHomeActionPresentationEligibility(accepted).eligible, true);

  const terminal = {
    ...accepted,
    presentation: {
      ...accepted.presentation,
      keyFacts: accepted.presentation.keyFacts.map((fact) =>
        fact.label === 'Work state' ? { ...fact, value: 'verified' } : fact),
    },
  };
  assert.deepEqual(evaluateHomeActionPresentationEligibility(terminal).reasons, ['TERMINAL_WORK']);
});

test('registry declares category-specific destination continuity requirements', () => {
  assert.ok(requiredHomeActionLaunchParams('ASSET_LIFECYCLE').includes('itemId'));
  assert.ok(requiredHomeActionLaunchParams('FINANCIAL_EXPOSURE').includes('journeyId'));
  assert.ok(requiredHomeActionLaunchParams('SALE_PREPARATION').includes('focusItemId'));
  assert.ok(requiredHomeActionLaunchParams('COVERAGE_REVIEW').includes('returnTo'));
});

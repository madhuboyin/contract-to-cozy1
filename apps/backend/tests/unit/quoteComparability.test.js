const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  evaluateQuoteComparability,
  evaluateQuoteReadiness,
} = require('../../src/services/quoteComparability.service.ts');

function completeProposal(overrides = {}) {
  return {
    id: 'quote-1',
    vendorName: 'Example HVAC',
    quoteAmount: 8200,
    serviceCategory: 'HVAC',
    scopeKind: 'REPLACEMENT',
    serviceLocation: 'attic',
    quoteDate: '2026-07-28T12:00:00.000Z',
    scopeSummary: 'Replace the attic air handler.',
    lineItems: [
      { description: 'Air handler replacement', kind: 'EQUIPMENT', quantity: 1, unit: 'each', total: 7000 },
      { description: 'Installation labor', kind: 'LABOR', quantity: 8, unit: 'hour', total: 1200 },
    ],
    terms: [
      { type: 'INCLUSION', value: 'Equipment and installation' },
      { type: 'EXCLUSION', value: 'Electrical panel upgrades' },
      { type: 'WARRANTY', value: '10-year parts, 1-year labor' },
      { type: 'PAYMENT', value: '20% deposit; balance on completion' },
    ],
    homeownerConfirmedAt: '2026-07-28T13:00:00.000Z',
    ...overrides,
  };
}

test('keeps a vendor-and-total estimate incomplete when scope facts are absent', () => {
  const result = evaluateQuoteReadiness({
    vendorName: 'Example Plumbing',
    quoteAmount: 900,
    serviceCategory: 'PLUMBING',
  });

  assert.equal(result.stage, 'INCOMPLETE_QUOTE');
  assert.ok(result.missingFacts.some((fact) => fact.key === 'scopeKind'));
  assert.ok(result.missingFacts.some((fact) => fact.key === 'scope'));
  assert.equal(result.comparabilityKey, null);
});

test('requires homeowner confirmation before a complete extraction is comparison ready', () => {
  const result = evaluateQuoteReadiness(completeProposal({ homeownerConfirmedAt: null }));

  assert.equal(result.stage, 'REVIEW_READY');
  assert.ok(result.missingFacts.some((fact) => fact.key === 'homeownerConfirmation'));
});

test('marks a complete, confirmed proposal comparison ready', () => {
  const result = evaluateQuoteReadiness(completeProposal());

  assert.equal(result.stage, 'COMPARISON_READY');
  assert.equal(result.missingFacts.length, 0);
  assert.match(result.comparabilityKey, /^HVAC\|REPLACEMENT\|attic\|/);
});

test('does not compare proposals with different scope signatures', () => {
  const result = evaluateQuoteComparability([
    completeProposal(),
    completeProposal({
      id: 'quote-2',
      lineItems: [
        { description: 'Condenser replacement', kind: 'EQUIPMENT', quantity: 1, unit: 'each', total: 7000 },
        { description: 'Installation labor', kind: 'LABOR', quantity: 8, unit: 'hour', total: 1200 },
      ],
    }),
  ]);

  assert.equal(result.status, 'NOT_COMPARABLE');
  assert.equal(result.eligibleQuoteIds.length, 2);
});

test('allows scope-equivalent confirmed proposals without recommending a winner', () => {
  const result = evaluateQuoteComparability([
    completeProposal(),
    completeProposal({ id: 'quote-2', vendorName: 'Second HVAC', quoteAmount: 7800 }),
  ]);

  assert.deepEqual(result, {
    status: 'COMPARABLE',
    eligibleQuoteIds: ['quote-1', 'quote-2'],
    reasons: ['The confirmed proposals share the same category, work type, location, and itemized scope.'],
  });
  assert.equal(Object.hasOwn(result, 'recommendedQuoteId'), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The Quote Comparison confirmation contract (design §3.4, FRD v1.360). No database.
const review = require('../../src/services/quoteReview.ts');

const quote = (over = {}) => ({
  vendorName: 'Acme HVAC', quoteAmount: '8200.00', currency: 'USD', quoteDate: new Date('2026-09-01'), expirationDate: null, serviceCategory: 'HVAC', serviceLocation: null,
  scopeKind: 'REPLACEMENT', scopeSummary: 'Replace furnace', providerLicenseNumber: null, providerLicenseVerified: null, providerInsuranceVerified: null,
  lineItems: [
    { id: 'li-b', kind: 'LABOR', description: 'Installation', quantity: null, unit: null, unitPrice: null, total: '2200', confirmationStatus: 'EXTRACTED_UNCONFIRMED' },
    { id: 'li-a', kind: 'EQUIPMENT', description: 'Furnace', quantity: '1', unit: 'ea', unitPrice: '6000', total: '6000', confirmationStatus: 'HOMEOWNER_CORRECTED' },
  ],
  terms: [{ id: 't-1', type: 'WARRANTY', label: null, value: '10 years', included: true, confirmationStatus: 'HOMEOWNER_CONFIRMED' }],
  factConfirmations: [{ fieldKey: 'vendorName', status: 'EXTRACTED_UNCONFIRMED', extractedValueJson: 'Acme HVAC', confirmedValueJson: null }],
  ...over,
});
const requestFor = (r, over = {}) => ({
  reviewFingerprint: r.fingerprint, lineItemIds: r.lineItems.map((i) => i.id), termIds: r.terms.map((t) => t.id), factKeys: r.facts.map((f) => f.fieldKey),
  rejectedLineItemIds: [], rejectedTermIds: [], ...over,
});

test('the review lists every value with its state, in a stable order, and counts the states', () => {
  const r = review.buildQuoteReview(quote());
  assert.deepEqual(r.lineItems.map((i) => i.id), ['li-a', 'li-b']);
  assert.deepEqual(r.lineItems.map((i) => i.state), ['HOMEOWNER_CORRECTED', 'EXTRACTED_UNCONFIRMED']);
  assert.equal(r.terms[0].state, 'HOMEOWNER_CONFIRMED');
  assert.deepEqual(r.counts, { facts: 1, lineItems: 2, terms: 1, unconfirmed: 2, corrected: 1, confirmed: 1 });
  assert.equal(r.headline.find((h) => h.key === 'quoteAmount').value, 8200);
  assert.equal(review.buildQuoteReview(quote()).fingerprint, r.fingerprint, 'same values, same fingerprint');
});

test('any change to a shown value changes the fingerprint, so a stale request is refused', () => {
  const base = review.buildQuoteReview(quote());
  const priceChanged = review.buildQuoteReview(quote({ lineItems: quote().lineItems.map((i) => (i.id === 'li-b' ? { ...i, total: '9999' } : i)) }));
  const termAdded = review.buildQuoteReview(quote({ terms: [...quote().terms, { id: 't-2', type: 'PAYMENT', label: null, value: '50% deposit', included: null, confirmationStatus: 'EXTRACTED_UNCONFIRMED' }] }));
  const headlineChanged = review.buildQuoteReview(quote({ vendorName: 'Other Co' }));
  for (const changed of [priceChanged, termAdded, headlineChanged]) {
    assert.notEqual(changed.fingerprint, base.fingerprint);
    assert.match(review.reviewRequestProblem(changed, requestFor(base)), /./);
  }
  assert.equal(review.reviewRequestProblem(base, requestFor(base)), null);
});

test('a request must name exactly the shown set: nothing missing, nothing extra, nothing duplicated, no unseen removal', () => {
  const r = review.buildQuoteReview(quote());
  assert.match(review.reviewRequestProblem(r, requestFor(r, { lineItemIds: ['li-a'] })), /line items/);
  assert.match(review.reviewRequestProblem(r, requestFor(r, { lineItemIds: ['li-a', 'li-b', 'li-z'] })), /line items/);
  assert.match(review.reviewRequestProblem(r, requestFor(r, { lineItemIds: ['li-a', 'li-a'] })), /line items/);
  assert.match(review.reviewRequestProblem(r, requestFor(r, { termIds: [] })), /terms/);
  assert.match(review.reviewRequestProblem(r, requestFor(r, { factKeys: [] })), /facts/);
  assert.match(review.reviewRequestProblem(r, requestFor(r, { rejectedLineItemIds: ['nope'] })), /removed line item/);
  assert.equal(review.reviewRequestProblem(r, requestFor(r, { rejectedLineItemIds: ['li-b'] })), null);
  assert.equal(review.confirmQuoteReviewSchema.safeParse({}).success, false, 'a bare confirm is not a request');
  assert.equal(review.confirmQuoteReviewSchema.safeParse({ ...requestFor(r), extra: 1 }).success, false);
});

test('an edit marks new or changed values as the person\'s corrections and leaves unchanged ones alone', () => {
  const previous = quote().lineItems;
  const marked = review.markLineItemCorrections(previous, [
    { kind: 'EQUIPMENT', description: 'Furnace', quantity: 1, unit: 'ea', unitPrice: 6000, total: 6000 },
    { kind: 'LABOR', description: 'Installation', quantity: null, unit: null, unitPrice: null, total: 2500 },
    { kind: 'OTHER', description: 'Haul away', total: 150 },
  ]);
  assert.deepEqual(marked.map((i) => i.confirmationStatus), ['HOMEOWNER_CORRECTED', 'HOMEOWNER_CORRECTED', 'HOMEOWNER_CORRECTED']);
  const same = review.markLineItemCorrections(previous, [{ kind: 'LABOR', description: 'installation', quantity: null, unit: null, unitPrice: null, total: 2200 }]);
  assert.equal(same[0].confirmationStatus, 'EXTRACTED_UNCONFIRMED', 'unchanged keeps its state');
  const terms = review.markTermCorrections(quote().terms, [{ type: 'WARRANTY', label: null, value: '10 years', included: true }, { type: 'WARRANTY', label: null, value: '20 years', included: true }]);
  assert.deepEqual(terms.map((t) => t.confirmationStatus), ['HOMEOWNER_CONFIRMED', 'HOMEOWNER_CORRECTED']);
});

test('after an edit a changed headline fact is stored as the correction, an unchanged one waits for affirmation', () => {
  const states = review.factStatesAfterEdit(
    [{ fieldKey: 'vendorName', extractedValueJson: 'Acme HVAC' }, { fieldKey: 'quoteAmount', extractedValueJson: 8000 }, { fieldKey: 'quoteDate', extractedValueJson: '2026-09-01' }],
    { vendorName: 'Acme HVAC', quoteAmount: 8200, quoteDate: '2026-09-01T00:00:00.000Z' },
  );
  assert.deepEqual(states.map((s) => [s.fieldKey, s.status]), [['vendorName', 'EXTRACTED_UNCONFIRMED'], ['quoteAmount', 'HOMEOWNER_CORRECTED'], ['quoteDate', 'EXTRACTED_UNCONFIRMED']]);
  assert.equal(states[1].confirmedValueJson, 8200);
});

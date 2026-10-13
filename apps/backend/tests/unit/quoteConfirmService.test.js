const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// confirmQuoteProposal against the confirmation contract (FRD v1.360): what is checked, what is removed, what is confirmed. No database.
const { prisma } = require('../../src/lib/prisma.ts');
const service = require('../../src/services/quoteComparison.service.ts');
const { buildQuoteReview } = require('../../src/services/quoteReview.ts');

const baseQuote = () => ({
  id: 'q-1', workspaceId: 'ws-1', vendorName: 'Acme HVAC', quoteAmount: '8200', currency: 'USD', quoteDate: new Date('2026-09-01'), expirationDate: null, serviceCategory: 'HVAC',
  serviceLocation: null, scopeKind: 'REPLACEMENT', scopeSummary: 'Replace furnace', providerLicenseNumber: null, providerLicenseVerified: null, providerInsuranceVerified: null,
  homeownerConfirmedAt: null,
  lineItems: [
    { id: 'li-1', kind: 'EQUIPMENT', description: 'Furnace', quantity: '1', unit: 'ea', unitPrice: '6000', total: '6000', confirmationStatus: 'EXTRACTED_UNCONFIRMED', sortOrder: 0 },
    { id: 'li-2', kind: 'OTHER', description: 'Mystery fee', quantity: null, unit: null, unitPrice: null, total: '500', confirmationStatus: 'EXTRACTED_UNCONFIRMED', sortOrder: 1 },
  ],
  terms: [{ id: 't-1', type: 'WARRANTY', label: null, value: '10 years', included: true, confirmationStatus: 'EXTRACTED_UNCONFIRMED' }],
  factConfirmations: [{ fieldKey: 'vendorName', status: 'EXTRACTED_UNCONFIRMED', extractedValueJson: 'Acme HVAC', confirmedValueJson: null }],
  extractions: [],
});

function install(quote) {
  const saved = { ws: prisma.quoteComparisonWorkspace, q: prisma.quoteComparisonQuote, tx: prisma.$transaction };
  const writes = [];
  const state = JSON.parse(JSON.stringify(quote));
  const tx = {
    quoteComparisonQuote: {
      findFirst: async () => JSON.parse(JSON.stringify(state)),
      update: async (args) => { writes.push(['quote.update', args.data]); return { ...state, ...args.data }; },
    },
    quoteComparisonLineItem: {
      deleteMany: async (args) => { writes.push(['lineItem.delete', args.where.id.in]); state.lineItems = state.lineItems.filter((i) => !args.where.id.in.includes(i.id)); },
      updateMany: async (args) => { writes.push(['lineItem.confirm', state.lineItems.filter((i) => i.confirmationStatus === args.where.confirmationStatus).map((i) => i.id)]); },
    },
    quoteComparisonTerm: {
      deleteMany: async (args) => { writes.push(['term.delete', args.where.id.in]); state.terms = state.terms.filter((i) => !args.where.id.in.includes(i.id)); },
      updateMany: async () => { writes.push(['term.confirm']); },
    },
    quoteComparisonFactConfirmation: { updateMany: async (args) => { writes.push(['fact.update', args.where.status, args.data.status ?? null]); } },
    quoteComparisonExtraction: { updateMany: async () => { writes.push(['extraction.confirm']); } },
    // the journey advance runs on the same fake
    quoteComparisonWorkspace: {
      findFirst: async () => ({ id: 'ws-1', journeyStage: 'SCOPE_REVIEW', outcome: 'OPEN', inventoryItemId: null, guidanceJourneyId: null }),
      update: async () => ({}), findUnique: async () => ({ id: 'ws-1', outcome: 'OPEN', journeyStage: 'SCOPE_REVIEW', transitions: [], contextLinks: [] }),
    },
    serviceQuoteDecisionTransition: { create: async () => ({}) },
    serviceQuoteDecisionContextLink: { upsert: async () => ({}) },
    homeEvent: { findFirst: async () => null, create: async () => ({}) },
  };
  prisma.quoteComparisonWorkspace = { findFirst: async () => ({ id: 'ws-1', propertyId: 'prop-1', outcome: 'OPEN', journeyStage: 'SCOPE_REVIEW' }) };
  prisma.quoteComparisonQuote = { findMany: async () => [] };
  prisma.$transaction = async (fn) => fn(tx);
  return { writes, restore() { prisma.quoteComparisonWorkspace = saved.ws; prisma.quoteComparisonQuote = saved.q; prisma.$transaction = saved.tx; } };
}
const requestOf = (quote, over = {}) => {
  const review = buildQuoteReview(quote);
  return { reviewFingerprint: review.fingerprint, lineItemIds: review.lineItems.map((i) => i.id), termIds: review.terms.map((t) => t.id), factKeys: review.facts.map((f) => f.fieldKey), rejectedLineItemIds: [], rejectedTermIds: [], ...over };
};
const confirm = (request) => service.confirmQuoteProposal('prop-1', 'ws-1', 'q-1', 'u1', request);

test('a request for exactly the shown set confirms it, and only that', async () => {
  const quote = baseQuote();
  const w = install(quote);
  try {
    const out = await confirm(requestOf(quote));
    assert.ok(w.writes.some(([kind]) => kind === 'lineItem.confirm'));
    assert.ok(w.writes.some(([kind]) => kind === 'extraction.confirm'));
    assert.equal(w.writes.find(([kind]) => kind === 'quote.update')[1].homeownerConfirmedByUserId, 'u1');
    assert.ok(out);
  } finally { w.restore(); }
});

test('a proposal that changed after it was shown, or a request that omits or adds a value, confirms nothing', async () => {
  const quote = baseQuote();
  const stale = requestOf(quote);
  const changed = baseQuote();
  changed.lineItems[0].total = '9000';
  let w = install(changed);
  try {
    await assert.rejects(() => confirm(stale), (e) => e.code === 'QUOTE_REVIEW_STALE' && e.statusCode === 409);
    assert.equal(w.writes.length, 0);
  } finally { w.restore(); }
  const withExtra = baseQuote();
  withExtra.terms.push({ id: 't-2', type: 'PAYMENT', label: null, value: '50% up front', included: null, confirmationStatus: 'EXTRACTED_UNCONFIRMED' });
  w = install(withExtra);
  try {
    await assert.rejects(() => confirm(requestOf(quote)), (e) => e.code === 'QUOTE_REVIEW_STALE');
    await assert.rejects(() => confirm(requestOf(withExtra, { termIds: ['t-1'] })), (e) => e.code === 'QUOTE_REVIEW_STALE');
    assert.equal(w.writes.length, 0);
  } finally { w.restore(); }
});

test('a value the person removed is deleted, not confirmed, and readiness is computed without it', async () => {
  const quote = baseQuote();
  const w = install(quote);
  try {
    await confirm(requestOf(quote, { rejectedLineItemIds: ['li-2'] }));
    const order = w.writes.map(([kind]) => kind);
    assert.ok(order.indexOf('lineItem.delete') < order.indexOf('lineItem.confirm'), 'removal happens before confirmation');
    assert.deepEqual(w.writes.find(([kind]) => kind === 'lineItem.delete')[1], ['li-2']);
    assert.deepEqual(w.writes.find(([kind]) => kind === 'lineItem.confirm')[1], ['li-1'], 'only the remaining value is confirmed');
  } finally { w.restore(); }
});

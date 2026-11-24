// BICC-4.3 / BUY-007 / FRD D03: promoting a candidate to an under-contract home. Explicit, reviewed, deduplicated, field-level provenance, candidate kept and linked.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const propertyService = require('../../src/services/property.service.ts');
const entryContext = require('../../src/services/entryContext.service.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const { buildPromotionProposal, proposalToken, candidatePromotionService } = require('../../src/services/ask/buyer/candidatePromotion.service.ts');

const FULL = { id: 'c1', userId: 'u1', status: 'ACTIVE', label: 'Maple St', addressLine: '12 Maple St', city: 'Austin', state: 'TX', postalCode: '78701', bedrooms: 3, bathrooms: 2, livingAreaSqFt: 1800, yearBuilt: 1995, listPriceCents: 40000000,
  provenance: { bedrooms: { source: 'LISTING', asOf: '2026-11-01' }, yearBuilt: { source: 'USER_ENTERED', asOf: '2026-11-02' } } };

function harness(rows, { existing = [] } = {}) {
  const calls = { created: [], entry: [], updates: [] };
  const orig = { cp: propertyService.createProperty, ce: entryContext.captureEntryContext, fa: prisma.candidateProperty.findFirst, um: prisma.candidateProperty.updateMany, hp: prisma.homeownerProfile.findFirst, pf: prisma.property.findMany };
  propertyService.createProperty = async (userId, data) => { calls.created.push({ userId, data }); return { id: 'p-new' }; };
  entryContext.captureEntryContext = async (propertyId, userId, input) => { calls.entry.push({ propertyId, userId, input }); return {}; };
  prisma.candidateProperty.findFirst = async ({ where }) => rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null;
  prisma.candidateProperty.updateMany = async ({ where, data }) => { calls.updates.push({ where, data }); const row = rows.find((r) => r.id === where.id && r.userId === where.userId && r.status === where.status); if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 }; };
  prisma.homeownerProfile.findFirst = async () => ({ id: 'hp1' });
  prisma.property.findMany = async () => existing;
  return { calls, restore: () => { propertyService.createProperty = orig.cp; entryContext.captureEntryContext = orig.ce; prisma.candidateProperty.findFirst = orig.fa; prisma.candidateProperty.updateMany = orig.um; prisma.homeownerProfile.findFirst = orig.hp; prisma.property.findMany = orig.pf; } };
}
const reject = async (promise, code) => { await assert.rejects(promise, (e) => e.code === code, `expected ${code}`); };

test('the proposal carries each fact with its own source and date, and says what is deliberately not carried over', () => {
  const p = buildPromotionProposal(FULL);
  assert.deepEqual(p.property, { name: 'Maple St', address: '12 Maple St', city: 'Austin', state: 'TX', zipCode: '78701', bedrooms: 3, bathrooms: 2, propertySize: 1800, yearBuilt: 1995 });
  assert.deepEqual(p.fields.find((f) => f.field === 'bedrooms'), { field: 'bedrooms', value: 3, source: 'LISTING', asOf: '2026-11-01' });
  assert.deepEqual(p.fields.find((f) => f.field === 'bathrooms'), { field: 'bathrooms', value: 2, source: null, asOf: null }, 'no provenance recorded means none is claimed');
  assert.ok(p.notCarriedOver.some((t) => /List price/.test(t)));
  assert.ok(!JSON.stringify(p.property).includes('40000000'), 'the list price never becomes a property fact');
});

test('a candidate without a full street address cannot be promoted, and the gaps are named', () => {
  const p = buildPromotionProposal({ ...FULL, addressLine: null, postalCode: ' ' });
  assert.equal(p.property, null);
  assert.deepEqual(p.missingRequired, ['street address', 'ZIP code']);
});

test('the token changes when any reviewed fact changes', () => {
  assert.notEqual(proposalToken(buildPromotionProposal(FULL)), proposalToken(buildPromotionProposal({ ...FULL, bedrooms: 4 })));
  assert.equal(proposalToken(buildPromotionProposal(FULL)), proposalToken(buildPromotionProposal({ ...FULL, listPriceCents: 1 })), 'a field that is not carried over does not invalidate the review');
});

test('review writes nothing and reports an existing home at the same address', async () => {
  const h = harness([{ ...FULL }], { existing: [{ id: 'p9', name: 'Mine', address: '12 maple st', unit: null, zipCode: '78701-1234' }] });
  try {
    const r = await candidatePromotionService.review('u1', 'c1');
    assert.equal(r.canPromote, true);
    assert.deepEqual(r.existingHome, { propertyId: 'p9', name: 'Mine', address: '12 maple st' });
    assert.equal(h.calls.created.length + h.calls.entry.length + h.calls.updates.length, 0);
  } finally { h.restore(); }
});

test('confirming creates the home through the property workflow, starts the under-contract journey, and keeps the candidate linked', async () => {
  const rows = [{ ...FULL }]; const h = harness(rows);
  try {
    const { token } = await candidatePromotionService.review('u1', 'c1');
    const out = await candidatePromotionService.confirm('u1', 'c1', { token, targetCloseDate: '2027-01-15T00:00:00.000Z' }, new Date('2026-11-23T00:00:00Z'));
    assert.deepEqual(out, { propertyId: 'p-new', created: true, linkedExisting: false, candidateId: 'c1' });
    assert.equal(h.calls.created[0].data.address, '12 Maple St');
    assert.equal(h.calls.created[0].data.isPrimary, false, 'a promoted home never silently becomes the primary home');
    const ctx = h.calls.entry[0].input;
    assert.deepEqual([ctx.entryPath, ctx.ownershipState, ctx.buyer.purchaseStage, ctx.buyer.targetCloseDate], ['EXISTING_HOME_PURCHASE', 'UNDER_CONTRACT', 'UNDER_CONTRACT', '2027-01-15T00:00:00.000Z']);
    assert.equal(ctx.sourceMetadata.promotedFromCandidateId, 'c1');
    assert.equal(ctx.sourceMetadata.fieldProvenance.bedrooms.source, 'LISTING');
    assert.deepEqual([rows[0].status, rows[0].promotedPropertyId], ['PROMOTED', 'p-new']);
  } finally { h.restore(); }
});

test('a confirmation without the review token, or with a stale one, creates nothing', async () => {
  const rows = [{ ...FULL }]; const h = harness(rows);
  try {
    await reject(candidatePromotionService.confirm('u1', 'c1', { token: '' }), 'CANDIDATE_PROMOTION_STALE');
    const { token } = await candidatePromotionService.review('u1', 'c1');
    rows[0].bedrooms = 5;
    await reject(candidatePromotionService.confirm('u1', 'c1', { token }), 'CANDIDATE_PROMOTION_STALE');
    assert.equal(h.calls.created.length, 0);
    assert.equal(rows[0].status, 'ACTIVE');
  } finally { h.restore(); }
});

test('a same-address home is never duplicated: confirming is refused unless the buyer chooses to link, and linking creates no property and no journey', async () => {
  const rows = [{ ...FULL }]; const h = harness(rows, { existing: [{ id: 'p9', name: 'Mine', address: '12 Maple St', unit: null, zipCode: '78701' }] });
  try {
    const { token } = await candidatePromotionService.review('u1', 'c1');
    await reject(candidatePromotionService.confirm('u1', 'c1', { token }), 'CANDIDATE_DUPLICATE_PROPERTY');
    assert.equal(h.calls.created.length, 0);
    const out = await candidatePromotionService.confirm('u1', 'c1', { token, linkToExistingHome: true });
    assert.deepEqual(out, { propertyId: 'p9', created: false, linkedExisting: true, candidateId: 'c1' });
    assert.equal(h.calls.created.length + h.calls.entry.length, 0, 'an existing home keeps its own journey and facts untouched');
    assert.equal(rows[0].promotedPropertyId, 'p9');
  } finally { h.restore(); }
});

test("someone else's candidate is indistinguishable from a missing one, and an already-promoted or archived one is refused", async () => {
  const rows = [{ ...FULL }, { ...FULL, id: 'c2', status: 'PROMOTED' }, { ...FULL, id: 'c3', status: 'ARCHIVED' }]; const h = harness(rows);
  try {
    await reject(candidatePromotionService.review('other', 'c1'), 'CANDIDATE_NOT_FOUND');
    await reject(candidatePromotionService.confirm('other', 'c1', { token: 'x' }), 'CANDIDATE_NOT_FOUND');
    await reject(candidatePromotionService.review('u1', 'nope'), 'CANDIDATE_NOT_FOUND');
    await reject(candidatePromotionService.review('u1', 'c2'), 'CANDIDATE_ALREADY_PROMOTED');
    await reject(candidatePromotionService.review('u1', 'c3'), 'CANDIDATE_NOT_ACTIVE');
    assert.equal(h.calls.created.length, 0);
  } finally { h.restore(); }
});

test('an incomplete candidate is refused at confirmation with the missing items named', async () => {
  const h = harness([{ ...FULL, city: null }]);
  try { await assert.rejects(candidatePromotionService.confirm('u1', 'c1', { token: 'x' }), (e) => e.code === 'CANDIDATE_PROMOTION_INCOMPLETE' && /city/.test(e.message)); } finally { h.restore(); }
});

test('the claim is atomic: when the candidate was claimed meanwhile, the second confirmation is refused', async () => {
  const rows = [{ ...FULL }]; const h = harness(rows);
  try {
    const { token } = await candidatePromotionService.review('u1', 'c1');
    const orig = prisma.candidateProperty.updateMany;
    prisma.candidateProperty.updateMany = async () => ({ count: 0 });
    await reject(candidatePromotionService.confirm('u1', 'c1', { token }), 'CANDIDATE_ALREADY_PROMOTED');
    prisma.candidateProperty.updateMany = orig;
  } finally { h.restore(); }
});

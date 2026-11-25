// BICC-4.3 / BUY-007 / FRD D03: promoting a candidate to an under-contract home. Explicit, reviewed, deduplicated, field-level provenance, candidate kept and linked.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const propertyService = require('../../src/services/property.service.ts');
const entryContext = require('../../src/services/entryContext.service.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const { buildPromotionProposal, proposalToken, candidatePromotionService } = require('../../src/services/ask/buyer/candidatePromotion.service.ts');

const FULL = { id: 'c1', userId: 'u1', status: 'ACTIVE', label: 'Maple St', addressLine: '12 Maple St', city: 'Austin', state: 'TX', postalCode: '78701', bedrooms: 3, bathrooms: 2, livingAreaSqFt: 1800, yearBuilt: 1995, listPriceCents: 40000000,
  provenance: { addressLine: { source: 'LISTING', asOf: '2026-11-01' }, bedrooms: { source: 'LISTING', asOf: '2026-11-01' }, yearBuilt: { source: 'USER_ENTERED', asOf: '2026-11-02' } } };

function harness(rows, { existing = [], failEntryOnce = false } = {}) {
  const calls = { created: [], entry: [], updates: [] }; let entryFailures = failEntryOnce ? 1 : 0; let nextId = 1;
  const orig = { cp: propertyService.createProperty, ce: entryContext.captureEntryContext, fa: prisma.candidateProperty.findFirst, um: prisma.candidateProperty.updateMany, hp: prisma.homeownerProfile.findFirst, pf: prisma.property.findMany, pff: prisma.property.findFirst };
  const made = [];
  propertyService.createProperty = async (userId, data) => { const id = `p-new-${nextId++}`; calls.created.push({ userId, data, id }); made.push({ id, name: data.name, address: data.address, zipCode: data.zipCode, onboarding: null }); return { id }; };
  entryContext.captureEntryContext = async (propertyId, userId, input) => { if (entryFailures-- > 0) throw new Error('entry context down'); calls.entry.push({ propertyId, userId, input }); const m = made.find((x) => x.id === propertyId); if (m) m.onboarding = { ownershipState: 'UNDER_CONTRACT' }; return {}; };
  prisma.candidateProperty.findFirst = async ({ where }) => rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null;
  // The fake applies each update synchronously, as one atomic compare-and-set, the way the database does.
  prisma.candidateProperty.updateMany = async ({ where, data }) => {
    calls.updates.push({ where, data });
    const row = rows.find((r) => r.id === where.id && r.userId === where.userId && (where.status === undefined || r.status === where.status));
    if (!row) return { count: 0 };
    if (where.OR) { const cutoff = where.OR[1].promotionReservedAt.lt; const free = !row.promotionReservedAt || new Date(row.promotionReservedAt) < cutoff; if (!free) return { count: 0 }; }
    Object.assign(row, data); return { count: 1 };
  };
  prisma.homeownerProfile.findFirst = async () => ({ id: 'hp1' });
  prisma.property.findMany = async () => [...existing, ...made];
  prisma.property.findFirst = async ({ where }) => made.find((m) => m.id === where.id) ?? null;
  return { calls, made, restore: () => { propertyService.createProperty = orig.cp; entryContext.captureEntryContext = orig.ce; prisma.candidateProperty.findFirst = orig.fa; prisma.candidateProperty.updateMany = orig.um; prisma.homeownerProfile.findFirst = orig.hp; prisma.property.findMany = orig.pf; prisma.property.findFirst = orig.pff; } };
}
const ex = (extra = {}) => ({ id: 'p9', name: 'Mine', address: '12 Maple St', zipCode: '78701', onboarding: { ownershipState: 'UNDER_CONTRACT' }, ...extra });
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
  const h = harness([{ ...FULL }], { existing: [ex({ address: '12 maple st', zipCode: '78701-1234' })] });
  try {
    const r = await candidatePromotionService.review('u1', 'c1');
    assert.equal(r.canPromote, true);
    assert.deepEqual(r.existingHome, { propertyId: 'p9', name: 'Mine', address: '12 maple st', linkable: true });
    assert.equal(h.calls.created.length + h.calls.entry.length + h.calls.updates.length, 0);
  } finally { h.restore(); }
});

test('confirming creates the home through the property workflow, starts the under-contract journey, and keeps the candidate linked', async () => {
  const rows = [{ ...FULL }]; const h = harness(rows);
  try {
    const { token } = await candidatePromotionService.review('u1', 'c1');
    const out = await candidatePromotionService.confirm('u1', 'c1', { token, targetCloseDate: '2027-01-15T00:00:00.000Z' }, new Date('2026-11-23T00:00:00Z'));
    assert.deepEqual(out, { propertyId: 'p-new-1', created: true, linkedExisting: false, candidateId: 'c1' });
    assert.equal(h.calls.created[0].data.address, '12 Maple St');
    assert.equal(h.calls.created[0].data.isPrimary, false, 'a promoted home never silently becomes the primary home');
    const ctx = h.calls.entry[0].input;
    assert.deepEqual([ctx.entryPath, ctx.ownershipState, ctx.buyer.purchaseStage, ctx.buyer.targetCloseDate], ['EXISTING_HOME_PURCHASE', 'UNDER_CONTRACT', 'UNDER_CONTRACT', '2027-01-15T00:00:00.000Z']);
    assert.equal(ctx.sourceMetadata.promotedFromCandidateId, 'c1');
    assert.equal(ctx.sourceMetadata.fieldProvenance.bedrooms.source, 'LISTING');
    assert.deepEqual([rows[0].status, rows[0].promotedPropertyId, rows[0].promotionReservedAt], ['PROMOTED', 'p-new-1', null]);
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
  const rows = [{ ...FULL }]; const h = harness(rows, { existing: [ex()] });
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

test('an address from the listing shows its recorded source, and one with no recorded source claims none (nothing is shown as entered by you without a record)', () => {
  const p = buildPromotionProposal(FULL);
  assert.deepEqual(p.fields.find((f) => f.field === 'address'), { field: 'address', value: '12 Maple St', source: 'LISTING', asOf: '2026-11-01' });
  assert.deepEqual(p.fields.find((f) => f.field === 'city'), { field: 'city', value: 'Austin', source: null, asOf: null });
  assert.deepEqual(p.fields.find((f) => f.field === 'zipCode'), { field: 'zipCode', value: '78701', source: null, asOf: null });
});

test('two simultaneous confirmations create exactly one property and one journey; the other is told it is in progress', async () => {
  const rows = [{ ...FULL }]; const h = harness(rows);
  try {
    const { token } = await candidatePromotionService.review('u1', 'c1');
    const results = await Promise.allSettled([candidatePromotionService.confirm('u1', 'c1', { token }), candidatePromotionService.confirm('u1', 'c1', { token })]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'CANDIDATE_PROMOTION_IN_PROGRESS');
    assert.equal(h.calls.created.length, 1, 'no second property');
    assert.equal(h.calls.entry.length, 1, 'no second journey');
    assert.equal(rows[0].status, 'PROMOTED');
  } finally { h.restore(); }
});

test('an abandoned reservation (older than the window) does not block a retry, a fresh one does', async () => {
  const now = new Date('2026-11-24T12:00:00Z');
  const fresh = [{ ...FULL, promotionReservedAt: new Date(now.getTime() - 30 * 1000) }]; let h = harness(fresh);
  try {
    const { token } = await candidatePromotionService.review('u1', 'c1');
    await reject(candidatePromotionService.confirm('u1', 'c1', { token }, now), 'CANDIDATE_PROMOTION_IN_PROGRESS');
    assert.equal(h.calls.created.length, 0);
  } finally { h.restore(); }
  const stale = [{ ...FULL, promotionReservedAt: new Date(now.getTime() - 10 * 60 * 1000) }]; h = harness(stale);
  try {
    const { token } = await candidatePromotionService.review('u1', 'c1');
    const out = await candidatePromotionService.confirm('u1', 'c1', { token }, now);
    assert.equal(out.created, true);
  } finally { h.restore(); }
});

test('when the journey step fails the reservation is released and the created property is kept on the candidate, so a retry resumes it and creates no second property', async () => {
  const rows = [{ ...FULL }]; const h = harness(rows, { failEntryOnce: true });
  try {
    const { token } = await candidatePromotionService.review('u1', 'c1');
    await assert.rejects(candidatePromotionService.confirm('u1', 'c1', { token }), /entry context down/);
    assert.deepEqual([rows[0].status, rows[0].promotionReservedAt, rows[0].promotedPropertyId], ['ACTIVE', null, 'p-new-1']);
    const again = await candidatePromotionService.review('u1', 'c1');
    assert.equal(again.existingHome, null, 'its own half-made property is not reported as a duplicate');
    const out = await candidatePromotionService.confirm('u1', 'c1', { token: again.token });
    assert.deepEqual([out.propertyId, out.created], ['p-new-1', true]);
    assert.equal(h.calls.created.length, 1, 'exactly one property across both attempts');
    assert.equal(h.calls.entry.length, 1);
    assert.equal(rows[0].status, 'PROMOTED');
  } finally { h.restore(); }
});

test('a same-address home that is not in the buying lifecycle (owned, sold) is never linked or duplicated, and nothing is changed', async () => {
  const rows = [{ ...FULL }]; const h = harness(rows, { existing: [ex({ onboarding: { ownershipState: 'ESTABLISHED_OWNER' } })] });
  try {
    const r = await candidatePromotionService.review('u1', 'c1');
    assert.equal(r.canPromote, false);
    assert.match(r.blockedReason, /already own a home at this address/);
    await reject(candidatePromotionService.confirm('u1', 'c1', { token: r.token, linkToExistingHome: true }), 'CANDIDATE_EXISTING_HOME_NOT_LINKABLE');
    assert.equal(h.calls.created.length + h.calls.entry.length, 0);
    assert.deepEqual([rows[0].status, rows[0].promotedPropertyId ?? null], ['ACTIVE', null]);
  } finally { h.restore(); }
});

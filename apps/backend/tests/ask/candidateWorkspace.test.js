// BICC-4.1: candidate workspace and buyer reads (BUY-002, 003, 004, 005; FRD D03). Pure comparison and cost rules, and the owner-scoped service against a fake store.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node/register');

const { compareCandidates, buyerCostBreakdown, BUYER_COST_DISCLAIMER, COMPARISON_DIMENSIONS } = require('../../src/services/ask/buyer/candidateComparison.ts');
const { candidatePropertyService, validateCandidateFacts, nextProvenance, MAX_ACTIVE_CANDIDATES_PER_USER } = require('../../src/services/ask/buyer/candidateProperty.service.ts');
const { prisma } = require('../../src/lib/prisma.ts');

const A = { id: 'a', label: 'Maple St', listPriceCents: 40000000, bedrooms: 3, bathrooms: 2, livingAreaSqFt: 1800, yearBuilt: 1995, annualPropertyTaxCents: 600000, annualInsuranceCents: 180000, hoaMonthlyCents: 0, provenance: { listPriceCents: { source: 'LISTING', asOf: '2026-11-01' } } };
const B = { id: 'b', label: 'Oak Ave', listPriceCents: 35000000, bedrooms: 2, bathrooms: null, livingAreaSqFt: 1500, yearBuilt: 2010, annualPropertyTaxCents: 700000, annualInsuranceCents: null };
const cell = (row, id) => row.cells.find((c) => c.candidateId === id);

// ---- comparison (BUY-004) ----
test('at least two candidates are needed, and at least one valid dimension', () => {
  assert.deepEqual(compareCandidates([A], ['listPriceCents']), { error: 'NEED_AT_LEAST_TWO' });
  assert.deepEqual(compareCandidates([], ['listPriceCents']), { error: 'NEED_AT_LEAST_TWO' });
  assert.deepEqual(compareCandidates([A, B], ['nonsense']), { error: 'NO_VALID_DIMENSION' });
});

test('only the dimensions the buyer chose are compared, in the catalogue order, and unknown ones are named, not silently dropped', () => {
  const result = compareCandidates([A, B], ['yearBuilt', 'listPriceCents', 'colour']);
  assert.deepEqual(result.rows.map((r) => r.key), ['listPriceCents', 'yearBuilt']);
  assert.deepEqual(result.unknownDimensions, ['colour']);
});

test('a "best" marker appears only where lower is better AND every home has the value; a missing value is shown as not entered and never filled in', () => {
  const result = compareCandidates([A, B], ['listPriceCents', 'annualInsuranceCents', 'bedrooms', 'bathrooms']);
  const price = result.rows.find((r) => r.key === 'listPriceCents');
  assert.equal(price.fullyComparable, true);
  assert.deepEqual([cell(price, 'a').isBest, cell(price, 'b').isBest], [false, true]);
  const insurance = result.rows.find((r) => r.key === 'annualInsuranceCents');
  assert.equal(insurance.fullyComparable, false);
  assert.deepEqual(insurance.missingFor, ['b']);
  assert.equal(cell(insurance, 'b').value, null);
  assert.ok(!cell(insurance, 'a').isBest, 'no best on partial data');
  const bedrooms = result.rows.find((r) => r.key === 'bedrooms');
  assert.ok(bedrooms.cells.every((c) => !c.isBest), 'a count has no direction, so nothing is marked best');
  assert.match(result.disclosure, /2 of 4 compared items are missing/);
  assert.match(result.disclosure, /Nothing was filled in/);
});

test('a tie is never a winner, provenance rides along, and with nothing missing the disclosure says the values are supplied, not verified', () => {
  const tie = compareCandidates([{ id: 'x', label: 'X', listPriceCents: 100 }, { id: 'y', label: 'Y', listPriceCents: 100 }], ['listPriceCents']);
  assert.ok(tie.rows[0].cells.every((c) => !c.isBest));
  const full = compareCandidates([{ ...A, id: 'x', label: 'X' }, { ...A, id: 'y', label: 'Y', listPriceCents: 1, provenance: undefined }], ['listPriceCents']);
  assert.deepEqual([cell(full.rows[0], 'x').source, cell(full.rows[0], 'x').asOf], ['LISTING', '2026-11-01']);
  assert.equal(cell(full.rows[0], 'y').source, null, 'no provenance recorded means none is claimed');
  assert.match(full.disclosure, /supplied, not verified facts/);
  assert.equal(compareCandidates([A, B], COMPARISON_DIMENSIONS.map((d) => d.key)).rows.length, COMPARISON_DIMENSIONS.length);
});

test('no overall winner is ever computed', () => {
  const result = compareCandidates([A, B], COMPARISON_DIMENSIONS.map((d) => d.key));
  assert.ok(!('winner' in result) && !('best' in result) && !('recommendation' in result));
});

// ---- buyer cost (BUY-005) ----
const FULL = { id: 'f', label: 'F', listPriceCents: 40000000, downPaymentPercent: 20, closingCostPercent: 3, mortgageRatePercent: 6, mortgageTermMonths: 360, annualPropertyTaxCents: 600000, annualInsuranceCents: 180000, hoaMonthlyCents: 25000, monthlyUtilitiesCents: 30000, oneTimeWorkEstimateCents: 1500000 };

test('the four answers stay separate and each is computed from entered numbers: price, cash to close, monthly ownership, one-time work', () => {
  const c = buyerCostBreakdown(FULL);
  assert.equal(c.purchasePrice.cents, 40000000);
  assert.deepEqual(c.estimatedCashToClose.lines.map((l) => [l.key, l.cents]), [['downPaymentPercent', 8000000], ['closingCostPercent', 1200000]]);
  assert.equal(c.estimatedCashToClose.cents, 9200000);
  // $320,000 at 6% over 360 months is $1,918.56 (separately computed), plus tax $500, insurance $150, HOA $250, utilities $300
  const lines = Object.fromEntries(c.estimatedMonthlyOwnership.lines.map((l) => [l.key, l.cents]));
  assert.equal(lines.principalAndInterest, 191856);
  assert.deepEqual([lines.annualPropertyTaxCents, lines.annualInsuranceCents, lines.hoaMonthlyCents, lines.monthlyUtilitiesCents], [50000, 15000, 25000, 30000]);
  assert.equal(c.estimatedMonthlyOwnership.cents, 191856 + 50000 + 15000 + 25000 + 30000);
  assert.equal(c.oneTimeWork.cents, 1500000);
  assert.deepEqual(c.estimatedCashToClose.missing, []);
});

test('a missing input makes the dependent figure null and names exactly what to add; nothing is defaulted', () => {
  const noPrice = buyerCostBreakdown({ ...FULL, listPriceCents: null });
  assert.equal(noPrice.purchasePrice.cents, null);
  assert.equal(noPrice.estimatedCashToClose.cents, null);
  assert.equal(noPrice.estimatedMonthlyOwnership.cents, null);
  assert.ok(noPrice.estimatedCashToClose.missing.includes('listPriceCents'));
  const noRate = buyerCostBreakdown({ ...FULL, mortgageRatePercent: undefined });
  assert.equal(noRate.estimatedMonthlyOwnership.cents, null);
  assert.deepEqual(noRate.estimatedMonthlyOwnership.missing, ['mortgageRatePercent']);
  assert.equal(noRate.estimatedCashToClose.cents, 9200000, 'cash to close does not depend on the rate');
  const noClosing = buyerCostBreakdown({ ...FULL, closingCostPercent: null });
  assert.equal(noClosing.estimatedCashToClose.cents, null);
  assert.deepEqual(noClosing.estimatedCashToClose.missing, ['closingCostPercent']);
});

test('HOA and utilities may be absent without blocking the monthly total, but their absence is named', () => {
  const c = buyerCostBreakdown({ ...FULL, hoaMonthlyCents: null, monthlyUtilitiesCents: undefined });
  assert.equal(c.estimatedMonthlyOwnership.cents, 191856 + 50000 + 15000);
  assert.deepEqual(c.estimatedMonthlyOwnership.missing, ['hoaMonthlyCents', 'monthlyUtilitiesCents']);
  assert.equal(c.estimatedMonthlyOwnership.lines.find((l) => l.key === 'hoaMonthlyCents').basis, 'MISSING');
});

test('property tax and insurance are required for the total, because leaving them out would understate the cost', () => {
  assert.equal(buyerCostBreakdown({ ...FULL, annualInsuranceCents: null }).estimatedMonthlyOwnership.cents, null);
  assert.equal(buyerCostBreakdown({ ...FULL, annualPropertyTaxCents: null }).estimatedMonthlyOwnership.cents, null);
});

test('a zero-rate loan divides the principal evenly, and an out-of-range percent is treated as not entered, not clamped', () => {
  const zero = buyerCostBreakdown({ ...FULL, mortgageRatePercent: 0, downPaymentPercent: 25 });
  assert.equal(zero.estimatedMonthlyOwnership.lines.find((l) => l.key === 'principalAndInterest').cents, 83333);
  const bad = buyerCostBreakdown({ ...FULL, downPaymentPercent: 140 });
  assert.equal(bad.estimatedCashToClose.cents, null);
});

test('the basis of every figure is honest: ENTERED, ESTIMATED_FROM_ENTERED or MISSING, and it is never presented as a lender disclosure', () => {
  const c = buyerCostBreakdown(FULL);
  const bases = new Set([c.purchasePrice, c.oneTimeWork, ...c.estimatedCashToClose.lines, ...c.estimatedMonthlyOwnership.lines].map((l) => l.basis));
  assert.deepEqual([...bases].sort(), ['ENTERED', 'ESTIMATED_FROM_ENTERED']);
  assert.equal(c.disclaimer, BUYER_COST_DISCLAIMER);
  assert.match(c.disclaimer, /not a lender disclosure, quote or commitment/);
  assert.doesNotMatch(JSON.stringify(c), /Loan Estimate|Closing Disclosure|pre-?approv/i);
});

// ---- the owner-scoped service (BUY-002/003, D03) ----
function fakeStore() {
  const rows = new Map(); const queries = []; let n = 0;
  const matches = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'not' in v ? row[k] !== v.not : row[k] === v));
  const fake = {
    count: async ({ where }) => { queries.push(['count', where]); return [...rows.values()].filter((r) => matches(r, where)).length; },
    create: async ({ data }) => { const row = { id: `c${++n}`, status: 'ACTIVE', ...data }; rows.set(row.id, row); queries.push(['create', data]); return row; },
    findMany: async ({ where }) => { queries.push(['findMany', where]); return [...rows.values()].filter((r) => matches(r, where)); },
    findFirst: async ({ where }) => { queries.push(['findFirst', where]); return [...rows.values()].find((r) => matches(r, where)) ?? null; },
    updateMany: async ({ where, data }) => { queries.push(['updateMany', where]); const hit = [...rows.values()].filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    deleteMany: async ({ where }) => { queries.push(['deleteMany', where]); const hit = [...rows.values()].filter((r) => matches(r, where)); hit.forEach((r) => rows.delete(r.id)); return { count: hit.length }; },
  };
  return { fake, rows, queries };
}
async function withStore(run) {
  const original = prisma.candidateProperty; const s = fakeStore(); prisma.candidateProperty = s.fake;
  try { await run(s); } finally { prisma.candidateProperty = original; }
}

test('every service query carries the owning user, so one person can never read, change or delete another person\'s home', async () => {
  await withStore(async ({ queries }) => {
    const mine = await candidatePropertyService.create('u1', { label: 'Mine', listPriceCents: 1000 });
    await candidatePropertyService.create('u2', { label: 'Theirs' });
    assert.equal((await candidatePropertyService.list('u1')).length, 1);
    assert.equal(await candidatePropertyService.get('u2', mine.id), null, 'another person gets null, as for a home that does not exist');
    await assert.rejects(() => candidatePropertyService.update('u2', mine.id, { label: 'Hijack' }), /not found/);
    await assert.rejects(() => candidatePropertyService.archive('u2', mine.id), /not found/);
    await assert.rejects(() => candidatePropertyService.remove('u2', mine.id), /not found/);
    assert.equal((await candidatePropertyService.get('u1', mine.id)).label, 'Mine', 'nothing of the owner\'s changed');
    for (const [kind, where] of queries.filter(([k]) => k !== 'create')) assert.ok('userId' in where, `${kind} is scoped by user`);
  });
});

test('provenance: supplied facts carry their source and date, a cleared fact loses its entry, untouched facts keep theirs', async () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const p1 = nextProvenance({}, { listPriceCents: 5, bedrooms: 3 }, 'LISTING', now);
  assert.deepEqual(p1.listPriceCents, { source: 'LISTING', asOf: now.toISOString() });
  const p2 = nextProvenance(p1, { bedrooms: null, yearBuilt: 1990 }, 'USER_ENTERED', new Date('2026-11-24T00:00:00Z'));
  assert.ok(!('bedrooms' in p2));
  assert.equal(p2.listPriceCents.source, 'LISTING');
  assert.equal(p2.yearBuilt.source, 'USER_ENTERED');
  assert.deepEqual(nextProvenance(null, {}, 'USER_ENTERED', now), {});
  await withStore(async () => {
    const row = await candidatePropertyService.create('u1', { label: 'X', listPriceCents: 7 }, 'LISTING', now);
    assert.equal(row.provenance.listPriceCents.source, 'LISTING');
    const updated = await candidatePropertyService.update('u1', row.id, { bedrooms: 4 }, 'USER_ENTERED', new Date('2026-12-01T00:00:00Z'));
    assert.equal(updated.provenance.listPriceCents.source, 'LISTING', 'the earlier fact keeps its own source');
    assert.equal(updated.provenance.bedrooms.source, 'USER_ENTERED');
  });
});

test('validation refuses what is not a sensible fact instead of coercing it', () => {
  for (const bad of [{ label: '' }, { label: 'x'.repeat(121) }, { label: 'ok', listPriceCents: -1 }, { label: 'ok', listPriceCents: 1.5 }, { label: 'ok', bedrooms: 2.5 }, { label: 'ok', downPaymentPercent: 101 }, { label: 'ok', mortgageRatePercent: 31 }, { label: 'ok', mortgageTermMonths: 0 },
    { label: 'ok', yearBuilt: 1200 }, { label: 'ok', listPriceCents: Number.NaN }, { label: 'ok', listPriceCents: '5' }, { label: 'ok', listingUrl: 'ftp://x' }, { label: 'ok', notes: 'n'.repeat(2001) }]) {
    assert.throws(() => validateCandidateFacts(bad), (e) => e.statusCode === 400, JSON.stringify(bad).slice(0, 60));
  }
  assert.doesNotThrow(() => validateCandidateFacts({ label: 'ok', listPriceCents: 0, downPaymentPercent: 0, bedrooms: 0, listingUrl: 'https://example.com/x', hoaMonthlyCents: null }));
  assert.doesNotThrow(() => validateCandidateFacts({ bedrooms: 3 }), 'a patch without a label is valid');
});

test('a person keeps at most the declared number of active homes, and archiving frees a slot', async () => {
  await withStore(async () => {
    for (let i = 0; i < MAX_ACTIVE_CANDIDATES_PER_USER; i += 1) await candidatePropertyService.create('u1', { label: `H${i}` });
    await assert.rejects(() => candidatePropertyService.create('u1', { label: 'one too many' }), (e) => e.code === 'CANDIDATE_LIMIT_REACHED' && e.statusCode === 409);
    await candidatePropertyService.create('u2', { label: 'another person is unaffected' });
    const first = (await candidatePropertyService.list('u1'))[0];
    await candidatePropertyService.archive('u1', first.id);
    await candidatePropertyService.create('u1', { label: 'fits now' });
  });
});

test('explicit deletion removes the home; a promoted home is kept as the audit link and cannot be edited or deleted here; workspace deletion removes only this person\'s homes', async () => {
  await withStore(async ({ rows }) => {
    const a = await candidatePropertyService.create('u1', { label: 'A' }); const b = await candidatePropertyService.create('u1', { label: 'B' }); const other = await candidatePropertyService.create('u2', { label: 'C' });
    rows.get(b.id).status = 'PROMOTED';
    await candidatePropertyService.remove('u1', a.id);
    assert.equal(await candidatePropertyService.get('u1', a.id), null);
    await assert.rejects(() => candidatePropertyService.remove('u1', b.id), /not found/);
    await assert.rejects(() => candidatePropertyService.update('u1', b.id, { label: 'edit' }), /not found/);
    assert.equal(await candidatePropertyService.removeAll('u1'), 0, 'only the promoted one is left, and it is kept');
    assert.ok(rows.has(b.id) && rows.has(other.id));
  });
});

test('BUY-003 isolation: no foreign key to Property in the schema, and no homeowner module imports the candidate service', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const model = schema.slice(schema.indexOf('model CandidateProperty {'), schema.indexOf('}', schema.indexOf('model CandidateProperty {')));
  assert.doesNotMatch(model, /@relation/, 'no relation to any other model');
  assert.doesNotMatch(model, /\bProperty\b\s+(?:@|\n)/, 'no Property field');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const importers = walk(path.join(__dirname, '../../src')).filter((f) => f.endsWith('.ts') && !f.includes(`${path.sep}ask${path.sep}buyer${path.sep}`) && !f.endsWith('askCandidates.controller.ts') && /candidateProperty\.service|candidateComparison/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(importers.map((f) => path.relative(path.join(__dirname, '../../src'), f)), [], 'only the candidate controller, and nothing in any homeowner module, reads candidates');
});

// ---- the HTTP surface ----
test('the candidate routes sit behind authentication and Ask eligibility, take no propertyId, and the compare route cannot probe other people\'s homes', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../../src/routes/ask.routes.ts'), 'utf8');
  assert.ok(routes.indexOf("router.use('/ask', authenticate, requireAskEligibleAccount)") < routes.indexOf("router.get('/ask/candidates'"), 'registered after the auth and eligibility middleware');
  for (const line of routes.split('\n').filter((l) => l.includes('/ask/candidates'))) assert.doesNotMatch(line, /propertyId|propertyAuthMiddleware/, line);
  const controller = fs.readFileSync(path.join(__dirname, '../../src/controllers/askCandidates.controller.ts'), 'utf8');
  assert.doesNotMatch(controller.replace(/\/\/[^\n]*/g, ''), /propertyId/, 'no propertyId in the code (comments excluded)');
  assert.match(controller, /rows\.some\(\(row\) => !row\)[\s\S]{0,120}CANDIDATE_NOT_FOUND/, 'a foreign id fails the whole comparison like a missing one');
  assert.match(controller, /candidateIds\.length < 2 \|\| candidateIds\.length > 6/);
});

test('the compare endpoint compares only the caller\'s homes and refuses a request that includes someone else\'s', async () => {
  const { compareAskCandidates, getAskCandidateCost } = require('../../src/controllers/askCandidates.controller.ts');
  await withStore(async ({ rows }) => {
    const mineA = await candidatePropertyService.create('u1', { label: 'A', listPriceCents: 10 }); const mineB = await candidatePropertyService.create('u1', { label: 'B', listPriceCents: 20 }); const theirs = await candidatePropertyService.create('u2', { label: 'T', listPriceCents: 5 });
    const call = async (handler, req) => { let out = null; let err = null; await handler({ user: { userId: 'u1' }, params: {}, query: {}, ...req }, { json: (v) => { out = v; return v; }, status() { return this; } }, (e) => { err = e; }); return { out, err }; };
    const ok = await call(compareAskCandidates, { body: { candidateIds: [mineA.id, mineB.id], dimensions: ['listPriceCents'] } });
    assert.equal(ok.out.data.rows[0].cells.find((c) => c.candidateId === mineA.id).value, 10);
    const probe = await call(compareAskCandidates, { body: { candidateIds: [mineA.id, theirs.id], dimensions: ['listPriceCents'] } });
    assert.equal(probe.err.code, 'CANDIDATE_NOT_FOUND');
    assert.equal(probe.out, null, 'nothing about the other person\'s home is returned');
    const same = await call(compareAskCandidates, { body: { candidateIds: [mineA.id, mineA.id], dimensions: ['listPriceCents'] } });
    assert.equal(same.err.code, 'CANDIDATE_COMPARE_INVALID', 'the same home twice is not a comparison');
    assert.equal((await call(compareAskCandidates, { body: { candidateIds: [mineA.id], dimensions: ['listPriceCents'] } })).err.code, 'CANDIDATE_COMPARE_INVALID');
    assert.equal((await call(getAskCandidateCost, { params: { candidateId: theirs.id } })).err.code, 'CANDIDATE_NOT_FOUND');
    assert.equal((await call(getAskCandidateCost, { params: { candidateId: mineA.id } })).out.data.purchasePrice.cents, 10);
    void rows;
  });
});

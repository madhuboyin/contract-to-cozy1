const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

// Actionable Result Enrichment FRD §5.1-5.4: shared normalization, classification precedence, single-use override fingerprint, and the write guard.
const match = require('../../src/modules/propertyContext/application/warrantyCoverageMatch');
const writer = require('../../src/modules/propertyContext/application/captureWarranty');

const d = (text) => new Date(`${text}T00:00:00.000Z`);
const record = (overrides = {}) => ({
  id: 'w1', providerName: 'Acme Home Care', policyNumber: 'AB-123', category: 'APPLIANCE', scopeKind: 'ITEM_SPECIFIC',
  startDate: d('2025-01-01'), expiryDate: d('2026-01-01'), updatedAt: new Date('2025-02-01T10:00:00.000Z'), ...overrides,
});
const candidate = (overrides = {}) => ({ providerName: 'acme home care', policyNumber: 'ab123', category: 'APPLIANCE', scopeKind: 'ITEM_SPECIFIC', startDate: d('2025-01-01'), expiryDate: d('2026-01-01'), ...overrides });

test('one shared normalization: provider punctuation and case, policy-number punctuation', () => {
  assert.equal(match.normalizeProvider('  Acme,  Home-Care! '), 'acme home care');
  assert.equal(match.normalizePolicyNumber('AB-123 4'), 'ab1234');
  assert.equal(match.normalizePolicyNumber(null), '');
});

test('date overlap is inclusive at the boundary day', () => {
  assert.equal(match.warrantyDateRangesOverlap({ startDate: d('2025-01-01'), expiryDate: d('2025-06-01') }, { startDate: d('2025-06-01'), expiryDate: d('2026-01-01') }), true);
  assert.equal(match.warrantyDateRangesOverlap({ startDate: d('2025-01-01'), expiryDate: d('2025-06-01') }, { startDate: d('2025-06-02'), expiryDate: d('2026-01-01') }), false);
});

test('exact duplicate: same provider, policy, category, scope and dates (normalized)', () => {
  assert.equal(match.classifyWarrantyCoverage(candidate(), [record()]).outcome, 'EXACT_DUPLICATE');
  // Both policy numbers absent is also identical.
  assert.equal(match.classifyWarrantyCoverage(candidate({ policyNumber: null }), [record({ policyNumber: null })]).outcome, 'EXACT_DUPLICATE');
});

test('equivalent includes the gap case: same provider, no policy numbers, overlapping non-identical dates', () => {
  const result = match.classifyWarrantyCoverage(candidate({ policyNumber: null, expiryDate: d('2026-03-01') }), [record({ policyNumber: null })]);
  assert.equal(result.outcome, 'EQUIVALENT');
  assert.deepEqual(result.matches.map((row) => row.id), ['w1']);
});

test('one policy number absent still counts as equivalent; two different policy numbers do not', () => {
  assert.equal(match.classifyWarrantyCoverage(candidate({ policyNumber: null, expiryDate: d('2026-03-01') }), [record()]).outcome, 'EQUIVALENT');
  assert.equal(match.classifyWarrantyCoverage(candidate({ policyNumber: 'ZZ-9', expiryDate: d('2026-03-01') }), [record()]).outcome, 'NO_MATCH');
});

test('precedence: a provider, category or scope difference is a conflict, even with the same provider and policy number', () => {
  assert.equal(match.classifyWarrantyCoverage(candidate({ providerName: 'Other Co' }), [record()]).outcome, 'OVERLAPPING_CONFLICT');
  assert.equal(match.classifyWarrantyCoverage(candidate({ category: 'HVAC', expiryDate: d('2026-03-01') }), [record()]).outcome, 'OVERLAPPING_CONFLICT');
  assert.equal(match.classifyWarrantyCoverage(candidate({ scopeKind: 'PROPERTY_PLAN', expiryDate: d('2026-03-01') }), [record()]).outcome, 'OVERLAPPING_CONFLICT');
});

test('no overlap in dates is no match; a boundary day shared is a match', () => {
  assert.equal(match.classifyWarrantyCoverage(candidate({ providerName: 'Other', startDate: d('2026-01-02'), expiryDate: d('2027-01-01') }), [record()]).outcome, 'NO_MATCH');
  assert.equal(match.classifyWarrantyCoverage(candidate({ providerName: 'Other', startDate: d('2026-01-01'), expiryDate: d('2027-01-01') }), [record()]).outcome, 'OVERLAPPING_CONFLICT');
});

test('a non-exact outcome returns every matching record, so the fingerprint covers the complete set', () => {
  const result = match.classifyWarrantyCoverage(candidate({ providerName: 'Other' }), [record(), record({ id: 'w2' }), record({ id: 'w3', startDate: d('2030-01-01'), expiryDate: d('2031-01-01') })]);
  assert.deepEqual(result.matches.map((row) => row.id).sort(), ['w1', 'w2']);
});

test('the override fingerprint binds execution, user, property, item and the sorted (id, updatedAt) pairs', () => {
  const base = { executionId: 'e1', userId: 'u1', propertyId: 'p1', inventoryItemId: 'i1', matches: [record(), record({ id: 'w2' })] };
  const same = match.warrantyOverrideFingerprint({ ...base, matches: [...base.matches].reverse() });
  assert.equal(match.warrantyOverrideFingerprint(base), same, 'order of matches does not change it');
  assert.notEqual(match.warrantyOverrideFingerprint({ ...base, executionId: 'e2' }), same);
  assert.notEqual(match.warrantyOverrideFingerprint({ ...base, userId: 'u2' }), same);
  assert.notEqual(match.warrantyOverrideFingerprint({ ...base, inventoryItemId: null }), same);
  assert.notEqual(match.warrantyOverrideFingerprint({ ...base, matches: [record({ updatedAt: new Date('2025-03-01T00:00:00.000Z') }), record({ id: 'w2' })] }), same, 'an updated record changes it');
  assert.notEqual(match.warrantyOverrideFingerprint({ ...base, matches: [...base.matches, record({ id: 'w9' })] }), same, 'a newly added record changes it');
});

test('the lock text uses the PROPERTY sentinel when there is no item', () => {
  assert.equal(match.warrantyCreateLockText('p1', 'i1'), 'warranty-create:p1:i1');
  assert.equal(match.warrantyCreateLockText('p1', null), 'warranty-create:p1:PROPERTY');
});

// ── the write guard, against a fake transaction ──────────────────────────────────────────────────────
function fakeTx({ existing = [], byExecution = null, itemOk = true } = {}) {
  const calls = { lock: 0, created: [] };
  const tx = {
    $executeRaw: async () => { calls.lock += 1; return 1; },
    property: { findUnique: async () => ({ homeownerProfileId: 'h1' }) },
    inventoryItem: { findFirst: async () => (itemOk ? { id: 'i1' } : null) },
    warranty: {
      findFirst: async () => byExecution,
      findMany: async () => existing,
      create: async ({ data }) => { calls.created.push(data); return { id: 'new', ...data }; },
    },
  };
  return { tx, calls };
}
const input = (overrides = {}) => ({
  providerName: 'Acme Home Care', category: 'APPLIANCE', inventoryItemId: 'i1', policyNumber: 'AB-123', startDate: '2025-01-01T00:00:00.000Z', expiryDate: '2026-01-01T00:00:00.000Z',
  sourceExecutionId: 'exec-1', ...overrides,
});
const run = (tx, inputOverrides = {}) => writer.recordWarrantyInTransaction(tx, {
  propertyId: 'p1', userId: 'u1', input: input(inputOverrides), scopeKind: 'ITEM_SPECIFIC', startDate: new Date('2025-01-01T00:00:00.000Z'), expiryDate: new Date('2026-01-01T00:00:00.000Z'),
});

test('the write takes the advisory lock first and creates when nothing matches', async () => {
  const { tx, calls } = fakeTx();
  const created = await run(tx);
  assert.equal(calls.lock, 1);
  assert.equal(calls.created.length, 1);
  assert.equal(created.inventoryItemId, 'i1');
});

test('a safe retry of the same execution returns the original row and never writes twice', async () => {
  const { tx, calls } = fakeTx({ byExecution: { id: 'original' }, existing: [record()] });
  assert.equal((await run(tx)).id, 'original');
  assert.equal(calls.created.length, 0);
});

test('an exact duplicate from a different execution is blocked', async () => {
  const { tx, calls } = fakeTx({ existing: [record()] });
  await assert.rejects(() => run(tx), (error) => error instanceof writer.WarrantyAlreadyRecordedError && error.existingWarrantyId === 'w1' && error.code === 'ASK_CONFIRMATION_CONFLICT');
  assert.equal(calls.created.length, 0);
});

test('equivalent or conflicting coverage needs the matching single-use fingerprint', async () => {
  const existing = [record({ providerName: 'Other Co' })];
  const { tx, calls } = fakeTx({ existing });
  await assert.rejects(() => run(tx), writer.WarrantyCoverageChangedError, 'no override: rejected');
  await assert.rejects(() => run(tx, { overrideFingerprint: 'forged' }), writer.WarrantyCoverageChangedError, 'a wrong fingerprint: rejected');
  assert.equal(calls.created.length, 0);
  const good = match.warrantyOverrideFingerprint({ executionId: 'exec-1', userId: 'u1', propertyId: 'p1', inventoryItemId: 'i1', matches: existing });
  assert.equal((await run(tx, { overrideFingerprint: good })).id, 'new');
});

test('a fingerprint copied to another execution or user is rejected', async () => {
  const existing = [record({ providerName: 'Other Co' })];
  const { tx } = fakeTx({ existing });
  const forOtherExecution = match.warrantyOverrideFingerprint({ executionId: 'exec-OTHER', userId: 'u1', propertyId: 'p1', inventoryItemId: 'i1', matches: existing });
  const forOtherUser = match.warrantyOverrideFingerprint({ executionId: 'exec-1', userId: 'u-OTHER', propertyId: 'p1', inventoryItemId: 'i1', matches: existing });
  await assert.rejects(() => run(tx, { overrideFingerprint: forOtherExecution }), writer.WarrantyCoverageChangedError);
  await assert.rejects(() => run(tx, { overrideFingerprint: forOtherUser }), writer.WarrantyCoverageChangedError);
});

test('an already-known record updated after review, and an entirely new conflicting record, both invalidate the override', async () => {
  const reviewed = [record({ providerName: 'Other Co' })];
  const stale = match.warrantyOverrideFingerprint({ executionId: 'exec-1', userId: 'u1', propertyId: 'p1', inventoryItemId: 'i1', matches: reviewed });
  const updated = fakeTx({ existing: [record({ providerName: 'Other Co', updatedAt: new Date('2025-09-09T00:00:00.000Z') })] });
  await assert.rejects(() => run(updated.tx, { overrideFingerprint: stale }), writer.WarrantyCoverageChangedError);
  const added = fakeTx({ existing: [...reviewed, record({ id: 'w-new', providerName: 'Third Co' })] });
  await assert.rejects(() => run(added.tx, { overrideFingerprint: stale }), writer.WarrantyCoverageChangedError);
  assert.equal(updated.calls.created.length + added.calls.created.length, 0);
});

test('a leftover override is harmless once the conflict is gone, and a blocked duplicate cannot be overridden', async () => {
  const gone = fakeTx({ existing: [] });
  assert.equal((await run(gone.tx, { overrideFingerprint: 'stale' })).id, 'new');
  const dup = fakeTx({ existing: [record()] });
  await assert.rejects(() => run(dup.tx, { overrideFingerprint: 'anything' }), writer.WarrantyAlreadyRecordedError);
});

test('two executions with identical input: exactly one creation and one exact-duplicate result', async () => {
  // A serialized store: the advisory lock makes the second transaction see the first one's row.
  const rows = [];
  let chain = Promise.resolve();
  const serial = (work) => { const next = chain.then(work); chain = next.catch(() => undefined); return next; };
  const make = () => ({
    $executeRaw: async () => 1,
    property: { findUnique: async () => ({ homeownerProfileId: 'h1' }) },
    inventoryItem: { findFirst: async () => ({ id: 'i1' }) },
    warranty: {
      findFirst: async ({ where }) => rows.find((row) => row.sourceExecutionId === where.sourceExecutionId) ?? null,
      findMany: async () => rows.map((row) => ({ ...record(), ...row })),
      create: async ({ data }) => { const row = { id: `w-${rows.length + 1}`, updatedAt: new Date(), ...data }; rows.push(row); return row; },
    },
  });
  const attempt = (executionId) => serial(() => run(make(), { sourceExecutionId: executionId })).then((value) => ({ ok: value }), (error) => ({ error }));
  const [first, second] = await Promise.all([attempt('exec-a'), attempt('exec-b')]);
  assert.equal(rows.length, 1);
  assert.ok(first.ok);
  assert.ok(second.error instanceof writer.WarrantyAlreadyRecordedError);
});

test('a missing item is still rejected', async () => {
  await assert.rejects(() => run(fakeTx({ itemOk: false }).tx), /does not belong to this property/);
});

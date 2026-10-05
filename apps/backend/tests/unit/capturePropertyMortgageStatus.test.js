const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { Prisma } = require('@prisma/client');
const writer = require('../../src/modules/propertyContext/application/capturePropertyMortgageStatus.ts');
const { PROPERTY_FACT_CATALOG, getFactDefinition, getFactDefinitionsForScope } = require('../../src/modules/propertyContext/catalog/factCatalog.ts');
const { createPropertyFact } = require('../../src/modules/propertyContext/domain/facts.ts');
const { financialAssembler } = require('../../src/modules/propertyContext/infrastructure/prismaAssemblers.ts');
const { prisma } = require('../../src/lib/prisma.ts');

// ASK_COZY_EXACT_FOUR_REGISTRY_PACKET D5 / step 6: mortgage-status fact, assembler entry, and the atomic UNKNOWN-only capture.
// No database: the fake models what the design relies on -- a conditional UPDATE is one atomic statement, it takes a row lock that is
// held until the transaction ends, a rollback undoes the transaction's writes, and transactions interleave between statements.

const tick = () => new Promise((resolve) => setImmediate(resolve));

function createFakeStore(seed = {}) {
  const store = {
    profile: seed.profile === undefined ? null : seed.profile, // { propertyId, mortgageStatus, ...details }
    evidence: [], changes: [], idSeq: 0,
    locks: new Map(), // propertyId -> promise chain tail
    replayKeys: new Set(),
  };
  const matches = (row, where) => Object.entries(where).every(([k, v]) => (v !== null && typeof v === 'object' && 'not' in v ? row[k] !== v.not : (row[k] ?? null) === v));
  const deps = (over = {}) => ({
    resolveAccess: async () => ({ role: 'CONTRIBUTOR' }),
    readProfile: async () => (store.profile ? { ...store.profile } : null),
    loadContextVersion: async () => 'ctx-v1',
    now: () => new Date('2026-10-04T12:00:00.000Z'),
    emitChange: async (tx, input) => { if (over.failEmit) throw new Error('emit failed'); await tick(); tx.undo.push(() => store.changes.pop()); store.changes.push(input.changedFactKeys[0]); },
    async transaction(callback) {
      const tx = { undo: [], heldLock: null, releases: [] };
      const acquire = async (propertyId) => {
        if (tx.releases.length) return;
        const previous = store.locks.get(propertyId) ?? Promise.resolve();
        let release;
        const mine = new Promise((resolve) => { release = resolve; });
        store.locks.set(propertyId, previous.then(() => mine));
        await previous;
        tx.releases.push(release);
      };
      tx.propertyFactEvidence = {
        async create({ data }) {
          await tick();
          const key = `${data.propertyId}|${data.captureExecutionId}`;
          if (data.captureExecutionId && store.replayKeys.has(key)) throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
          const row = { id: `ev-${++store.idSeq}`, ...data, supersededAt: null };
          store.evidence.push(row);
          if (data.captureExecutionId) store.replayKeys.add(key);
          tx.undo.push(() => { store.evidence.splice(store.evidence.indexOf(row), 1); if (data.captureExecutionId) store.replayKeys.delete(key); });
          return row;
        },
        async updateMany({ where, data }) {
          await tick();
          const touched = store.evidence.filter((row) => row.propertyId === where.propertyId && row.factKey === where.factKey && row.supersededAt === null && row.id !== where.id.not);
          for (const row of touched) { row.supersededAt = data.supersededAt; tx.undo.push(() => { row.supersededAt = null; }); }
          return { count: touched.length };
        },
      };
      tx.propertyFinancingProfile = {
        async createMany({ data }) {
          await tick();
          if (!store.profile) { store.profile = { ...data[0] }; tx.undo.push(() => { store.profile = null; }); }
          return { count: 0 };
        },
        async updateMany({ where, data }) {
          await acquire(where.propertyId); // row lock, held until the transaction ends
          await tick();
          if (!store.profile || !matches(store.profile, where)) return { count: 0 };
          const before = { ...store.profile };
          Object.assign(store.profile, data);
          tx.undo.push(() => { store.profile = before; });
          return { count: 1 };
        },
      };
      try {
        const result = await callback(tx);
        return result;
      } catch (error) {
        for (const undo of tx.undo.reverse()) undo();
        throw error;
      } finally {
        for (const release of tx.releases) release();
      }
    },
  });
  return { store, deps };
}

const PROPERTY = 'prop-1';
const capture = (deps, status, extra = {}) => writer.capturePropertyMortgageStatus(PROPERTY, 'user-1', { status, ...extra }, deps);

// ---- catalog and assembler ---------------------------------------------------------------------------------------------------------

test('catalog: financial.mortgageStatus exists, is FINANCIAL-scoped, owned by the profile, and not writable through the generic writer', () => {
  const definition = getFactDefinition('financial.mortgageStatus');
  assert.equal(definition.scope, 'FINANCIAL');
  assert.equal(definition.canonicalOwner, 'PropertyFinancingProfile.mortgageStatus');
  assert.equal(definition.writable, false);
  assert.ok(getFactDefinitionsForScope('FINANCIAL').some((entry) => entry.key === 'financial.mortgageStatus'));
  assert.equal(PROPERTY_FACT_CATALOG.filter((entry) => entry.key === 'financial.mortgageStatus').length, 1);
});

test('assembler: UNKNOWN is the unanswered state; answers are KNOWN, never stale on a timer; financingProfile content is unchanged', async () => {
  const restore = [];
  const stub = (target, name, value) => { const original = target[name]; target[name] = value; restore.push(() => { target[name] = original; }); };
  try {
    const profileRow = (status) => ({
      mortgageStatus: status, purchasePriceCents: null, purchaseDate: null, mortgageType: null, originalMortgageBalanceCents: null,
      currentMortgageBalanceCents: null, mortgageBalanceAsOfDate: null, interestRateBps: null, remainingTermMonths: null, monthlyPaymentCents: null,
      hasSecondMortgage: false, secondMortgageBalanceCents: null, hasPMI: false, updatedAt: new Date('2025-01-01T00:00:00Z'),
    });
    let current = null;
    stub(prisma.propertyFinancingProfile, 'findUnique', async () => current);
    stub(prisma.equityPosition, 'findFirst', async () => null);
    stub(prisma.homeReserveFund, 'findUnique', async () => null);
    stub(prisma.homeCapitalTimelineItem, 'findMany', async () => []);
    stub(prisma.expense, 'groupBy', async () => []);
    stub(prisma.financingScenario, 'findMany', async () => []);
    stub(prisma.propertyFactEvidence, 'findMany', async () => []);
    const now = new Date('2026-10-04T12:00:00Z');
    const factOf = async (row) => { current = row; const facts = await financialAssembler.assemble('p1', now); return Object.fromEntries(facts.map((fact) => [fact.key, fact])); };

    const none = await factOf(null);
    assert.equal(none['financial.mortgageStatus'].state, 'UNKNOWN');
    const unknown = await factOf(profileRow('UNKNOWN'));
    assert.equal(unknown['financial.mortgageStatus'].state, 'UNKNOWN');
    assert.equal(unknown['financial.mortgageStatus'].value, null);
    const mortgaged = await factOf(profileRow('MORTGAGED'));
    assert.equal(mortgaged['financial.mortgageStatus'].state, 'KNOWN');
    assert.equal(mortgaged['financial.mortgageStatus'].value, 'MORTGAGED');
    assert.equal(mortgaged['financial.mortgageStatus'].validUntil, null, 'a status does not expire on a timer');
    const none2 = await factOf(profileRow('NO_MORTGAGE'));
    assert.equal(none2['financial.mortgageStatus'].value, 'NO_MORTGAGE');
    assert.equal(none2['financial.mortgageStatus'].state, 'KNOWN');
    // The existing fact keeps its content: status is its own fact, not a new field on the profile row.
    assert.ok(!('mortgageStatus' in mortgaged['financial.financingProfile'].value));
  } finally { for (const undo of restore.reverse()) undo(); }
});

// ---- the capture ------------------------------------------------------------------------------------------------------------------

test('UNKNOWN -> MORTGAGED and UNKNOWN -> NO_MORTGAGE capture, with evidence and exactly one property change', async () => {
  for (const status of ['MORTGAGED', 'NO_MORTGAGE']) {
    const { store, deps } = createFakeStore({ profile: { propertyId: PROPERTY, mortgageStatus: 'UNKNOWN', hasSecondMortgage: false, hasPMI: false } });
    const result = await capture(deps(), status);
    assert.deepEqual(result, { outcome: 'CAPTURED', status, contextVersion: 'ctx-v1' });
    assert.equal(store.profile.mortgageStatus, status);
    assert.equal(store.evidence.length, 1);
    assert.equal(store.evidence[0].factKey, 'financial.mortgageStatus');
    assert.deepEqual(store.changes, ['financial.mortgageStatus']);
  }
});

test('a missing profile row is created and transitioned in the same transaction', async () => {
  const { store, deps } = createFakeStore({ profile: null });
  const result = await capture(deps(), 'MORTGAGED');
  assert.equal(result.outcome, 'CAPTURED');
  assert.equal(store.profile.mortgageStatus, 'MORTGAGED');
});

test('a known status is never changed by a capture: same answer is ALREADY_SET, a different one is CONFLICT_STATUS, and nothing is written', async () => {
  for (const [existing, requested, outcome] of [['MORTGAGED', 'MORTGAGED', 'ALREADY_SET'], ['MORTGAGED', 'NO_MORTGAGE', 'CONFLICT_STATUS'], ['NO_MORTGAGE', 'MORTGAGED', 'CONFLICT_STATUS'], ['NO_MORTGAGE', 'NO_MORTGAGE', 'ALREADY_SET']]) {
    const { store, deps } = createFakeStore({ profile: { propertyId: PROPERTY, mortgageStatus: existing, interestRateBps: 650, hasSecondMortgage: false, hasPMI: false } });
    const result = await capture(deps(), requested);
    assert.equal(result.outcome, outcome, `${existing} -> ${requested}`);
    assert.equal(result.status, existing);
    assert.equal(store.profile.mortgageStatus, existing);
    assert.equal(store.profile.interestRateBps, 650, 'details never touched');
    assert.equal(store.evidence.length, 0, 'the refused capture rolled back its evidence row');
    assert.equal(store.changes.length, 0);
  }
});

test('NO_MORTGAGE never wipes: existing mortgage details refuse it as CONFLICT_DETAILS and stay intact', async () => {
  const { store, deps } = createFakeStore({ profile: { propertyId: PROPERTY, mortgageStatus: 'UNKNOWN', interestRateBps: 625, hasSecondMortgage: false, hasPMI: false } });
  const result = await capture(deps(), 'NO_MORTGAGE');
  assert.equal(result.outcome, 'CONFLICT_DETAILS');
  assert.equal(store.profile.mortgageStatus, 'UNKNOWN');
  assert.equal(store.profile.interestRateBps, 625);
  assert.equal(store.evidence.length, 0);
  // MORTGAGED is fine with details already present (a rate captured before the status).
  const ok = await capture(deps(), 'MORTGAGED');
  assert.equal(ok.outcome, 'CAPTURED');
  assert.equal(store.profile.interestRateBps, 625);
  for (const field of ['hasSecondMortgage', 'hasPMI']) {
    const flagged = createFakeStore({ profile: { propertyId: PROPERTY, mortgageStatus: 'UNKNOWN', [field]: true } });
    assert.equal((await capture(flagged.deps(), 'NO_MORTGAGE')).outcome, 'CONFLICT_DETAILS', field);
  }
});

// ---- concurrency -------------------------------------------------------------------------------------------------------------------

test('concurrency: many simultaneous captures produce exactly one transition, one evidence row and one change; the rest are classified, not written', async () => {
  const { store, deps } = createFakeStore({ profile: { propertyId: PROPERTY, mortgageStatus: 'UNKNOWN', hasSecondMortgage: false, hasPMI: false } });
  const requests = ['MORTGAGED', 'NO_MORTGAGE', 'NO_MORTGAGE', 'MORTGAGED', 'NO_MORTGAGE', 'MORTGAGED', 'NO_MORTGAGE', 'MORTGAGED'];
  const results = await Promise.all(requests.map((status, i) => capture(deps(), status, { captureExecutionId: `exec-${i}` })));
  const captured = results.filter((r) => r.outcome === 'CAPTURED');
  assert.equal(captured.length, 1, 'exactly one capture wins');
  const winner = store.profile.mortgageStatus;
  assert.ok(['MORTGAGED', 'NO_MORTGAGE'].includes(winner));
  assert.equal(captured[0].status, winner);
  assert.equal(store.evidence.length, 1, 'losers rolled back their evidence rows');
  assert.equal(store.changes.length, 1);
  results.forEach((result, i) => {
    if (result.outcome === 'CAPTURED') return;
    assert.equal(result.outcome, requests[i] === winner ? 'ALREADY_SET' : 'CONFLICT_STATUS', `request ${i} (${requests[i]}) vs winner ${winner}`);
    assert.equal(result.status, winner);
  });
});

test('concurrency control: a read-then-write implementation WOULD double-write under the same interleaving (the fake can catch the race)', async () => {
  const { store } = createFakeStore({ profile: { propertyId: PROPERTY, mortgageStatus: 'UNKNOWN', hasSecondMortgage: false, hasPMI: false } });
  let writes = 0;
  const naive = async (status) => {
    const seen = store.profile.mortgageStatus; // read
    await tick(); // another request interleaves here
    if (seen === 'UNKNOWN') { store.profile.mortgageStatus = status; writes += 1; } // write on a stale read
  };
  await Promise.all(['MORTGAGED', 'NO_MORTGAGE', 'MORTGAGED'].map(naive));
  assert.ok(writes > 1, 'the naive approach writes more than once, so the atomic test above is discriminating');
});

test('a rolled-back transaction leaves no trace: an emit failure undoes the transition and its evidence', async () => {
  const { store, deps } = createFakeStore({ profile: { propertyId: PROPERTY, mortgageStatus: 'UNKNOWN', hasSecondMortgage: false, hasPMI: false } });
  await assert.rejects(() => capture(deps({ failEmit: true }), 'NO_MORTGAGE'), /emit failed/);
  assert.equal(store.profile.mortgageStatus, 'UNKNOWN');
  assert.equal(store.evidence.length, 0);
  assert.equal((await capture(deps(), 'NO_MORTGAGE')).outcome, 'CAPTURED', 'a retry succeeds because nothing was left behind');
});

test('idempotent replay: the same captureExecutionId returns ALREADY_SET and does not write or emit again', async () => {
  const { store, deps } = createFakeStore({ profile: { propertyId: PROPERTY, mortgageStatus: 'UNKNOWN', hasSecondMortgage: false, hasPMI: false } });
  assert.equal((await capture(deps(), 'MORTGAGED', { captureExecutionId: 'exec-1' })).outcome, 'CAPTURED');
  const replay = await capture(deps(), 'MORTGAGED', { captureExecutionId: 'exec-1' });
  assert.equal(replay.outcome, 'ALREADY_SET');
  assert.equal(replay.status, 'MORTGAGED');
  assert.equal(store.evidence.length, 1);
  assert.equal(store.changes.length, 1);
});

// ---- authorization and input -------------------------------------------------------------------------------------------------------

test('authorization and input: below CONTRIBUTOR is denied before any write; only MORTGAGED and NO_MORTGAGE are accepted answers', async () => {
  const { store, deps } = createFakeStore({ profile: { propertyId: PROPERTY, mortgageStatus: 'UNKNOWN', hasSecondMortgage: false, hasPMI: false } });
  for (const role of ['VIEWER', null]) {
    await assert.rejects(() => capture({ ...deps(), resolveAccess: async () => (role ? { role } : null) }, 'MORTGAGED'), /./);
  }
  assert.equal(store.profile.mortgageStatus, 'UNKNOWN');
  assert.equal(store.evidence.length, 0);
  for (const bad of ['UNKNOWN', 'MAYBE', '', undefined]) await assert.rejects(() => capture(deps(), bad), /./);
  assert.deepEqual([...writer.MORTGAGE_STATUS_ANSWERS], ['MORTGAGED', 'NO_MORTGAGE']);
  assert.equal(createPropertyFact('financial.mortgageStatus', 'MORTGAGED').state, 'KNOWN');
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The canonical, owner-only financing profile writer (owner ruling 2026-10-13, FRD v1.332). No database: the Prisma client is replaced.

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const writer = require('../../src/services/financingProfile/financingProfileWriter.ts');

const T0 = new Date('2026-09-01T00:00:00Z');

test('plan: NO_MORTGAGE clears every loan fact in the same write, and loan facts alongside it are refused', () => {
  const current = { mortgageStatus: 'MORTGAGED', purchasePriceCents: 40000000, currentMortgageBalanceCents: 30000000, originalMortgageBalanceCents: 32000000, interestRateBps: 650, remainingTermMonths: 300, monthlyPaymentCents: 200000, hasSecondMortgage: true, secondMortgageBalanceCents: 1000000, hasPMI: true, mortgageType: 'FIXED' };
  const { next, diff } = writer.planFinancingProfileChange(current, { mortgageStatus: 'NO_MORTGAGE' });
  assert.equal(next.mortgageStatus, 'NO_MORTGAGE');
  for (const field of ['currentMortgageBalanceCents', 'originalMortgageBalanceCents', 'interestRateBps', 'remainingTermMonths', 'monthlyPaymentCents', 'secondMortgageBalanceCents', 'mortgageType']) assert.equal(next[field], null, field);
  assert.equal(next.hasPMI, false);
  assert.equal(next.hasSecondMortgage, false);
  assert.equal(next.purchasePriceCents, 40000000, 'the purchase price is not a loan fact');
  assert.ok(diff.some((d) => d.field === 'hasPMI' && d.before === true && d.after === false));
  assert.throws(() => writer.planFinancingProfileChange(current, { mortgageStatus: 'NO_MORTGAGE', interestRateBps: 500 }), (e) => e.code === 'NO_MORTGAGE_WITH_LOAN_FACTS');
});

test('plan: loan facts promote a profile that is not MORTGAGED, are refused over NO_MORTGAGE, and a flag alone does not promote', () => {
  assert.equal(writer.planFinancingProfileChange(null, { interestRateBps: 650 }).next.mortgageStatus, 'MORTGAGED');
  assert.equal(writer.planFinancingProfileChange({ mortgageStatus: 'UNKNOWN' }, { hasPMI: true }).next.mortgageStatus, 'UNKNOWN');
  assert.throws(() => writer.planFinancingProfileChange({ mortgageStatus: 'NO_MORTGAGE' }, { interestRateBps: 650 }), (e) => e.code === 'LOAN_FACTS_OVER_NO_MORTGAGE');
  assert.equal(writer.planFinancingProfileChange({ mortgageStatus: 'NO_MORTGAGE' }, { mortgageStatus: 'MORTGAGED', interestRateBps: 650 }).next.mortgageStatus, 'MORTGAGED');
});

test('plan: a balance above the original is a caution that needs an explicit acknowledgement, not a rejection', () => {
  const current = { mortgageStatus: 'MORTGAGED', originalMortgageBalanceCents: 30000000 };
  assert.throws(() => writer.planFinancingProfileChange(current, { currentMortgageBalanceCents: 31000000 }), (e) => e.code === 'BALANCE_EXCEEDS_ORIGINAL' && e.statusCode === 409 && e.details?.caution === true);
  const ok = writer.planFinancingProfileChange(current, { currentMortgageBalanceCents: 31000000 }, { acknowledgeBalanceExceedsOriginal: true });
  assert.deepEqual(ok.cautions, ['BALANCE_EXCEEDS_ORIGINAL']);
  assert.equal(writer.planFinancingProfileChange(current, { currentMortgageBalanceCents: 29000000 }).cautions.length, 0);
});

test('plan: only changed fields are in the diff, with before and after; an unchanged write has an empty diff', () => {
  const current = { mortgageStatus: 'MORTGAGED', interestRateBps: 650, purchaseDate: new Date('2020-05-01T12:00:00Z') };
  const same = writer.planFinancingProfileChange(current, { interestRateBps: 650, purchaseDate: new Date('2020-05-01T12:00:00Z') });
  assert.deepEqual(same.diff, []);
  const changed = writer.planFinancingProfileChange(current, { interestRateBps: 600 });
  assert.deepEqual(changed.diff, [{ field: 'interestRateBps', before: 650, after: 600 }]);
});

function installPrisma(initial) {
  const state = { profile: initial, logs: [], updates: 0 };
  const saved = prisma.propertyFinancingProfile; const savedLog = prisma.propertyFinancingProfileChange; const savedTx = prisma.$transaction;
  const model = {
    findUnique: async () => state.profile,
    findUniqueOrThrow: async () => state.profile,
    create: async ({ data }) => { state.profile = { id: 'p1', updatedAt: T0, ...data }; return state.profile; },
    updateMany: async ({ where, data }) => {
      if (!state.profile || (where.updatedAt && where.updatedAt.getTime() !== state.profile.updatedAt.getTime())) return { count: 0 };
      state.updates += 1; state.profile = { ...state.profile, ...data, updatedAt: new Date(state.profile.updatedAt.getTime() + 1000) }; return { count: 1 };
    },
  };
  const log = { createMany: async ({ data }) => { state.logs.push(...data); return { count: data.length }; } };
  prisma.propertyFinancingProfile = model; prisma.propertyFinancingProfileChange = log;
  prisma.$transaction = async (fn) => fn({ propertyFinancingProfile: model, propertyFinancingProfileChange: log });
  return { state, restore() { prisma.propertyFinancingProfile = saved; prisma.propertyFinancingProfileChange = savedLog; prisma.$transaction = savedTx; } };
}
const withRole = (role) => {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
};

test('authorization is inside the writer: owner and a stated system actor write; contributor, viewer and an unreasoned system write do not', async () => {
  const w = installPrisma({ id: 'p1', propertyId: 'p', mortgageStatus: 'UNKNOWN', hasPMI: false, hasSecondMortgage: false, updatedAt: T0 });
  try {
    for (const role of ['CONTRIBUTOR', 'VIEWER']) {
      const restore = withRole(role);
      try {
        await assert.rejects(() => writer.updateFinancingProfile({ propertyId: 'p', actor: { kind: 'USER', userId: 'u1' }, surface: 'DESKTOP_ROUTE', changes: { hasPMI: true } }), (e) => e.statusCode === 403 && e.code === 'FINANCING_PROFILE_OWNER_REQUIRED', role);
      } finally { restore(); }
    }
    assert.equal(w.state.updates, 0);
    const owner = withRole('OWNER');
    try {
      const out = await writer.updateFinancingProfile({ propertyId: 'p', actor: { kind: 'USER', userId: 'u1' }, surface: 'DESKTOP_ROUTE', changes: { hasPMI: true } });
      assert.equal(out.profile.hasPMI, true);
    } finally { owner(); }
    await writer.updateFinancingProfile({ propertyId: 'p', actor: { kind: 'SYSTEM', reason: 'nightly lender sync' }, surface: 'SYSTEM', changes: { interestRateBps: 610 } });
    await assert.rejects(() => writer.updateFinancingProfile({ propertyId: 'p', actor: { kind: 'SYSTEM', reason: ' ' }, surface: 'SYSTEM', changes: { interestRateBps: 1 } }), (e) => e.code === 'FINANCING_PROFILE_SYSTEM_REASON_REQUIRED');
    const kinds = w.state.logs.map((l) => `${l.actorKind}:${l.sourceSurface}:${l.fieldKey}`);
    assert.ok(kinds.includes('USER:DESKTOP_ROUTE:hasPMI'));
    assert.ok(kinds.includes('SYSTEM:SYSTEM:interestRateBps'));
    assert.equal(w.state.logs.find((l) => l.actorKind === 'SYSTEM').systemReason, 'nightly lender sync');
    assert.equal(w.state.logs.find((l) => l.fieldKey === 'hasPMI').actorUserId, 'u1');
  } finally { w.restore(); }
});

test('a stale write is refused, the log carries before and after, and a write that changes nothing logs nothing', async () => {
  const w = installPrisma({ id: 'p1', propertyId: 'p', mortgageStatus: 'MORTGAGED', interestRateBps: 650, hasPMI: false, hasSecondMortgage: false, updatedAt: T0 });
  const owner = withRole('OWNER');
  try {
    const actor = { kind: 'USER', userId: 'u1' };
    await assert.rejects(() => writer.updateFinancingProfile({ propertyId: 'p', actor, surface: 'ASK', changes: { interestRateBps: 600 }, expectedUpdatedAt: new Date('2026-08-01') }), (e) => e.code === 'FINANCING_PROFILE_STALE' && e.statusCode === 409);
    assert.equal(w.state.updates, 0);
    await writer.updateFinancingProfile({ propertyId: 'p', actor, surface: 'ASK', changes: { interestRateBps: 600 }, expectedUpdatedAt: T0 });
    const row = w.state.logs.find((l) => l.fieldKey === 'interestRateBps');
    assert.equal(row.beforeValue, 650);
    assert.equal(row.afterValue, 600);
    assert.equal(row.sourceSurface, 'ASK');
    const logged = w.state.logs.length;
    await writer.updateFinancingProfile({ propertyId: 'p', actor, surface: 'ASK', changes: { interestRateBps: 600 } });
    assert.equal(w.state.logs.length, logged, 'an unchanged write logs nothing');
  } finally { owner(); w.restore(); }
});

test('no surface writes the profile around the writer', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../../src');
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'graphify-out') walk(full); continue; }
      if (!/\.ts$/.test(entry.name)) continue;
      const source = fs.readFileSync(full, 'utf8');
      if (/propertyFinancingProfile\.(upsert|update|create)\(/.test(source)) hits.push(path.relative(root, full));
    }
  };
  walk(root);
  // The writer itself. The two capture modules keep their own conditional UPDATEs (the guard is the write) and are the audited exceptions.
  assert.deepEqual(hits.sort(), ['services/financingProfile/financingProfileWriter.ts']);
});

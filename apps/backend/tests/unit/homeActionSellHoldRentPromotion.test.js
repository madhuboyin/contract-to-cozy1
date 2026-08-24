const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

// Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
// delivery step 7 — the Home Action producer for the persisted
// SellHoldRentAnalysis (sellHoldRent.service.ts now saves one on every
// canonical, non-scenario estimate).

const {
  loadSellHoldRentActions,
} = require('../../src/services/homeActionSourcePromotion.service.ts');

const COMPUTED_AT = new Date('2026-08-01T00:00:00.000Z');

function dbWithAnalysis(overrides = {}) {
  const analysis = {
    id: 'analysis-1',
    propertyId: 'property-1',
    years: 5,
    winner: 'RENT',
    confidence: 'HIGH',
    homeValueNowCents: 450_000_00,
    netSellCents: 40_000_00,
    netHoldCents: 55_000_00,
    netRentCents: 72_000_00,
    rationale: ['Rent wins when rental net cashflow plus equity growth outweighs costs and overhead.'],
    drivers: [],
    computedAt: COMPUTED_AT,
    ...overrides,
  };
  return {
    sellHoldRentAnalysis: {
      findFirst: async () => analysis,
    },
  };
}

test('no persisted analysis yields no action', async () => {
  const db = { sellHoldRentAnalysis: { findFirst: async () => null } };
  const actions = await loadSellHoldRentActions('property-1', db);
  assert.deepEqual(actions, []);
});

test('a missing db.sellHoldRentAnalysis delegate (older test fixtures) is a safe no-op', async () => {
  const actions = await loadSellHoldRentActions('property-1', {});
  assert.deepEqual(actions, []);
});

test('a persisted analysis promotes to a material Home Action with the winning option recommended', async () => {
  const db = dbWithAnalysis();
  const [action] = await loadSellHoldRentActions('property-1', db);
  assert.ok(action, 'expected exactly one action');
  assert.equal(action.lineageId, 'sell-hold-rent:property-1');
  assert.equal(action.id, 'sell-hold-rent:analysis-1');
  assert.equal(action.source.kind, 'SYSTEM');
  assert.equal(action.governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.equal(action.job, 'MAJOR_MOMENT');

  const rentOption = action.options.find((option) => option.id === 'rent');
  const sellOption = action.options.find((option) => option.id === 'sell');
  assert.equal(rentOption.recommended, true);
  assert.equal(sellOption.recommended, false);
  assert.equal(action.options.length, 3);
  assert.ok(action.tradeoffs.length > 0);
  assert.ok(action.assumptions.length > 0);
});

test('a different winner shifts which option is recommended', async () => {
  const db = dbWithAnalysis({ winner: 'SELL', id: 'analysis-2' });
  const [action] = await loadSellHoldRentActions('property-1', db);
  const sellOption = action.options.find((option) => option.id === 'sell');
  const holdOption = action.options.find((option) => option.id === 'hold');
  assert.equal(sellOption.recommended, true);
  assert.equal(holdOption.recommended, false);
});

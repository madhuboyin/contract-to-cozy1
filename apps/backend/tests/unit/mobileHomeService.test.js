// apps/backend/tests/unit/mobileHomeService.test.js
//
// PWA audit remediation B3: GET /api/mobile/home consolidates the "urgent
// actions" list server-side so a second client (native iOS, wrapped PWA) does
// not re-implement apps/frontend/src/lib/dashboard/urgentActions.ts.
// This covers consolidateUrgentActions() — the port of that frontend logic.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ incidents = [], policies = [], overdueTasks = [], inventoryItems = [] } = {}) {
  const prismaMock = {
    incident: { findMany: async () => incidents },
    insurancePolicy: { findMany: async () => policies },
    propertyMaintenanceTask: { findMany: async () => overdueTasks },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath, filename: prismaPath, loaded: true,
    exports: { prisma: prismaMock },
  };

  const inventoryPath = require.resolve('../../src/services/inventory.service.ts');
  require.cache[inventoryPath] = {
    id: inventoryPath, filename: inventoryPath, loaded: true,
    exports: { InventoryService: class { async listItems() { return inventoryItems; } } },
  };

  // property.service pulls in heavy modules; only getUserProperties matters and
  // it is not exercised by consolidateUrgentActions.
  const propertyPath = require.resolve('../../src/services/property.service.ts');
  require.cache[propertyPath] = {
    id: propertyPath, filename: propertyPath, loaded: true,
    exports: { getUserProperties: async () => [] },
  };
  const onboardingPath = require.resolve('../../src/services/propertyOnboarding.service.ts');
  require.cache[onboardingPath] = {
    id: onboardingPath, filename: onboardingPath, loaded: true,
    exports: { computeSetupStatus: async () => ({}) },
  };
  const narrativePath = require.resolve('../../src/services/narrativeRun.service.ts');
  require.cache[narrativePath] = {
    id: narrativePath, filename: narrativePath, loaded: true,
    exports: { getOrCreateActiveNarrativeRun: async () => null },
  };

  delete require.cache[require.resolve('../../src/services/mobileHome.service.ts')];
  return require('../../src/services/mobileHome.service.ts');
}

const NOW = new Date('2026-06-01T12:00:00Z');
const daysFromNow = (n) => new Date(NOW.getTime() + n * 86_400_000);

function property(overrides = {}) {
  return { id: 'prop-1', warranties: [], healthScore: { insights: [] }, ...overrides };
}

test('incidents become INCIDENT actions and sort first', async () => {
  const { consolidateUrgentActions } = loadService({
    incidents: [{ id: 'inc-1', title: 'Roof leak', summary: 'Water in attic', severity: 'CRITICAL' }],
    overdueTasks: [{ id: 't-1', title: 'Change filter', description: null, nextDueDate: daysFromNow(-10) }],
  });

  const { actions } = await consolidateUrgentActions(property(), NOW);

  assert.equal(actions[0].type, 'INCIDENT');
  assert.equal(actions[0].id, 'inc-1');
  assert.equal(actions[0].severity, 'CRITICAL');
  assert.ok(actions.some((a) => a.type === 'MAINTENANCE_OVERDUE'));
});

test('health-score insights dedupe by factor, keeping the most severe status', async () => {
  const { consolidateUrgentActions } = loadService();
  const p = property({
    healthScore: {
      insights: [
        { factor: 'Roof Factor', status: 'Needs Review', score: 2 },
        { factor: 'Roof Factor', status: 'Needs attention', score: 1 },
        { factor: 'Systems Factor', status: 'Good', score: 9 }, // not critical -> skipped
      ],
    },
  });

  const { actions } = await consolidateUrgentActions(p, NOW);
  const insightActions = actions.filter((a) => a.type === 'HEALTH_INSIGHT');

  assert.equal(insightActions.length, 1);
  assert.equal(insightActions[0].title, 'Roof Factor');
  assert.equal(insightActions[0].status, 'Needs attention'); // rank 0 beats "Needs Review"
  assert.equal(insightActions[0].id, 'prop-1-INSIGHT-roof-factor');
});

test('renewals split into EXPIRED vs UPCOMING within the 90-day window', async () => {
  const { consolidateUrgentActions } = loadService({
    policies: [
      { id: 'pol-expired', carrierName: 'Acme', expiryDate: daysFromNow(-5) },
      { id: 'pol-soon', carrierName: 'Globex', expiryDate: daysFromNow(30) },
      { id: 'pol-far', carrierName: 'Initech', expiryDate: daysFromNow(200) }, // outside window
    ],
  });
  const p = property({ warranties: [{ id: 'war-1', providerName: 'HomeShield', expiryDate: daysFromNow(10) }] });

  const { actions } = await consolidateUrgentActions(p, NOW);
  const byId = Object.fromEntries(actions.map((a) => [a.id, a]));

  assert.equal(byId['pol-expired'].type, 'RENEWAL_EXPIRED');
  assert.equal(byId['pol-expired'].entityType, 'Insurance');
  assert.equal(byId['pol-soon'].type, 'RENEWAL_UPCOMING');
  assert.equal(byId['war-1'].type, 'RENEWAL_UPCOMING');
  assert.equal(byId['war-1'].entityType, 'Warranty');
  assert.equal(byId['pol-far'], undefined);
});

test('coverage gaps respect the replacement-cost threshold', async () => {
  const { consolidateUrgentActions } = loadService({
    inventoryItems: [
      { id: 'inv-lo', name: 'Microwave', category: 'APPLIANCE', coverageState: 'MISSING', coverageActionable: true, effectiveReplacementCostCents: 20000 }, // below 25000
      { id: 'inv-hi', name: 'Furnace', category: 'HVAC', coverageState: 'MISSING', coverageActionable: true, effectiveReplacementCostCents: 80000, coverageStateDetail: 'No coverage linked.' },
      { id: 'inv-ok', name: 'Fridge', category: 'APPLIANCE', coverageState: 'CONFIRMED', coverageActionable: false, effectiveReplacementCostCents: 90000 },
    ],
  });

  const { actions, coverageGaps } = await consolidateUrgentActions(property(), NOW);
  const gapActions = actions.filter((a) => a.type === 'COVERAGE_GAP');

  assert.equal(coverageGaps, 1);
  assert.equal(gapActions.length, 1);
  assert.equal(gapActions[0].itemId, 'inv-hi');
  assert.ok(gapActions[0].href.includes('/inventory/items/inv-hi/coverage'));
});

test('empty inputs produce no actions and zero counts', async () => {
  const { consolidateUrgentActions } = loadService();
  const { actions, overdueMaintenance, coverageGaps } = await consolidateUrgentActions(property(), NOW);
  assert.deepEqual(actions, []);
  assert.equal(overdueMaintenance, 0);
  assert.equal(coverageGaps, 0);
});

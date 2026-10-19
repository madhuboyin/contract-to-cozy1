const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { HomeEventsService } = require('../../src/services/homeEvents.service.ts');

const row = (n, overrides = {}) => ({
  id: `evt-${String(n).padStart(3, '0')}`, propertyId: 'p1', createdById: 'u1', type: 'REPAIR', subtype: null, importance: 'NORMAL', visibility: 'HOUSEHOLD',
  occurredAt: new Date(Date.UTC(2026, 5, 1) - n * 86_400_000), datePrecision: 'EXACT_DATE', dateRangeStart: null, dateRangeEnd: null, title: `Event ${n}`, summary: null,
  providerName: null, verificationStatus: 'UNVERIFIED', documents: [], inventoryItem: null, ...overrides,
});

function install(rows, appliances = []) {
  const calls = { events: [], inventory: [] };
  prisma.homeEvent = { findMany: async (args) => { calls.events.push(args); return rows; } };
  prisma.inventoryItem = { findMany: async (args) => { calls.inventory.push(args); return appliances; } };
  return calls;
}

test('every current event is returned with no limit, no evidence graph, and newest first', async () => {
  const rows = Array.from({ length: 450 }, (_, index) => row(index + 1));
  const calls = install(rows);
  const events = await new HomeEventsService().listAllCurrentEvents('p1');
  assert.equal(events.length, 450);
  assert.deepEqual(events.map((event) => event.id), rows.map((event) => event.id));
  const query = calls.events[0];
  assert.deepEqual(query.where, { propertyId: 'p1', isCurrent: true, deletedAt: null });
  assert.equal('take' in query, false);
  assert.equal('include' in query, false);
  assert.equal(Boolean(query.select.evidence || query.select.verificationRecords), false);
  assert.equal(events.some((event) => 'inventoryItem' in event), false);
});

test('duplicate purchase entries collapse exactly as the Timeline page does, and a missing appliance purchase is projected once', async () => {
  const rows = [
    row(1, { type: 'PURCHASE', title: 'Purchased: Dishwasher', occurredAt: new Date('2025-01-10T00:00:00Z') }),
    row(2, { type: 'PURCHASE', title: 'Purchased Dishwasher', occurredAt: new Date('2025-01-12T00:00:00Z'), documents: [{ id: 'd1' }] }),
    row(3, { type: 'REPAIR' }),
  ];
  install(rows, [{ id: 'inv-1', name: 'Refrigerator', sourceHash: 'property_appliance::REFRIGERATOR', installedOn: null, purchasedOn: new Date('2024-02-01T00:00:00Z'), createdAt: new Date('2024-02-02T00:00:00Z') }]);
  const result = await new HomeEventsService().listAllCurrentEvents('p1');
  const purchases = result.filter((event) => event.type === 'PURCHASE');
  const dishwasher = purchases.filter((event) => /dishwasher/i.test(event.title));
  assert.equal(dishwasher.length, 1, 'duplicate dishwasher purchases collapse to one');
  assert.match(dishwasher[0].summary ?? '', /Consolidated 2 similar purchase entries/);
  const synthetic = result.filter((event) => String(event.id).startsWith('synthetic-appliance-'));
  assert.deepEqual(synthetic.map((event) => event.title), ['Purchased: Refrigerator']);
  const times = result.map((event) => new Date(event.occurredAt).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

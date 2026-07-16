const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const calls = [];
const prismaMock = {
  propertyFactEvidence: {
    findMany: async (args) => { calls.push(['evidence', args]); return []; },
  },
  property: {
    findUnique: async (args) => {
      calls.push(['property', args]);
      if (args.select.roofType) {
        return {
          roofType: 'SHINGLE',
          roofReplacementYear: 2016,
          foundationType: 'UNKNOWN',
          sidingType: 'BRICK',
          electricalPanelAge: 12,
        };
      }
      return {
        homeownerProfile: { segment: 'EXISTING_OWNER' },
        onboarding: { status: 'IN_PROGRESS', currentStep: 3, setupScore: 60 },
      };
    },
  },
  inventoryRoom: {
    findMany: async (args) => {
      calls.push(['rooms', args]);
      return [{
        id: 'room-1', name: 'Kitchen', type: 'KITCHEN', floorLevel: 1, sortOrder: 0,
        updatedAt: new Date('2026-07-10T10:00:00.000Z'),
      }];
    },
  },
  inventoryItem: {
    findMany: async (args) => {
      calls.push(['inventory', args]);
      return [{
        id: 'item-1', roomId: 'room-1', name: 'Furnace', category: 'HVAC', condition: 'GOOD',
        manufacturer: 'Example', modelNumber: 'A1', serialNumber: null,
        installedOn: new Date('2020-01-01T00:00:00.000Z'), purchasedOn: null,
        lastServicedOn: null, expectedExpiryDate: null, replacementCostCents: 500000,
        currency: 'USD', isVerified: true, verificationSource: 'MANUAL',
        updatedAt: new Date('2026-07-11T10:00:00.000Z'),
      }];
    },
  },
  householdMember: {
    findUnique: async (args) => { calls.push(['member', args]); return { role: 'CONTRIBUTOR' }; },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const {
  structureAssembler,
  roomsAssembler,
  inventoryAssembler,
  productContextAssembler,
} = require('../../src/modules/propertyContext/infrastructure/prismaAssemblers.ts');
const { getPropertyContext } = require('../../src/modules/propertyContext/application/getPropertyContext.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

function byKey(facts) {
  return Object.fromEntries(facts.map((fact) => [fact.key, fact]));
}

test('STRUCTURE derives roof age and treats UNKNOWN enum values as unknown facts', async () => {
  const facts = byKey(await structureAssembler.assemble('property-1', NOW));
  assert.equal(facts['structure.roofAgeYears'].value, 10);
  assert.equal(facts['structure.roofAgeYears'].source, 'SYSTEM_DERIVED');
  assert.equal(facts['structure.foundationType'].state, 'UNKNOWN');
  assert.equal(facts['structure.foundationType'].value, null);
});

test('derived STRUCTURE facts keep the context version stable within the same year', async () => {
  const makeDependencies = (now) => ({
    authorize: async () => true,
    assemblers: [structureAssembler],
    now: () => now,
  });
  const first = await getPropertyContext(
    'property-1', { userId: 'user-1' }, { scopes: ['STRUCTURE'] },
    makeDependencies(new Date('2026-02-01T00:00:00.000Z')),
  );
  const second = await getPropertyContext(
    'property-1', { userId: 'user-1' }, { scopes: ['STRUCTURE'] },
    makeDependencies(new Date('2026-11-01T00:00:00.000Z')),
  );
  assert.equal(first.contextVersion, second.contextVersion);
});

test('ROOMS and INVENTORY use narrow canonical projections and serialize dates', async () => {
  const rooms = byKey(await roomsAssembler.assemble('property-1', NOW));
  const inventory = byKey(await inventoryAssembler.assemble('property-1', NOW));
  assert.equal(rooms['rooms.list'].value[0].updatedAt, '2026-07-10T10:00:00.000Z');
  assert.equal(inventory['inventory.items'].value[0].installedOn, '2020-01-01T00:00:00.000Z');
  assert.equal(inventory['inventory.items'].value[0].serialNumber, null);
  const inventoryCall = calls.find(([name]) => name === 'inventory');
  assert.equal(inventoryCall[1].select.technicalSpecs, undefined);
  assert.equal(inventoryCall[1].select.notes, undefined);
});

test('PRODUCT_CONTEXT keeps permissions and product state separate from physical facts', async () => {
  const facts = byKey(await productContextAssembler.assemble(
    'property-1',
    NOW,
    { userId: 'user-1' },
  ));
  assert.equal(facts['product.homeownerSegment'].value, 'EXISTING_OWNER');
  assert.equal(facts['product.canViewFacts'].value, true);
  assert.equal(facts['product.canCorrectFacts'].value, true);
  assert.ok(calls.some(([name]) => name === 'member'));
});

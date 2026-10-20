const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home record writes batch of the handler sweep (docs/product/ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md): Ask links to no desktop
// Household, Timeline, Warranties or Rooms page (owner decision, 2026-10-10), so the add, correct and invitation answers carry no page
// action or row link. The real handler functions run against a permissive fake prisma and a stubbed property-access lookup.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const writes = require('../../src/services/ask/handlers/homeRecordWrites.handler.ts');

const originals = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess };
let role;
const empty = () => new Proxy({}, { get: (_t, method) => (method === 'then' ? undefined : async () => (String(method).startsWith('find') && method !== 'findUnique' && method !== 'findFirst' ? [] : null)) });

test.beforeEach(() => {
  role = 'CONTRIBUTOR';
  prismaModule.prisma = new Proxy({}, { get: (_t, model) => (model === 'then' ? undefined : empty()) });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
});
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  propertyAccess.resolvePropertyAccess = originals.access;
});

const noPageLinks = (result, label) => {
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false, label);
  for (const block of result.blocks) {
    for (const action of block.actions ?? []) assert.equal(action.href, undefined, `${label} ${block.id} ${action.id}`);
    for (const section of block.sections ?? []) for (const item of section.items) assert.ok(item.href == null, `${label} ${item.id}`);
  }
};

test('a viewer adding a warranty or a timeline event is told who can, and is offered no page', async () => {
  role = 'VIEWER';
  for (const [label, result] of [['warranty', await writes.warrantyAddResult('u1', 'p1', null)], ['event', await writes.eventAddResult('u1', 'p1', null)]]) {
    assert.equal(result.reasonCode, 'ASK_PERMISSION_REQUIRED', label);
    assert.deepEqual(result.blocks[0].actions, [], label);
    noPageLinks(result, label);
  }
});

test('the add-a-warranty and add-an-event forms carry no "open the page instead" action', async () => {
  for (const [label, result] of [['warranty', await writes.warrantyAddResult('u1', 'p1', null)], ['event', await writes.eventAddResult('u1', 'p1', null)]]) {
    assert.notEqual(result.reasonCode, 'ASK_PERMISSION_REQUIRED', label);
    noPageLinks(result, label);
    assert.equal(/instead/i.test(JSON.stringify(result.blocks.map((block) => block.actions))), false, label);
  }
});

test('a household invitation needs an owner, says so, and links nowhere', async () => {
  for (const nonOwner of ['CONTRIBUTOR', 'VIEWER']) {
    role = nonOwner;
    const result = await writes.householdInvitationResult('u1', 'p1', 'Invite my sister to this home');
    assert.equal(result.reasonCode, 'ASK_PERMISSION_REQUIRED', nonOwner);
    assert.deepEqual(result.blocks[0].actions, [], nonOwner);
    noPageLinks(result, nonOwner);
  }
});

test('the unavailable-record copy tells the user to show the timeline or inventory in Ask, not to open a page', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/homeRecordWrites.handler.ts'), 'utf8');
  assert.equal(/Open the home timeline|Open the home inventory/.test(source), false);
  assert.match(source, /Show your home timeline to find it\./);
  assert.match(source, /Show your home inventory to find it\./);
});

test('correcting a warranty, a timeline event or a room with no target shows plain rows and no page action', async () => {
  for (const [operationId, message] of [
    ['WARRANTY_UPDATE', 'Correct the provider of this warranty.'],
    ['HOME_EVENT_CORRECT', 'Correct the date of this timeline event.'],
    ['HOME_EVENT_VISIBILITY', 'Change who can see this timeline event.'],
    ['ROOM_RENAME', 'Rename this room.'],
  ]) {
    const result = await capabilityInvoke(operationId, { userId: 'u1', propertyId: 'p1', message });
    noPageLinks(result, operationId);
  }
});

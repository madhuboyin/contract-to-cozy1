const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { EACH_ROOM_PATTERN, NO_ROOM_TITLE, groupRowsByRoom } = require('../../src/services/ask/support/inventoryRoomGrouping.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence: attachEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1' }).operation.operationId;

// Review screenshots (2026-11-07): "give me the room details and item details in each room", "how many items are there in my master bed room",
// "how many bedrooms do i have" and "what is the color of bedroom" all matched no operation. The data is in Ask already: inventory items carry a
// room, the Property Summary reads the bedroom/bathroom/size/year facts, and Material Specs holds paint colours.

test('questions about the items in a room, or in each room, reach the inventory answer', () => {
  for (const message of [
    'give me the room details and item details in each room',
    'what rooms do I have and what is in each one',
    'list everything in my kitchen',
    'what appliances are in the master bedroom',
    'how many items are there in my master bed room',
    'how many items are in my kitchen',
    'what is in the garage',
  ]) assert.equal(route(message), 'INVENTORY_LOOKUP', message);
});

test('questions about the home’s own recorded facts reach the property summary', () => {
  for (const message of [
    'how many bedrooms do i have', 'how many bathrooms are there', 'what is the square footage of my home',
    'what year was my house built', 'how old is my house', 'what is the lot size', 'how many stories does my house have',
  ]) assert.equal(route(message), 'PROPERTY_SUMMARY', message);
});

test('the colour of a room reaches Material Specs', () => {
  for (const message of ['what is the color of bedroom', 'what color is the living room', 'what is the paint color in the kitchen']) {
    assert.equal(route(message), 'MATERIAL_SPECS_LIST', message);
  }
  assert.notEqual(route('what color should I paint the bedroom'), 'MATERIAL_SPECS_LIST', 'advice is not a lookup of a recorded colour');
});

test('an appliance’s model, brand, purchase date and age reach the inventory answer', () => {
  for (const message of [
    'what is the model number of my dishwasher', 'when did i buy my fridge', 'how old is my water heater',
    'what brand is my washer', 'what is the serial number of my dryer', 'when did we install the furnace',
  ]) assert.equal(route(message), 'INVENTORY_LOOKUP', message);
  assert.equal(route('how old is my fridge'), 'REPLACEMENT_GUIDANCE', 'the existing fridge-age route is unchanged');
});

test('neighbouring requests are not pulled into these routes', () => {
  assert.equal(route('add a microwave to the kitchen'), 'INVENTORY_ITEM_CREATE');
  assert.equal(route('what maintenance is due in the kitchen'), 'MAINTENANCE_STATUS');
  assert.equal(route('what plants are good for the bedroom'), 'ROOM_PLANT_RECOMMENDATIONS');
  assert.equal(route('how many rooms are in my house'), 'PROPERTY_SUMMARY');
  assert.equal(route('show me my home inventory'), 'INVENTORY_LOOKUP');
  assert.notEqual(route('price per square foot in my area'), 'PROPERTY_SUMMARY');
  assert.notEqual(route('change the model number of my dishwasher'), 'INVENTORY_LOOKUP', 'a correction is never a lookup');
});

test('the room-by-room phrasing is recognised, and only that phrasing', () => {
  for (const message of ['item details in each room', 'every room', 'room by room', 'items by room', 'what rooms do I have and what is in each one']) {
    assert.ok(EACH_ROOM_PATTERN.test(message), message);
  }
  for (const message of ['list everything in my kitchen', 'show my rooms', 'how many bedrooms do i have']) assert.ok(!EACH_ROOM_PATTERN.test(message), message);
});

test('rows group by room: rooms alphabetical, unassigned last, counts and ids stable', () => {
  const rows = [
    { id: 'a', room: 'Kitchen' }, { id: 'b', room: null }, { id: 'c', room: 'Garage' }, { id: 'd', room: 'Kitchen' }, { id: 'e', room: '  ' },
  ];
  const groups = groupRowsByRoom(rows, (row) => row.room);
  assert.deepEqual(groups.map((group) => [group.title, group.count]), [['Garage', 1], ['Kitchen', 2], [NO_ROOM_TITLE, 2]]);
  assert.deepEqual(groups.map((group) => group.id), ['room-garage', 'room-kitchen', 'room-no-room-assigned']);
  assert.deepEqual(groups[1].items.map((row) => row.id), ['a', 'd']);
  assert.deepEqual(groupRowsByRoom([], () => null), []);
});

test('a room-grouped inventory answer passes the answer-trust pipeline for the original question', () => {
  const question = 'give me the room details and item details in each room';
  const row = (id, title, room) => ({ id, title, entityType: 'INVENTORY_ITEM', actions: [], description: null, meta: [room, 'Samsung', 'Purchased Oct 11, 2025'], status: 'FAIR', href: null });
  const sections = groupRowsByRoom([row('1', 'Microwave', 'Kitchen'), row('2', 'Dishwasher', 'Kitchen'), row('3', 'Bed frame', 'Master bedroom')], (item) => item.meta[0]);
  const result = attachEvidence({
    status: 'ANSWERED',
    blocks: [
      { type: 'SUMMARY', id: 'inventory-summary', title: '3 inventory records match this request', body: 'All matching records are shown. Each row reflects the canonical inventory record.', tone: 'DEFAULT', actions: [] },
      { type: 'GROUPED_LIST', id: 'inventory-results', title: 'Inventory details', description: 'Grouped by the room each item is recorded in.', filters: [], sections, actions: [] },
    ],
    suggestions: [],
  }, [completedAskAuthoritativeSourceEvidence('INVENTORY_LOOKUP')]);
  const validation = validateAskAnswerTrustPipeline({ question, operationId: 'INVENTORY_LOOKUP', result, semanticEnabled: true, propertyId: 'p1' });
  assert.equal(validation.result.status, 'ANSWERED', JSON.stringify(validation.trust.reasonCodes));
  assert.deepEqual(validation.result.blocks[1].sections.map((section) => section.title), ['Kitchen', 'Master bedroom']);
});

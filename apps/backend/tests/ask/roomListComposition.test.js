const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { parseDeterministicSemanticRequest } = require('../../src/services/ask/semantic/deterministicSemanticParser.ts');
const { executeSemanticSlice } = require('../../src/services/ask/semantic/slice/sliceExecutor.ts');
const { SLICE_SEEDED_PROPERTY_SNAPSHOT: SEEDED, SLICE_OWNER_AUTH } = require('../../src/services/ask/semantic/slice/index.ts');

// Live prompt #15 ("... missing receipts in the kitchen or laundry room") asked a "neither/either" question about two rooms. Fixing that exposed that a room list
// combined with another condition was joined with OR (so "has a warranty in the kitchen or basement" returned every item) and that "no warranty in the kitchen"
// negated the room. A room list is one inclusive group of places, ANDed with the other conditions.
//
// Seeded home: Refrigerator (kitchen, warranty linked), Dishwasher (kitchen, explicitly none), Furnace (basement, unknown), Water Heater (basement, warranty linked),
// Sump Pump (basement, conflicting links). Unknown and conflicting warranty states are never counted as "has" or "has no" a warranty.
const ask = (rawText, snapshot = SEEDED) => {
  const result = executeSemanticSlice({ rawText, snapshot, auth: SLICE_OWNER_AUTH });
  return { result, names: result.activeEntityIds.map((id) => snapshot.items.find((item) => item.id === id).name).sort() };
};

test('a room list is one inclusive group, ANDed with the warranty condition', () => {
  assert.deepEqual(ask('which appliances have no warranty in the kitchen').names, ['Dishwasher'], 'the negation belongs to the warranty, not the room');
  assert.deepEqual(ask('which appliances have a warranty in the kitchen').names, ['Refrigerator']);
  assert.deepEqual(ask('which appliances have a warranty in the kitchen or basement').names, ['Refrigerator', 'Water Heater'], 'not every item');
  assert.deepEqual(ask('which appliances have no warranty in the kitchen or basement').names, ['Dishwasher']);
});

test('"and" between rooms is a list too, not two rooms at once', () => {
  assert.deepEqual(ask('which appliances have a warranty in the kitchen and basement').names, ['Refrigerator', 'Water Heater']);
});

test('a room is negated only when it is the only condition; an "or" between conditions still coordinates them', () => {
  assert.deepEqual(ask('which appliances are not in the kitchen').names, ['Furnace', 'Sump Pump', 'Water Heater']);
  assert.deepEqual(ask('which appliances have a warranty or are in the kitchen').names, ['Dishwasher', 'Refrigerator', 'Water Heater']);
});

test('"neither a warranty nor in …" excludes both the warranty and every listed room', () => {
  const garage = { id: 'room-garage', propertyId: SEEDED.propertyId, name: 'Garage' };
  const item = (id, name, roomId, warrantyIds = []) => ({ id, propertyId: SEEDED.propertyId, name, category: 'APPLIANCE', installedOn: '2024-01-01', roomId, propertyPlanWarrantyId: null, itemWarrantyIds: warrantyIds, coverageEvidenceStatus: warrantyIds.length ? 'VERIFIED' : 'NONE', condition: 'GOOD_CONDITION' });
  const snapshot = { ...SEEDED, rooms: [...SEEDED.rooms, garage], items: [item('i1', 'Kitchen bare', 'room-kitchen'), item('i2', 'Garage bare', 'room-garage'), item('i3', 'Garage warranted', 'room-garage', ['w']), item('i4', 'Basement bare', 'room-basement')], maintenanceTasks: [] };
  assert.deepEqual(ask('which appliances have neither a warranty nor are in the kitchen or basement', snapshot).names, ['Garage bare']);
});

test('an age condition combines with a room list the same way', () => {
  assert.deepEqual(ask('which appliances are older than 10 years in the kitchen or basement').names, ['Furnace']);
});

test('the condition is stated in words, rooms as one phrase', () => {
  const body = ask('which appliances have no warranty in the kitchen or basement').result.operationResult.blocks.find((b) => b.type === 'SUMMARY').body;
  assert.match(body, /^Matching: no warranty linked in your home record and in Kitchen or Basement\./);
});

test('the real ambiguity is still asked: an "or" between conditions after a negation', () => {
  assert.equal(parseDeterministicSemanticRequest('which appliances have no warranty or due maintenance').outcome, 'BOUNDARY');
});

test('missing receipts compose with an inclusive room list (live prompt #15)', () => {
  const rooms = [{ kind: 'ROOM', entityId: 'entity.room', recordId: 'r1', names: ['Kitchen'], authorized: true }, { kind: 'ROOM', entityId: 'entity.room', recordId: 'r2', names: ['Laundry Room'], authorized: true }];
  const plan = parseDeterministicSemanticRequest('show items with missing receipts in the kitchen or laundry room', { dynamicEntities: rooms });
  assert.equal(plan.outcome, 'MATCH');
  assert.deepEqual(plan.unresolvedSpans, []);
  const receipt = plan.facets[0].where.operands.find((operand) => operand.kind === 'PREDICATE' && /receipt/.test(operand.predicateId));
  assert.equal(receipt.predicateId, 'predicate.inventory_item.has_no_receipt_record');
  assert.equal(parseDeterministicSemanticRequest('which appliances have no warranty or sparkly widgets').outcome, 'NONE_FITS');
});

test('missing receipts are filtered before the kitchen-or-laundry room group is applied', () => {
  const laundry = { id: 'room-laundry', propertyId: SEEDED.propertyId, name: 'Laundry Room' };
  const items = SEEDED.items.map((item) => ({ ...item, receiptDocumentId: item.name === 'Refrigerator' ? 'receipt-1' : null }));
  const snapshot = { ...SEEDED, rooms: [...SEEDED.rooms, laundry], items };
  assert.deepEqual(ask('show items with missing receipts in the kitchen or laundry room', snapshot).names, ['Dishwasher']);
});

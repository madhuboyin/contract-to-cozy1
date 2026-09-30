const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { inferMajorApplianceType, majorApplianceTypeFromSourceHash, MAJOR_APPLIANCE_TYPES } = require('../../src/services/majorAppliance.util.ts');

// Name -> major appliance type inference (FRD v1.177). The first matching type wins, so order matters.

test('range hoods and over-the-range microwaves are hood/microwave units, not ovens (the range pattern used to win)', () => {
  for (const name of ['Range hood', 'Kitchen range hood', 'Vent hood', 'Exhaust hood', 'Over-the-range microwave', 'Over the range microwave', 'Microwave', 'Microwave oven', 'GE Micro wave']) {
    assert.equal(inferMajorApplianceType(name), 'MICROWAVE_HOOD', name);
  }
});

test('ovens, ranges, stoves and cooktops are still ovens/ranges', () => {
  for (const name of ['Oven', 'Wall oven', 'Double oven', 'Range', 'Gas range', 'Electric range', 'Stove', 'Cooktop', 'Cook top', 'Induction cooktop']) {
    assert.equal(inferMajorApplianceType(name), 'OVEN_RANGE', name);
  }
});

test('the other types are unchanged, including the dishwasher-before-washer rule', () => {
  assert.equal(inferMajorApplianceType('Dishwasher'), 'DISHWASHER');
  assert.equal(inferMajorApplianceType('Dish washer'), 'DISHWASHER');
  assert.equal(inferMajorApplianceType('Bosch dishwasher'), 'DISHWASHER', '"dishwasher" contains "washer" but must not become a washer');
  for (const name of ['Washer', 'Dryer', 'Washing machine', 'Laundry set']) assert.equal(inferMajorApplianceType(name), 'WASHER_DRYER', name);
  for (const name of ['Refrigerator', 'Fridge', 'Side-by-side refrigerator']) assert.equal(inferMajorApplianceType(name), 'REFRIGERATOR', name);
  for (const name of ['Water softener', 'Softener', 'Water conditioner']) assert.equal(inferMajorApplianceType(name), 'WATER_SOFTENER', name);
});

test('names that carry no type keyword classify as nothing', () => {
  for (const name of ['KitchenAid KDTM404', 'Garbage disposal', 'Ice maker', 'Water heater', 'Furnace', '', '   ', null, undefined]) {
    assert.equal(inferMajorApplianceType(name), null, String(name));
  }
});

test('every declared type is reachable by some name, so no pattern is dead behind another', () => {
  const reached = new Set(['Dishwasher', 'Refrigerator', 'Range hood', 'Oven', 'Washer', 'Water softener'].map(inferMajorApplianceType));
  assert.deepEqual([...reached].sort(), [...MAJOR_APPLIANCE_TYPES].sort());
});

test('the source hash round-trips to a declared type only', () => {
  assert.equal(majorApplianceTypeFromSourceHash('property_appliance::MICROWAVE_HOOD'), 'MICROWAVE_HOOD');
  assert.equal(majorApplianceTypeFromSourceHash('property_appliance::microwave_hood'), 'MICROWAVE_HOOD');
  assert.equal(majorApplianceTypeFromSourceHash('property_appliance::FRIDGE'), null, 'not a declared type');
  assert.equal(majorApplianceTypeFromSourceHash('other::DISHWASHER'), null);
  assert.equal(majorApplianceTypeFromSourceHash(null), null);
});

// CURRENT BEHAVIOUR, NOT ENDORSED. Each of these groups is one type, and duplicate prevention allows one classified item
// per type per home, so a home with a separate washer and dryer (or a fridge and a chest freezer) cannot classify both
// (the second gets "already exists"). Whether these should be separate types is an open product decision. If it is
// changed, update this test deliberately rather than working around it.
test('OPEN DECISION (pinned, not endorsed): washer+dryer share one type and refrigerator+freezer share one type', () => {
  assert.equal(inferMajorApplianceType('Washer'), inferMajorApplianceType('Dryer'));
  for (const name of ['Freezer', 'Chest freezer', 'Basement freezer']) assert.equal(inferMajorApplianceType(name), 'REFRIGERATOR', name);
});

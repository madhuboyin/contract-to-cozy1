const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
const { capitalBundle, servicePriceCategoryForCapital } = require('../../src/services/ask/support/capitalBundle.ts');
const { capitalTimelineBlock } = require('../../src/services/ask/askOrchestrator.service.ts');

const item = (id, year, priority = 'HIGH', category = 'HVAC', min = 100000, max = 300000) => ({
  id, category, priority, windowStart: new Date(`${year}-06-15T12:00:00.000Z`), windowEnd: new Date(`${year + 1}-06-15T12:00:00.000Z`), confidence: 'MEDIUM', estimatedCostMinCents: min, estimatedCostMaxCents: max, inventoryItem: { name: id },
});

test('the largest two-year cluster of high or medium items is the bundle, with its midpoint cost', () => {
  const bundle = capitalBundle([item('a', 2027), item('b', 2028), item('c', 2029), item('far', 2035), item('low', 2027, 'LOW')]);
  assert.deepEqual(bundle.group.map((i) => i.id), ['a', 'b', 'c']);
  assert.equal(bundle.midCents, 600000);
  assert.equal(bundle.yearRange, '2027–2029');
});

test('fewer than two qualifying items in reach is no bundle', () => {
  assert.equal(capitalBundle([item('a', 2027), item('b', 2035)]), null);
  assert.equal(capitalBundle([item('a', 2027), item('b', 2027, 'LOW')]), null);
});

test('the radar category follows the page mapping', () => {
  assert.equal(servicePriceCategoryForCapital('ROOF'), 'ROOFING');
  assert.equal(servicePriceCategoryForCapital('EXTERIOR'), 'ROOFING');
  assert.equal(servicePriceCategoryForCapital('WATER_HEATER'), 'WATER_HEATER');
  assert.equal(servicePriceCategoryForCapital('APPLIANCE'), 'GENERAL_HANDYMAN');
});

test('the timeline track carries every window it is given, not only twelve', () => {
  const many = Array.from({ length: 30 }, (_, n) => item(`i${n}`, 2027));
  const block = capitalTimelineBlock(many, 30);
  assert.equal(block.items.length, 30);
  assert.doesNotMatch(block.description, /soonest/);
});

test('the plan handler hands the track every window (source check: the handler, not the block, used to cut to twelve)', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/services/ask/handlers/capitalPlanning.handler.ts'), 'utf8');
  assert.doesNotMatch(source, /windowStart\)\.getTime\(\) - new Date\(b\.windowStart\)\.getTime\(\)\)\.slice\(0, 12\)/);
  assert.match(source, /capitalBundleBlocks\(userId, propertyId, upcoming, canManage\)/);
});

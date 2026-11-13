// FR-DATA-10 shapes 7-9: reviewed declarations enable the owner path, while an incomplete declaration fails closed.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const r = require('../../src/services/ask/dataPoint/queryShapeRegistries.ts');
const { planDataPointQuery } = require('../../src/services/ask/dataPoint/dataPointQueryPlan.ts');

test('owner-path declarations validate and enable shapes 7-9; the generic planner (shapes 3-6) still builds no plan for them', () => {
  assert.deepEqual([r.validateTimeSeries(), r.validateAbsence(), r.validateCrossEntity()], [[], [], []]);
  assert.deepEqual(r.queryShapesEnabled(), { timeSeries: true, absence: true, crossEntity: true });
  assert.ok(r.TIME_SERIES_REGISTRY.length > 0 && r.ABSENCE_REQUIREMENT_REGISTRY.length > 0 && r.CROSS_ENTITY_RELATION_REGISTRY.length > 0);
  for (const m of ['how has my tax bill changed over the years', 'what documents am I missing', 'which appliances have a warranty']) assert.notEqual(planDataPointQuery(m).kind, 'PLAN', m);
});
test('time series: needs a catalogued point, an observation timestamp (never an edit time), bounded periods and a named reviewer', () => {
  const ok = { dataPointId: 'taxBill.amount', historyEntity: 'PropertyTaxBillRecord', timestampColumn: 'observedAt', ordering: 'OBSERVED_AT_ASC', deduplication: 'LATEST_RECORDED_WINS', supersession: 'EXCLUDE_SUPERSEDED', maxPeriods: 10, reviewedBy: 'Reviewer', reviewedOn: '2026-11-13' };
  assert.deepEqual(r.validateTimeSeries([ok]), []);
  assert.ok(r.validateTimeSeries([{ ...ok, dataPointId: 'nope.nope' }]).some((i) => /not a catalogued/.test(i)));
  assert.ok(r.validateTimeSeries([{ ...ok, timestampColumn: 'updatedAt' }]).some((i) => /observation time/.test(i)));
  assert.ok(r.validateTimeSeries([{ ...ok, maxPeriods: 500 }]).length); assert.ok(r.validateTimeSeries([{ ...ok, reviewedBy: '' }]).some((i) => /reviewer/.test(i)));
  assert.ok(r.validateTimeSeries([ok, ok]).some((i) => /twice/.test(i)));
});
test('absence: needs an applicability rule, a responsible source, the four distinct outcomes and a reviewer', () => {
  const ok = { requirementId: 'roof-permit', label: 'Roof permit', applicabilityRuleId: 'HAS_RECENT_ROOF_WORK', responsibleSource: 'PropertyRecord', outcomes: ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'], audienceFloor: 'VIEWER', reviewedBy: 'R', reviewedOn: '2026-11-13' };
  assert.deepEqual(r.validateAbsence([ok]), []);
  assert.ok(r.validateAbsence([{ ...ok, applicabilityRuleId: '' }]).some((i) => /applicability/.test(i)));
  assert.ok(r.validateAbsence([{ ...ok, outcomes: ['NOT_RECORDED', 'NOT_FOUND', 'NOT_AUTHORIZED', 'NOT_APPLICABLE'] }]).some((i) => /four outcomes/.test(i)));
});
test('cross-entity: both sides property-scoped, a floor for EVERY participating entity, a bounded join and a declared cardinality', () => {
  const ok = { relationId: 'item-warranty', from: 'InventoryItem', to: 'Warranty', viaColumn: 'inventoryItemId', cardinality: 'ONE_TO_MANY', maxJoinedRows: 20, audienceFloors: { InventoryItem: 'VIEWER', Warranty: 'VIEWER' }, propertyScopedBothSides: true, reviewedBy: 'R', reviewedOn: '2026-11-13' };
  assert.deepEqual(r.validateCrossEntity([ok]), []);
  assert.ok(r.validateCrossEntity([{ ...ok, audienceFloors: { InventoryItem: 'VIEWER' } }]).some((i) => /EVERY participating/.test(i)));
  assert.ok(r.validateCrossEntity([{ ...ok, maxJoinedRows: 1000 }]).some((i) => /bounded/.test(i)));
  assert.ok(r.validateCrossEntity([{ ...ok, propertyScopedBothSides: false }]).some((i) => /property-scoped/.test(i)));
});

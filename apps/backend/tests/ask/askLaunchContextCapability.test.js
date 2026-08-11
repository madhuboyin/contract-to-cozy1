const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { ASK_CAPABILITY_UNIQUE_OPERATION } = require('../../src/services/ask/askOrchestrator.service.ts');

test('a capabilityId mapped to exactly one operation resolves to that operation', () => {
  assert.equal(ASK_CAPABILITY_UNIQUE_OPERATION['coverage-intelligence'], 'COVERAGE_GAPS');
  assert.equal(ASK_CAPABILITY_UNIQUE_OPERATION['savings-benefits'], 'SAVINGS_OPPORTUNITIES');
  assert.equal(ASK_CAPABILITY_UNIQUE_OPERATION['home-records'], 'INVENTORY_LOOKUP');
});

test('a capabilityId shared by multiple operations is excluded rather than guessed', () => {
  // 'maintenance' fronts MAINTENANCE_STATUS/CREATE/COMPLETE/UPDATE and
  // HOME_DEADLINE_MONITOR — a launch context naming it doesn't tell us
  // which, so it must never bias routing.
  assert.equal(ASK_CAPABILITY_UNIQUE_OPERATION['maintenance'], undefined);
  // 'mortgage-refinance-radar' fronts both REFINANCE_ANALYSIS and
  // REFINANCE_RATE_MONITOR.
  assert.equal(ASK_CAPABILITY_UNIQUE_OPERATION['mortgage-refinance-radar'], undefined);
  // 'quote-comparison' fronts both CREATE and REVIEW.
  assert.equal(ASK_CAPABILITY_UNIQUE_OPERATION['quote-comparison'], undefined);
  // 'property-brief' fronts both PROPERTY_SUMMARY and MAJOR_EVENT_ENTRY.
  assert.equal(ASK_CAPABILITY_UNIQUE_OPERATION['property-brief'], undefined);
});

test('an unregistered capabilityId resolves to nothing', () => {
  assert.equal(ASK_CAPABILITY_UNIQUE_OPERATION['not-a-real-capability'], undefined);
});

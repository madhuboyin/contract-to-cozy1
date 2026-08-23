const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { sourceTypeLabel } = require('../../src/services/decisionPlatform/outcomeObservationService.ts');

// This switch previously handled only 2 of OutcomeObservationSourceType's
// 10 values with no default, which fails a real `tsc` build (not just
// `tsc --noEmit`) — it broke the production Docker build. Every value gets
// its own case (see the function's own comment for why not a default), so
// this test locks in that every enum member has a real, non-empty label.
test('sourceTypeLabel returns a real label for every OutcomeObservationSourceType value', () => {
  const allValues = [
    'HOMEOWNER_REPORTED',
    'COMPLETED_MAINTENANCE_RECORD',
    'OPERATIONAL_WORK_ITEM',
    'PROJECT_RECORD',
    'BOOKING_RECORD',
    'CLAIM_RECORD',
    'INSPECTION_FINDING',
    'DOCUMENT_PROMOTION',
    'COVERAGE_DECISION',
    'HOME_EVENT',
  ];
  for (const value of allValues) {
    const label = sourceTypeLabel(value);
    assert.equal(typeof label, 'string', `${value} must return a string label`);
    assert.ok(label.trim().length > 0, `${value} must return a non-empty label`);
  }
});

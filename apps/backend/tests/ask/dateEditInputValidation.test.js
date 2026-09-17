const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md §10.3 B04 fix
// (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md).
// Pure (no DB access), so this imports it directly from
// askOrchestrator.service.ts, same convention as the other extracted
// helpers this session (mergeEvidence, isCapitalTimelineAnalysisStale,
// isAllPropertyAttentionRequest, parseRefinanceScenarioEdit). Shared by
// both editAskConfirmation branches (MAINTENANCE_TASK_UPDATE and, as of
// this fix, BUYER_TASK_UPDATE) -- previously duplicated inline in each.
const { isValidDateEditInput } = require('../../src/services/ask/askOrchestrator.service.ts');

test('a well-formed calendar date string is valid', () => {
  assert.equal(isValidDateEditInput('2026-10-15'), true);
  assert.equal(isValidDateEditInput('2026-01-01'), true);
  assert.equal(isValidDateEditInput('2026-12-31'), true);
});

test('a non-string value is invalid, not thrown', () => {
  assert.equal(isValidDateEditInput(undefined), false);
  assert.equal(isValidDateEditInput(null), false);
  assert.equal(isValidDateEditInput(12345), false);
  assert.equal(isValidDateEditInput({ date: '2026-10-15' }), false);
});

test('a string that is not yyyy-mm-dd shaped is invalid', () => {
  assert.equal(isValidDateEditInput('10/15/2026'), false);
  assert.equal(isValidDateEditInput('October 15, 2026'), false);
  assert.equal(isValidDateEditInput('2026-10-15T00:00:00Z'), false);
  assert.equal(isValidDateEditInput(''), false);
});

test('month 13 is rejected (JS Date does not roll that far over)', () => {
  assert.equal(isValidDateEditInput('2026-13-01'), false);
});

// Verified directly before writing this assertion (not assumed): JS's Date
// constructor silently rolls a nonexistent day-of-month over into the next
// month rather than producing NaN -- `new Date('2026-02-30T00:00:00Z')`
// parses as 2026-03-02, not an invalid date. This is a pre-existing
// characteristic of MAINTENANCE_TASK_UPDATE's own original validation
// (extracted here verbatim, not changed by the B04 fix) -- documented as
// known behavior, not silently asserted as "rejects invalid dates" without
// checking. A stricter month/day round-trip check would catch this, but
// that's a separate, unscoped improvement to a mechanism shared with
// Maintenance's own reference implementation, not part of this fix.
test('a day-of-month that does not exist rolls over into the next month rather than being rejected (known, pre-existing behavior)', () => {
  assert.equal(isValidDateEditInput('2026-02-30'), true);
});

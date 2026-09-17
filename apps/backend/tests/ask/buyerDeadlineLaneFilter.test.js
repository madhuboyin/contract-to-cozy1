const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// B02 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md,
// per explicit user design decision). Pure function, extracted for direct
// unit testing without a live database, same convention as
// isAllPropertyAttentionRequest/parseRefinanceScenarioEdit -- reuses
// CLOSING_HOME_LANES' own label text rather than a second, independently
// maintained regex set, so chip-generation and parsing can't drift apart.
const { parseBuyerDeadlineLaneFilter, selectBuyerDeadlineMilestones, buildBuyerDeadlinesViewState } = require('../../src/services/ask/askOrchestrator.service.ts');
const { CLOSING_HOME_LANES, BUYER_MILESTONE_TYPE_LANE } = require('../../src/services/HomeBuyerTask.service.ts');

test('recognizes each of the 4 declared lane labels, case-insensitively', () => {
  assert.equal(parseBuyerDeadlineLaneFilter('Only show Contract deadlines', CLOSING_HOME_LANES), 'CONTRACT');
  assert.equal(parseBuyerDeadlineLaneFilter('only show due diligence deadlines', CLOSING_HOME_LANES), 'DUE_DILIGENCE');
  assert.equal(parseBuyerDeadlineLaneFilter('Only show Closing readiness deadlines', CLOSING_HOME_LANES), 'CLOSING');
  assert.equal(parseBuyerDeadlineLaneFilter('ONLY SHOW MOVE & POSSESSION DEADLINES', CLOSING_HOME_LANES), 'MOVE');
});

test('an explicit "All" reset message matches no lane label and returns null', () => {
  assert.equal(parseBuyerDeadlineLaneFilter('Now show all blocking deadlines', CLOSING_HOME_LANES), null);
});

test('an ordinary, unrelated Buyer question matches no lane label and returns null', () => {
  assert.equal(parseBuyerDeadlineLaneFilter('What is due before closing?', CLOSING_HOME_LANES), null);
  assert.equal(parseBuyerDeadlineLaneFilter('Which transaction documents are missing?', CLOSING_HOME_LANES), null);
});

test('the first matching lane wins when a message could plausibly match more than one (declared-chip messages are self-contained, this only matters for organic text)', () => {
  // "Closing readiness" contains neither "contract" nor "due diligence" nor
  // "move & possession" as substrings, so this is not actually ambiguous --
  // asserting it resolves to exactly CLOSING confirms no false-positive
  // cross-match against the other 3 labels.
  const result = parseBuyerDeadlineLaneFilter('Only show Closing readiness deadlines', CLOSING_HOME_LANES);
  assert.equal(result, 'CLOSING');
});

// B02 milestone-filtering follow-up, per explicit user design decision
// (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md).
test('every declared BuyerMilestoneType maps to exactly one of the 4 lanes, or explicitly to no lane', () => {
  const expected = {
    OFFER_SUBMITTED: 'CONTRACT', CONTRACT_ACCEPTED: 'CONTRACT', EARNEST_MONEY_DUE: 'CONTRACT',
    INSPECTION: 'DUE_DILIGENCE', INSPECTION_CONTINGENCY: 'DUE_DILIGENCE', ATTORNEY_REVIEW: 'DUE_DILIGENCE',
    FINANCING_CONTINGENCY: 'DUE_DILIGENCE', APPRAISAL: 'DUE_DILIGENCE', TITLE_SURVEY: 'DUE_DILIGENCE',
    INSURANCE_EFFECTIVE: 'CLOSING', CLOSING_DISCLOSURE: 'CLOSING', FINAL_WALKTHROUGH: 'CLOSING', CLOSING: 'CLOSING',
    MOVE_IN: 'MOVE',
    DAY_30: null, DAY_60: null, DAY_90: null, CUSTOM: null,
  };
  for (const [type, lane] of Object.entries(expected)) {
    assert.equal(BUYER_MILESTONE_TYPE_LANE[type], lane, `milestone type ${type}`);
  }
  // Exhaustiveness: every key this test declares should be every key the
  // real map declares, and vice versa -- catches a future BuyerMilestoneType
  // addition silently falling through with no explicit lane decision.
  assert.deepEqual(Object.keys(BUYER_MILESTONE_TYPE_LANE).sort(), Object.keys(expected).sort());
});

function milestone(id, type, status = 'NOT_STARTED') {
  return { id, type, status, milestoneKey: id, label: type, dueAt: null };
}

function overviewFixture() {
  const contractMilestone = milestone('m-contract', 'CONTRACT_ACCEPTED');
  const dueDiligenceMilestone = milestone('m-dd', 'INSPECTION');
  const day30Milestone = milestone('m-day30', 'DAY_30');
  const customMilestone = milestone('m-custom', 'CUSTOM');
  const completedContractMilestone = milestone('m-contract-done', 'OFFER_SUBMITTED', 'COMPLETED');
  return {
    milestones: [contractMilestone, dueDiligenceMilestone, day30Milestone, customMilestone, completedContractMilestone],
    milestonesByLane: [
      { key: 'CONTRACT', items: [contractMilestone, completedContractMilestone] },
      { key: 'DUE_DILIGENCE', items: [dueDiligenceMilestone] },
      { key: 'CLOSING', items: [] },
      { key: 'MOVE', items: [] },
    ],
    unmappedMilestones: [day30Milestone, customMilestone],
  };
}

test('with no active lane filter, matching returns the unfiltered legacy milestone list (minus completed) and unmapped is empty (already included once, not duplicated)', () => {
  const result = selectBuyerDeadlineMilestones(overviewFixture(), null);
  assert.deepEqual(result.matching.map((m) => m.id), ['m-contract', 'm-dd', 'm-day30', 'm-custom']);
  assert.deepEqual(result.unmapped, []);
});

test('with an active lane filter, matching is scoped to that lane (completed excluded) and unmapped surfaces separately', () => {
  const result = selectBuyerDeadlineMilestones(overviewFixture(), 'CONTRACT');
  assert.deepEqual(result.matching.map((m) => m.id), ['m-contract']);
  assert.deepEqual(result.unmapped.map((m) => m.id), ['m-day30', 'm-custom']);
});

test('an active lane filter with zero matching milestones still surfaces the unmapped set, not an empty result', () => {
  const result = selectBuyerDeadlineMilestones(overviewFixture(), 'CLOSING');
  assert.deepEqual(result.matching, []);
  assert.deepEqual(result.unmapped.map((m) => m.id), ['m-day30', 'm-custom']);
});

// B07 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md,
// per explicit user design decision): proves BUYER_DEADLINES's own lane
// filter genuinely round-trips a refresh/return, not just by tracing the
// code -- resultId carries forward, the same lane-filtered message
// re-derives the same statusFilter, selection survives untouched, and
// revision increments exactly once per call.
test('a fresh query with no prior view state mints a new resultId, has no active lane, and starts at revision 1', () => {
  const viewState = buildBuyerDeadlinesViewState(null, null);
  assert.equal(typeof viewState.resultId, 'string');
  assert.ok(viewState.resultId.length > 0);
  assert.equal(viewState.statusFilter, 'ALL');
  assert.equal(viewState.selectedTaskId, null);
  assert.equal(viewState.revision, 1);
});

test('re-issuing the same lane-filtered message on refresh (same priorViewState, same laneFilter) reproduces the same resultId and statusFilter, with revision incremented by exactly 1', () => {
  const first = buildBuyerDeadlinesViewState(null, 'CONTRACT');
  const refreshed = buildBuyerDeadlinesViewState(first, 'CONTRACT');
  assert.equal(refreshed.resultId, first.resultId);
  assert.equal(refreshed.statusFilter, 'CONTRACT');
  assert.equal(refreshed.revision, first.revision + 1);
});

test('a selected task survives a lane-filter refresh untouched', () => {
  const first = buildBuyerDeadlinesViewState(null, 'DUE_DILIGENCE');
  const withSelection = { ...first, selectedTaskId: 'task-42' };
  const refreshed = buildBuyerDeadlinesViewState(withSelection, 'DUE_DILIGENCE');
  assert.equal(refreshed.selectedTaskId, 'task-42');
  assert.equal(refreshed.resultId, first.resultId);
});

test('switching the active lane on a subsequent turn keeps resultId stable but updates statusFilter to the new lane', () => {
  const first = buildBuyerDeadlinesViewState(null, 'CONTRACT');
  const switched = buildBuyerDeadlinesViewState(first, 'CLOSING');
  assert.equal(switched.resultId, first.resultId);
  assert.equal(switched.statusFilter, 'CLOSING');
  assert.equal(switched.revision, first.revision + 1);
});

test('clearing back to "All" (laneFilter null) after a lane was active resets statusFilter to ALL without minting a new resultId', () => {
  const filtered = buildBuyerDeadlinesViewState(null, 'MOVE');
  const cleared = buildBuyerDeadlinesViewState(filtered, null);
  assert.equal(cleared.resultId, filtered.resultId);
  assert.equal(cleared.statusFilter, 'ALL');
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// B02 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md,
// per explicit user design decision). Pure function, extracted for direct
// unit testing without a live database, same convention as
// isAllPropertyAttentionRequest/parseRefinanceScenarioEdit -- reuses
// CLOSING_HOME_LANES' own label text rather than a second, independently
// maintained regex set, so chip-generation and parsing can't drift apart.
const { parseBuyerDeadlineLaneFilter } = require('../../src/services/ask/askOrchestrator.service.ts');
const { CLOSING_HOME_LANES } = require('../../src/services/HomeBuyerTask.service.ts');

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

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node').register({ transpileOnly: true });

const { claimsStateFromWords, claimsFilterChips } = require('../../src/services/ask/handlers/claims.handler.ts');

// UI review 2026-11-21, P0 #3: the state a claims question asks about decides what is read, what the headline counts and which chip is active.
test('a question about open claims reads open records; closed reads closed; both or neither read all', () => {
  for (const m of ['Which claims are still open?', 'show my open claims', 'any active claims', 'what claims are pending', 'which claims are not closed yet']) assert.equal(claimsStateFromWords(m), 'OPEN', m);
  for (const m of ['show my closed claims', 'which claims were resolved', 'past claims']) assert.equal(claimsStateFromWords(m), 'CLOSED', m);
  for (const m of ['show my claims', 'show open and closed claims', 'what incidents and claims do I have']) assert.equal(claimsStateFromWords(m), 'ALL', m);
});

test('the active status chip is the state the answer was read with', () => {
  const active = (state) => claimsFilterChips('CLAIMS', state).filter((chip) => chip.id.startsWith('state-') && chip.active).map((chip) => chip.label);
  assert.deepEqual(active(claimsStateFromWords('Which claims are still open?')), ['Open']);
  assert.deepEqual(active(claimsStateFromWords('show my claims')), ['Open and closed']);
});

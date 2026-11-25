// BICC-BUY-011 across turns: a split request, or a follow-up to a refusal, is refused; ordinary follow-ups are not.
require('ts-node/register');
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyFairHousingRequestWithHistory: classify, classifyFairHousingRequest } = require('../../src/services/ask/support/fairHousing.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const turn = (message, reasonCode = 'ASK_OPERATION') => ({ message, reasonCode });
const REFUSED = 'ASK_FAIR_HOUSING_BOUNDARY';

// Each case states its expected outcome, so a gain or a loss of coverage shows as a failure. `caught: false` entries are the recorded known gap (FRD D43).
const SPLITS = [
  { first: 'which areas', second: 'should I avoid', caught: true },
  { first: 'is this neighborhood', second: 'a good one to buy in', caught: true },
  { first: 'what is the area like', second: 'for raising my kids', caught: false },
  { first: 'tell me about the people', second: 'next door', caught: true },
];
test('split requests: every case has an explicit expected outcome (known gaps listed as false)', () => {
  for (const { first, second, caught } of SPLITS) {
    assert.equal(classifyFairHousingRequest(first), null, first);
    assert.equal(classifyFairHousingRequest(second), null, second);
    assert.equal(Boolean(classify(second, [turn(first)])), caught, `${first} / ${second}`);
  }
});

test('a follow-up that points back at a refusal is refused again', () => {
  const history = [turn('which neighborhoods have the fewest families with kids', REFUSED)];
  for (const message of ['ok what about the families there', 'and those areas?', 'so who lives there then', 'what about that neighborhood', 'how about the people in those areas']) {
    assert.ok(classify(message, history), message);
  }
});

test('ordinary turns after a refusal or in a normal conversation are not refused', () => {
  const refused = [turn('which neighborhoods have the fewest families with kids', REFUSED)];
  for (const message of ['what is the monthly cost of my candidate homes', 'compare my candidate homes', 'show my maintenance tasks', 'how much is the property tax', 'what is the flood zone for the first one']) {
    assert.equal(classify(message, refused), null, message);
  }
  // the same objective questions, immediately after a refusal: they must be answered, even when they contain "there", "where", "who" or "with"
  for (const message of ['Where is the closest grocery store?', 'Who is my inspector?', 'What is the roof age there?', 'with a garage and a big yard', 'what is the flood zone there', 'who is the listing agent', 'is there a park near the house', 'what are the property taxes there']) {
    assert.equal(classify(message, refused), null, `after refusal: ${message}`);
  }
  const normal = [turn('show me the neighborhoods I saved'), turn('which homes are near the park')];
  for (const message of ['and the one with the lowest price', 'what about the roof age there', 'those with a garage', 'near the train station', 'where is the closest grocery store']) {
    assert.equal(classify(message, normal), null, message);
  }
});

test('a long message or no history behaves exactly like the single-message check', () => {
  assert.equal(classify('and those', []), null);
  assert.equal(classify('what is a fair price for a three bedroom house in a quiet town with a big yard and a short commute to the city center for two people', [turn('which areas', REFUSED)]), null);
  assert.equal(classify('which neighborhoods have a lot of white families'), classifyFairHousingRequest('which neighborhoods have a lot of white families'));
});

test('through the cascade the history decides, and an emergency still wins', () => {
  const split = resolveAskRoutingCascade('should I avoid', { fairHousingHistory: [turn('which areas')] });
  assert.ok(split.fairHousing);
  assert.equal(resolveAskRoutingCascade('should I avoid').fairHousing, undefined);
  const gas = resolveAskRoutingCascade('I smell gas there', { fairHousingHistory: [turn('which areas', REFUSED)] });
  assert.equal(gas.stage, 'SAFETY');
});


test('the history loader reads only delivered, terminal, same-session, top-level turns of the caller, newest two', async () => {
  const { loadFairHousingHistory, FAIR_HOUSING_HISTORY_STATUSES } = require('../../src/services/ask/support/fairHousingHistory.ts');
  let seen;
  const db = { askExecution: { findMany: async (args) => { seen = args; return [{ message: 'b', reasonCode: null, operationId: 'X' }, { message: 'a', reasonCode: 'ASK_FAIR_HOUSING_BOUNDARY', operationId: null }]; } } };
  const turns = await loadFairHousingHistory(db, { userId: 'u1', sessionId: 's1' });
  assert.deepEqual(turns.map((t) => t.message), ['b', 'a']);
  assert.equal(seen.where.userId, 'u1');
  assert.equal(seen.where.sessionId, 's1');
  assert.equal(seen.where.parentRole, null);
  assert.deepEqual(seen.orderBy, { createdAt: 'desc' });
  assert.equal(seen.take, 2);
  assert.deepEqual([...seen.where.status.in].sort(), [...FAIR_HOUSING_HISTORY_STATUSES].sort());
  for (const bad of ['FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED', 'EXPIRED', 'RUNNING', 'RECEIVED', 'ROUTING', 'NEEDS_CONFIRMATION', 'BLOCKED', 'OUTCOME_UNKNOWN']) {
    assert.ok(!seen.where.status.in.includes(bad), bad);
  }
  // NOTE: this checks the query the loader sends, not what Postgres returns; no database-backed test has been run (there is no local database).
});

test('a long referential message is still read against history (the word limit is linguistic, not a query-cost gate)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  assert.doesNotMatch(src, /split\(\/\\s\+\/\)\.length <= 14\s*\n\s*\? \(await prisma\.askExecution/);
  assert.match(src, /loadFairHousingHistory\(prisma as never/);
});

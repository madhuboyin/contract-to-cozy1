// BICC-BUY-011 across turns: a split request, or a follow-up to a refusal, is refused; ordinary follow-ups are not.
require('ts-node/register');
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyFairHousingRequestWithHistory: classify, classifyFairHousingRequest } = require('../../src/services/ask/support/fairHousing.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const turn = (message, reasonCode = 'ASK_OPERATION') => ({ message, reasonCode });
const REFUSED = 'ASK_FAIR_HOUSING_BOUNDARY';

// KNOWN GAP (recorded in the FRD): only splits whose halves complete a closed pattern are caught; the other pairs below are listed so the gap is visible, not asserted.
test('a split request is refused when no single message is (partial coverage, see known gap)', () => {
  const pairs = [
    ['which areas', 'should I avoid'],
    ['is this neighborhood', 'a good one to buy in'],
    ['what is the area like', 'for raising my kids'],
    ['tell me about the people', 'next door'],
  ];
  let refused = 0;
  for (const [first, second] of pairs) {
    assert.equal(classifyFairHousingRequest(first), null, first);
    assert.equal(classifyFairHousingRequest(second), null, second);
    if (classify(second, [turn(first)])) refused += 1;
  }
  assert.ok(refused >= 1, `only ${refused} of ${pairs.length} split requests were caught`);
  assert.ok(classify('should I avoid', [turn('which areas')]));
});

test('a follow-up that points back at a refusal is refused again', () => {
  const history = [turn('which neighborhoods have the fewest families with kids', REFUSED)];
  for (const message of ['ok what about the families there', 'and those areas?', 'so who lives there then', 'what about that neighborhood']) {
    assert.ok(classify(message, history), message);
  }
});

test('ordinary turns after a refusal or in a normal conversation are not refused', () => {
  const refused = [turn('which neighborhoods have the fewest families with kids', REFUSED)];
  for (const message of ['what is the monthly cost of my candidate homes', 'compare my candidate homes', 'show my maintenance tasks', 'how much is the property tax', 'what is the flood zone for the first one']) {
    assert.equal(classify(message, refused), null, message);
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

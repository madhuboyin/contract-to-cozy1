// BICC-UX-010: pure social turns get a brief authored reply with no tool, no clarification and no suggested-action row.
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { classifySocialTurn, socialTurnResult } = require('../../src/services/ask/support/socialTurn.ts');

const PURE = {
  GREETING: ['Hi', 'hello!', 'Hey there', 'Good morning', 'good evening, cozy', 'Howdy'],
  THANKS: ['thanks', 'Thank you!', 'thank you so much', 'thx', 'Thanks a lot', 'much appreciated'],
  ACKNOWLEDGEMENT: ['ok', 'Okay.', 'cool', 'got it', 'sounds good', 'Perfect!', 'makes sense'],
  GOODBYE: ['bye', 'Good night', 'talk to you later', 'see you'],
  WELLBEING: ['how are you', 'How are you doing today?', "how's it going", "what's up"],
  DAY_CHECK: ['how is my day going', "how's my day"],
  JOKE_REQUEST: ['tell me a joke'],
};

test('a message that is only a social phrase is classified, whatever the case or punctuation', () => {
  for (const [kind, messages] of Object.entries(PURE)) for (const message of messages) assert.equal(classifySocialTurn(message), kind, message);
});

test('a greeting that carries a request is NOT a social turn: the request is never swallowed', () => {
  for (const message of ['hi, what is due this week', 'hello what is due', 'thanks, now complete the gutter task', 'ok show my warranties', 'good morning how old is my roof', 'thanks for the roof estimate it was 12000', 'ok', ''].slice(0, 6)) {
    assert.equal(classifySocialTurn(message), null, message);
  }
  assert.equal(classifySocialTurn('how is my home doing'), null);
  assert.equal(classifySocialTurn('how are you going to replace the furnace'), null);
  assert.equal(classifySocialTurn('great room paint colors for resale'), null);
});

test('the routing decision marks pure social turns and only them, and never offers candidates or a clarification', () => {
  for (const messages of Object.values(PURE)) for (const message of messages) {
    const decision = resolveAskRoutingCascade(message, { propertyId: 'p1' });
    assert.equal(decision.stage, 'REMOTE_FALLBACK', message);
    assert.ok(decision.socialTurn, message);
    assert.equal(decision.requiresClarification, false);
    assert.deepEqual(decision.candidates, []);
  }
  for (const message of ['hi what is due', 'how is my home doing', 'what is due this week']) {
    assert.equal(resolveAskRoutingCascade(message, { propertyId: 'p1' }).socialTurn, undefined, message);
  }
});

test('the reply is one authored answer: no tool output, no clarification, no confirmation, no capture, no suggestions', () => {
  for (const kind of Object.keys(PURE)) {
    const result = socialTurnResult(kind);
    assert.equal(result.status, 'ANSWERED');
    assert.equal(result.reasonCode, 'ASK_SOCIAL_TURN');
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].type, 'SUMMARY');
    assert.deepEqual(result.blocks[0].actions, []);
    assert.equal(result.clarification, null);
    assert.equal(result.confirmation, null);
    assert.deepEqual(result.captureRequests, []);
    assert.deepEqual(result.suggestions, []);
    assert.deepEqual(result.suggestedNextActions, []);
    assert.equal(result.suppressSkillHandoff, true);
  }
});

test('the replies are brief and invent no home fact, memory, feeling, or completed work', () => {
  for (const kind of Object.keys(PURE)) {
    const { title, body } = socialTurnResult(kind).blocks[0];
    const text = `${title} ${body}`;
    assert.ok(body.length <= 190, `${kind} is brief (${body.length})`);
    assert.doesNotMatch(text, /\b(?:remember|last time|as I said|I(?:'m| am) (?:so )?(?:happy|glad|excited|sad|tired)|I feel|I(?:'ve| have) (?:done|completed|finished|updated|saved)|your (?:roof|furnace|water heater|warranty|task|home is))\b/i, kind);
    assert.doesNotMatch(text, /\d/, `${kind} states no figure`);
  }
  // The day-check reply says it cannot see the person's day instead of pretending to.
  assert.match(socialTurnResult('DAY_CHECK').blocks[0].body, /can.t see how your day is going/);
  // Every reply that moves on offers the supported help in the same words.
  for (const kind of ['GREETING', 'WELLBEING', 'DAY_CHECK', 'JOKE_REQUEST']) assert.match(socialTurnResult(kind).blocks[0].body, /maintenance, records, costs, warranties/);
});

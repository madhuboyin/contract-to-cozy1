// BICC-BUY-001: a general wish to buy a home gets the authored buyer introduction with no property; a specific request never does.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { isBuyerIntro, buyerIntroResult } = require('../../src/services/ask/support/buyerIntro.ts');
const { classifyFairHousingRequest } = require('../../src/services/ask/support/fairHousing.ts');

const INTRO = ['I want to buy a house', 'I am thinking of buying a home', "I'm looking to buy my first home", 'help me buy my first home', 'I am a first time home buyer', "we're first-time buyers",
  'how do I start buying a home', 'How do I buy a house?', 'what can you do for someone buying a home', 'first time home buyer help', 'we are ready to buy a home', 'Help me buy a house', 'I want to start house hunting', 'what can you do for buyers'];
const NOT_INTRO = ['what is left before closing on my house', 'I want to buy a house for 400000 with 20 percent down', 'should I buy the house on Maple St', 'what did the inspection find on the house I am buying',
  'how much would a house cost me each month', 'when does my buying contract say the contingencies end', 'I want to sell my house', 'when should I buy a new furnace', 'help me buy a new dishwasher', 'how do I replace my roof',
  'I bought a house last week', 'Compare my candidate homes', 'show my closing deadlines', ''];

test('a general wish to buy a home is recognised, whatever the case or punctuation', () => {
  const misses = INTRO.filter((m) => !isBuyerIntro(m));
  assert.deepEqual(misses, []);
});

test('a specific request is never swallowed by the introduction', () => {
  const hits = NOT_INTRO.filter((m) => isBuyerIntro(m));
  assert.deepEqual(hits, []);
});

test('the cascade answers it with no property and no candidates or clarification, and a steering request still wins as a refusal', () => {
  for (const m of INTRO) {
    const d = resolveAskRoutingCascade(m, { propertyId: null });
    assert.equal(d.buyerGuidance, 'INTRO', m);
    assert.equal(d.requiresClarification, false);
    assert.deepEqual(d.candidates, []);
  }
  for (const m of NOT_INTRO) assert.notEqual(resolveAskRoutingCascade(m, { propertyId: null }).buyerGuidance, 'INTRO', m);
  assert.equal(resolveAskRoutingCascade('I want to buy a house in a mostly white neighborhood', { propertyId: null }).fairHousing, 'PROTECTED_CLASS');
});

test('the introduction invites a candidate workspace, discloses that the numbers are the buyer\'s own, states the boundary, and carries no tool, action or suggestion', () => {
  const result = buyerIntroResult();
  assert.equal(result.reasonCode, 'ASK_BUYER_INTRO');
  const body = result.blocks[0].body;
  assert.match(body, /don’t need a home in your account/);
  assert.match(body, /Homes I’m considering/);
  assert.match(body, /your numbers, not a lender’s/);
  assert.match(body, /who lives there/);
  assert.deepEqual([result.captureRequests, result.suggestions, result.suggestedNextActions, result.confirmation, result.clarification, result.blocks[0].actions], [[], [], [], null, null, []]);
});

test('no routing-corpus prompt becomes an introduction (nothing that worked is lost)', () => {
  const prompts = ['askRoutingCorpus.js', 'askRoutingHoldoutCorpus.js', 'askRoutingHoldoutCorpus2.js'].flatMap((name) => Object.values(require(`../fixtures/${name}`)).flatMap((v) => (Array.isArray(v) ? v : [])).filter((r) => typeof r === 'string'));
  assert.ok(prompts.length > 500);
  assert.deepEqual(prompts.filter((p) => isBuyerIntro(p)), []);
});

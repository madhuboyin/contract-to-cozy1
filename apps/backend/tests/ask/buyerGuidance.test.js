// BICC-BUY-001: general buyer guidance without a property. Closed whole-question forms only; specific requests go to the ordinary router; the content states no home fact, recommends
// nothing, gives no price, and points to the professionals who decide what varies.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
require('../../src/services/ask/askRuntimeBootstrap.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { classifyBuyerRequest, buyerGuidanceResult } = require('../../src/services/ask/support/buyerGuidance.ts');
const { classifyFairHousingRequest } = require('../../src/services/ask/support/fairHousing.ts');

const YES = {
  STEPS: ['What are the steps to buying a house?', 'how does buying a home work', 'What is the process of buying a home', 'walk me through buying a house', 'how does the home buying process work'],
  WHAT_TO_CHECK: ['what should I look for when buying a house', 'What should I check before buying a home', 'what to look for when buying a house', 'what do I need to know when buying a home'],
  COSTS: ['what costs are involved in buying a house', 'How much does it cost to buy a house?', 'what are all the costs of buying a home', 'what closing costs should I expect when buying a house'],
  INSPECTION: ['what is a home inspection', 'How does a home inspection work', 'what does a home inspection cover', 'do I need a home inspection before buying a house', 'what happens at a home inspection'],
  OFFER_PRICE: ['what is a good price to offer on a house', 'How much should I offer on a house?', "what's a fair price to offer for a home", 'how do I decide how much to offer on a house'],
  INTRO: ['I want to buy a house', 'first time home buyer'],
};
const NO = [
  'what should I look for in my inspection report', 'what did the inspection find on the house I am buying', 'what costs are coming up after the purchase', 'how much will the house on Maple St cost me each month',
  'what are the steps left before closing', 'what is the process to replace my roof', 'what should I check before buying a new furnace', 'how much does it cost to buy a new roof',
  'what is a good price for a new water heater', 'how much should I offer the seller for repairs after the inspection', 'schedule a home inspection for next week', 'what does my home inspection report say about the roof',
  'how much should I offer on Maple St', 'what is a home inspection worth for my sale', 'what closing costs are on my closing disclosure', 'what should I look for when buying a house in a diverse neighborhood',
  'show my closing deadlines', 'explain my loan estimate', 'what should I look for when selling a house', 'how much does it cost to maintain a house', ''];

test('the closed buyer question forms are recognised, with the right topic', () => {
  const misses = Object.entries(YES).flatMap(([kind, list]) => list.filter((m) => classifyBuyerRequest(m) !== kind).map((m) => `${kind}: ${m} -> ${classifyBuyerRequest(m)}`));
  assert.deepEqual(misses, []);
});

test('a specific request or a nearby homeowner question is never swallowed', () => {
  const hits = NO.filter((m) => classifyBuyerRequest(m)).map((m) => `${m} -> ${classifyBuyerRequest(m)}`);
  assert.deepEqual(hits, []);
});

test('no routing-corpus prompt becomes guidance (nothing that worked is lost)', () => {
  const prompts = ['askRoutingCorpus.js', 'askRoutingHoldoutCorpus.js', 'askRoutingHoldoutCorpus2.js'].flatMap((name) => Object.values(require(`../fixtures/${name}`)).flatMap((v) => (Array.isArray(v) ? v : [])).filter((r) => typeof r === 'string'));
  assert.ok(prompts.length > 500);
  assert.deepEqual(prompts.filter((p) => classifyBuyerRequest(p)), []);
});

test('the cascade answers each topic with no property, candidates or clarification; and steering wording still wins as a refusal', () => {
  for (const [kind, list] of Object.entries(YES)) for (const m of list) {
    const d = resolveAskRoutingCascade(m, { propertyId: null });
    assert.equal(d.buyerGuidance, kind, m);
    assert.equal(d.requiresClarification, false);
    assert.deepEqual(d.candidates, []);
  }
  assert.equal(resolveAskRoutingCascade('what should I look for when buying a house in a mostly white neighborhood', { propertyId: null }).fairHousing, 'PROTECTED_CLASS');
});

test('the content: authored, general, no price or recommendation, sends the buyer to the professionals, and is itself free of steering', () => {
  for (const kind of ['STEPS', 'WHAT_TO_CHECK', 'COSTS', 'INSPECTION', 'OFFER_PRICE']) {
    const result = buyerGuidanceResult(kind);
    assert.deepEqual([result.status, result.reasonCode], ['ANSWERED', 'ASK_BUYER_GUIDANCE']);
    const { title, body } = result.blocks[0];
    assert.ok(title && body.length > 200, kind);
    assert.doesNotMatch(body, /\$\s?\d|\d{2,}\s?(?:%|percent)(?! of)/, `${kind} states no figure`);
    assert.doesNotMatch(body, /you should (?:buy|offer|pick|choose)|the best (?:home|house|neighbou?rhood|price)/i, `${kind} recommends nothing`);
    assert.deepEqual([result.captureRequests, result.suggestions, result.suggestedNextActions, result.confirmation, result.clarification, result.blocks[0].actions], [[], [], [], null, null, []]);
  }
  for (const kind of ['STEPS', 'WHAT_TO_CHECK', 'COSTS', 'INSPECTION', 'OFFER_PRICE']) assert.equal(classifyFairHousingRequest(buyerGuidanceResult(kind).blocks[0].body.split('\n\n')[0]), null, `${kind} first paragraph`);
  assert.match(buyerGuidanceResult('STEPS').blocks[0].body, /confirm the details with your agent, attorney and lender/);
  assert.match(buyerGuidanceResult('INSPECTION').blocks[0].body, /not a guarantee/);
  assert.match(buyerGuidanceResult('WHAT_TO_CHECK').blocks[0].body, /I can’t see the home/);
  assert.match(buyerGuidanceResult('COSTS').blocks[0].body, /not a lender’s/);
});

test('"what should I offer" declines to name a price and says why, and offers the cost tool instead', () => {
  const body = buyerGuidanceResult('OFFER_PRICE').blocks[0].body;
  assert.match(body, /I can’t tell you what to offer/);
  assert.match(body, /comparable sales/);
  assert.match(body, /Homes I’m considering/);
  assert.doesNotMatch(body, /\d/);
});

test('INTRO is still the introduction', () => {
  assert.equal(buyerGuidanceResult('INTRO').reasonCode, 'ASK_BUYER_INTRO');
});

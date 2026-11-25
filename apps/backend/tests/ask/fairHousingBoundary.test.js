// BICC-BUY-011 / EVAL-017: the fair-housing boundary refuses steering and redirects to objective criteria, and stays out of the way of ordinary questions.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { classifyFairHousingRequest, fairHousingResult } = require('../../src/services/ask/support/fairHousing.ts');
const { deriveAnswerMode } = require('../../src/services/ask/support/answerModes.ts');
const { REFUSE, BENIGN } = require('../fixtures/fairHousing/corpus.js');

test('every steering prompt is refused, with the expected kind', () => {
  const misses = REFUSE.filter(([kind, prompt]) => classifyFairHousingRequest(prompt) !== kind).map(([kind, prompt]) => `${kind}: ${prompt} -> ${classifyFairHousingRequest(prompt)}`);
  assert.deepEqual(misses, []);
});

test('no ordinary buyer or homeowner question is refused', () => {
  const hits = BENIGN.filter((prompt) => classifyFairHousingRequest(prompt)).map((prompt) => `${prompt} -> ${classifyFairHousingRequest(prompt)}`);
  assert.deepEqual(hits, []);
});

test('none of the existing routing corpora prompts is refused (the boundary does not cost any answer that worked)', () => {
  const corpora = ['askRoutingCorpus.js', 'askRoutingHoldoutCorpus.js', 'askRoutingHoldoutCorpus2.js'].flatMap((name) => {
    const mod = require(`../fixtures/${name}`);
    return Object.values(mod).flatMap((value) => (Array.isArray(value) ? value : [])).filter((row) => typeof row === 'string');
  });
  assert.ok(corpora.length > 500, `expected the routing corpora to load, got ${corpora.length}`);
  const hits = corpora.filter((prompt) => classifyFairHousingRequest(prompt));
  assert.deepEqual(hits, []);
});

test('the routing cascade stops at the boundary: no rule, classifier, clarification or candidates', () => {
  for (const [kind, prompt] of REFUSE) {
    const decision = resolveAskRoutingCascade(prompt, { propertyId: 'p1' });
    assert.equal(decision.fairHousing, kind, prompt);
    assert.equal(decision.stage, 'REMOTE_FALLBACK');
    assert.equal(decision.requiresClarification, false);
    assert.deepEqual(decision.candidates, []);
    assert.equal(decision.socialTurn, undefined);
  }
  for (const prompt of BENIGN) assert.equal(resolveAskRoutingCascade(prompt, { propertyId: 'p1' }).fairHousing, undefined, prompt);
});

test('an emergency wins over the boundary, because safety is decided first', () => {
  const decision = resolveAskRoutingCascade('there is a gas leak in the white neighborhood house I just bought', { propertyId: 'p1' });
  assert.equal(decision.stage, 'SAFETY');
  assert.equal(decision.fairHousing, undefined);
});

test('the reply is fixed, refuses plainly, redirects to objective criteria, infers nothing, and carries no tool, action or suggestion', () => {
  for (const kind of ['PROTECTED_CLASS', 'WHO_LIVES_THERE', 'SUITABILITY_FOR_GROUP', 'DESIRABILITY']) {
    const result = fairHousingResult(kind);
    assert.equal(result.status, 'OUT_OF_SCOPE');
    assert.equal(result.reasonCode, 'ASK_FAIR_HOUSING_BOUNDARY');
    const block = result.blocks[0];
    assert.match(block.body, /price and total monthly cost/);
    assert.match(block.body, /flood zone/);
    assert.match(block.body, /source and a date/);
    assert.doesNotMatch(block.body, /\b(neighborhood is|area is) (good|bad|safe)/i);
    assert.deepEqual([result.captureRequests, result.suggestions, result.suggestedNextActions, result.confirmation, result.clarification], [[], [], [], null, null]);
    assert.deepEqual(block.actions, []);
    assert.equal(deriveAnswerMode({ status: result.status, operationId: null, hasProperty: true, reasonCode: result.reasonCode }), null, 'a refusal is not labelled as an unavailable record');
  }
});

test('the prompt is evaluated on its raw text, so case and punctuation do not defeat it', () => {
  assert.equal(classifyFairHousingRequest('IS THIS A GOOD NEIGHBORHOOD???'), 'DESIRABILITY');
  assert.equal(classifyFairHousingRequest('what   KIND of people   live here'), 'WHO_LIVES_THERE');
  assert.equal(classifyFairHousingRequest(''), null);
});

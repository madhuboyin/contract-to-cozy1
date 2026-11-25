require('ts-node/register');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CreateAskExecutionRequestSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const base = { clientRequestId: 'r1', sessionId: 's1', message: 'hello' };

test('BICC-D42: lifecycleMode accepts only PROSPECTIVE_BUYER, null or omitted', () => {
  assert.equal(CreateAskExecutionRequestSchema.safeParse(base).success, true);
  assert.equal(CreateAskExecutionRequestSchema.safeParse({ ...base, lifecycleMode: null }).success, true);
  assert.equal(CreateAskExecutionRequestSchema.safeParse({ ...base, lifecycleMode: 'PROSPECTIVE_BUYER' }).success, true);
  for (const bad of ['HOMEOWNER', 'UNDER_CONTRACT_BUYER', 'BUYER', '', 'prospective_buyer', 1, true]) {
    assert.equal(CreateAskExecutionRequestSchema.safeParse({ ...base, lifecycleMode: bad }).success, false, String(bad));
  }
});

test('BICC-D42 (STATIC): the mode is stored on the session and never derived from message text or granting a property', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  assert.match(src, /lifecycleMode: input\.lifecycleMode \?\? null/);
  assert.match(src, /input\.lifecycleMode !== undefined/);
  // the only place lifecycleMode is read for behavior is the session value, not the message
  assert.doesNotMatch(src, /PROSPECTIVE_BUYER'[^\n]*(message|routingMessage)\)/);
  // propertyId resolution does not mention the mode
  assert.doesNotMatch(src.split('executionPropertyId = ')[1].split('\n')[0], /lifecycleMode/);
});

test('BICC-D42 (STATIC): the session read returns the stored mode, only ever as PROSPECTIVE_BUYER or null', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../src', p), 'utf8');
  assert.match(read('controllers/ask.controller.ts'), /data: \{ executions, lifecycleMode \}/);
  const svc = read('services/ask/execution/askSessions.ts');
  assert.match(svc, /where: \{ id: sessionId, userId \}, select: \{ lifecycleMode: true \}/);
  assert.match(svc, /=== 'PROSPECTIVE_BUYER' \? 'PROSPECTIVE_BUYER' : null/);
});

const { classifyBuyerRequest, buyerGuidanceResult } = require('../../src/services/ask/support/buyerGuidance.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

test('BICC-D42: buyer mode recognises open-ended buyer questions that are not recognised without it', () => {
  const cases = [
    ['what should I look for', 'WHAT_TO_CHECK'], ['What are the red flags?', 'WHAT_TO_CHECK'],
    ['how much should I offer', 'OFFER_PRICE'], ["what's a good price to offer", 'OFFER_PRICE'],
    ['what are the closing costs', 'COSTS'], ['where do I start', 'STEPS'], ['do I need a home inspection', 'INSPECTION'],
  ];
  for (const [text, kind] of cases) {
    assert.equal(classifyBuyerRequest(text), null, `without mode: ${text}`);
    assert.equal(classifyBuyerRequest(text, { buyerMode: true }), kind, `with mode: ${text}`);
  }
});

test('BICC-D42: buyer mode never swallows a specific request or an owned-home question', () => {
  for (const text of ['what should I look for in my roof warranty', 'how much should I offer on 12 Oak Street', 'what are my closing costs on the Elm house for $400000',
    'when is my furnace filter due', 'what is my insurance deductible', 'compare my candidate homes', 'show my maintenance tasks']) {
    assert.equal(classifyBuyerRequest(text, { buyerMode: true }), null, text);
  }
});

test('BICC-D42: through the cascade the mode changes the routing; without it the same text does not get buyer guidance', () => {
  const on = resolveAskRoutingCascade('what should I look for', { buyerMode: true });
  const off = resolveAskRoutingCascade('what should I look for');
  assert.equal(on.buyerGuidance, 'WHAT_TO_CHECK');
  assert.equal(off.buyerGuidance, undefined);
  assert.equal(on.requiresClarification, false);
});

test('BICC-D42: a steering request is still refused in buyer mode, and an emergency still wins', () => {
  const steer = resolveAskRoutingCascade('which neighborhoods have the fewest families with kids', { buyerMode: true });
  assert.ok(steer.fairHousing);
  assert.equal(steer.buyerGuidance, undefined);
  const fire = resolveAskRoutingCascade('I smell gas in the house', { buyerMode: true });
  assert.equal(fire.stage, 'SAFETY');
});

test('BICC-D42: the no-home reply is authored, answers no home fact and offers no action', () => {
  const result = buyerGuidanceResult('NEEDS_HOME');
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.reasonCode, 'ASK_BUYER_GUIDANCE');
  assert.deepEqual(result.suggestedNextActions, []);
  assert.match(result.blocks[0].body, /no home is selected/);
});

test('BICC-D42 (STATIC): the decline is applied only for buyer mode with no property on an operation that requires one', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  assert.match(src, /session\.lifecycleMode === 'PROSPECTIVE_BUYER' && !executionPropertyId && operationDefinition\.requiresProperty/);
  assert.match(src, /buyerMode: session\.lifecycleMode === 'PROSPECTIVE_BUYER'/);
});

test('BICC-D42/BUY-004: explicit candidate-compare forms route in buyer mode; pronoun-only forms need a candidate-homes answer right before', () => {
  for (const text of ['compare my homes', 'which of my homes has the lowest property tax', 'rank my options', 'show the candidates side by side']) {
    const on = resolveAskRoutingCascade(text, { buyerMode: true });
    assert.equal(on.operation.operationId, 'CANDIDATE_HOMES_REVIEW', text);
    assert.equal(on.stage, 'PROVISIONAL', text);
    assert.notEqual(resolveAskRoutingCascade(text).candidates[0]?.reasonCodes?.[0], 'BUYER_MODE_CANDIDATE_COMPARE', text);
  }
  for (const text of ['Compare them', 'which one is the cheapest', 'what is the biggest', 'line up these']) {
    assert.notEqual(resolveAskRoutingCascade(text, { buyerMode: true }).candidates[0]?.reasonCodes?.[0], 'BUYER_MODE_CANDIDATE_COMPARE', `no context: ${text}`);
    assert.notEqual(resolveAskRoutingCascade(text, { buyerMode: true, candidateContext: false }).candidates[0]?.reasonCodes?.[0], 'BUYER_MODE_CANDIDATE_COMPARE', `no context: ${text}`);
    const withContext = resolveAskRoutingCascade(text, { buyerMode: true, candidateContext: true });
    assert.equal(withContext.operation.operationId, 'CANDIDATE_HOMES_REVIEW', `with context: ${text}`);
    assert.equal(withContext.stage, 'PROVISIONAL', text);
    assert.notEqual(resolveAskRoutingCascade(text, { candidateContext: true }).candidates[0]?.reasonCodes?.[0], 'BUYER_MODE_CANDIDATE_COMPARE', `not buyer mode: ${text}`);
  }
  for (const text of ['compare my homes insurance quotes', 'what is the biggest expense this year', 'show my maintenance tasks']) {
    assert.notEqual(resolveAskRoutingCascade(text, { buyerMode: true, candidateContext: true }).candidates[0]?.reasonCodes?.[0], 'BUYER_MODE_CANDIDATE_COMPARE', text);
  }
});

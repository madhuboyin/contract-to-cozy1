const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  canonicalCapabilityRegistry,
  matchCapabilityGoal,
} = require('../../src/productFramework/capabilities');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry');

const goldenGoals = [
  ['I am planning to refinance my mortgage', 'mortgage-refinance-radar'],
  ['Should I sell my house or rent it out?', 'sell-hold-rent'],
  ['Can you help me compare contractor bids?', 'quote-comparison'],
  ['When should I repair or replace an appliance?', 'replace-repair'],
  ['Find rebates, credits, and benefits for my home', 'savings-benefits'],
  ['Help me organize all my home paperwork', 'home-records'],
  ['What tax exemptions might apply to my property?', 'property-tax'],
  ['Does this remodel require a building permit?', 'permits'],
  ['Help me prepare my house to list', 'seller-prep'],
  ['What plants work in a low-light room?', 'plant-advisor'],
  ['I want to track a contractor renovation project', 'project-tracker'],
  ['Where should I store appliance warranties and receipts?', 'home-records'],
];

test('Ask capability goal matcher meets the Phase 3 top-1 golden threshold', () => {
  let correct = 0;
  for (const [goal, expected] of goldenGoals) {
    const result = matchCapabilityGoal({
      registry: canonicalCapabilityRegistry,
      goal,
      limit: 3,
    });
    assert.ok(result.matches[0], goal);
    if (result.matches[0].capabilityId === expected) correct += 1;
    assert.ok(result.matches[0].score >= 72, `${goal}: ${result.matches[0].score}`);
  }
  assert.ok(correct / goldenGoals.length >= 0.9, `top-1 accuracy was ${correct}/${goldenGoals.length}`);
});

test('ambiguous homeowner language returns bounded, deterministic choices', () => {
  const first = matchCapabilityGoal({
    registry: canonicalCapabilityRegistry,
    goal: 'I need to track permits for a remodel project',
    limit: 3,
  });
  const second = matchCapabilityGoal({
    registry: canonicalCapabilityRegistry,
    goal: 'I need to track permits for a remodel project',
    limit: 3,
  });
  assert.equal(first.ambiguous, true);
  assert.deepEqual(first, second);
  assert.ok(first.matches.length >= 2);
  assert.ok(first.matches.length <= 3);
});

test('unrelated and adversarial prompts do not become capability matches', () => {
  assert.deepEqual(matchCapabilityGoal({
    registry: canonicalCapabilityRegistry,
    goal: 'Create a Python program with a never ending loop',
  }).matches, []);
  assert.equal(resolveAskOperation('Create a Python program with a never ending loop').operationId, 'OUT_OF_SCOPE_BOUNDARY');
});

test('synonymous navigation goals route into deterministic discovery', () => {
  for (const prompt of [
    'Can you help me compare contractor bids?',
    'Help me organize my home paperwork',
    'I want to track permits for a remodel',
  ]) {
    assert.equal(resolveAskOperation(prompt).operationId, 'CAPABILITY_DISCOVERY', prompt);
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  evaluateHomeActionProactiveEligibility,
  categorizeHomeActionForNotification,
  isHomeActionProactiveEscalation,
  redactProactiveMessageBody,
} = require('../../../src/services/decisionPlatform/homeActionProactiveEligibilityPolicy.ts');

function baseInput(overrides = {}) {
  return {
    hasConsent: true,
    channelEnabled: true,
    ...overrides,
    item: {
      consumerPriority: 'DO_NOW',
      cta: { href: '/dashboard/home-actions', label: 'Review' },
      suppressed: false,
      completed: false,
      unavailable: false,
      ...overrides.item,
    },
    budget: { dailyCount: 0, dailyLimit: 1, weeklyCount: 0, weeklyLimit: 3, ...overrides.budget },
  };
}

test('a fully eligible DO_NOW item with consent, an enabled channel, and budget headroom is eligible', () => {
  const result = evaluateHomeActionProactiveEligibility(baseInput());
  assert.deepEqual(result, { eligible: true, reasonCodes: ['ELIGIBLE'], escalationBudgetBypassed: false });
});

test('WATCH/OPTIONAL/NO_ACTION items are never eligible (FRD §17.3 materiality floor)', () => {
  for (const consumerPriority of ['WATCH', 'OPTIONAL', 'NO_ACTION']) {
    const result = evaluateHomeActionProactiveEligibility(baseInput({ item: { consumerPriority } }));
    assert.equal(result.eligible, false);
    assert.ok(result.reasonCodes.includes('NOT_MATERIAL'));
  }
});

test('PLAN_SOON is material and can be eligible', () => {
  const result = evaluateHomeActionProactiveEligibility(baseInput({ item: { consumerPriority: 'PLAN_SOON' } }));
  assert.equal(result.eligible, true);
});

test('a suppressed, completed, or unavailable item is never eligible', () => {
  assert.equal(evaluateHomeActionProactiveEligibility(baseInput({ item: { suppressed: true } })).eligible, false);
  assert.equal(evaluateHomeActionProactiveEligibility(baseInput({ item: { completed: true } })).eligible, false);
  assert.equal(evaluateHomeActionProactiveEligibility(baseInput({ item: { unavailable: true } })).eligible, false);
});

test('an item with no actionable CTA (honest watch/no-action state) is never sent externally', () => {
  const result = evaluateHomeActionProactiveEligibility(baseInput({ item: { cta: null } }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasonCodes.includes('NO_ACTIONABLE_CTA'));
});

test('missing consent is always disqualifying, even for an otherwise-perfect DO_NOW item (FRD §22.2 zero-tolerance)', () => {
  const result = evaluateHomeActionProactiveEligibility(baseInput({ hasConsent: false }));
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasonCodes, ['CONSENT_MISSING']);
  assert.equal(result.escalationBudgetBypassed, false);
});

test('a disabled channel is disqualifying independent of consent', () => {
  const result = evaluateHomeActionProactiveEligibility(baseInput({ channelEnabled: false }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasonCodes.includes('CHANNEL_DISABLED'));
});

test('exhausted daily or weekly budget blocks delivery even when everything else is eligible', () => {
  assert.equal(evaluateHomeActionProactiveEligibility(baseInput({ budget: { dailyCount: 1 } })).eligible, false);
  assert.equal(evaluateHomeActionProactiveEligibility(baseInput({ budget: { weeklyCount: 3 } })).eligible, false);
});

test('multiple simultaneous failures are all reported, not just the first', () => {
  const result = evaluateHomeActionProactiveEligibility(baseInput({ hasConsent: false, channelEnabled: false, item: { cta: null } }));
  assert.equal(result.eligible, false);
  assert.deepEqual(new Set(result.reasonCodes), new Set(['NO_ACTIONABLE_CTA', 'CONSENT_MISSING', 'CHANNEL_DISABLED']));
});

test('exhausted daily budget is bypassed only when isEscalation is set, and weekly budget is never bypassed', () => {
  const escalated = evaluateHomeActionProactiveEligibility(baseInput({ budget: { dailyCount: 1 }, isEscalation: true }));
  assert.equal(escalated.eligible, true);
  assert.equal(escalated.escalationBudgetBypassed, true);
  assert.deepEqual(escalated.reasonCodes, ['ELIGIBLE']);

  const weeklyStillBlocked = evaluateHomeActionProactiveEligibility(baseInput({ budget: { dailyCount: 1, weeklyCount: 3 }, isEscalation: true }));
  assert.equal(weeklyStillBlocked.eligible, false);
  assert.deepEqual(weeklyStillBlocked.reasonCodes, ['WEEKLY_BUDGET_EXCEEDED']);
});

test('isEscalation never bypasses consent, channel, suppression, completion, or the CTA requirement (FRD §18.2: no silent bypass of channel law or consent)', () => {
  const result = evaluateHomeActionProactiveEligibility(baseInput({ hasConsent: false, budget: { dailyCount: 1 }, isEscalation: true }));
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasonCodes, ['CONSENT_MISSING']);
});

test('isHomeActionProactiveEscalation is true only for a PLAN_SOON -> DO_NOW transition', () => {
  assert.equal(isHomeActionProactiveEscalation('PLAN_SOON', 'DO_NOW'), true);
  assert.equal(isHomeActionProactiveEscalation('DO_NOW', 'DO_NOW'), false);
  assert.equal(isHomeActionProactiveEscalation('PLAN_SOON', 'PLAN_SOON'), false);
  assert.equal(isHomeActionProactiveEscalation(null, 'DO_NOW'), false);
  assert.equal(isHomeActionProactiveEscalation('DO_NOW', 'PLAN_SOON'), false);
});

test('redactProactiveMessageBody strips currency and percentage figures for material-financial and regulated-coverage items only', () => {
  assert.equal(redactProactiveMessageBody('Estimated cost is $4,500.50 with a 12% surcharge.', 'MATERIAL_FINANCIAL'), 'Estimated cost is [redacted] with a [redacted] surcharge.');
  assert.equal(redactProactiveMessageBody('Your policy lapses in $2,000 of exposure.', 'REGULATED_COVERAGE'), 'Your policy lapses in [redacted] of exposure.');
  assert.equal(redactProactiveMessageBody('Estimated cost is $4,500.', 'LOW_CONSEQUENCE'), 'Estimated cost is $4,500.');
  assert.equal(redactProactiveMessageBody('No figures here.', 'SAFETY_EMERGENCY'), 'No figures here.');
});

test('categorizeHomeActionForNotification routes safety and coverage floors ahead of source kind', () => {
  assert.equal(categorizeHomeActionForNotification({ governance: { safetyTier: 'SAFETY_EMERGENCY' }, source: { kind: 'MAINTENANCE' } }), 'SAFETY');
  assert.equal(categorizeHomeActionForNotification({ governance: { safetyTier: 'REGULATED_COVERAGE' }, source: { kind: 'MAINTENANCE' } }), 'COVERAGE');
});

test('categorizeHomeActionForNotification maps known source kinds and falls back to GENERAL', () => {
  assert.equal(categorizeHomeActionForNotification({ governance: { safetyTier: 'LOW_CONSEQUENCE' }, source: { kind: 'MAINTENANCE' } }), 'MAINTENANCE');
  assert.equal(categorizeHomeActionForNotification({ governance: { safetyTier: 'LOW_CONSEQUENCE' }, source: { kind: 'PROJECT' } }), 'PROJECT');
  assert.equal(categorizeHomeActionForNotification({ governance: { safetyTier: 'LOW_CONSEQUENCE' }, source: { kind: 'RECALL' } }), 'RECALL');
  assert.equal(categorizeHomeActionForNotification({ governance: { safetyTier: 'LOW_CONSEQUENCE' }, source: { kind: 'SAVINGS_BENEFITS' } }), 'SAVINGS_BENEFITS');
  assert.equal(categorizeHomeActionForNotification({ governance: { safetyTier: 'LOW_CONSEQUENCE' }, source: { kind: 'GUIDANCE' } }), 'GENERAL');
});

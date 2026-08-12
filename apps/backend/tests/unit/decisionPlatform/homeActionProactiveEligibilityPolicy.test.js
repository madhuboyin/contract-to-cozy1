const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  evaluateHomeActionProactiveEligibility,
  categorizeHomeActionForNotification,
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
  assert.deepEqual(result, { eligible: true, reasonCodes: ['ELIGIBLE'] });
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

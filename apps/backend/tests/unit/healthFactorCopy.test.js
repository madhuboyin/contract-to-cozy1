const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  HEALTH_FACTOR_COPY,
  CARD_PRODUCING_HEALTH_STATUSES,
  resolveHealthFactorCopy,
  resolveHealthFactorInsightCopy,
  healthFactorImpact,
  healthFactorKeyFacts,
  displayHealthFactorName,
  friendlyHealthStatus,
  normalizeHealthStatus,
} = require('../../src/content/healthFactorCopy.ts');

const {
  homeActionGroundingReasons,
} = require('../../src/services/homeActionSourcePromotion.service.ts');

const CTX = { propertyId: 'property-1', observedAt: '2026-08-29T00:00:00.000Z' };

// Mirror of homeActionPresentationRegistry.ABSTRACT_HOME_HEADLINE plus the
// grounding gate's UNGROUNDED_HOME_COPY — a resolved headline must never match
// either, or the card is filtered out of the feed.
const ABSTRACT = /^(?:review a financial exposure|review and address before listing|review the flagged home facts|review and update (?:this|the) home fact\.?|(?:review|continue|address|resolve)\s+(?:(?:this|the|a|an)\s+)?(?:action|decision|journey|issue|item|exposure|details?|home fact))$/i;

test('every card-producing (factor, status) pair has explicit copy', () => {
  // Statuses the score util emits that flow to a card. Documents/Safety use
  // non-card statuses today, so only the ones that can produce a card here.
  const expected = [
    ['Property Age (Year Built)', 'Needs Review'],
    ['Property Age (Year Built)', 'Missing Data'],
    ['HVAC Age', 'Needs Inspection'],
    ['Water Heater Age', 'Needs Review'],
    ['Roof Age', 'Needs Inspection'],
    ['Exterior', 'Needs Attention'],
    ['Appliances', 'Missing Data'],
  ];
  for (const [factor, status] of expected) {
    assert.ok(
      HEALTH_FACTOR_COPY[factor] && HEALTH_FACTOR_COPY[factor][status],
      `missing copy for ${factor} / ${status}`,
    );
  }
});

test('resolveHealthFactorCopy never throws and never returns an abstract headline', () => {
  const factors = ['Property Age (Year Built)', 'HVAC Age', 'Water Heater Age', 'Roof Age', 'Exterior', 'Appliances', 'Structure Factor', 'Systems Factor', 'Size Factor', 'Documents', 'Safety', 'Totally Unknown Factor'];
  const statuses = [...CARD_PRODUCING_HEALTH_STATUSES, 'Aging', 'Good', 'Whatever'];
  for (const factor of factors) {
    for (const status of statuses) {
      const copy = resolveHealthFactorCopy(factor, status, { ...CTX, assetName: 'Dishwasher' });
      assert.ok(copy.headline && copy.headline.trim().length > 0);
      assert.doesNotMatch(copy.headline.trim(), ABSTRACT, `${factor}/${status} -> "${copy.headline}"`);
      assert.doesNotMatch(copy.headline, /Requires resolution|Status:/);
      assert.ok(['MAINTENANCE', 'DATA_GAP', 'WARRANTY_GAP'].includes(copy.mode));
      assert.ok(copy.ctaLabel && copy.summary && copy.whyItMatters && copy.statusLabel);
    }
  }
});

test('the dynamic "<Asset> aging" / Needs Warranty factor resolves to WARRANTY_GAP copy', () => {
  const copy = resolveHealthFactorCopy('Dishwasher aging', 'Needs Warranty', { ...CTX, assetName: 'Dishwasher' });
  assert.equal(copy.mode, 'WARRANTY_GAP');
  assert.match(copy.headline, /warranty/i);
  assert.match(copy.headline, /dishwasher/i);
  const facts = healthFactorKeyFacts(copy, { ...CTX, assetName: 'Dishwasher' });
  assert.ok(facts.some((f) => f.value === 'No active home warranty found'));
});

test('status casing drift is normalized (Needs Attention vs Needs attention)', () => {
  assert.equal(normalizeHealthStatus('Needs attention'), 'Needs Attention');
  assert.equal(normalizeHealthStatus('  needs INSPECTION '), 'Needs Inspection');
  const a = resolveHealthFactorCopy('Exterior', 'Needs Attention', CTX);
  const b = resolveHealthFactorCopy('Exterior', 'Needs attention', CTX);
  assert.equal(a.headline, b.headline);
});

test('displayHealthFactorName maps internal taxonomy to homeowner names', () => {
  assert.equal(displayHealthFactorName('Systems Factor'), 'Major Systems Health');
  assert.equal(displayHealthFactorName('Usage/Wear Factor'), 'Occupancy & Wear');
  assert.equal(displayHealthFactorName('Exterior'), 'Exterior Drainage');
  assert.equal(displayHealthFactorName('Water Heater Age'), 'Water Heater Age');
  assert.equal(displayHealthFactorName('Dishwasher aging'), 'Dishwasher (aging)');
});

test('friendlyHealthStatus never leaks a raw Needs* enum', () => {
  for (const s of ['Needs Review', 'Needs Inspection', 'Needs Attention', 'Missing Data', 'Needs Warranty']) {
    const friendly = friendlyHealthStatus(s);
    assert.notEqual(friendly, s);
    assert.doesNotMatch(friendly, /^Needs /);
  }
});

test('resolveHealthFactorInsightCopy (Phase 2): negatives carry the card copy, positives carry encouragement, never a raw enum', () => {
  const cases = [
    ['Water Heater Age', 'Needs Review', 'negative'],
    ['HVAC Age', 'Needs Inspection', 'negative'],
    ['Exterior', 'Needs Attention', 'negative'],
    ['Property Age (Year Built)', 'Missing Data', 'negative'],
    ['Water Heater Age', 'Aging', 'neutral'],
    ['HVAC Age', 'Good', 'positive'],
    ['Systems Factor', 'Modern', 'positive'],
    ['Documents', 'Complete', 'positive'],
    ['Dishwasher aging', 'Needs Warranty', 'negative'],
  ];
  for (const [factor, status, expectedImpact] of cases) {
    const c = resolveHealthFactorInsightCopy(factor, status, { ...CTX, installYear: 2013, assetName: 'Dishwasher' });
    assert.equal(c.impact, expectedImpact, `${factor}/${status}`);
    assert.ok(c.displayName && c.statusLabel && c.summary && c.explanation);
    assert.doesNotMatch(
      [c.displayName, c.statusLabel, c.summary, c.explanation, c.actionHint ?? ''].join(' | '),
      /Requires resolution|Status:|Needs Review\b|Needs Inspection\b|Needs Attention\b/,
    );
    if (expectedImpact === 'negative') {
      assert.ok(['MAINTENANCE', 'DATA_GAP', 'WARRANTY_GAP'].includes(c.mode));
      assert.match(c.explanation, /\w+/);
    } else {
      assert.equal(c.mode, null);
      assert.equal(c.actionHint, null);
    }
  }
});

test('resolveHealthFactorInsightCopy: maintenance negatives expose an actionHint with a rough cost', () => {
  const wh = resolveHealthFactorInsightCopy('Water Heater Age', 'Needs Review', { ...CTX, installYear: 2013 });
  assert.match(wh.actionHint, /\$/);
  const exterior = resolveHealthFactorInsightCopy('Exterior', 'Needs Attention', CTX);
  assert.match(exterior.actionHint, /drain|downspout|grad/i);
});

test('resolveHealthFactorInsightCopy: a stale "Missing Data" appliance snapshot with records present reads as recorded', () => {
  const c = resolveHealthFactorInsightCopy('Appliances', 'Missing Data', {
    ...CTX, applianceCount: 3, incompleteApplianceCount: 1,
  });
  assert.equal(c.impact, 'neutral');
  assert.match(c.summary, /3 appliances/);
  assert.match(c.explanation, /installation year/i);
});

test('healthFactorImpact classifies the score-util statuses', () => {
  assert.equal(healthFactorImpact('Needs Attention'), 'negative');
  assert.equal(healthFactorImpact('Needs attention'), 'negative');
  assert.equal(healthFactorImpact('Missing Data'), 'negative');
  assert.equal(healthFactorImpact('Aging'), 'neutral');
  assert.equal(healthFactorImpact('Action Pending'), 'neutral');
  assert.equal(healthFactorImpact('Good'), 'positive');
  assert.equal(healthFactorImpact('Modern'), 'positive');
});

test('key facts lead with Current status and never include Confidence telemetry', () => {
  const copy = resolveHealthFactorCopy('Water Heater Age', 'Needs Review', { ...CTX, installYear: 2013 });
  const facts = healthFactorKeyFacts(copy, { ...CTX, installYear: 2013 });
  assert.equal(facts[0].label, 'Current status');
  assert.ok(facts.some((f) => f.value === '2013'));
  assert.ok(!facts.some((f) => f.label === 'Confidence'));
  assert.ok(facts.length <= 8);
});

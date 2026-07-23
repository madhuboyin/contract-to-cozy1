// apps/workers/tests/unit/deepLinks.test.js
//
// W1 item 7: typed builders for worker-generated notification destinations.
// Route resolution itself is covered by
// apps/frontend/scripts/product-framework/check-route-disposition.mjs
// (scans this file specifically, see DEEP_LINK_BUILDER_FILES there) — this
// just locks each builder's exact output shape so a future edit can't
// silently change a destination without a test noticing.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  reserveFundUrl,
  seasonalChecklistUrl,
  permitTrackerUrl,
  homeHabitCoachUrl,
  neighborhoodChangeRadarUrl,
  claimDetailUrl,
  recallFollowUpUrl,
} = require('../../src/lib/deepLinks.ts');

test('reserveFundUrl', () => {
  assert.equal(reserveFundUrl('property-1'), '/dashboard/properties/property-1/tools/reserve-fund');
});

test('seasonalChecklistUrl', () => {
  assert.equal(seasonalChecklistUrl('property-1'), '/dashboard/seasonal?propertyId=property-1');
});

test('permitTrackerUrl', () => {
  assert.equal(permitTrackerUrl('property-1'), '/dashboard/properties/property-1/tools/permits');
});

test('homeHabitCoachUrl', () => {
  assert.equal(homeHabitCoachUrl('property-1'), '/dashboard/properties/property-1/tools/home-habit-coach');
});

test('neighborhoodChangeRadarUrl', () => {
  assert.equal(
    neighborhoodChangeRadarUrl('property-1'),
    '/dashboard/properties/property-1/tools/neighborhood-change-radar',
  );
});

test('claimDetailUrl builds a per-claim link when both ids are present', () => {
  assert.equal(claimDetailUrl('property-1', 'claim-1'), '/dashboard/properties/property-1/claims/claim-1');
});

test('claimDetailUrl returns undefined when either id is missing', () => {
  assert.equal(claimDetailUrl(null, 'claim-1'), undefined);
  assert.equal(claimDetailUrl('property-1', null), undefined);
  assert.equal(claimDetailUrl(undefined, undefined), undefined);
});

test('recallFollowUpUrl always includes matchId', () => {
  assert.equal(recallFollowUpUrl('property-1', 'match-1'), '/dashboard/properties/property-1/recalls?matchId=match-1');
});

test('recallFollowUpUrl appends guidance context params only when present', () => {
  const url = recallFollowUpUrl('property-1', 'match-1', {
    guidanceJourneyId: 'journey-1',
    guidanceStepKey: 'step-1',
    guidanceSignalIntentFamily: 'family-1',
    itemId: 'item-1',
  });
  const parsed = new URL(url, 'https://example.com');
  assert.equal(parsed.pathname, '/dashboard/properties/property-1/recalls');
  assert.equal(parsed.searchParams.get('matchId'), 'match-1');
  assert.equal(parsed.searchParams.get('guidanceJourneyId'), 'journey-1');
  assert.equal(parsed.searchParams.get('guidanceStepKey'), 'step-1');
  assert.equal(parsed.searchParams.get('guidanceSignalIntentFamily'), 'family-1');
  assert.equal(parsed.searchParams.get('itemId'), 'item-1');
});

test('recallFollowUpUrl omits guidance context params when null/absent', () => {
  const url = recallFollowUpUrl('property-1', 'match-1', null);
  assert.equal(url, '/dashboard/properties/property-1/recalls?matchId=match-1');
});

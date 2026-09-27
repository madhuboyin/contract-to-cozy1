const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  sourceTypeLabel,
  buildChangeSummaryText,
  homeChangeDisplayTitle,
  homeChangeLinkedAction,
} = require('../../../src/services/decisionPlatform/homeChangeSummaryMapping.ts');

test('a known sourceType resolves to its curated label', () => {
  assert.equal(sourceTypeLabel('DECISION_RECOMMENDATION_SNAPSHOT'), 'Repair/replace recommendation');
  assert.equal(sourceTypeLabel('DECISION_PREFERENCE_VALUE'), 'Saved preference');
  assert.equal(sourceTypeLabel('HOME_EVENT'), 'Home event');
});

test('an unrecognized sourceType humanizes rather than throwing (FRD: never crash on a future/unknown source)', () => {
  assert.equal(sourceTypeLabel('DOMAIN_EVENT_SOME_NEW_THING'), 'Domain Event Some New Thing');
  assert.equal(sourceTypeLabel('X'), 'X');
});

test('a detailOverride is used verbatim, since the pure mapper has no DB access to verify content itself', () => {
  const summary = buildChangeSummaryText({
    sourceType: 'DECISION_PREFERENCE_VALUE',
    changeType: 'SOURCE_RECORD_CREATED',
    detailOverride: 'Saved: plan to sell in about 18 months.',
  });
  assert.equal(summary, 'Saved: plan to sell in about 18 months.');
});

test('with no override, summary falls back to a generated label + verb sentence', () => {
  assert.equal(
    buildChangeSummaryText({ sourceType: 'HOME_EVENT', changeType: 'SOURCE_RECORD_CREATED' }),
    'Home event added.',
  );
  assert.equal(
    buildChangeSummaryText({ sourceType: 'DECISION_RECOMMENDATION_SNAPSHOT', changeType: 'SOURCE_RECORD_REVISED' }),
    'Repair/replace recommendation updated.',
  );
});

test('an unrecognized changeType still produces a readable sentence, never throws', () => {
  assert.equal(
    buildChangeSummaryText({ sourceType: 'HOME_EVENT', changeType: 'SOME_FUTURE_CHANGE_TYPE' }),
    'Home event changed.',
  );
});

test('canonical entity titles replace generic source labels in the homeowner-facing row', () => {
  assert.equal(homeChangeDisplayTitle({ sourceType: 'OPERATIONAL_WORK_EVENT', canonicalActionTitle: 'Chimney cleaning and inspection' }), 'Chimney cleaning and inspection');
  assert.equal(homeChangeDisplayTitle({ sourceType: 'HOME_EVENT', canonicalEventTitle: 'Kitchen remodel completed' }), 'Kitchen remodel completed');
  assert.equal(homeChangeDisplayTitle({ sourceType: 'DOCUMENT' }), 'Document');
});

test('linked changes deep-link to their exact canonical work item or event', () => {
  assert.deepEqual(homeChangeLinkedAction({ propertyId: 'property 1', canonicalActionId: 'work/1' }), {
    label: 'Open in Home Operations',
    href: '/dashboard/properties/property%201/home-operations?focusWorkItemId=work%2F1&openManage=1',
  });
  assert.deepEqual(homeChangeLinkedAction({ propertyId: 'property 1', canonicalEventId: 'event/1' }), {
    label: 'Open in Home Timeline',
    href: '/dashboard/properties/property%201/timeline?eventId=event%2F1',
  });
  assert.equal(homeChangeLinkedAction({ propertyId: 'property-1' }), null);
});

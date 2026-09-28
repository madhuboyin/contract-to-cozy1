const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  sourceTypeLabel,
  buildChangeSummaryText,
  homeChangeDisplayTitle,
  homeChangeLinkedAction,
  homeChangeCanonicalIdentity,
  homeChangeInlineReviewAction,
  liveHomeChangeCanonicalIdentity,
  resolveLiveHomeChangeAction,
  selectUniqueHomeChanges,
  shouldIncludeHomeChange,
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

test('canonical identity collapses multiple change rows for the same action without title-based guessing', () => {
  const changes = [
    { id: 'new-action', title: 'Furnace inspection', actionId: 'work-1' },
    { id: 'old-action', title: 'Furnace inspection', actionId: 'work-1' },
    { id: 'same-title-other-record', title: 'Furnace inspection', actionId: 'work-2' },
  ];
  assert.deepEqual(
    selectUniqueHomeChanges(changes, (change) => homeChangeCanonicalIdentity({
      sourceType: 'OPERATIONAL_WORK_EVENT', sourceEntityId: change.id, canonicalActionId: change.actionId,
    }), 10).map((change) => change.id),
    ['new-action', 'same-title-other-record'],
  );
});

test('inline review keeps the primary action in Ask with exact canonical context', () => {
  assert.deepEqual(homeChangeInlineReviewAction({ title: 'Furnace inspection', canonicalActionId: 'work-1' }), {
    id: 'review-home-action-work-1', label: 'Review in Ask', interactionType: 'START_WORKFLOW',
    message: 'What should I do next for “Furnace inspection”?', operationId: 'HOME_ACTIONS',
    entityType: 'HOME_ACTION', entityId: 'work-1', actionId: 'work-1', style: 'SECONDARY',
  });
});

test('live reconciliation translates a work item id to the actual feed action id', () => {
  const action = {
    id: 'operational-work:work-1', lineageId: 'operational-work:work-1',
    source: { entityId: 'task-1' },
    deduplication: { canonicalKey: 'work-key-1', mergedActionIds: [] },
    workItem: { id: 'work-1', workKey: 'work-key-1' },
  };
  assert.equal(resolveLiveHomeChangeAction([action], { canonicalActionId: 'work-1' }), action);
  assert.equal(liveHomeChangeCanonicalIdentity(action), 'live-action:work-key-1');
});

test('event and work rows resolve to one governed feed identity', () => {
  const action = {
    id: 'weather-action-1', lineageId: 'weather-lineage-1',
    source: { entityId: 'event-1' },
    deduplication: { canonicalKey: 'weather-preparation-1', mergedActionIds: ['older-action'] },
    workItem: { id: 'work-1', workKey: 'weather-preparation-1' },
  };
  const eventMatch = resolveLiveHomeChangeAction([action], { canonicalEventId: 'event-1' });
  const workMatch = resolveLiveHomeChangeAction([action], { canonicalActionId: 'work-1' });
  assert.equal(liveHomeChangeCanonicalIdentity(eventMatch), liveHomeChangeCanonicalIdentity(workMatch));
});

test('an inactive work item does not resolve merely because its stale id still exists', () => {
  assert.equal(resolveLiveHomeChangeAction([], { canonicalActionId: 'work-1' }), null);
  assert.equal(shouldIncludeHomeChange({
    sourceType: 'OPERATIONAL_WORK_EVENT', canonicalActionId: 'work-1', liveAction: null,
  }), false);
  assert.equal(shouldIncludeHomeChange({
    sourceType: 'OPERATIONAL_WORK_DUE', canonicalActionId: 'work-1', liveAction: null,
  }), false);
  assert.equal(shouldIncludeHomeChange({
    sourceType: 'HOME_EVENT', canonicalActionId: null, liveAction: null,
  }), true);
});

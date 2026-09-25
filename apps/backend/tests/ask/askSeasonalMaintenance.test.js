const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildSeasonalMaintenanceResult,
  seasonalShelfFacts,
  parseSeasonalMaintenanceIntent,
} = require('../../src/services/ask/askSeasonalMaintenance.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const {
  attachAskAuthoritativeSourceEvidence,
  completedAskAuthoritativeSourceEvidence,
} = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const NOW = new Date('2026-08-14T12:00:00.000Z');

function item(overrides = {}) {
  return {
    id: overrides.id ?? 'item-1',
    taskKey: overrides.taskKey ?? overrides.id ?? 'task-1',
    title: overrides.title ?? 'Service air conditioner',
    description: overrides.description ?? 'Prepare the cooling system for sustained heat.',
    priority: overrides.priority ?? 'CRITICAL',
    status: overrides.status ?? 'RECOMMENDED',
    recommendedDate: 'recommendedDate' in overrides ? overrides.recommendedDate : new Date('2026-08-20T00:00:00.000Z'),
    snoozedUntil: overrides.snoozedUntil ?? null,
    updatedAt: overrides.updatedAt ?? NOW,
    maintenanceTask: overrides.maintenanceTask ?? null,
  };
}

function checklist(overrides = {}) {
  return {
    id: overrides.id ?? 'summer-2026',
    season: overrides.season ?? 'SUMMER',
    year: overrides.year ?? 2026,
    status: overrides.status ?? 'IN_PROGRESS',
    seasonStartDate: overrides.seasonStartDate ?? new Date('2026-06-21T00:00:00.000Z'),
    seasonEndDate: overrides.seasonEndDate ?? new Date('2026-09-21T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? NOW,
    items: overrides.items ?? [item()],
  };
}

function result(message, context, contextAvailable = true) {
  return buildSeasonalMaintenanceResult({
    message,
    propertyId: 'property-1',
    propertyTimezone: 'America/New_York',
    context,
    contextAvailable,
    now: NOW,
  });
}

test('seasonal intent recognizes seasons, status, and year without affecting ordinary maintenance queries', () => {
  assert.deepEqual(parseSeasonalMaintenanceIntent('What summer tasks are pending in 2026?'), {
    requested: true, seasons: ['SUMMER'], year: 2026, view: 'OPEN',
  });
  assert.equal(parseSeasonalMaintenanceIntent('What maintenance is pending?').requested, false);
  assert.equal(result('What maintenance is pending?', { checklists: [checklist()] }), null);
});

test('pending summer questions return actual checklist items instead of an empty maintenance filter', () => {
  const response = result('what seasonal tasks are pending', { checklists: [checklist({ items: [
    item({ id: 'cooling', title: 'Service air conditioner' }),
    item({ id: 'drainage', title: 'Inspect exterior drainage', priority: 'RECOMMENDED' }),
  ] })] });
  assert.equal(response.status, 'ANSWERED');
  assert.equal(response.blocks[0].title, '2 summer tasks need attention');
  // One checklist renders as priority shelves (FRD v1.83), still in priority order.
  assert.deepEqual(response.blocks[1].sections.flatMap((section) => section.items.map((entry) => entry.title)), [
    'Service air conditioner', 'Inspect exterior drainage',
  ]);
  assert.match(response.blocks[0].actions[0].href, /dashboard\/seasonal/);
});

test('seasonal maintenance navigation survives answer-trust validation', () => {
  const response = result('what seasonal tasks are pending', { checklists: [checklist()] });
  const checked = validateAskAnswerTrust({
    question: 'what seasonal tasks are pending',
    operationId: 'MAINTENANCE_STATUS',
    propertyId: 'property-1',
    result: attachAskAuthoritativeSourceEvidence(
      response,
      [completedAskAuthoritativeSourceEvidence('MAINTENANCE_STATUS')],
    ),
  });
  assert.equal(checked.trust.outcome, 'PASS');
  assert.equal(checked.result.blocks[0].actions[0].id, 'open-seasonal');
});

test('an explicit season selects the latest matching year and deduplicates linked canonical tasks', () => {
  const sharedTask = { id: 'maintenance-1', status: 'PENDING' };
  const response = result('What summer tasks are pending?', { checklists: [
    checklist({ id: 'summer-2026', items: [
      item({ id: 'one', title: 'First projection', maintenanceTask: sharedTask }),
      item({ id: 'two', title: 'Duplicate projection', maintenanceTask: sharedTask }),
    ] }),
    checklist({ id: 'summer-2025', year: 2025, seasonStartDate: new Date('2025-06-21T00:00:00.000Z'), seasonEndDate: new Date('2025-09-21T00:00:00.000Z'), items: [item({ id: 'old', title: 'Old summer task' })] }),
  ] });
  assert.equal(response.blocks[0].title, '1 summer task needs attention');
  assert.equal(response.blocks[1].sections[0].items.length, 1);
  assert.doesNotMatch(JSON.stringify(response), /Old summer task/);
});

test('linked canonical completion takes precedence over a stale checklist status', () => {
  const context = { checklists: [checklist({ items: [item({
    status: 'ADDED', maintenanceTask: { id: 'maintenance-1', status: 'COMPLETED' },
  })] })] };
  assert.equal(result('What summer tasks are pending?', context).blocks[0].title, 'No pending summer tasks were found');
  assert.equal(result('Show completed summer tasks', context).blocks[1].sections[0].items[0].status, 'COMPLETED');
});

test('dismissed and snoozed states remain distinct', () => {
  const context = { checklists: [checklist({ items: [
    item({ id: 'dismissed', title: 'Dismissed task', status: 'DISMISSED' }),
    item({ id: 'snoozed', title: 'Snoozed task', status: 'SNOOZED', snoozedUntil: new Date('2026-08-30T00:00:00.000Z') }),
  ] })] };
  const pending = result('What seasonal tasks are pending?', context);
  assert.equal(pending.blocks[1].sections[0].items[0].status, 'SNOOZED');
  const dismissed = result('Show dismissed seasonal tasks', context);
  assert.equal(dismissed.blocks[1].sections[0].items[0].title, 'Dismissed task');
});

test('provider failure never becomes a false zero-task answer', () => {
  const response = result('What seasonal tasks are pending?', null, false);
  assert.equal(response.status, 'READY_WITH_LIMITATIONS');
  assert.equal(response.reasonCode, 'SEASONAL_CHECKLIST_CONTEXT_UNAVAILABLE');
  assert.doesNotMatch(response.blocks[0].body, /no tasks exist/i);
});

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-014, FRD v1.83): the seasonal checklist as read-only shelves.
const fmt = (value) => value.toISOString().slice(0, 10);

test('shelf facts: only an open critical task is a caution; timing is the recommended or snooze date', () => {
  const base = { priority: 'CRITICAL', status: 'PENDING', recommendedDate: new Date('2026-08-20T00:00:00Z'), snoozedUntil: null, formatDate: fmt };
  assert.deepEqual(seasonalShelfFacts(base), { tone: 'CAUTION', timingLabel: 'Recommended 2026-08-20' });
  assert.deepEqual(seasonalShelfFacts({ ...base, priority: 'RECOMMENDED' }), { tone: 'DEFAULT', timingLabel: 'Recommended 2026-08-20' });
  assert.deepEqual(seasonalShelfFacts({ ...base, status: 'SNOOZED', snoozedUntil: new Date('2026-08-30T00:00:00Z') }), { tone: 'DEFAULT', timingLabel: 'Snoozed until 2026-08-30' });
  assert.deepEqual(seasonalShelfFacts({ ...base, status: 'COMPLETED' }), { tone: 'DEFAULT', timingLabel: 'Recommended 2026-08-20' });
  assert.deepEqual(seasonalShelfFacts({ ...base, recommendedDate: null }), { tone: 'CAUTION', timingLabel: 'No recommended date' });
});

test('one checklist declares shelves by priority with card facts, no item actions, and leaves out empty priorities', () => {
  const response = result('what seasonal tasks are pending', { checklists: [checklist({ items: [
    item({ id: 'a', title: 'Service air conditioner' }),
    item({ id: 'b', title: 'Clean dryer vent', priority: 'OPTIONAL', recommendedDate: null }),
  ] })] });
  const list = response.blocks[1];
  assert.deepEqual(list.presentation, { pattern: 'SHELVES' });
  assert.deepEqual(list.sections.map((section) => [section.id, section.title, section.count]), [['priority-critical', 'Critical', 1], ['priority-optional', 'Optional', 1]]);
  assert.deepEqual([list.sections[0].items[0].tone, list.sections[0].items[0].timingLabel], ['CAUTION', 'Recommended Aug 19, 2026']);
  assert.equal(list.sections[1].items[0].timingLabel, 'No recommended date');
  assert.ok(list.sections.every((section) => section.items.every((entry) => entry.actions.length === 0)));
  const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
  AskPresentationBlockSchema.parse(list);
});

test('several checklists keep one shelf per season and year, never merging tasks across them', () => {
  const response = result('Show all seasonal tasks in 2026', { checklists: [
    checklist({ id: 'summer-2026', items: [item({ id: 's', title: 'Service air conditioner' })] }),
    checklist({ id: 'fall-2026', season: 'FALL', seasonStartDate: new Date('2026-09-22T00:00:00Z'), seasonEndDate: new Date('2026-12-21T00:00:00Z'), items: [item({ id: 'f', title: 'Clean gutters', priority: 'RECOMMENDED' })] }),
  ] });
  assert.deepEqual(response.blocks[1].sections.map((section) => section.title), ['Summer 2026', 'Fall 2026']);
  assert.deepEqual(response.blocks[1].presentation, { pattern: 'SHELVES' });
});

test('the full answer checker, with answer relevance on, keeps the shelves answer even with a code-like task title', () => {
  const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
  const response = result('what seasonal tasks are pending', { checklists: [checklist({ items: [item({ id: 'c', title: 'HVAC_FILTER_CHANGE' })] })] });
  const checked = validateAskAnswerTrustPipeline({
    question: 'what seasonal tasks are pending', operationId: 'MAINTENANCE_STATUS', propertyId: 'property-1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(response, [completedAskAuthoritativeSourceEvidence('MAINTENANCE_STATUS')]),
  });
  assert.equal(checked.result.status, 'ANSWERED', JSON.stringify(checked.semantic));
});

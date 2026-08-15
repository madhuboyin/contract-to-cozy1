const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildSeasonalMaintenanceResult,
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
    recommendedDate: overrides.recommendedDate ?? new Date('2026-08-20T00:00:00.000Z'),
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
  assert.deepEqual(response.blocks[1].sections[0].items.map((entry) => entry.title), [
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

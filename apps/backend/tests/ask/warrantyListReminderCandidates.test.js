require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  warrantyListReminderCandidates, warrantiesFromRecords, shownWarrantyIds, warrantyReminderActionKey, warrantyReminderIsCurrent,
} = require('../../src/services/ask/handlers/warranties.handler.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { warrantyContextVersion } = require('../../src/services/ask/suggestedActions/domainVersions.ts');
const { currentOperationOwnsOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { isRegisteredOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

// Phase 5 first slice: the warranty list nominates a reminder for an expiring warranty it shows, with one batched monitor-state lookup.

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-03T12:00:00Z');
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000);
const warranty = (id, expiresInDays, over = {}) => ({
  id, propertyId: PROPERTY, providerName: `Provider ${id}`, category: 'APPLIANCE', coverageDetails: null,
  startDate: day(-300), expiryDate: day(expiresInDays), updatedAt: day(-5), inventoryItem: null, documents: [], ...over,
});
const base = (records, over = {}) => ({
  records, shownIds: new Set(records.map((record) => record.id)), propertyId: PROPERTY, canWrite: true, conflictedIds: new Set(), now: NOW, ...over,
});
function loader(rows = []) {
  const calls = [];
  const load = async (propertyId, keys) => { calls.push({ propertyId, keys: [...keys] }); return rows; };
  return { load, calls };
}
const current = (id, expiresInDays) => ({
  actionKey: warrantyReminderActionKey(id), status: 'PENDING',
  nextDueDate: new Date(day(expiresInDays).getTime() - 30 * 86_400_000),
});

test('an expiring on-screen warranty yields one schema-valid, exact-entity reminder candidate with a registered outcome', async () => {
  const records = [warranty('w1', 20)];
  const { load, calls } = loader();
  const [candidate, ...rest] = await warrantyListReminderCandidates(base(records, { loadReminderTasks: load }));
  assert.equal(rest.length, 0);
  assert.doesNotThrow(() => SuggestedNextActionCandidateSchema.parse(candidate));
  assert.equal(candidate.operationId, 'HOME_DEADLINE_MONITOR');
  assert.equal(candidate.outcomeKey, 'MONITOR_WARRANTY_EXPIRY');
  assert.equal(candidate.sourceOperationId, 'WARRANTY_LOOKUP');
  assert.deepEqual(candidate.entityContext, { propertyId: PROPERTY, entityType: 'WARRANTY', entityId: 'w1', contextVersion: warrantyContextVersion(records[0]) });
  assert.ok(isRegisteredOutcome('HOME_DEADLINE_MONITOR', 'MONITOR_WARRANTY_EXPIRY'));
  assert.equal(calls.length, 1, 'exactly one batched lookup');
  assert.deepEqual(calls[0].keys, [warrantyReminderActionKey('w1')]);
});

test('the warranty list owns this outcome (registered relationship), so the ownership claim is honored', () => {
  assert.equal(currentOperationOwnsOutcome('WARRANTY_LOOKUP', { operationId: 'HOME_DEADLINE_MONITOR', outcomeKey: 'MONITOR_WARRANTY_EXPIRY' }), true);
  assert.equal(currentOperationOwnsOutcome('INVENTORY_LOOKUP', { operationId: 'HOME_DEADLINE_MONITOR', outcomeKey: 'MONITOR_WARRANTY_EXPIRY' }), false);
});

test('role floor: the destination needs the same write access the nomination requires', async () => {
  assert.notEqual(ASK_OPERATION_DEFINITIONS.HOME_DEADLINE_MONITOR.propertyRoleFloor, 'VIEWER');
  const { load, calls } = loader();
  assert.deepEqual(await warrantyListReminderCandidates(base([warranty('w1', 20)], { canWrite: false, loadReminderTasks: load })), []);
  assert.equal(calls.length, 0, 'a viewer costs no query');
});

test('nothing expiring, not on screen, expired, not started or in conflict: no candidate and no query', async () => {
  const cases = [
    base([warranty('far', 200)]),
    base([warranty('gone', -3)]),
    base([warranty('later', 20, { startDate: day(10) })]),
    base([warranty('hidden', 20)], { shownIds: new Set(['other']) }),
    base([warranty('conflict', 20)], { conflictedIds: new Set(['conflict']) }),
  ];
  for (const input of cases) {
    const { load, calls } = loader();
    assert.deepEqual(await warrantyListReminderCandidates({ ...input, loadReminderTasks: load }), [], input.records[0].id);
    assert.equal(calls.length, 0, `${input.records[0].id} must not query`);
  }
});

test('monitor state: a current reminder suppresses that warranty; the next soonest without one is offered; one batched query', async () => {
  const records = [warranty('soon', 10), warranty('later', 30), warranty('latest', 50)];
  const { load, calls } = loader([current('soon', 10)]);
  const result = await warrantyListReminderCandidates(base(records, { loadReminderTasks: load }));
  assert.deepEqual(result.map((candidate) => candidate.entityContext.entityId), ['later']);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].keys, ['soon', 'later', 'latest'].map(warrantyReminderActionKey));

  const all = loader(records.map((record, index) => current(record.id, [10, 30, 50][index])));
  assert.deepEqual(await warrantyListReminderCandidates(base(records, { loadReminderTasks: all.load })), []);
});

test('a cancelled, completed or differently-dated reminder does not count as current', () => {
  const expiry = day(20);
  const due = new Date(expiry.getTime() - 30 * 86_400_000);
  assert.equal(warrantyReminderIsCurrent({ status: 'PENDING', nextDueDate: due }, expiry), true);
  assert.equal(warrantyReminderIsCurrent({ status: 'CANCELLED', nextDueDate: due }, expiry), false);
  assert.equal(warrantyReminderIsCurrent({ status: 'COMPLETED', nextDueDate: due }, expiry), false);
  assert.equal(warrantyReminderIsCurrent({ status: 'PENDING', nextDueDate: day(5) }, expiry), false);
  assert.equal(warrantyReminderIsCurrent(null, expiry), false);
});

test('a monitor-state lookup failure offers nothing rather than a possible duplicate', async () => {
  const failing = async () => { throw new Error('db down'); };
  assert.deepEqual(await warrantyListReminderCandidates(base([warranty('w1', 20)], { loadReminderTasks: failing })), []);
});

test('the lookup is bounded', async () => {
  const records = Array.from({ length: 25 }, (_, i) => warranty(`w${String(i).padStart(2, '0')}`, 5 + i));
  const { load, calls } = loader();
  await warrantyListReminderCandidates(base(records, { loadReminderTasks: load }));
  assert.ok(calls[0].keys.length <= 10);
});

test('on-screen ids come from the real list result, so a filtered view only nominates what it shows', () => {
  const records = [warranty('exp', 20), warranty('act', 200)];
  const result = warrantiesFromRecords({ message: 'Show my warranties', propertyId: PROPERTY, records, canWrite: true, ownedIds: new Set(), now: NOW });
  const shown = shownWarrantyIds(result);
  assert.ok(shown.has('exp') && shown.has('act'));
  const empty = warrantiesFromRecords({ message: 'Show my warranties', propertyId: PROPERTY, records: [], canWrite: true, ownedIds: new Set(), now: NOW });
  assert.equal(shownWarrantyIds(empty).size, 0);
});

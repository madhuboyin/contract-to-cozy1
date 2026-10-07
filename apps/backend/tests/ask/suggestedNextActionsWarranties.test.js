const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { SuggestedNextActionSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { warrantyExpiryReminderCandidates, warrantyReminderActionKey } = require('../../src/services/ask/handlers/warranties.handler.ts');
const { homeDeadlineMonitorResult } = require('../../src/services/ask/handlers/miscHandlers.handler.ts');
const { warrantyContextVersion } = require('../../src/services/ask/handlers/homeRecordWrites.handler.ts');
const { warrantyContextVersion: leafVersion } = require('../../src/services/ask/suggestedActions/domainVersions.ts');
const { isRegisteredOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');
const { getSuggestedNextActionEntityValidator } = require('../../src/services/ask/suggestedActions/suggestedNextActionEntityValidators.ts');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Appendix C, warranties: "remind me before this warranty expires".

const NOW = new Date('2026-10-04T12:00:00.000Z');
const UPDATED = new Date('2026-10-04T11:00:00.000Z');
const future = (days) => new Date(NOW.getTime() + days * 86_400_000);
const warranty = (over = {}) => ({ id: 'w-1', providerName: 'Acme Home Shield', expiryDate: future(200), updatedAt: UPDATED, ...over });
const ctx = { propertyId: 'prop-1', sourceOperationId: 'CAPTURE_WARRANTY_CONFIRM', checkExistingReminder: false, now: NOW };

// ---- candidate -------------------------------------------------------------------------------------------------------------

test('a warranty with a future expiry nominates one reminder candidate on that exact warranty', async () => {
  const [candidate, ...rest] = await warrantyExpiryReminderCandidates(warranty(), ctx);
  assert.equal(rest.length, 0);
  assert.ok(SuggestedNextActionCandidateSchema.safeParse(candidate).success, JSON.stringify(candidate));
  assert.equal(candidate.operationId, 'HOME_DEADLINE_MONITOR');
  assert.equal(candidate.outcomeKey, 'MONITOR_WARRANTY_EXPIRY');
  assert.ok(isRegisteredOutcome('HOME_DEADLINE_MONITOR', 'MONITOR_WARRANTY_EXPIRY'));
  assert.equal(candidate.label, 'Remind me before the Acme Home Shield warranty expires');
  assert.equal(candidate.entityContext.entityType, 'WARRANTY');
  assert.equal(candidate.entityContext.entityId, 'w-1');
  assert.equal(candidate.entityContext.contextVersion, warrantyContextVersion(warranty()));
  assert.equal(warrantyContextVersion(warranty()), leafVersion(warranty()), 'handler and validator share one version function');
});

test('an expired warranty offers nothing, and a long provider name keeps the label within the limit', async () => {
  assert.deepEqual(await warrantyExpiryReminderCandidates(warranty({ expiryDate: future(-1) }), ctx), []);
  const [long] = await warrantyExpiryReminderCandidates(warranty({ providerName: 'The Very Long Named National Residential Home Protection and Appliance Service Company' }), ctx);
  assert.ok(long.label.length <= 80 && SuggestedNextActionCandidateSchema.safeParse(long).success, long.label);
});

test('an active reminder already set for the date the monitor would use suppresses the suggestion; other reminder states do not', async () => {
  const dueFor = (w) => new Date(w.expiryDate.getTime() - 30 * 86_400_000);
  const w = warranty();
  const original = prisma.propertyMaintenanceTask.findUnique;
  let lookedUp = null;
  const withTask = async (task) => {
    prisma.propertyMaintenanceTask.findUnique = async (args) => { lookedUp = args.where.propertyId_actionKey; return task; };
    try { return await warrantyExpiryReminderCandidates(w, { ...ctx, checkExistingReminder: true }); } finally { prisma.propertyMaintenanceTask.findUnique = original; }
  };
  assert.deepEqual(await withTask({ status: 'PENDING', nextDueDate: dueFor(w) }), [], 'active reminder at the same date');
  assert.deepEqual(lookedUp, { propertyId: 'prop-1', actionKey: warrantyReminderActionKey('w-1') });
  assert.equal((await withTask(null)).length, 1, 'no reminder yet');
  assert.equal((await withTask({ status: 'CANCELLED', nextDueDate: dueFor(w) })).length, 1, 'cancelled reminder');
  assert.equal((await withTask({ status: 'COMPLETED', nextDueDate: dueFor(w) })).length, 1, 'completed reminder');
  assert.equal((await withTask({ status: 'PENDING', nextDueDate: future(10) })).length, 1, 'reminder pinned to an old expiry: the confirmation moves it');
});

test('a failing reminder lookup costs only the suggestion; a malformed warranty row yields nothing', async () => {
  const original = prisma.propertyMaintenanceTask.findUnique;
  prisma.propertyMaintenanceTask.findUnique = async () => { throw new Error('db down'); };
  try { assert.deepEqual(await warrantyExpiryReminderCandidates(warranty(), { ...ctx, checkExistingReminder: true }), []); } finally { prisma.propertyMaintenanceTask.findUnique = original; }
  assert.deepEqual(await warrantyExpiryReminderCandidates({ id: 'w', providerName: 'X', updatedAt: UPDATED }, ctx), []);
});

test('the reminder key the suggestion checks is the one the confirmation deduplicates on', () => {
  assert.equal(warrantyReminderActionKey('w-9'), 'ask-deadline:WARRANTY:w-9');
  const confirm = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/workflowConfirm.handler.ts'), 'utf8');
  assert.match(confirm, /`ask-deadline:\$\{candidate\.data\.sourceType\}:\$\{candidate\.data\.sourceId\}`/);
  assert.match(confirm, /propertyId_actionKey: \{ propertyId: execution\.propertyId, actionKey \}/, 'confirmation still looks up the existing reminder before creating one');
});

// ---- the monitor operation, executed with stubbed reads ------------------------------------------------------------------------

const ROWS = [
  { id: 'w-early', propertyId: 'prop-1', category: 'APPLIANCE', providerName: 'Early Co', expiryDate: future(60), updatedAt: UPDATED },
  { id: 'w-late', propertyId: 'prop-1', category: 'ROOFING', providerName: 'Late Co', expiryDate: future(300), updatedAt: UPDATED },
  { id: 'w-other', propertyId: 'prop-2', category: 'PLUMBING', providerName: 'Other Home Co', expiryDate: future(90), updatedAt: UPDATED },
];
const withWarranties = async (rows, fn) => {
  const original = [prisma.warranty.findFirst, prisma.warranty.findMany];
  const calls = [];
  prisma.warranty.findFirst = async (args) => {
    calls.push(args);
    const { id, propertyId, expiryDate } = args.where;
    return rows.filter((r) => (!id || r.id === id) && (!propertyId || r.propertyId === propertyId) && (!expiryDate?.gt || r.expiryDate > expiryDate.gt))
      .sort((a, b) => a.expiryDate - b.expiryDate)[0] ?? null;
  };
  prisma.warranty.findMany = async (args) => rows.filter((r) => r.propertyId === args.where.propertyId);
  try { return await fn(calls); } finally { [prisma.warranty.findFirst, prisma.warranty.findMany] = original; prisma.warranty.findFirst = original[0]; prisma.warranty.findMany = original[1]; }
};
const exactTarget = (id, over = {}) => ({ warrantyId: id, contextVersion: leafVersion(ROWS.find((r) => r.id === id) ?? { id, updatedAt: UPDATED }), ...over });
const MESSAGE = 'Remind me before the Late Co warranty expires.';

test('with two future warranties the selected chip reminds about its own warranty, not the earliest', async () => {
  await withWarranties(ROWS, async () => {
    const result = await homeDeadlineMonitorResult('u1', 'prop-1', MESSAGE, exactTarget('w-late'));
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.equal(result.parameters.homeDeadlineMonitor.sourceId, 'w-late');
    assert.equal(result.parameters.homeDeadlineMonitor.sourceType, 'WARRANTY');
    assert.match(result.parameters.homeDeadlineMonitor.title, /Late Co/);
    assert.equal(result.parameters.homeDeadlineMonitor.dueDate, new Date(future(300).getTime() - 30 * 86_400_000).toISOString().slice(0, 10));
  });
});

test('ordinary free text with no entity keeps today\'s earliest-future-warranty selection', async () => {
  await withWarranties(ROWS, async (calls) => {
    const result = await homeDeadlineMonitorResult('u1', 'prop-1', 'Remind me about my warranty');
    assert.equal(result.parameters.homeDeadlineMonitor.sourceId, 'w-early');
    assert.ok(calls[0].orderBy, 'the search path is still the ordered search');
  });
});

test('a forged warranty id from another property is rejected as stale, with no other warranty chosen', async () => {
  await withWarranties(ROWS, async (calls) => {
    const result = await homeDeadlineMonitorResult('u1', 'prop-1', MESSAGE, exactTarget('w-other'));
    assert.equal(result.reasonCode, 'ASK_SUGGESTED_ACTION_STALE');
    assert.equal(result.confirmation, undefined);
    assert.ok(calls.every((c) => c.where.id === 'w-other'), 'only the referenced warranty was ever looked up');
  });
});

test('a deleted, changed or expired target gives the stale recovery and never falls back to another warranty', async () => {
  const expired = { ...ROWS[0], id: 'w-expired', expiryDate: future(-5) };
  await withWarranties([...ROWS, expired], async (calls) => {
    for (const [name, target] of [
      ['deleted', exactTarget('w-gone', { contextVersion: null })],
      ['changed since offered', exactTarget('w-late', { contextVersion: leafVersion({ id: 'w-late', updatedAt: new Date(UPDATED.getTime() - 1000) }) })],
      ['expired', exactTarget('w-expired', { contextVersion: null })],
    ]) {
      const result = await homeDeadlineMonitorResult('u1', 'prop-1', MESSAGE, target);
      assert.equal(result.reasonCode, 'ASK_SUGGESTED_ACTION_STALE', name);
      assert.equal(result.status, 'NOT_APPLICABLE', name);
    }
    assert.ok(calls.every((c) => c.where.id && !c.orderBy), 'no earliest-warranty search ran for any stale target');
  });
});

// ---- finalizer with the real validator ---------------------------------------------------------------------------------------

const clock = fixedSuggestedNextActionClock(NOW);
const finalize = (candidates, availability = null) => finalizeSuggestedNextActionsWithReport(
  { result: { status: 'COMPLETED', blocks: [], suggestions: ['Show my warranties'], suggestedNextActionCandidates: candidates }, executionId: 'exec-1', userId: 'u1', sessionId: 's1', propertyId: 'prop-1', operationId: 'WARRANTY_CORRECT', message: 'Correct the expiry date of this warranty.' },
  { clock, loadOperationAvailability: async () => new Map([['HOME_DEADLINE_MONITOR', availability]]), loadExecutionExpiresAt: async () => null },
);
const withValidatorRows = async (rows, fn) => {
  const original = prisma.warranty.findMany;
  let calls = 0;
  prisma.warranty.findMany = async (args) => { calls += 1; return rows.filter((r) => args.where.id.in.includes(r.id) && (!args.where.propertyId || args.where.propertyId === r.propertyId)); };
  try { return await fn(() => calls); } finally { prisma.warranty.findMany = original; }
};
const vrow = (over = {}) => ({ id: 'w-1', propertyId: 'prop-1', updatedAt: UPDATED, ...over });
const candidates = () => warrantyExpiryReminderCandidates(warranty(), ctx);

test('the warranty validator is registered; the typed chip survives without a raw fallback', async () => {
  assert.equal(typeof getSuggestedNextActionEntityValidator('WARRANTY'), 'function');
  await withValidatorRows([vrow()], async (calls) => {
    const { result } = await finalize(await candidates());
    assert.equal(calls(), 1);
    assert.equal(result.suggestedNextActions.length, 1);
    assert.ok(SuggestedNextActionSchema.safeParse(result.suggestedNextActions[0]).success);
    assert.deepEqual(result.suggestions, []);
  });
});

test('a warranty that was deleted, is in another property, or changed since the receipt is not offered; a viewer is not offered it', async () => {
  const c = await candidates();
  await withValidatorRows([], async () => assert.deepEqual((await finalize(c)).result.suggestedNextActions, [], 'deleted'));
  await withValidatorRows([vrow({ propertyId: 'prop-2' })], async () => assert.deepEqual((await finalize(c)).result.suggestedNextActions, [], 'other property'));
  await withValidatorRows([vrow({ updatedAt: new Date(UPDATED.getTime() + 1000) })], async () => {
    const { result, report } = await finalize(c);
    assert.deepEqual(result.suggestedNextActions, []);
    assert.equal(report.diagnostics.rejections['FRESHNESS:CONTEXT_VERSION_STALE'], 1);
  });
  await withValidatorRows([vrow()], async () => {
    const { result, report } = await finalize(c, 'AUTHORIZATION');
    assert.deepEqual(result.suggestedNextActions, []);
    assert.equal(report.diagnostics.rejections['AUTHORIZATION:ROLE_BELOW_FLOOR'], 1);
  });
});

// ---- wiring guards ---------------------------------------------------------------------------------------------------------

test('the recorded receipt and an expiry-date correction nominate the reminder; other corrections do not', () => {
  const record = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/recordConfirm.handler.ts'), 'utf8');
  assert.match(record, /suggestedNextActionCandidates: field === 'expiryDate'\n\s+\? await warrantyExpiryReminderCandidates\(updated, \{[^}]*checkExistingReminder: true/);
  assert.doesNotMatch(record, /field === 'startDate'\s*\?\s*await warrantyExpiryReminderCandidates/);
  const capture = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/captureConfirm.handler.ts'), 'utf8');
  assert.match(capture, /warrantyExpiryReminderCandidates\(warranty, \{[^}]*checkExistingReminder: false/);
});

test('the monitor capability targets the exact warranty only for the registered outcome on a WARRANTY entity', () => {
  const misc = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/miscHandlers.handler.ts'), 'utf8');
  assert.match(misc, /launch\?\.outcomeKey === 'MONITOR_WARRANTY_EXPIRY' && launch\.entityType === 'WARRANTY' && launch\.entityId/);
});

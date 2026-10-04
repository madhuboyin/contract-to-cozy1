const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { SuggestedNextActionSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { homeEventFollowUpCandidates, homeEventContextVersion } = require('../../src/services/ask/handlers/homeRecordWrites.handler.ts');
const { homeEventContextVersion: leafVersion } = require('../../src/services/ask/suggestedActions/domainVersions.ts');
const { isRegisteredOutcome, correctionFieldForOutcome, MISSING_FACT_CAPTURES } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { HOME_EVENT_CORRECTION_FIELDS } = require('../../src/services/ask/support/homeEventCorrection.ts');
const { finalizeSuggestedNextActionsWithReport } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');
const { getSuggestedNextActionEntityValidator } = require('../../src/services/ask/suggestedActions/suggestedNextActionEntityValidators.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');

// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Appendix C, home events: link-to-item and repair-cost chips on the event receipts.

const NOW = new Date('2026-10-04T12:00:00.000Z');
const ctx = { propertyId: 'prop-1', sourceOperationId: 'HOME_EVENT_CORRECT' };
const event = (over = {}) => ({ id: 'ev-1', title: 'Water heater repair', type: 'REPAIR', revision: 2, amount: null, inventoryItemId: null, ...over });

const withItemCount = async (count, fn) => {
  const original = prisma.inventoryItem.count;
  let calls = 0;
  prisma.inventoryItem.count = async () => { calls += 1; return count; };
  try { return await fn(() => calls); } finally { prisma.inventoryItem.count = original; }
};
const outcomes = async (e, items = 3) => withItemCount(items, async () => (await homeEventFollowUpCandidates(e, ctx)).map((c) => c.outcomeKey));

// ---- candidates by event type ----------------------------------------------------------------------------------------------

test('a REPAIR with no item and no amount offers the link and the cost, link first', async () => {
  assert.deepEqual(await outcomes(event()), ['LINK_INVENTORY_ITEM', 'ADD_AMOUNT']);
});

test('MAINTENANCE and INSPECTION are offered the link only; the cost is never prompted for them', async () => {
  assert.deepEqual(await outcomes(event({ type: 'MAINTENANCE' })), ['LINK_INVENTORY_ITEM']);
  assert.deepEqual(await outcomes(event({ type: 'INSPECTION' })), ['LINK_INVENTORY_ITEM']);
});

test('other event types offer nothing', async () => {
  for (const type of ['NOTE', 'PURCHASE', 'DOCUMENT', 'CLAIM', 'IMPROVEMENT', 'MILESTONE', 'OTHER', undefined]) assert.deepEqual(await outcomes(event({ type })), [], String(type));
});

test('no link chip when the event is already linked or the home has no inventory item to link; a recorded amount (even 0) removes the cost chip', async () => {
  assert.deepEqual(await outcomes(event({ inventoryItemId: 'item-1' })), ['ADD_AMOUNT']);
  assert.deepEqual(await outcomes(event(), 0), ['ADD_AMOUNT']);
  assert.deepEqual(await outcomes(event({ amount: 0 })), ['LINK_INVENTORY_ITEM']);
  assert.deepEqual(await outcomes(event({ amount: '125.00', inventoryItemId: 'item-1' })), []);
});

test('re-evaluated from the replacement record: a correction that changes the type, amount or item changes the chips', async () => {
  assert.deepEqual(await outcomes(event({ type: 'NOTE' })), [], 'before');
  assert.deepEqual(await outcomes(event({ type: 'REPAIR' })), ['LINK_INVENTORY_ITEM', 'ADD_AMOUNT'], 'type corrected to REPAIR');
  assert.deepEqual(await outcomes(event({ amount: 90 })), ['LINK_INVENTORY_ITEM'], 'amount added');
  assert.deepEqual(await outcomes(event({ amount: 90, inventoryItemId: 'item-1' })), [], 'item linked');
});

test('the item count is only queried when a link could be offered', async () => {
  await withItemCount(3, async (calls) => {
    await homeEventFollowUpCandidates(event({ type: 'NOTE' }), ctx);
    await homeEventFollowUpCandidates(event({ inventoryItemId: 'item-1', amount: 5 }), ctx);
    assert.equal(calls(), 0);
    await homeEventFollowUpCandidates(event(), ctx);
    assert.equal(calls(), 1);
  });
});

test('each candidate is schema-valid, names the exact event and version, and uses a registered outcome mapped to a real correction field', async () => {
  const candidates = await withItemCount(2, () => homeEventFollowUpCandidates(event({ title: 'Garage door spring repair' }), ctx));
  assert.equal(candidates.length, 2);
  for (const candidate of candidates) {
    assert.ok(SuggestedNextActionCandidateSchema.safeParse(candidate).success, JSON.stringify(candidate));
    assert.equal(candidate.operationId, 'HOME_EVENT_CORRECT');
    assert.equal(candidate.tier, 'RECORD_ACTION');
    assert.equal(candidate.entityContext.entityType, 'HOME_EVENT');
    assert.equal(candidate.entityContext.entityId, 'ev-1');
    assert.equal(candidate.entityContext.contextVersion, homeEventContextVersion({ id: 'ev-1', revision: 2 }));
    assert.ok(isRegisteredOutcome('HOME_EVENT_CORRECT', candidate.outcomeKey));
    assert.ok(correctionFieldForOutcome('HOME_EVENT_CORRECT', candidate.outcomeKey) in HOME_EVENT_CORRECTION_FIELDS);
  }
  assert.deepEqual(candidates.map((c) => c.label), ['Link Garage door spring repair to an inventory item', 'Add the cost of Garage door spring repair']);
  assert.equal(homeEventContextVersion({ id: 'a', revision: 1 }), leafVersion({ id: 'a', revision: 1 }));
  const [long] = await withItemCount(1, () => homeEventFollowUpCandidates(event({ title: 'Replacement of the entire north-facing roof section after the storm damage last spring' }), ctx));
  assert.ok(long.label.length <= 80 && SuggestedNextActionCandidateSchema.safeParse(long).success, long.label);
});

test('a failing lookup costs only the suggestions; a record with no revision carries no version', async () => {
  const original = prisma.inventoryItem.count;
  prisma.inventoryItem.count = async () => { throw new Error('db down'); };
  try { assert.deepEqual(await homeEventFollowUpCandidates(event(), ctx), []); } finally { prisma.inventoryItem.count = original; }
  const [c] = await withItemCount(1, () => homeEventFollowUpCandidates(event({ revision: undefined }), ctx));
  assert.equal(c.entityContext.contextVersion, null);
});

// ---- the correction operation: the outcome decides the field, a typed target is authoritative -----------------------------------

const EVENTS = [
  { id: 'ev-room', title: 'Room Addition permit', revision: 1, occurredAt: new Date('2026-03-01'), datePrecision: 'EXACT_DATE', summary: null, amount: null, type: 'IMPROVEMENT', importance: 'NORMAL', roomId: null, inventoryItemId: null },
  { id: 'ev-twin', title: 'Water heater repair', revision: 3, occurredAt: new Date('2026-04-01'), datePrecision: 'EXACT_DATE', summary: null, amount: null, type: 'REPAIR', importance: 'NORMAL', roomId: null, inventoryItemId: null },
];
const withStubs = async (events, fn) => {
  const o = [prisma.householdMember.findUnique, prisma.homeEvent.findMany, prisma.inventoryItem.findMany, prisma.inventoryRoom.findMany];
  prisma.householdMember.findUnique = async () => ({ role: 'OWNER', isPrimaryOwner: true });
  prisma.homeEvent.findMany = async () => events;
  prisma.inventoryItem.findMany = async () => [{ id: 'item-1', name: 'Water heater' }];
  prisma.inventoryRoom.findMany = async () => [{ id: 'room-1', name: 'Kitchen' }];
  try { return await fn(); } finally { prisma.householdMember.findUnique = o[0]; prisma.homeEvent.findMany = o[1]; prisma.inventoryItem.findMany = o[2]; prisma.inventoryRoom.findMany = o[3]; }
};
const invoke = (message, launchContext) => capabilityInvoke('HOME_EVENT_CORRECT', { userId: 'u1', propertyId: 'prop-1', message, launchContext });
const launch = (over = {}) => ({ surface: 'ASK_SUGGESTED_ACTION', operationId: 'HOME_EVENT_CORRECT', entityType: 'HOME_EVENT', entityId: 'ev-room', contextVersion: homeEventContextVersion({ id: 'ev-room', revision: 1 }), outcomeKey: 'ADD_AMOUNT', ...over });

test('a selected ADD_AMOUNT on an event whose title contains "Room" proposes the amount field, not the room link', async () => {
  await withStubs(EVENTS, async () => {
    const message = 'Correct the amount of the timeline event "Room Addition permit".';
    const typed = await invoke(message, launch());
    assert.equal(typed.status, 'NEEDS_CONFIRMATION');
    assert.equal(typed.parameters.homeEventCorrection.field, 'amount');
    assert.equal(typed.parameters.homeEventCorrection.eventId, 'ev-room');
    // Free text alone keeps the old keyword behaviour ("room" wins), so the outcome is what protects the selection.
    const free = await invoke(message, { surface: 'ASK_WORKSPACE' });
    assert.equal(free.parameters.homeEventCorrection.field, 'roomId');
  });
});

test('a selected LINK_INVENTORY_ITEM proposes the inventory-item field on the exact event', async () => {
  await withStubs(EVENTS, async () => {
    const result = await invoke('Correct the inventory item of the timeline event "Water heater repair".', launch({ entityId: 'ev-twin', contextVersion: homeEventContextVersion({ id: 'ev-twin', revision: 3 }), outcomeKey: 'LINK_INVENTORY_ITEM' }));
    assert.equal(result.parameters.homeEventCorrection.field, 'inventoryItemId');
    assert.equal(result.parameters.homeEventCorrection.eventId, 'ev-twin');
  });
});

test('a superseded, deleted, hidden or changed target gives the stale recovery and never resolves a similarly named event', async () => {
  // ev-old was superseded by ev-twin (same title): it is not in the current, visible list.
  await withStubs(EVENTS, async () => {
    const message = 'Correct the amount of the timeline event "Water heater repair".';
    const superseded = await invoke(message, launch({ entityId: 'ev-old', contextVersion: homeEventContextVersion({ id: 'ev-old', revision: 2 }) }));
    assert.equal(superseded.reasonCode, 'ASK_SUGGESTED_ACTION_STALE');
    assert.equal(superseded.confirmation, undefined);
    const changed = await invoke(message, launch({ entityId: 'ev-twin', contextVersion: homeEventContextVersion({ id: 'ev-twin', revision: 2 }) }));
    assert.equal(changed.reasonCode, 'ASK_SUGGESTED_ACTION_STALE', 'revision moved on');
  });
  await withStubs([], async () => assert.equal((await invoke('x', launch())).reasonCode, 'ASK_SUGGESTED_ACTION_STALE', 'no visible events'));
});

test('without a registered outcome on a HOME_EVENT entity the old selection path is unchanged', async () => {
  await withStubs(EVENTS, async () => {
    const result = await invoke('Correct the date of the timeline event "Water heater repair".', { surface: 'ASK_WORKSPACE', entityType: 'HOME_EVENT', entityId: 'ev-twin' });
    assert.equal(result.parameters.homeEventCorrection.field, 'occurredAt');
    const unknown = await invoke('Correct the date of the timeline event "Water heater repair".', launch({ entityId: 'ev-twin', outcomeKey: 'NOT_AN_OUTCOME' }));
    assert.equal(unknown.parameters.homeEventCorrection.field, 'occurredAt', 'an unknown outcome is ignored, not trusted');
  });
});

// ---- validator + finalizer ---------------------------------------------------------------------------------------------------

const clock = fixedSuggestedNextActionClock(NOW);
const finalize = (candidates, availability = null) => finalizeSuggestedNextActionsWithReport(
  { result: { status: 'COMPLETED', blocks: [], suggestions: ['Show my home timeline'], suggestedNextActionCandidates: candidates }, executionId: 'exec-1', userId: 'u1', sessionId: 's1', propertyId: 'prop-1', operationId: 'HOME_EVENT_CORRECT', message: 'Correct the title' },
  { clock, loadOperationAvailability: async () => new Map([['HOME_EVENT_CORRECT', availability]]), loadExecutionExpiresAt: async () => null },
);
const withEventRows = async (rows, fn) => {
  const original = prisma.homeEvent.findMany;
  let calls = 0; let lastWhere = null;
  prisma.homeEvent.findMany = async (args) => {
    calls += 1; lastWhere = args.where;
    return rows.filter((r) => args.where.id.in.includes(r.id) && r.isCurrent === args.where.isCurrent && r.deletedAt === null
      && (!args.where.propertyId || args.where.propertyId === r.propertyId)
      && (r.visibility !== 'PRIVATE' || r.createdById === 'u1'));
  };
  try { return await fn(() => ({ calls, lastWhere })); } finally { prisma.homeEvent.findMany = original; }
};
const row = (over = {}) => ({ id: 'ev-1', propertyId: 'prop-1', revision: 2, isCurrent: true, deletedAt: null, visibility: 'HOUSEHOLD', createdById: 'u1', ...over });
const candidates = () => withItemCount(2, () => homeEventFollowUpCandidates(event(), ctx));

test('the HOME_EVENT validator is registered and enforces current revision, not deleted, same property and creator-only privacy', async () => {
  assert.equal(typeof getSuggestedNextActionEntityValidator('HOME_EVENT'), 'function');
  const c = await candidates();
  await withEventRows([row()], async (probe) => {
    const { result } = await finalize(c);
    assert.equal(probe().calls, 1, 'one batched query for both candidates');
    assert.deepEqual(result.suggestedNextActions.map((a) => a.outcomeKey), ['ADD_AMOUNT', 'LINK_INVENTORY_ITEM'], 'tier-only: same tier orders by outcomeKey');
    for (const a of result.suggestedNextActions) { assert.ok(SuggestedNextActionSchema.safeParse(a).success); assert.equal(a.provenance.source, 'MISSING_DETAIL'); }
    assert.deepEqual(result.suggestions, ['Show my home timeline']);
    assert.equal(probe().lastWhere.isCurrent, true);
    assert.equal(probe().lastWhere.deletedAt, null);
  });
  for (const [name, over] of [['superseded', { isCurrent: false }], ['deleted', { deletedAt: new Date() }], ['other property', { propertyId: 'prop-2' }], ['private to someone else', { visibility: 'PRIVATE', createdById: 'u2' }]]) {
    await withEventRows([row(over)], async () => assert.deepEqual((await finalize(c)).result.suggestedNextActions, [], name));
  }
  await withEventRows([row({ visibility: 'PRIVATE', createdById: 'u1' })], async () => assert.equal((await finalize(c)).result.suggestedNextActions.length, 2, 'own private event'));
  await withEventRows([row({ revision: 3 })], async () => {
    const { result, report } = await finalize(c);
    assert.deepEqual(result.suggestedNextActions, []);
    assert.equal(report.diagnostics.rejections['FRESHNESS:CONTEXT_VERSION_STALE'], 2);
  });
  await withEventRows([row()], async () => assert.deepEqual((await finalize(c, 'AUTHORIZATION')).result.suggestedNextActions, [], 'viewer'));
});

// ---- wiring + intentional terminal receipts ---------------------------------------------------------------------------------

test('both event receipts build suggestions from the complete record; the correction receipt uses the replacement event', () => {
  const record = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/recordConfirm.handler.ts'), 'utf8');
  assert.match(record, /finish = async \(replacement: \{ id: string; title: string; type\?/);
  assert.match(record, /homeEventFollowUpCandidates\(replacement, \{ propertyId: execution\.propertyId!, sourceOperationId: 'HOME_EVENT_CORRECT' \}\)/);
  const capture = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/captureConfirm.handler.ts'), 'utf8');
  assert.match(capture, /homeEventFollowUpCandidates\(event, \{ propertyId: execution\.propertyId, sourceOperationId: 'CAPTURE_EVENT_CONFIRM' \}\)/);
});

test('invalidation of the persisted replace-or-repair and do-nothing analyses is done by the service both event writes call', () => {
  const service = readFileSync(resolve(__dirname, '../../src/services/homeEvents.service.ts'), 'utf8');
  assert.equal((service.match(/markReplaceRepairStale\(/g) ?? []).length >= 3, true);
  assert.equal((service.match(/markDoNothingRunsStale\(/g) ?? []).length >= 3, true);
  const capture = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/captureConfirm.handler.ts'), 'utf8');
  assert.match(capture, /homeEventsServiceForCapture\.createHomeEvent/);
  assert.match(capture, /homeEventsServiceForCapture\.updateHomeEvent/);
});

test('radar receipts and the visibility receipt stay plain by decision', () => {
  const radar = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/radarConfirm.handler.ts'), 'utf8');
  assert.doesNotMatch(radar, /suggestedNextActionCandidates/);
  const home = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/homeEventRadar.handler.ts'), 'utf8');
  assert.doesNotMatch(home, /suggestedNextActionCandidates/);
});

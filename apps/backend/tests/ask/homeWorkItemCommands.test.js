const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Maintenance and Home Operations": the work-items list, snooze, reschedule and routine bulk-accept (FRD v1.342). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const getUse = require('../../src/modules/homeOperations/application/getWorkItem.usecase.ts');
const listUse = require('../../src/modules/homeOperations/application/listWorkItems.usecase.ts');
const snoozeUse = require('../../src/modules/homeOperations/application/snoozeWorkItem.usecase.ts');
const reschedUse = require('../../src/modules/homeOperations/application/rescheduleWorkItem.usecase.ts');
const batchUse = require('../../src/modules/homeOperations/application/batchTransitionWorkItems.usecase.ts');
const transitionUse = require('../../src/modules/homeOperations/application/transitionWorkItem.usecase.ts');
const command = require('../../src/services/ask/support/homeWorkItemCommand.ts');
const { homeWorkItemsFromRows } = require('../../src/services/ask/handlers/homeWorkItems.handler.ts');

const OP = 'HOME_WORK_ITEM_COMMAND';
const M = command.WORK_ITEM_MESSAGES;
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const iso = (v) => (v ? v.toISOString() : '');
const item = (over = {}) => ({ id: 'w1', propertyId: 'prop-1', title: 'Flush water heater', state: 'ACCEPTED', safetyTier: 'LOW_CONSEQUENCE', obligationType: 'MAINTENANCE', dueAt: new Date('2026-10-01T12:00:00Z'), dueWindowStart: null, dueWindowEnd: null, snoozedUntil: null, supersededByWorkItemId: null, ownerUserId: null, isRoutine: false, legalNextStates: ['SCHEDULED', 'IN_PROGRESS', 'BLOCKED', 'DEFERRED', 'REOPENED'], closureDispositionRule: 'OPTIONAL', ...over });
const version = (kind, i) => sha(`work-item:${kind}:${i.id}:${i.state}:${iso(i.dueAt)}:${iso(i.dueWindowStart)}:${iso(i.dueWindowEnd)}:${iso(i.snoozedUntil)}:${i.supersededByWorkItemId ?? ''}:${i.ownerUserId ?? ''}:${(i.watchers ?? []).map((w) => w.userId).sort().join(',')}`);
const batchVersion = (items) => sha(`work-batch:${items.map((i) => `${i.id}:${i.state}`).sort().join('|')}`);

function install(role, items = [item()]) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: getUse.getWorkItem, l: listUse.listWorkItems, s: snoozeUse.snoozeWorkItem, r: reschedUse.rescheduleWorkItem, b: batchUse.batchTransitionWorkItems, t: transitionUse.transitionWorkItem, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  getUse.getWorkItem = async (id) => items.find((i) => i.id === id) ?? null;
  listUse.listWorkItems = async () => items;
  snoozeUse.snoozeWorkItem = async (a) => { calls.push(['snooze', a]); return {}; };
  reschedUse.rescheduleWorkItem = async (a) => { calls.push(['reschedule', a]); return {}; };
  batchUse.batchTransitionWorkItems = async (a) => { calls.push(['batch', a]); return a.workItemIds.map((id) => ({ workItemId: id, success: true })); };
  transitionUse.transitionWorkItem = async (a) => { calls.push(['transition', a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; getUse.getWorkItem = saved.g; listUse.listWorkItems = saved.l; snoozeUse.snoozeWorkItem = saved.s; reschedUse.rescheduleWorkItem = saved.r; batchUse.batchTransitionWorkItems = saved.b; transitionUse.transitionWorkItem = saved.t; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: command.WORK_ITEM_ENTITY_TYPE, entityId: 'w1', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('routing: the list is typed; the commands are declared-action only; contributor floor', () => {
  assert.equal(resolveAskRoutingCascade('Show my home operations work items', { localRoutingEnabled: true }).operation?.operationId, 'HOME_WORK_ITEMS');
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
});

test('the list drops finished or replaced work, sorts by due date, and offers controls and the batch only to contributors', () => {
  const rows = [
    item({ id: 'late', title: 'Late', dueAt: new Date('2026-12-01T12:00:00Z') }), item({ id: 'soon', title: 'Soon', dueAt: new Date('2026-10-01T12:00:00Z') }),
    item({ id: 'done', state: 'CLOSED' }), item({ id: 'dup', supersededByWorkItemId: 'soon' }),
    item({ id: 'cand', title: 'Routine', state: 'CANDIDATE', dueAt: null }),
  ];
  const view = (canChange) => homeWorkItemsFromRows(rows, canChange, new Date('2026-09-15T00:00:00Z'));
  const contributor = view(true);
  assert.deepEqual(contributor.blocks[1].sections.map((section) => section.title), ['Needs action', 'Recommendations']);
  assert.deepEqual(contributor.blocks[1].sections.flatMap((section) => section.items.map((i) => i.id)), ['soon', 'late', 'cand']);
  assert.equal(contributor.blocks[1].listDensity, 'DENSE');
  assert.deepEqual(contributor.blocks[1].sections.map((section) => section.initialVisibleCount), [2, 1]);
  assert.equal(contributor.blocks[1].description, null);
  assert.deepEqual(contributor.blocks[1].sections[0].items[0].actions.map((a) => a.id), ['work-item-update-status', 'work-item-snooze', 'work-item-reschedule', 'work-item-options']);
  assert.deepEqual(contributor.blocks[0].actions.map((a) => a.id), ['work-items-accept-routine']);
  const viewer = view(false);
  assert.ok(viewer.blocks[1].sections.flatMap((section) => section.items).every((i) => i.actions.length === 0));
  assert.deepEqual(viewer.blocks[0].actions, []);
  assert.equal(homeWorkItemsFromRows([item({ state: 'CLOSED' })], true, new Date()).reasonCode, 'NO_OPEN_WORK_ITEMS');
});

test('the list keeps distinct canonical rows with the same title and adds context instead of deduplicating by copy', () => {
  const result = homeWorkItemsFromRows([
    item({ id: 'decision-1', title: 'Consider replacing your Dishwasher.', homeownerReason: 'The appliance is nearing its expected service life.', subjectType: 'INVENTORY_ITEM' }),
    item({ id: 'decision-2', title: 'Consider replacing your Dishwasher.', homeownerReason: 'Repair costs may exceed the remaining value.', subjectType: 'INVENTORY_ITEM' }),
  ], true, new Date('2026-09-15T00:00:00Z'));
  const rows = result.blocks[1].sections.flatMap((section) => section.items);
  assert.deepEqual(rows.map((row) => row.id), ['decision-1', 'decision-2']);
  assert.deepEqual(rows.map((row) => row.description), [
    'The appliance is nearing its expected service life.',
    'Repair costs may exceed the remaining value.',
  ]);
});

test('the list distinguishes overdue adopted work, paused reminders, reported completion, and recommendations', () => {
  const result = homeWorkItemsFromRows([
    item({ id: 'overdue', dueAt: new Date('2026-09-23T12:00:00Z') }),
    item({ id: 'paused', dueAt: new Date('2026-08-24T12:00:00Z'), snoozedUntil: new Date('2026-11-01T12:00:00Z') }),
    item({ id: 'reported', state: 'REPORTED_COMPLETE', dueAt: new Date('2026-09-15T12:00:00Z') }),
    item({ id: 'candidate', state: 'CANDIDATE', dueAt: new Date('2026-09-01T12:00:00Z'), obligationType: 'DECISION' }),
  ], true, new Date('2026-10-21T12:00:00Z'));
  const rows = result.blocks[1].sections.flatMap((section) => section.items);
  assert.equal(rows.find((row) => row.id === 'overdue').tone, 'CRITICAL');
  assert.match(rows.find((row) => row.id === 'overdue').meta[0], /^Overdue since /);
  assert.equal(rows.find((row) => row.id === 'paused').tone, 'DEFAULT');
  assert.match(rows.find((row) => row.id === 'paused').meta.join(' · '), /Snoozed until/);
  assert.equal(rows.find((row) => row.id === 'reported').tone, 'DEFAULT');
  assert.equal(rows.find((row) => row.id === 'reported').status, 'Waiting for verification');
  assert.match(rows.find((row) => row.id === 'reported').meta.join(' · '), /stays here until the outcome is verified/);
  assert.deepEqual(rows.find((row) => row.id === 'reported').actions.map((action) => action.label), ['Add evidence', 'Update status', 'More options']);
  assert.equal(rows.find((row) => row.id === 'candidate').status, 'Not added');
  assert.equal(rows.find((row) => row.id === 'candidate').description, 'Recommendation · decision');
  assert.match(rows.find((row) => row.id === 'candidate').meta.join(' · '), /Not yet added to your work/);
});

test('snooze and reschedule: form, then a review with before and after; nothing is written; viewers, refresh, finished work refused', async () => {
  let w = install('VIEWER');
  try { assert.equal((await invoke('SNOOZE', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('SNOOZE', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_HOME_WORK_ITEM_NOT_DIRECTLY_ROUTABLE');
    const form = await invoke('SNOOZE', launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.contextVersion, version('SNOOZE', item()));
    const rescheduleForm = await invoke('RESCHEDULE', launch());
    assert.equal(rescheduleForm.status, 'NEEDS_CONTEXT');
    assert.equal(rescheduleForm.captureRequests[0].title, 'Change due date');
    assert.equal(rescheduleForm.captureRequests[0].question, 'Flush water heater');
    assert.equal(rescheduleForm.captureRequests[0].helpText, 'Current due date: Oct 1, 2026');
    assert.equal(rescheduleForm.captureRequests[0].destinationLabel, 'You’ll review this change before saving');
    const { workItemCommandResult } = require('../../src/services/ask/handlers/homeWorkItemCommands.handler.ts');
    const snooze = await workItemCommandResult('u1', 'prop-1', { kind: 'SNOOZE', entityId: 'w1', sourceExecutionId: null }, { snooze: 'ONE_WEEK' });
    assert.equal(snooze.status, 'NEEDS_CONFIRMATION');
    assert.match(snooze.confirmation.fields[1].value, /Not snoozed → Snoozed until/);
    const resched = await workItemCommandResult('u1', 'prop-1', { kind: 'RESCHEDULE', entityId: 'w1', sourceExecutionId: null }, { dueAt: '2026-11-15' });
    assert.match(resched.confirmation.fields[1].value, /→ /);
    const bad = await workItemCommandResult('u1', 'prop-1', { kind: 'SNOOZE', entityId: 'w1', sourceExecutionId: null }, { snooze: 'FOREVER' });
    assert.equal(bad.reasonCode, 'HOME_WORK_ITEM_INPUT_INVALID');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', [item({ state: 'CLOSED' })]);
  try { assert.equal((await invoke('SNOOZE', launch())).reasonCode, 'HOME_WORK_ITEM_FINISHED'); } finally { w.restore(); }
});

test('confirming calls the usecases the routes call; a changed item or finished work writes nothing', async () => {
  const w = install('CONTRIBUTOR');
  try {
    const v = version('SNOOZE', item());
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'SNOOZE', entityId: 'w1' }, workItemChange: { snoozedUntil: '2026-10-01T00:00:00.000Z' }, workItemContextVersion: v }));
    assert.equal(w.calls[0][0], 'snooze');
    assert.equal(w.calls[0][1].workItemId, 'w1');
    assert.equal(w.calls[0][1].snoozedUntil.toISOString(), '2026-10-01T00:00:00.000Z');
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'SNOOZE', entityId: 'w1' }, workItemChange: { snoozedUntil: null }, workItemContextVersion: v }));
    assert.equal(w.calls[1][1].snoozedUntil, null);
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'RESCHEDULE', entityId: 'w1' }, workItemChange: { dueAt: '2026-11-15T12:00:00.000Z' }, workItemContextVersion: version('RESCHEDULE', item()) }));
    assert.equal(w.calls[2][0], 'reschedule');
    assert.equal(w.calls[2][1].dueAt.toISOString(), '2026-11-15T12:00:00.000Z');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'SNOOZE', entityId: 'w1' }, workItemChange: { snoozedUntil: null }, workItemContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'SNOOZE', entityId: 'w1' }, workItemChange: {}, workItemContextVersion: v })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 3);
  } finally { w.restore(); }
});

test('update status: shows only legal homeowner transitions, reviews the change, and confirms through the canonical transition usecase', async () => {
  const w = install('CONTRIBUTOR');
  try {
    const form = await invoke('UPDATE_STATUS', launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const fields = form.captureRequests[0].inputSchema.fields;
    assert.deepEqual(fields[0].inputSchema.options.map((option) => option.value), ['SCHEDULED', 'IN_PROGRESS', 'BLOCKED', 'DEFERRED', 'REOPENED']);
    assert.equal(fields.some((field) => field.key === 'disposition'), false);
    const { workItemCommandResult } = require('../../src/services/ask/handlers/homeWorkItemCommands.handler.ts');
    const review = await workItemCommandResult('u1', 'prop-1', { kind: 'UPDATE_STATUS', entityId: 'w1', sourceExecutionId: null }, { status: 'IN_PROGRESS' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.confirmation.fields[1].value, 'On your list → In progress');
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'UPDATE_STATUS', entityId: 'w1' }, workItemChange: { status: 'IN_PROGRESS', disposition: null }, workItemContextVersion: version('UPDATE_STATUS', item()) }));
    assert.equal(w.calls[0][0], 'transition');
    assert.deepEqual([w.calls[0][1].workItemId, w.calls[0][1].to, w.calls[0][1].actorType], ['w1', 'IN_PROGRESS', 'USER']);
    const illegal = await workItemCommandResult('u1', 'prop-1', { kind: 'UPDATE_STATUS', entityId: 'w1', sourceExecutionId: null }, { status: 'VERIFIED' });
    assert.equal(illegal.reasonCode, 'HOME_WORK_ITEM_STATUS_NOT_AVAILABLE');
  } finally { w.restore(); }
});

test('accept routine: lists exactly the low-consequence candidates, binds to that set, and accepts only that set', async () => {
  const items = [
    item({ id: 'c1', state: 'CANDIDATE', title: 'Check detectors' }), item({ id: 'c2', state: 'CANDIDATE', title: 'Clean gutters' }),
    item({ id: 'hi', state: 'CANDIDATE', safetyTier: 'SAFETY_CRITICAL', title: 'Gas smell' }), item({ id: 'acc', state: 'ACCEPTED' }),
  ];
  let w = install('CONTRIBUTOR', items);
  try {
    const review = await invoke('ACCEPT_ROUTINE', { operationId: OP, surface: 'ASK_PAGE' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.parameters.workItemBatchIds, ['c1', 'c2']);
    assert.equal(review.contextVersion, batchVersion([{ id: 'c1', state: 'CANDIDATE' }, { id: 'c2', state: 'CANDIDATE' }]));
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'ACCEPT_ROUTINE', entityId: null }, workItemBatchIds: ['c1', 'c2'], workItemContextVersion: review.contextVersion }));
    assert.deepEqual(w.calls[0], ['batch', { propertyId: 'prop-1', workItemIds: ['c1', 'c2'], actorUserId: 'u1' }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'ACCEPT_ROUTINE', entityId: null }, workItemBatchIds: ['c1'], workItemContextVersion: review.contextVersion })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', [item()]);
  try { assert.equal((await invoke('ACCEPT_ROUTINE', { operationId: OP, surface: 'ASK_PAGE' })).reasonCode, 'HOME_WORK_ITEMS_NO_ROUTINE_CANDIDATES'); } finally { w.restore(); }
});

test('the action ids are allowlisted on the list and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  const A = command.WORK_ITEM_ACTION_IDS;
  for (const id of [A.SNOOZE, A.RESCHEDULE, A.ACCEPT_ROUTINE, A.UPDATE_STATUS, A.ATTACH_EVIDENCE, A.OPTIONS]) assert.equal(applicable(id, 'HOME_WORK_ITEMS'), true, id);
  for (const id of ['home-work-items-back', A.ASSIGN_OWNER, A.ADD_WATCHER, A.REMOVE_WATCHER, A.MARK_DUPLICATE, A.UNDO_DUPLICATE]) assert.equal(applicable(id, OP), true, id);
});

// FRD 1.401: attach an existing record, submit completion evidence, remove evidence. Prisma delegates and the document inventory are faked; nothing else is.
const { prisma } = require('../../src/lib/prisma.ts');
const docs = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const recordUse = require('../../src/modules/homeOperations/application/recordEvidence.usecase.ts');
const removeUse = require('../../src/modules/homeOperations/application/removeEvidence.usecase.ts');

function installEvidence({ attached = [], removable = [] } = {}) {
  const saved = { list: docs.listPropertyDocuments, resolve: docs.resolvePropertyDocuments, rec: recordUse.recordEvidence, rem: removeUse.removeEvidence,
    ev: prisma.operationalWorkEvidence, he: prisma.homeEvent, pf: prisma.propertyFactEvidence, doc: prisma.document };
  const calls = [];
  docs.listPropertyDocuments = async () => ({ items: [{ id: 'doc-1', title: 'Chimney invoice.pdf' }, { id: 'doc-2', title: 'Already there.pdf' }] });
  docs.resolvePropertyDocuments = async ({ ids }) => ids.filter((id) => id === 'doc-1').map((id) => ({ id, title: 'Chimney invoice.pdf' }));
  recordUse.recordEvidence = async (a) => { calls.push(['record', a]); return {}; };
  removeUse.removeEvidence = async (a) => { calls.push(['remove', a]); return { removed: true }; };
  prisma.operationalWorkEvidence = { findMany: async (q) => (q.where.evidenceType ? removable : attached), findFirst: async () => null };
  prisma.homeEvent = { findMany: async () => [{ id: 'ev-1', title: 'Annual inspection', occurredAt: new Date('2026-09-02T00:00:00Z') }], findFirst: async ({ where }) => (where.id === 'ev-1' ? { title: 'Annual inspection' } : null) };
  prisma.propertyFactEvidence = { findMany: async () => [{ id: 'pf-1', factKey: 'chimney.lastSweepYear', observedAt: new Date() }, { id: 'pf-2', factKey: 'chimney.lastSweepYear', observedAt: new Date() }], findFirst: async ({ where }) => (where.id === 'pf-1' ? { factKey: 'chimney.lastSweepYear' } : null) };
  prisma.document = { findMany: async () => [{ id: 'doc-9', name: 'Old photo.jpg' }] };
  return { calls, restore() { Object.assign(docs, { listPropertyDocuments: saved.list, resolvePropertyDocuments: saved.resolve }); recordUse.recordEvidence = saved.rec; removeUse.removeEvidence = saved.rem;
    prisma.operationalWorkEvidence = saved.ev; prisma.homeEvent = saved.he; prisma.propertyFactEvidence = saved.pf; prisma.document = saved.doc; } };
}

test('attach existing: the picker offers this home\'s documents, events and one current fact, minus what is already attached; the pick is re-read before review', async () => {
  const w = install('CONTRIBUTOR'); const e = installEvidence({ attached: [{ evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-2' }] });
  try {
    const form = await invoke('ATTACH_EXISTING', launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const options = form.captureRequests[0].inputSchema.fields[0].inputSchema.options;
    assert.deepEqual(options.map((o) => o.value), ['DOCUMENT:doc-1', 'HOME_EVENT:ev-1', 'PROPERTY_FACT:pf-1']);
    assert.match(options[2].label, /Home fact · Chimney last sweep year/);
    const { workItemCommandResult } = require('../../src/services/ask/handlers/homeWorkItemCommands.handler.ts');
    const review = await workItemCommandResult('u1', 'prop-1', { kind: 'ATTACH_EXISTING', entityId: 'w1', sourceExecutionId: null }, { record: 'HOME_EVENT:ev-1' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.parameters.workItemChange, { evidenceType: 'HOME_EVENT', evidenceEntityId: 'ev-1' });
    assert.match(review.confirmation.description, /does not mark the work complete/);
    const submit = await workItemCommandResult('u1', 'prop-1', { kind: 'SUBMIT_COMPLETION_EVIDENCE', entityId: 'w1', sourceExecutionId: null }, { record: 'DOCUMENT:doc-1' });
    assert.equal(submit.confirmation.title, 'Submit this as completion evidence?');
    // A forged or already-attached pick resolves to nothing and writes nothing.
    for (const record of ['DOCUMENT:doc-2', 'DOCUMENT:other-home', 'NOPE:1', 'PROPERTY_FACT:pf-2']) {
      const refused = await workItemCommandResult('u1', 'prop-1', { kind: 'ATTACH_EXISTING', entityId: 'w1', sourceExecutionId: null }, { record });
      assert.notEqual(refused.status, 'NEEDS_CONFIRMATION', record);
    }
    assert.equal(e.calls.length, 0);
  } finally { e.restore(); w.restore(); }
});

test('attach existing, confirm: writes ONE pending evidence row through the canonical writer, idempotent, and refuses a record that went away', async () => {
  const w = install('CONTRIBUTOR'); const e = installEvidence();
  try {
    const params = { workItemCommand: { kind: 'ATTACH_EXISTING', entityId: 'w1' }, workItemChange: { evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-1' }, workItemContextVersion: version('ATTACH_EXISTING', item()) };
    await confirmCapabilityInvoke(OP, ctx(params));
    assert.equal(e.calls.length, 1);
    assert.deepEqual([e.calls[0][1].evidenceType, e.calls[0][1].evidenceEntityId, e.calls[0][1].verificationStatus, e.calls[0][1].idempotencyKey], ['DOCUMENT', 'doc-1', 'PENDING', 'ask:exec-1:work-evidence-ref']);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...params, workItemChange: { evidenceType: 'DOCUMENT', evidenceEntityId: 'gone' } })), (err) => err.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...params, workItemContextVersion: 'old' })), (err) => err.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(e.calls.length, 1);
  } finally { e.restore(); w.restore(); }
});

test('remove evidence: only withdrawable evidence is offered, the review names it, and confirm calls the withdrawal usecase; viewers and an empty list are refused', async () => {
  let w = install('CONTRIBUTOR'); let e = installEvidence({ removable: [{ id: 'row-1', evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-9', observedAt: new Date() }] });
  try {
    const form = await invoke('REMOVE_EVIDENCE', launch());
    assert.deepEqual(form.captureRequests[0].inputSchema.fields[0].inputSchema.options, [{ label: 'Document · Old photo.jpg', value: 'row-1' }]);
    const { workItemCommandResult } = require('../../src/services/ask/handlers/homeWorkItemCommands.handler.ts');
    const review = await workItemCommandResult('u1', 'prop-1', { kind: 'REMOVE_EVIDENCE', entityId: 'w1', sourceExecutionId: null }, { evidence: 'row-1' });
    assert.deepEqual(review.parameters.workItemChange, { evidenceId: 'row-1' });
    const forged = await workItemCommandResult('u1', 'prop-1', { kind: 'REMOVE_EVIDENCE', entityId: 'w1', sourceExecutionId: null }, { evidence: 'someone-elses' });
    assert.equal(forged.reasonCode, 'HOME_WORK_ITEM_EVIDENCE_NOT_AVAILABLE');
    await confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'REMOVE_EVIDENCE', entityId: 'w1' }, workItemChange: { evidenceId: 'row-1' }, workItemContextVersion: version('REMOVE_EVIDENCE', item()) }));
    assert.deepEqual([e.calls[0][0], e.calls[0][1].workItemId, e.calls[0][1].evidenceId], ['remove', 'w1', 'row-1']);
    // A withdrawal the usecase refuses (verified or governing-record evidence) surfaces as a stale confirmation, never a silent success.
    removeUse.removeEvidence = async () => { throw new removeUse.EvidenceNotWithdrawableError('Verified evidence cannot be removed because a completion or approval may rely on it.'); };
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ workItemCommand: { kind: 'REMOVE_EVIDENCE', entityId: 'w1' }, workItemChange: { evidenceId: 'row-1' }, workItemContextVersion: version('REMOVE_EVIDENCE', item()) })), (err) => err.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  } finally { e.restore(); w.restore(); }
  w = install('CONTRIBUTOR'); e = installEvidence({ removable: [] });
  try { assert.equal((await invoke('REMOVE_EVIDENCE', launch())).reasonCode, 'HOME_WORK_ITEM_NO_REMOVABLE_EVIDENCE'); } finally { e.restore(); w.restore(); }
  w = install('VIEWER'); e = installEvidence();
  try { assert.equal((await invoke('ATTACH_EXISTING', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { e.restore(); w.restore(); }
});

test('attach existing, confirm twice: a record already on the work writes nothing more, and the focused action list is refreshed after a change', async () => {
  const w = install('CONTRIBUTOR'); const e = installEvidence();
  try {
    prisma.operationalWorkEvidence.findFirst = async () => ({ id: 'already' });
    const params = { workItemCommand: { kind: 'ATTACH_EXISTING', entityId: 'w1' }, workItemChange: { evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-1' }, workItemContextVersion: version('ATTACH_EXISTING', item()) };
    const out = await confirmCapabilityInvoke(OP, ctx(params));
    assert.equal(out.result.blocks[0].title, 'Already on this work');
    assert.equal(e.calls.length, 0);
    // The work-items list and the Home Actions feed (where the focused card shows the evidence) are both re-read after a change.
    assert.deepEqual([...executeOperation.ASK_MUTATION_IMPACT_MAP.HOME_WORK_ITEM_COMMAND].sort(), ['HOME_ACTIONS', 'HOME_WORK_ITEMS']);
  } finally { e.restore(); w.restore(); }
});

// ---- owner, watchers and duplicates (FRD v1.454) --------------------------------------------------------------------------------------------------
const assignUse = require('../../src/modules/homeOperations/application/assignOwner.usecase.ts');
const watchUse = require('../../src/modules/homeOperations/application/watchers.usecase.ts');
const dupUse = require('../../src/modules/homeOperations/application/recordDuplicateDecision.usecase.ts');
const { HouseholdService } = require('../../src/services/household.service.ts');
const member = (userId, first, displayName = null) => ({ userId, displayName, user: { firstName: first, lastName: 'Lee' } });
function installPeople(role, items, members = [member('u1', 'Sam'), member('u2', 'Pat'), member('u3', 'Kim', 'Kimmy')]) {
  const w = install(role, items);
  const saved = { as: assignUse.assignWorkItemOwner, aw: watchUse.addWatcher, rw: watchUse.removeWatcher, rd: dupUse.recordDuplicateDecision, ud: dupUse.reverseDuplicateDecision, lm: HouseholdService.prototype.listMembers };
  assignUse.assignWorkItemOwner = async (a) => { w.calls.push(['owner', a]); };
  watchUse.addWatcher = async (a) => { w.calls.push(['watch', a]); };
  watchUse.removeWatcher = async (a) => { w.calls.push(['unwatch', a]); };
  dupUse.recordDuplicateDecision = async (a) => { w.calls.push(['dup', a]); };
  dupUse.reverseDuplicateDecision = async (a) => { w.calls.push(['undup', a]); };
  HouseholdService.prototype.listMembers = async () => members;
  const base = w.restore;
  w.restore = () => { base(); assignUse.assignWorkItemOwner = saved.as; watchUse.addWatcher = saved.aw; watchUse.removeWatcher = saved.rw; dupUse.recordDuplicateDecision = saved.rd; dupUse.reverseDuplicateDecision = saved.ud; HouseholdService.prototype.listMembers = saved.lm; };
  return w;
}
const answer = async (kind, form, id = 'w1') => command.parseWorkItemAnswer && (await require('../../src/services/ask/handlers/homeWorkItemCommands.handler.ts').workItemCommandResult('u1', 'prop-1', { kind, entityId: id, sourceExecutionId: null }, form));
const cp = (kind, items, change, id = 'w1') => ({ workItemCommand: { kind, entityId: id }, workItemChange: change, workItemContextVersion: version(kind, items.find((i) => i.id === id)) });

test('more options: one row with the people and duplicate controls, names resolved from the household; viewers refused; the list row gains the entry', async () => {
  const items = [item({ ownerUserId: 'u2', watchers: [{ userId: 'u3' }] })];
  let w = installPeople('CONTRIBUTOR', items);
  try {
    const result = await invoke('OPTIONS', launch());
    const row = result.blocks.find((b) => b.type === 'GROUPED_LIST').sections[0].items[0];
    assert.equal(row.id, 'w1');
    assert.equal(row.description, 'Owner: Pat Lee. Watching: Kimmy.');
    assert.deepEqual(row.actions.map((a) => a.id), ['work-item-assign-owner', 'work-item-add-watcher', 'work-item-remove-watcher', 'work-item-mark-duplicate']);
    assert.equal(w.calls.length, 0);
    const list = homeWorkItemsFromRows([item()], true, new Date('2026-09-15T00:00:00Z'));
    assert.ok(list.blocks.find((b) => b.type === 'GROUPED_LIST').sections.flatMap((x) => x.items)[0].actions.some((a) => a.id === 'work-item-options'));
    assert.ok(!homeWorkItemsFromRows([item()], false, new Date('2026-09-15T00:00:00Z')).blocks.find((b) => b.type === 'GROUPED_LIST').sections.flatMap((x) => x.items)[0].actions.some((a) => a.id === 'work-item-options'));
  } finally { w.restore(); }
  w = installPeople('VIEWER', items);
  try { assert.equal((await invoke('OPTIONS', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
});

test('assign the owner: the picker lists the household and No one, the review shows before and after, the confirmation calls the usecase, a stranger is refused', async () => {
  const items = [item({ ownerUserId: 'u2' })];
  const w = installPeople('CONTRIBUTOR', items);
  try {
    const ask = await invoke('ASSIGN_OWNER', launch());
    assert.deepEqual(ask.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.label), ['No one', 'Sam Lee', 'Pat Lee (current owner)', 'Kimmy']);
    const review = await answer('ASSIGN_OWNER', { member: 'u3' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.equal(review.confirmation.fields[1].value, 'Pat Lee → Kimmy');
    assert.equal((await answer('ASSIGN_OWNER', { member: 'stranger' })).reasonCode, 'HOME_WORK_ITEM_CHOICE_NOT_AVAILABLE');
    await confirmCapabilityInvoke(OP, ctx(cp('ASSIGN_OWNER', items, { ownerUserId: 'u3' })));
    assert.deepEqual(w.calls[0], ['owner', { workItemId: 'w1', ownerUserId: 'u3', actorUserId: 'u1', idempotencyKey: 'ask:exec-1:work-owner' }]);
    await confirmCapabilityInvoke(OP, ctx(cp('ASSIGN_OWNER', items, { ownerUserId: null })));
    assert.equal(w.calls[1][1].ownerUserId, null);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(cp('ASSIGN_OWNER', items, { ownerUserId: 'stranger' }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 2);
  } finally { w.restore(); }
});

test('watchers: add offers only non-watchers, remove only watchers, and the confirmation is idempotent for a member already watching', async () => {
  const items = [item({ watchers: [{ userId: 'u2' }] })];
  const w = installPeople('CONTRIBUTOR', items);
  try {
    assert.deepEqual((await invoke('ADD_WATCHER', launch())).captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value), ['u1', 'u3']);
    assert.deepEqual((await invoke('REMOVE_WATCHER', launch())).captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value), ['u2']);
    await confirmCapabilityInvoke(OP, ctx(cp('ADD_WATCHER', items, { watcherUserId: 'u3' })));
    assert.equal(w.calls[0][0], 'watch');
    await confirmCapabilityInvoke(OP, ctx(cp('ADD_WATCHER', items, { watcherUserId: 'u2' })));
    assert.equal(w.calls.length, 1, 'already watching writes nothing');
    await confirmCapabilityInvoke(OP, ctx(cp('REMOVE_WATCHER', items, { watcherUserId: 'u2' })));
    assert.deepEqual(w.calls[1], ['unwatch', { workItemId: 'w1', userId: 'u2', actorUserId: 'u1', idempotencyKey: 'ask:exec-1:work-watcher-remove' }]);
  } finally { w.restore(); }
  const none = installPeople('CONTRIBUTOR', [item()]);
  try { assert.equal((await invoke('REMOVE_WATCHER', launch())).reasonCode, 'HOME_WORK_ITEM_NO_CHOICES'); } finally { none.restore(); }
});

test('duplicates: the picker lists only the other open work, the confirmation re-checks the target, and the receipt offers the undo which reverses it', async () => {
  const items = [item(), item({ id: 'w2', title: 'Clean gutters' }), item({ id: 'w3', title: 'Old', state: 'CLOSED' })];
  const w = installPeople('CONTRIBUTOR', items);
  try {
    assert.deepEqual((await invoke('MARK_DUPLICATE', launch())).captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value), ['w2']);
    const review = await answer('MARK_DUPLICATE', { target: 'w2' });
    assert.match(review.confirmation.description, /not deleted/);
    const done = await confirmCapabilityInvoke(OP, ctx(cp('MARK_DUPLICATE', items, { duplicateOfWorkItemId: 'w2' })));
    assert.deepEqual(w.calls[0], ['dup', { workItemId: 'w1', supersededByWorkItemId: 'w2', actorUserId: 'u1', idempotencyKey: 'ask:exec-1:work-duplicate' }]);
    const undo = done.result.blocks[0].actions.find((a) => a.id === 'work-item-undo-duplicate');
    assert.equal(undo.entityId, 'w1');
    for (const bad of ['w1', 'w3', 'nope']) await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(cp('MARK_DUPLICATE', items, { duplicateOfWorkItemId: bad }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE', bad);
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
  const set = [item({ supersededByWorkItemId: 'w2' }), item({ id: 'w2', title: 'Clean gutters' })];
  const w2 = installPeople('CONTRIBUTOR', set);
  try {
    assert.equal((await invoke('UNDO_DUPLICATE', launch())).status, 'NEEDS_CONFIRMATION');
    await confirmCapabilityInvoke(OP, ctx(cp('UNDO_DUPLICATE', set, {})));
    assert.deepEqual(w2.calls[0], ['undup', { workItemId: 'w1', actorUserId: 'u1', idempotencyKey: 'ask:exec-1:work-duplicate-undo' }]);
    assert.equal((await invoke('MARK_DUPLICATE', launch())).reasonCode, 'HOME_WORK_ITEM_FINISHED', 'a set-aside item is not marked again');
  } finally { w2.restore(); }
  const plain = installPeople('CONTRIBUTOR', [item()]);
  try { assert.equal((await invoke('UNDO_DUPLICATE', launch())).reasonCode, 'HOME_WORK_ITEM_NOT_DUPLICATE'); } finally { plain.restore(); }
});

// ── v1.457: the owner's confirmation of material or safety work ("Confirm the result") ────────────────────────────────────────────────
test('confirm the result: owner-only, offered on a reported-complete item that needs approval, evidence picked from what is on the work, policy checked before and at confirm', async () => {
  const approveUse = require('../../src/modules/homeOperations/application/approveMaterialWork.usecase.ts');
  const { workItemCommandResult } = require('../../src/services/ask/handlers/homeWorkItemCommands.handler.ts');
  const T2 = new Date('2026-09-03T00:00:00Z');
  const evidence = [
    { id: 'ev-row-1', evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-9', verificationStatus: 'PENDING', observedAt: T2 },
    { id: 'ev-row-2', evidenceType: 'USER_ATTESTATION', evidenceEntityId: 'att-1', verificationStatus: 'PENDING', observedAt: T2 },
  ];
  const needs = (over = {}) => item({ state: 'REPORTED_COMPLETE', safetyTier: 'MATERIAL_FINANCIAL', materialApprovalRequired: true, materialApprovedAt: null, evidence, sources: [], executions: [], ...over });
  const versionOf = (i) => sha(`work-item:APPROVE_MATERIAL:${iso(i.materialApprovedAt)}:${i.evidence.map((e) => `${e.id}=${e.verificationStatus}`).sort().join(',')}:${i.id}:${i.state}:${iso(i.dueAt)}:${iso(i.dueWindowStart)}:${iso(i.dueWindowEnd)}:${iso(i.snoozedUntil)}:${i.supersededByWorkItemId ?? ''}:${i.ownerUserId ?? ''}:${(i.watchers ?? []).map((x) => x.userId).sort().join(',')}`);
  const savedApprove = approveUse.approveMaterialWork;
  const calls = [];
  approveUse.approveMaterialWork = async (a) => { calls.push(a); };
  const L = { kind: 'APPROVE_MATERIAL', entityId: 'w1', sourceExecutionId: null };
  const answer = { evidence: 'ev-row-1', note: 'Plumber replaced it; no leaks.', cost: '420.5', observedResult: 'CONFIRMED_HEALTHY' };
  let w = install('OWNER', [needs()]); let e = installEvidence({ attached: evidence });
  try {
    // the list offers the action to the owner only, and only on work that awaits approval
    const rows = (canApprove, i) => homeWorkItemsFromRows([i], true, new Date('2026-09-15T00:00:00Z'), canApprove).blocks.find((b) => b.type === 'GROUPED_LIST').sections.flatMap((s) => s.items)[0].actions.map((a) => a.id);
    assert.ok(rows(true, needs()).includes('work-item-approve-material'));
    assert.ok(!rows(false, needs()).includes('work-item-approve-material'), 'contributors are not offered it');
    assert.ok(!rows(true, needs({ materialApprovedAt: T2 })).includes('work-item-approve-material'), 'already confirmed');
    assert.ok(!rows(true, needs({ materialApprovalRequired: false })).includes('work-item-approve-material'), 'no approval needed');
    assert.ok(!rows(true, needs({ state: 'ACCEPTED' })).includes('work-item-approve-material'), 'not reported done');

    // the form lists the evidence already on the work, and a material item also asks for cost and a result
    const form = await invoke('APPROVE_MATERIAL', launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const fields = form.captureRequests[0].inputSchema.fields;
    assert.deepEqual(fields.map((f) => f.key), ['evidence', 'note', 'cost', 'observedResult']);
    assert.deepEqual(fields[0].inputSchema.options.map((o) => o.value), ['ev-row-1', 'ev-row-2']);

    // review: names the pick, note, cost and result; writes nothing
    const review = await workItemCommandResult('u1', 'prop-1', L, answer);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.parameters.workItemChange, { evidenceId: 'ev-row-1', decisionNote: 'Plumber replaced it; no leaks.', costCents: 42050, observedResult: 'CONFIRMED_HEALTHY' });
    assert.ok(['Your note', 'Cost', 'Result'].every((label) => review.confirmation.fields.some((f) => f.label === label)));
    assert.equal(calls.length, 0, 'review writes nothing');
    // the policy is said before confirming: a material item needs a cost or a result; a forged evidence id resolves to nothing
    assert.equal((await workItemCommandResult('u1', 'prop-1', L, { evidence: 'ev-row-1', note: 'ok' })).reasonCode, 'HOME_WORK_ITEM_APPROVAL_POLICY_NOT_MET');
    assert.equal((await workItemCommandResult('u1', 'prop-1', L, { ...answer, evidence: 'someone-elses' })).reasonCode, 'HOME_WORK_ITEM_EVIDENCE_NOT_AVAILABLE');
    assert.equal((await workItemCommandResult('u1', 'prop-1', L, { ...answer, note: '' })).reasonCode, 'HOME_WORK_ITEM_INPUT_INVALID');

    // confirm: owner, same governed usecase with the owner's role and the exact values
    const params = { workItemCommand: { kind: 'APPROVE_MATERIAL', entityId: 'w1' }, workItemChange: review.parameters.workItemChange, workItemContextVersion: versionOf(needs()) };
    const ownerCtx = { ...ctx(params), access: { role: 'OWNER' } };
    await confirmCapabilityInvoke(OP, ownerCtx);
    assert.equal(calls.length, 1);
    assert.deepEqual([calls[0].evidenceId, calls[0].decisionNote, calls[0].costCents, calls[0].observedResult, calls[0].role, calls[0].actorUserId], ['ev-row-1', 'Plumber replaced it; no leaks.', 42050, 'CONFIRMED_HEALTHY', 'OWNER', 'u1']);
    // a contributor's confirmation, a stale version, and a usecase refusal each write nothing more and surface as stale
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(params)), (err) => err.code === 'ASK_PERMISSION_REQUIRED');
    await assert.rejects(() => confirmCapabilityInvoke(OP, { ...ownerCtx, parameters: { ...params, workItemContextVersion: 'old' } }), (err) => err.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    approveUse.approveMaterialWork = async () => { throw new approveUse.MaterialApprovalRequestError(400, 'EVIDENCE_REQUIRED', 'Select evidence attached to this work item.'); };
    await assert.rejects(() => confirmCapabilityInvoke(OP, ownerCtx), (err) => err.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(calls.length, 1);
  } finally { e.restore(); w.restore(); approveUse.approveMaterialWork = savedApprove; }

  // a contributor cannot even open the form; work not awaiting approval is refused
  w = install('CONTRIBUTOR', [needs()]); e = installEvidence({ attached: evidence });
  try { assert.equal((await invoke('APPROVE_MATERIAL', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { e.restore(); w.restore(); }
  w = install('OWNER', [needs({ materialApprovedAt: T2 })]); e = installEvidence({ attached: evidence });
  try { assert.equal((await invoke('APPROVE_MATERIAL', launch())).reasonCode, 'HOME_WORK_ITEM_NOT_AWAITING_APPROVAL'); } finally { e.restore(); w.restore(); }
  // no evidence yet: say to add some first (the page says the same)
  w = install('OWNER', [needs({ evidence: [] })]); e = installEvidence({ attached: [] });
  try { assert.equal((await invoke('APPROVE_MATERIAL', launch())).reasonCode, 'HOME_WORK_ITEM_NO_EVIDENCE_TO_CONFIRM'); } finally { e.restore(); w.restore(); }
  // safety work: a plain document cannot confirm it, said at review (the registry policy requires a domain completion record); no cost field is asked
  const safety = needs({ safetyTier: 'SAFETY_EMERGENCY' });
  w = install('OWNER', [safety]); e = installEvidence({ attached: evidence });
  try {
    const form = await invoke('APPROVE_MATERIAL', launch());
    assert.deepEqual(form.captureRequests[0].inputSchema.fields.map((f) => f.key), ['evidence', 'note']);
    const refused = await workItemCommandResult('u1', 'prop-1', L, { evidence: 'ev-row-1', note: 'Looks fixed' });
    assert.equal(refused.reasonCode, 'HOME_WORK_ITEM_APPROVAL_POLICY_NOT_MET');
    assert.match(refused.blocks[0].body, /domain completion record/);
  } finally { e.restore(); w.restore(); }
  // the action id is allowlisted on the list
  assert.ok(isAskActionApplicable({ action: { id: 'work-item-approve-material', label: 'x', interactionType: 'MUTATE_RECORD', message: M.APPROVE_MATERIAL, operationId: OP, style: 'PRIMARY' }, operationId: 'HOME_WORK_ITEMS', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true }));
});

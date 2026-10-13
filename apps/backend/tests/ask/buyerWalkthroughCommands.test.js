const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Buyer Closing": the final walkthrough's plan, observations, issues and completion (FRD v1.345). No database, browser or native module.

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
const { BuyerWalkthroughService } = require('../../src/services/buyerWalkthrough.service.ts');
const command = require('../../src/services/ask/support/buyerWalkthroughCommand.ts');
const { walkthroughCommandResult } = require('../../src/services/ask/handlers/buyerWalkthroughCommands.handler.ts');

const OP = 'BUYER_WALKTHROUGH_COMMAND';
const M = command.WALKTHROUGH_MESSAGES;
const T = '2026-09-01T00:00:00.000Z';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const obs = (over = {}) => ({ id: 'o1', area: 'Kitchen', category: 'PLUMBING', status: 'ACCEPTABLE', notes: null, updatedAt: T, ...over });
const iss = (over = {}) => ({ id: 'i1', title: 'Leak under sink', category: 'NEW_DAMAGE', status: 'OPEN', blocking: true, sourceObservationId: 'o1', routedToRole: null, updatedAt: T, ...over });
const ws = (over = {}) => ({ updatedAt: T, completedAt: null, scheduledAt: null, accessConfirmedAt: null, utilitiesConfirmedAt: null, observations: [obs()], issues: [], ...over });
const version = (w) => sha(`walkthrough:${w?.updatedAt ?? 'none'}:${w?.completedAt ?? ''}:${(w?.observations ?? []).map((o) => `${o.id}:${o.status}:${o.updatedAt}`).join('|')}:${(w?.issues ?? []).map((i) => `${i.id}:${i.status}:${i.updatedAt}`).join('|')}`);

function install(role, workspace = ws()) {
  const S = BuyerWalkthroughService;
  const saved = { a: propertyAccess.resolvePropertyAccess, g: S.get, u: S.update, co: S.createObservation, uo: S.updateObservation, ci: S.createIssue, ui: S.updateIssue, c: S.complete, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  S.get = async () => ({ workspace, context: {}, evidenceDocuments: [] });
  S.update = async (...a) => { calls.push(['update', ...a]); return {}; };
  S.createObservation = async (...a) => { calls.push(['createObservation', ...a]); return {}; };
  S.updateObservation = async (...a) => { calls.push(['updateObservation', ...a]); return {}; };
  S.createIssue = async (...a) => { calls.push(['createIssue', ...a]); return {}; };
  S.updateIssue = async (...a) => { calls.push(['updateIssue', ...a]); return {}; };
  S.complete = async (...a) => { calls.push(['complete', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; S.get = saved.g; S.update = saved.u; S.createObservation = saved.co; S.updateObservation = saved.uo; S.createIssue = saved.ci; S.updateIssue = saved.ui; S.complete = saved.c; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const run = (kind, entityId, answer, kindOverride) => walkthroughCommandResult('u1', 'prop-1', { kind: kindOverride ?? kind, entityId, sourceExecutionId: null }, answer);

test('declared-action only; contributor floor; viewers refused; a refresh and a missing entity are not routable', async () => {
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke('OBSERVATION_ADD', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('OBSERVATION_ADD', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_BUYER_WALKTHROUGH_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('OBSERVATION_REVIEW', launch())).reasonCode, 'ASK_BUYER_WALKTHROUGH_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('OBSERVATION_ADD', launch())).status, 'NEEDS_CONTEXT');
  } finally { w.restore(); }
});

test('forms validate like the schemas: routing needs a recipient, an observation needs a place, the plan needs something', () => {
  const p = command.parseWalkthroughAnswer;
  assert.equal(p('ISSUE_UPDATE', { status: 'ROUTED_TO_PROFESSIONAL' }).success, false);
  assert.equal(p('ISSUE_UPDATE', { status: 'ROUTED_TO_PROFESSIONAL', routedToRole: 'ATTORNEY' }).success, true);
  assert.equal(p('ISSUE_UPDATE', { status: 'RESOLVED' }).success, true);
  assert.equal(p('OBSERVATION_ADD', { area: '', category: 'PLUMBING', status: 'ACCEPTABLE' }).success, false);
  assert.equal(p('OBSERVATION_ADD', { area: 'Kitchen', category: 'PLUMBING', status: 'ACCEPTABLE' }).success, true);
  assert.equal(p('WORKSPACE', {}).success, false);
  assert.equal(p('WORKSPACE', { accessConfirmed: 'YES' }).success, true);
  assert.equal(p('OBSERVATION_REVIEW', { status: 'NOT_REVIEWED' }).success, false);
});

test('completion is offered only when the service\'s own rules would accept, and says what stands in the way', async () => {
  assert.deepEqual(command.walkthroughCompletionBlockers(null), ['Record at least one observation.']);
  assert.deepEqual(command.walkthroughCompletionBlockers(ws({ observations: [obs({ status: 'NOT_REVIEWED' })] })), ['Review 1 observation you have not reviewed.']);
  assert.deepEqual(command.walkthroughCompletionBlockers(ws({ observations: [obs({ status: 'ISSUE' })] })), ['Record an issue for 1 observation marked as a problem.']);
  assert.deepEqual(command.walkthroughCompletionBlockers(ws({ observations: [obs({ status: 'ISSUE' })], issues: [iss()] })), ['Route or settle 1 open issue.']);
  assert.deepEqual(command.walkthroughCompletionBlockers(ws({ observations: [obs({ status: 'ISSUE' })], issues: [iss({ status: 'ACCEPTED_AS_IS' })] })), []);
  let w = install('CONTRIBUTOR', ws({ observations: [obs({ status: 'NOT_REVIEWED' })] }));
  try {
    const out = await invoke('COMPLETE', launch());
    assert.equal(out.reasonCode, 'BUYER_WALKTHROUGH_NOT_READY');
    assert.match(out.blocks[0].body, /Review 1 observation/);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    const out = await invoke('COMPLETE', launch());
    assert.equal(out.status, 'NEEDS_CONFIRMATION');
    assert.match(out.confirmation.description, /does not tell you whether to close/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', ws({ completedAt: T }));
  try { assert.equal((await invoke('COMPLETE', launch())).reasonCode, 'BUYER_WALKTHROUGH_ALREADY_COMPLETE'); } finally { w.restore(); }
});

test('review shows before and after and writes nothing; an issue is only offered for a problem observation without one', async () => {
  const w = install('CONTRIBUTOR', ws({ observations: [obs({ id: 'o1', status: 'ISSUE' }), obs({ id: 'o2', status: 'ACCEPTABLE' })] }));
  try {
    const review = await run('OBSERVATION_REVIEW', 'o2', { status: 'ISSUE' });
    assert.deepEqual(review.confirmation.fields[1], { label: 'Result', value: 'Looks fine → A problem' });
    assert.equal((await run('ISSUE_ADD', 'o2', { category: 'NEW_DAMAGE', title: 'x', blocking: 'NO' })).reasonCode, 'BUYER_WALKTHROUGH_ISSUE_NOT_NEEDED');
    const add = await run('ISSUE_ADD', 'o1', { category: 'NEW_DAMAGE', title: 'Leak under sink', blocking: 'YES' });
    assert.equal(add.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(add.confirmation.fields[2], { label: 'Holds up closing', value: 'Yes' });
    const plan = await run('WORKSPACE', null, { scheduledDate: '2026-11-20', accessConfirmed: 'YES' });
    assert.equal(plan.confirmation.fields.length, 2);
    assert.equal((await run('OBSERVATION_REVIEW', 'nope', { status: 'ISSUE' })).reasonCode, 'BUYER_WALKTHROUGH_OBSERVATION_NOT_FOUND');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirming calls the service methods the routes call, with the issue tied to its observation; stale or changed writes nothing', async () => {
  const workspace = ws({ observations: [obs({ id: 'o1', status: 'ISSUE' })], issues: [iss({ id: 'i1' })] });
  const w = install('CONTRIBUTOR', workspace);
  try {
    const v = version(workspace);
    const p = (kind, entityId, form, cv = v) => ({ walkthroughCommand: { kind, entityId }, walkthroughForm: form, walkthroughContextVersion: cv });
    await confirmCapabilityInvoke(OP, ctx(p('OBSERVATION_ADD', null, { area: 'Garage', category: 'GARAGE_ACCESS', status: 'ACCEPTABLE' })));
    assert.deepEqual(w.calls[0].slice(0, 3), ['createObservation', 'u1', 'prop-1']);
    assert.equal(w.calls[0][3].area, 'Garage');
    await confirmCapabilityInvoke(OP, ctx(p('OBSERVATION_REVIEW', 'o1', { status: 'ACCEPTABLE', notes: 'Fixed' })));
    assert.deepEqual(w.calls[1].slice(0, 4), ['updateObservation', 'u1', 'prop-1', 'o1']);
    assert.equal(w.calls[1][4].notes, 'Fixed');
    await confirmCapabilityInvoke(OP, ctx(p('ISSUE_UPDATE', 'i1', { status: 'ROUTED_TO_PROFESSIONAL', routedToRole: 'ATTORNEY' })));
    assert.deepEqual(w.calls[2].slice(0, 4), ['updateIssue', 'u1', 'prop-1', 'i1']);
    assert.equal(w.calls[2][4].routedToRole, 'ATTORNEY');
    await confirmCapabilityInvoke(OP, ctx(p('WORKSPACE', null, { scheduledDate: '2026-11-20', utilitiesConfirmed: 'NO' })));
    assert.equal(w.calls[3][3].utilitiesConfirmed, false);
    assert.equal(w.calls[3][3].scheduledAt, '2026-11-20T12:00:00.000Z');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('OBSERVATION_REVIEW', 'o1', { status: 'ACCEPTABLE' }, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('ISSUE_UPDATE', 'i1', { status: 'ROUTED_TO_PROFESSIONAL' }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('COMPLETE', null, undefined))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 4);
  } finally { w.restore(); }
});

// The readiness answer itself reads the buyer plan context (database), so it is not exercised end to end here; these are the rules it applies and the ids it offers.
test('row rules: a problem observation without an issue offers one, only an open issue offers an update; ids are allowlisted', async () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.WALKTHROUGH_ACTION_IDS)) assert.equal(applicable(id, 'BUYER_WALKTHROUGH_READINESS'), true, id);
  assert.equal(applicable('buyer-walkthrough-back', OP), true);
  assert.deepEqual(command.observationKinds({ status: 'ISSUE' }, false, false), ['OBSERVATION_REVIEW', 'ISSUE_ADD']);
  assert.deepEqual(command.observationKinds({ status: 'ISSUE' }, true, false), ['OBSERVATION_REVIEW']);
  assert.deepEqual(command.issueKinds({ status: 'ROUTED_TO_PROFESSIONAL' }), []);
  assert.deepEqual(command.issueKinds({ status: 'OPEN' }), ['ISSUE_UPDATE']);
});

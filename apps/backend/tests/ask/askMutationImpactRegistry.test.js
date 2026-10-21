const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const registry = require('../../src/services/ask/governance/askMutationImpactRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_RECORD_SECTION_REGISTRY } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');
const { ASK_WORK_PROVIDER_REGISTRY } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const reconciliation = require('../../src/services/ask/support/askReconciliation.ts');
const { mapPersistedExecution } = require('../../src/services/ask/support/executionState.ts');

const mutationIds = registry.askMutationOperationIds();
const clone = () => ({ ...registry.ASK_MUTATION_IMPACT_REGISTRY });

test('every Ask mutation has exactly one impact declaration, and nothing else does', () => {
  assert.equal(mutationIds.length, 118);
  assert.deepEqual(Object.keys(registry.ASK_MUTATION_IMPACT_REGISTRY).sort(), [...mutationIds].sort());
  assert.deepEqual(registry.validateAskMutationImpactRegistry(), []);
});

test('every declaration names real surfaces: reads are read operations, and sections, providers, Saved types and notification rules exist', () => {
  for (const id of mutationIds) {
    const entry = registry.ASK_MUTATION_IMPACT_REGISTRY[id];
    assert.equal(entry.operationId, id);
    for (const read of entry.reads) {
      assert.ok(ASK_OPERATION_DEFINITIONS[read], `${id} reads ${read}`);
      assert.notEqual(ASK_OPERATION_DEFINITIONS[read].family, 'COMMAND', `${id} reads a command ${read}`);
      assert.ok(!mutationIds.includes(read), `${id} reads a mutation ${read}`);
    }
    assert.equal(entry.suggestions, entry.reads.length ? 'REFRESH_VISIBLE' : 'NONE', id);
  }
});

test('the registry agrees with what Record sections and Work providers say about their own commands', () => {
  for (const section of ASK_RECORD_SECTION_REGISTRY) for (const command of section.commandOperationIds) {
    const entry = registry.ASK_MUTATION_IMPACT_REGISTRY[command];
    assert.ok(entry, `${section.id} lists unregistered command ${command}`);
    assert.ok(entry.recordSections.includes(section.id), `${command} omits section ${section.id}`);
    assert.ok(entry.reads.includes(section.lifecycleOperationId), `${command} does not refresh ${section.lifecycleOperationId}`);
  }
  for (const provider of ASK_WORK_PROVIDER_REGISTRY) for (const command of provider.commandOperationIds) {
    const entry = registry.ASK_MUTATION_IMPACT_REGISTRY[command];
    assert.ok(entry, `${provider.id} lists unregistered command ${command}`);
    assert.ok(entry.workProviders.includes(provider.id), `${command} omits provider ${provider.id}`);
    if (provider.lifecycleOperationId) assert.ok(entry.reads.includes(provider.lifecycleOperationId), `${command} does not refresh ${provider.lifecycleOperationId}`);
  }
});

test('gaps the old sibling list had are closed: writes that left a visible list silently current now refresh it', () => {
  const reads = (id) => registry.impactedReadOperationIds(id);
  assert.ok(reads('WARRANTY_UPDATE').includes('WARRANTY_LOOKUP'));
  assert.ok(reads('MAINTENANCE_TASK_COMPLETE').includes('MAINTENANCE_STATUS'));
  assert.ok(reads('MAINTENANCE_TASK_CREATE').includes('MAINTENANCE_STATUS'));
  assert.ok(reads('HOME_EVENT_VISIBILITY').includes('HOME_TIMELINE_EVENTS'));
  assert.ok(reads('HOUSEHOLD_INVITATION').includes('HOUSEHOLD_ACCESS_SUMMARY'));
  assert.ok(reads('HOME_EVENT_RADAR_STATE').includes('HOME_EVENT_RADAR_FEED'));
  assert.ok(reads('SELL_HOLD_RENT_GOAL_CAPTURE').includes('SELL_HOLD_RENT_ANALYSIS'));
  assert.ok(reads('CLAIM_FILE').includes('INCIDENT_CLAIM_STATUS'));
  assert.ok(reads('HOME_DIGITAL_WILL_CREATE').includes('HOME_DIGITAL_WILL'));
});

test('the validator rejects each way a declaration can be wrong', () => {
  const broken = (mutate) => { const registryCopy = clone(); mutate(registryCopy); return registry.validateAskMutationImpactRegistry(registryCopy); };
  assert.match(broken((r) => { delete r.WARRANTY_UPDATE; }).join('\n'), /WARRANTY_UPDATE: a mutation with no impact declaration/);
  assert.match(broken((r) => { r.NOT_A_MUTATION = { ...r.ROOM_RENAME, operationId: 'NOT_A_MUTATION' }; }).join('\n'), /NOT_A_MUTATION: declared but not a registered mutation/);
  assert.match(broken((r) => { r.ROOM_RENAME = { ...r.ROOM_RENAME, reads: ['ROOM_CREATE'] }; }).join('\n'), /ROOM_CREATE, which is a mutation, not a read/);
  assert.match(broken((r) => { r.ROOM_RENAME = { ...r.ROOM_RENAME, reads: ['NO_SUCH_OPERATION'] }; }).join('\n'), /reads unknown operation/);
  assert.match(broken((r) => { r.ROOM_RENAME = { ...r.ROOM_RENAME, recordSections: ['no-section'] }; }).join('\n'), /unknown record section/);
  assert.match(broken((r) => { r.ROOM_RENAME = { ...r.ROOM_RENAME, workProviders: ['NO_PROVIDER'] }; }).join('\n'), /unknown work provider/);
  assert.match(broken((r) => { r.ROOM_RENAME = { ...r.ROOM_RENAME, artifactTypes: ['NO_ARTIFACT'] }; }).join('\n'), /unknown artifact type/);
  assert.match(broken((r) => { r.ROOM_RENAME = { ...r.ROOM_RENAME, notifications: ['no-rule'] }; }).join('\n'), /unknown notification rule/);
  assert.match(broken((r) => { r.CLAIM_FILE = { ...r.CLAIM_FILE, reads: [] }; }).join('\n'), /CLAIM_FILE: the read INCIDENT_CLAIM_STATUS .* is not refreshed/);
  assert.match(broken((r) => { r.CLAIM_FILE = { ...r.CLAIM_FILE, workProviders: [] }; }).join('\n'), /work provider CLAIMS lists it as a command/);
  assert.match(broken((r) => { r.ROOM_RENAME = { ...r.ROOM_RENAME, recordSections: [] }; }).join('\n'), /record section rooms lists it as a command/);
  assert.match(broken((r) => { r.QUOTE_COMPARISON_CREATE = { ...r.QUOTE_COMPARISON_CREATE, reads: [] }; }).join('\n'), /artifact QUOTE_COMPARISON is read by QUOTE_COMPARISON_REVIEW/);
  assert.match(broken((r) => { r.SERVICE_PRICE_CHECK_RUN = { ...r.SERVICE_PRICE_CHECK_RUN, reads: [], suggestions: 'NONE' }; }).join('\n'), /affects nothing but gives no reason/);
  assert.match(broken((r) => { r.SERVICE_PRICE_CHECK_RUN = { ...r.SERVICE_PRICE_CHECK_RUN, suggestions: 'NONE' }; }).join('\n'), /suggestions cannot be NONE/);
  assert.match(broken((r) => { r.ROOM_RENAME = { ...r.ROOM_RENAME, noDependents: 'nothing' }; }).join('\n'), /says it affects nothing but declares surfaces/);
});

test('the old sibling map is now a read-only view of the registry', () => {
  const map = executeOperation.ASK_MUTATION_IMPACT_MAP;
  assert.deepEqual(Object.keys(map).sort(), [...mutationIds].sort());
  for (const id of mutationIds) assert.deepEqual(map[id], registry.ASK_MUTATION_IMPACT_REGISTRY[id].reads);
  assert.ok(Object.isFrozen(map));
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/executeOperation.ts'), 'utf8');
  assert.doesNotMatch(source, /OWNERSHIP_COST_COMMAND: \['OWNERSHIP_COSTS'\]/, 'no hand-written sibling list remains');
});

test('startup validation includes the impact registry', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '../../src/index.ts'), 'utf8'), /\.\.\.validateAskMutationImpactRegistry\(\)/);
});

// ---- Runtime: marking answers stale and clearing the mark -------------------------------------------------------------------------------------------------

const t = (minutes) => new Date(Date.UTC(2026, 9, 20, 12, minutes));
const row = (id, overrides = {}) => ({ id, userId: 'u1', sessionId: 's1', propertyId: 'p1', operationId: 'WARRANTY_LOOKUP', status: 'ANSWERED', parametersJson: null, createdAt: t(0), updatedAt: t(1), ...overrides });
const writer = { id: 'w1', userId: 'u1', sessionId: 's1', propertyId: 'p1', operationId: 'WARRANTY_UPDATE', status: 'COMPLETED', parametersJson: {}, createdAt: t(0), updatedAt: t(5) };

function install(rows) {
  const updates = [];
  prisma.askExecution = {
    findMany: async ({ where }) => rows.filter((candidate) => where.operationId.in.includes(candidate.operationId) && !where.id.notIn.includes(candidate.id)).sort((a, b) => b.updatedAt - a.updatedAt),
    findFirst: async ({ where }) => rows.find((candidate) => candidate.id === where.id) ?? null,
    updateMany: async ({ where, data }) => { updates.push({ id: where.id, guard: where.updatedAt, data }); return { count: 1 }; },
  };
  return updates;
}
const refresher = (behaviour) => async (userId, id) => {
  const outcome = behaviour[id];
  if (outcome === 'THROW') throw new Error('refresh failed');
  return { response: { executionId: id, sessionId: 's1' }, refreshed: outcome !== 'NOOP' };
};

test('a refreshed answer is returned and never marked stale', async () => {
  const updates = install([row('a')]);
  const { value, scope } = await reconciliation.runInReconciliationScope(() => executeOperation.reconcileAskExecutionSideEffects('u1', writer, {}, refresher({ a: 'OK' })));
  assert.deepEqual(value.refreshedExecutions.map((r) => r.executionId), ['a']);
  assert.deepEqual(value.staleExecutionIds, []);
  assert.equal(value.attemptedAndFailed, false);
  assert.deepEqual(updates, []);
  assert.equal(scope.invoked, true);
  assert.deepEqual([...scope.refreshedExecutionIds], ['a']);
});

test('an answer whose refresh fails or returns the old answer is marked stale, keeping its place in history', async () => {
  for (const behaviour of ['THROW', 'NOOP']) {
    const updates = install([row('a')]);
    const { value, scope } = await reconciliation.runInReconciliationScope(() => executeOperation.reconcileAskExecutionSideEffects('u1', writer, {}, refresher({ a: behaviour })));
    assert.deepEqual(value.refreshedExecutions, [], behaviour);
    assert.deepEqual(value.staleExecutionIds, ['a'], behaviour);
    assert.equal(value.attemptedAndFailed, true, behaviour);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].data.updatedAt.getTime(), t(1).getTime(), 'the answer keeps its updated time');
    assert.equal(updates[0].guard.getTime(), t(1).getTime(), 'a row that changed meanwhile is left alone');
    assert.deepEqual(reconciliation.staleMarkerFor(updates[0].data.parametersJson), { staleSince: updates[0].data.parametersJson.reconciliation.staleSince, becauseOperationId: 'WARRANTY_UPDATE' });
    assert.deepEqual([...scope.staleExecutionIds], ['a']);
  }
});

test('answers in other conversations are marked stale, not refreshed, newest per conversation and operation; commands are never touched', async () => {
  const updates = install([
    row('same', { updatedAt: t(2) }),
    row('other-new', { sessionId: 's2', updatedAt: t(4) }), row('other-old', { sessionId: 's2', updatedAt: t(3) }), row('third', { sessionId: 's3' }),
    row('command', { operationId: 'WARRANTY_UPDATE' }),
  ]);
  const refreshed = [];
  const { value, scope } = await reconciliation.runInReconciliationScope(() => executeOperation.reconcileAskExecutionSideEffects('u1', writer, {}, async (userId, id) => { refreshed.push(id); return { response: { executionId: id }, refreshed: true }; }));
  assert.deepEqual(refreshed, ['same'], 'only this conversation\'s answer is refreshed');
  assert.deepEqual(updates.map((u) => u.id).sort(), ['other-new', 'third']);
  assert.equal(value.markedElsewhere, 2);
  assert.equal(scope.markedElsewhere, 2);
  assert.ok(!updates.some((u) => u.id === 'command'));
});

test('a refreshed answer that does not fit in the response is reported, so the screen never keeps the old copy silently', async () => {
  install([row('a', { operationId: 'BUYER_PLAN_STATUS', updatedAt: t(1) }), row('b', { operationId: 'BUYER_DEADLINES', updatedAt: t(2) }), row('c', { operationId: 'BUYER_FINANCING_READINESS', updatedAt: t(3) }), row('d', { operationId: 'BUYER_LOAN_ESTIMATES', updatedAt: t(4) })]);
  const buyer = { ...writer, operationId: 'BUYER_PLAN_SETUP_COMMAND' };
  const { value } = await reconciliation.runInReconciliationScope(() => executeOperation.reconcileAskExecutionSideEffects('u1', buyer, {}, refresher({})));
  assert.equal(value.refreshedExecutions.length, 3, 'the response carries at most three');
  assert.equal(value.staleExecutionIds.length, 1, 'the fourth was refreshed but not delivered');
  assert.ok(!value.refreshedExecutions.some((r) => r.executionId === value.staleExecutionIds[0]));
});

test('a mutation with no declared reads marks and refreshes nothing', async () => {
  const updates = install([row('a')]);
  const noReads = { ...writer, operationId: 'HOME_DIGITAL_WILL_CREATE' };
  const { value } = await reconciliation.runInReconciliationScope(() => executeOperation.reconcileAskExecutionSideEffects('u1', { ...noReads, operationId: 'HOME_EVENT_VISIBILITY' }, {}, refresher({})));
  assert.deepEqual(value.refreshedExecutions, []);
  assert.deepEqual(updates, []);
});

test('the explicit source answer is refreshed too, and marked stale when that fails', async () => {
  const updates = install([row('src', { operationId: 'MAINTENANCE_STATUS' })]);
  const { value } = await reconciliation.runInReconciliationScope(() => executeOperation.reconcileAskExecutionSideEffects('u1', { ...writer, operationId: 'ROOM_RENAME' }, { sourceExecutionId: 'src' }, refresher({ src: 'THROW' })));
  assert.deepEqual(value.staleExecutionIds, ['src']);
  assert.equal(updates.some((u) => u.id === 'src'), true);
});

test('the stale mark reads back as staleSince on the answer, and a fresh answer carries none', () => {
  const marker = { staleSince: '2026-10-20T12:05:00.000Z', becauseOperationId: 'WARRANTY_UPDATE' };
  const marked = reconciliation.withStaleMarker({ viewState: { resultId: 'r1', revision: 3 } }, marker);
  assert.equal(marked.viewState.revision, 3, 'the answer\'s own state is kept');
  assert.deepEqual(reconciliation.staleMarkerFor(marked), marker);
  assert.equal(reconciliation.staleMarkerFor(reconciliation.withoutStaleMarker(marked)), null);
  assert.deepEqual(reconciliation.withoutStaleMarker(marked).viewState, { resultId: 'r1', revision: 3 });
  assert.equal(reconciliation.withoutStaleMarker(null), null);
  assert.equal(reconciliation.withoutStaleMarker(undefined), undefined);
  const base = { id: 'e1', sessionId: 's1', message: 'q', status: 'ANSWERED', propertyId: null, operationId: null, operationVersion: null, intentFamily: null, contextVersion: null, resultJson: { blocks: [] }, createdAt: t(0), updatedAt: t(1) };
  const mapped = mapPersistedExecution({ ...base, parametersJson: reconciliation.withStaleMarker({ other: 1 }, marker) }, null);
  assert.equal(mapped.status, 'ANSWERED');
  assert.equal(mapped.staleSince, marker.staleSince);
  assert.equal(mapPersistedExecution({ ...base, parametersJson: null }, null).staleSince, null);
});

test('reconciliation is collected per confirmation without any handler passing it along', async () => {
  assert.equal(reconciliation.reconciliationWasRun(), false);
  const { scope } = await reconciliation.runInReconciliationScope(async () => {
    assert.equal(reconciliation.reconciliationWasRun(), false);
    reconciliation.recordReconciliationOutcome({ refreshedExecutionIds: ['a'], staleExecutionIds: ['b', 'a'], markedElsewhere: 2 });
    assert.equal(reconciliation.reconciliationWasRun(), true);
  });
  assert.deepEqual([...scope.refreshedExecutionIds], ['a']);
  assert.deepEqual([...scope.staleExecutionIds], ['b'], 'an answer refreshed in the same confirmation is not stale');
  assert.equal(scope.markedElsewhere, 2);
  assert.equal(reconciliation.reconciliationWasRun(), false, 'nothing leaks outside the confirmation');
  reconciliation.recordReconciliationOutcome({ refreshedExecutionIds: [], staleExecutionIds: [], markedElsewhere: 0 });
});

test('a confirmation always reconciles, and a reconciliation failure never fails the write', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/askConfirm.ts'), 'utf8');
  assert.match(source, /runInReconciliationScope\(async \(\) => \{\s*const invoked = await confirmCapabilityInvoke/, 'the handler runs inside a reconciliation scope');
  assert.match(source, /if \(!reconciliationWasRun\(\)\) \{\s*try \{\s*const fallback = await reconcileAskExecutionSideEffects/, 'a handler that did not reconcile is reconciled centrally');
  assert.match(source, /catch \(error\) \{\s*logger\.warn\(\{ err: error, executionId, operationId: execution\.operationId \}, '\[ASK\] Reconciliation after a confirmed write failed; the write stands'\)/);
  assert.match(source, /reconciliation: \{ staleExecutionIds, markedElsewhere \}/, 'a replayed confirmation reports it too');
});

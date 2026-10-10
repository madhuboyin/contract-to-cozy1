const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Capability discovery Phase 6 (IW-SHELL-021): discovery events + canonical capability lifecycle. The real registries, planner, attribution check and
// event builder run; only the two database reads/writes (the execution row, the idempotency marker) and the analytics sink are replaced.
const lifecycle = require('../../src/services/ask/askCapabilityLifecycle.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const { canonicalCapabilityRegistry } = require('../../src/productFramework/capabilities/index.ts');
const { ASK_DISCOVERY_BINDINGS } = require('../../src/services/ask/askCapabilityBindings.ts');
const { buildToolLifecycleAnalyticsEvents } = require('../../src/services/analytics/toolLifecycle.ts');
const { CreateAskExecutionRequestSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { buildAskDiscoveryTopics } = require('../../src/services/ask/askDiscoveryTopics.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const { explorerEntryById } = require('../../src/services/ask/askExplorerRegistry.ts');
const { getAskTargetSelector } = require('../../src/services/ask/askTargetSelectors.ts');

const { planAskCapabilityLifecycle, resolveDiscoveryAttribution, readStoredDiscoveryClaim, recordAskCapabilityLifecycle, validateAskCompletionOutcomes, ASK_COMPLETION_OUTCOMES } = lifecycle;
const capability = (id) => canonicalCapabilityRegistry.getById(id);
const stages = (events) => events.map((event) => event.stage);

test('LAUNCHED records STARTED; CANCELLED and EXPIRED record ABANDONED', () => {
  const plan = (signal) => planAskCapabilityLifecycle({ capability: capability('maintenance'), operationId: 'MAINTENANCE_STATUS', status: 'RUNNING', signal });
  assert.deepEqual(plan('LAUNCHED'), [{ stage: 'STARTED', outcome: 'LAUNCHED' }]);
  assert.deepEqual(plan('CANCELLED'), [{ stage: 'ABANDONED', outcome: 'PROPOSAL_CANCELLED' }]);
  assert.deepEqual(plan('EXPIRED'), [{ stage: 'ABANDONED', outcome: 'PROPOSAL_EXPIRED' }]);
});

test('an answered execution produces output but does NOT complete a capability that declares another kind', () => {
  for (const [capabilityId, operationId] of [['maintenance', 'MAINTENANCE_STATUS'], ['diy', 'DIY_PROJECTS'], ['property-brief', 'PROPERTY_SUMMARY'], ['coverage-intelligence', 'COVERAGE_GAPS']]) {
    const events = planAskCapabilityLifecycle({ capability: capability(capabilityId), operationId, status: 'ANSWERED', signal: 'RESULT' });
    assert.deepEqual(stages(events), ['OUTPUT_GENERATED'], capabilityId);
  }
});

test('no discovery entry can complete its capability by being answered, today: every bound capability declares a non-output completion kind', () => {
  for (const binding of ASK_DISCOVERY_BINDINGS) {
    const kind = capability(binding.capabilityId).lifecycle.completionKind;
    assert.ok(!['OUTPUT_VIEWED', 'OUTPUT_GENERATED'].includes(kind), `${binding.id}: ${kind}`);
    const events = planAskCapabilityLifecycle({ capability: capability(binding.capabilityId), operationId: binding.operationId, status: 'ANSWERED', signal: 'RESULT' });
    assert.ok(!stages(events).includes('COMPLETED'), binding.id);
    const confirmed = planAskCapabilityLifecycle({ capability: capability(binding.capabilityId), operationId: binding.operationId, status: 'COMPLETED', signal: 'CONFIRMED' });
    assert.ok(!stages(confirmed).includes('COMPLETED'), `${binding.id} (confirmed)`);
  }
});

test('results that are not delivered output emit nothing: proposals, missing context, clarifications, limited answers and every failure', () => {
  for (const status of ['NEEDS_CONFIRMATION', 'NEEDS_CONTEXT', 'NEEDS_CLARIFICATION', 'NEEDS_ENTITY', 'NEEDS_PROPERTY', 'READY_WITH_LIMITATIONS', 'RUNNING', 'UNAVAILABLE', 'NOT_APPLICABLE', 'OUT_OF_SCOPE', 'BLOCKED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED', 'EXPIRED']) {
    assert.deepEqual(planAskCapabilityLifecycle({ capability: capability('maintenance'), operationId: 'MAINTENANCE_TASK_CREATE', status, signal: 'RESULT' }), [], status);
    assert.deepEqual(planAskCapabilityLifecycle({ capability: capability('maintenance'), operationId: 'MAINTENANCE_TASK_CREATE', status, signal: 'CONFIRMED' }), [], `${status} confirmed`);
  }
});

test('a confirmed task creation is output, not completion of Maintenance (whose kind is a completed task)', () => {
  const events = planAskCapabilityLifecycle({ capability: capability('maintenance'), operationId: 'MAINTENANCE_TASK_CREATE', status: 'COMPLETED', signal: 'CONFIRMED' });
  assert.deepEqual(events, [{ stage: 'OUTPUT_GENERATED', outcome: 'WRITE_CONFIRMED' }]);
});

test('COMPLETED requires a declared outcome that matches the signal, the capability kind, and a verified output entity type', () => {
  const maintenance = capability('maintenance');
  const complete = (completions, over = {}) => planAskCapabilityLifecycle({ capability: maintenance, operationId: 'MAINTENANCE_TASK_COMPLETE', status: 'COMPLETED', signal: 'CONFIRMED', completions, ...over });
  const good = { MAINTENANCE_TASK_COMPLETE: { kind: 'ACTION_COMPLETED', on: 'WRITE_CONFIRMED', outputEntityType: 'WORK_ITEM' } };
  assert.deepEqual(complete(good), [{ stage: 'OUTPUT_GENERATED', outcome: 'WRITE_CONFIRMED' }, { stage: 'COMPLETED', outcome: 'WRITE_CONFIRMED', completionKind: 'ACTION_COMPLETED' }]);
  assert.deepEqual(stages(complete({ MAINTENANCE_TASK_COMPLETE: { ...good.MAINTENANCE_TASK_COMPLETE, kind: 'ARTIFACT_CREATED' } })), ['OUTPUT_GENERATED'], 'kind differs from the capability');
  assert.deepEqual(stages(complete({ MAINTENANCE_TASK_COMPLETE: { ...good.MAINTENANCE_TASK_COMPLETE, outputEntityType: 'PROJECT' } })), ['OUTPUT_GENERATED'], 'entity type not verified');
  assert.deepEqual(stages(complete({ MAINTENANCE_TASK_COMPLETE: { ...good.MAINTENANCE_TASK_COMPLETE, outputEntityType: undefined } })), ['OUTPUT_GENERATED'], 'missing entity type');
  assert.deepEqual(stages(complete(good, { signal: 'RESULT' })), ['OUTPUT_GENERATED'], 'an answer is not a confirmed write');
  assert.deepEqual(stages(complete({})), ['OUTPUT_GENERATED'], 'nothing declared, nothing completed');
  // An OUTPUT_GENERATED capability completes only when its operation is declared to, and only on delivery.
  const output = { capability: { lifecycle: { completionKind: 'OUTPUT_GENERATED', outputEntityTypes: [] } }, operationId: 'HOME_STATUS_BOARD', status: 'ANSWERED', signal: 'RESULT' };
  assert.deepEqual(stages(planAskCapabilityLifecycle(output)), ['OUTPUT_GENERATED']);
  assert.deepEqual(stages(planAskCapabilityLifecycle({ ...output, completions: { HOME_STATUS_BOARD: { kind: 'OUTPUT_GENERATED', on: 'OUTPUT_DELIVERED' } } })), ['OUTPUT_GENERATED', 'COMPLETED']);
});

test('delivery is never "viewed": an OUTPUT_VIEWED capability is not completed by an answer, even if a table entry says so, and the validator rejects such an entry', () => {
  const viewed = { capability: { lifecycle: { completionKind: 'OUTPUT_VIEWED', outputEntityTypes: [] } }, operationId: 'HOME_STATUS_BOARD', status: 'ANSWERED', signal: 'RESULT', completions: { HOME_STATUS_BOARD: { kind: 'OUTPUT_VIEWED', on: 'OUTPUT_DELIVERED' } } };
  assert.deepEqual(stages(planAskCapabilityLifecycle(viewed)), ['OUTPUT_GENERATED']);
  assert.match(validateAskCompletionOutcomes({ HOME_STATUS_BOARD: viewed.completions.HOME_STATUS_BOARD }, { getById: () => ({ id: 'status-board', lifecycle: { completionKind: 'OUTPUT_VIEWED', outputEntityTypes: [] } }) }, () => 'status-board').join('\n'), /OUTPUT_VIEWED cannot be satisfied by delivery/);
});

test('the real completion table is valid, and the validator rejects contradictions of the capability registry', () => {
  assert.deepEqual(validateAskCompletionOutcomes(), []);
  assert.deepEqual(Object.keys(ASK_COMPLETION_OUTCOMES), ['MAINTENANCE_TASK_COMPLETE']);
  const bad = (entry) => validateAskCompletionOutcomes({ MAINTENANCE_TASK_COMPLETE: entry }).join('\n');
  assert.match(bad({ kind: 'DECISION_RECORDED', on: 'WRITE_CONFIRMED', outputEntityType: 'WORK_ITEM' }), /declares DECISION_RECORDED but maintenance declares ACTION_COMPLETED/);
  assert.match(bad({ kind: 'ACTION_COMPLETED', on: 'WRITE_CONFIRMED', outputEntityType: 'PROJECT' }), /output entity type is not verified/);
  assert.match(bad({ kind: 'ACTION_COMPLETED', on: 'OUTPUT_DELIVERED', outputEntityType: 'WORK_ITEM' }), /is satisfied by WRITE_CONFIRMED, not OUTPUT_DELIVERED/);
  assert.match(validateAskCompletionOutcomes({ NOT_AN_OPERATION: { kind: 'ACTION_COMPLETED', on: 'WRITE_CONFIRMED' } }).join('\n'), /unknown operation/);
  assert.match(validateAskCompletionOutcomes({ HOME_DIGITAL_WILL: { kind: 'ACTION_COMPLETED', on: 'WRITE_CONFIRMED' } }, canonicalCapabilityRegistry, () => undefined).join('\n'), /assigns no capability/);
});

test('attribution is honoured only when the declared operation and the message match the reviewed entry exactly; everything else is derived', () => {
  const entry = explorerEntryById('maintain-due');
  const ok = { claim: { entryId: 'maintain-due', surface: 'TOPIC', topicId: 'HOME_CARE' }, declaredOperationId: entry.operationId, message: ` ${entry.question} ` };
  assert.deepEqual(resolveDiscoveryAttribution(ok), { entryId: 'maintain-due', capabilityId: 'maintenance', operationId: 'MAINTENANCE_STATUS', surface: 'TOPIC', topicId: 'HOME_CARE' });
  assert.equal(resolveDiscoveryAttribution({ ...ok, declaredOperationId: 'HOME_ACTIONS' }), null, 'declared operation differs');
  assert.equal(resolveDiscoveryAttribution({ ...ok, declaredOperationId: null }), null);
  assert.equal(resolveDiscoveryAttribution({ ...ok, message: 'What maintenance is due? (edited)' }), null, 'message edited');
  assert.equal(resolveDiscoveryAttribution({ ...ok, claim: { entryId: 'not-an-entry', surface: 'TOPIC' } }), null);
  assert.equal(resolveDiscoveryAttribution({ ...ok, claim: { entryId: 'maintain-due', surface: 'SOMEWHERE' } }), null);
  assert.equal(resolveDiscoveryAttribution({ ...ok, claim: null }), null);
  assert.equal(resolveDiscoveryAttribution({ ...ok, claim: 'maintain-due' }), null);
  // The capability is never taken from the claim.
  assert.equal(resolveDiscoveryAttribution({ ...ok, claim: { ...ok.claim, capabilityId: 'diy', operationId: 'DIY_PROJECTS' } }).capabilityId, 'maintenance');
  // A topic is kept only when it lists the entry.
  assert.equal(resolveDiscoveryAttribution({ ...ok, claim: { entryId: 'maintain-due', surface: 'TOPIC', topicId: 'DIY_PROJECTS' } }).topicId, null);
  assert.equal(resolveDiscoveryAttribution({ ...ok, claim: { entryId: 'maintain-due', surface: 'EXPLORER' } }).topicId, null);
});

test('readStoredDiscoveryClaim reads the claim and the declared operation from the persisted launch context only', () => {
  assert.deepEqual(readStoredDiscoveryClaim({ surface: 'ASK_PAGE', operationId: 'DIY_PROJECTS', discovery: { entryId: 'maintain-diy', surface: 'TOPIC' } }), { claim: { entryId: 'maintain-diy', surface: 'TOPIC' }, declaredOperationId: 'DIY_PROJECTS' });
  for (const value of [null, undefined, 'x', [], 5]) assert.deepEqual(readStoredDiscoveryClaim(value), { claim: null, declaredOperationId: null });
});

test('every discovery entry builds a valid canonical lifecycle event for every stage it can emit', () => {
  for (const binding of ASK_DISCOVERY_BINDINGS) {
    // An idea behind a selector sends the chosen option's message, not its own prompt.
    const message = binding.launch === 'SELECTOR' ? getAskTargetSelector(binding.selectorId).messages[0] : binding.question;
    const attribution = resolveDiscoveryAttribution({ claim: { entryId: binding.id, surface: 'EXPLORER' }, declaredOperationId: binding.operationId, message });
    assert.ok(attribution, binding.id);
    for (const stage of ['STARTED', 'OUTPUT_GENERATED', 'ABANDONED']) {
      const events = buildToolLifecycleAnalyticsEvents({ userId: 'u', propertyId: 'p', events: [{ toolId: attribution.capabilityId, stage, surface: 'ask_discovery', sourceKind: 'CATALOG', sourceId: binding.id, manifestVersion: capability(attribution.capabilityId).version, metadata: {} }] });
      assert.equal(events[0].featureKey, attribution.capabilityId);
    }
  }
});

function stubStorage({ execution, existing = [] }) {
  const original = {
    findUnique: prisma.askExecution.findUnique, findMany: prisma.askExecutionEvent.findMany, createMany: prisma.askExecutionEvent.createMany,
  };
  const marks = [...existing];
  prisma.askExecution.findUnique = async () => execution;
  prisma.askExecutionEvent.findMany = async ({ where }) => marks.filter((type) => where.eventType.in.includes(type)).map((eventType) => ({ eventType }));
  prisma.askExecutionEvent.createMany = async ({ data }) => { for (const row of data) marks.push(row.eventType); return { count: data.length }; };
  return { marks, restore: () => { prisma.askExecution.findUnique = original.findUnique; prisma.askExecutionEvent.findMany = original.findMany; prisma.askExecutionEvent.createMany = original.createMany; } };
}
const executionRow = (over = {}) => ({
  id: 'ex-1', userId: 'u1', propertyId: 'p1', sessionId: 's1', operationId: 'MAINTENANCE_STATUS', status: 'ANSWERED', reasonCode: 'MAINTENANCE_READY',
  message: 'What maintenance tasks are due this month?',
  launchContextJson: { surface: 'ASK_PAGE', operationId: 'MAINTENANCE_STATUS', discovery: { entryId: 'maintain-due', surface: 'TOPIC', topicId: 'HOME_CARE' } }, ...over,
});

test('the recorder writes STARTED then OUTPUT_GENERATED once each, with bounded join keys and no message text', async () => {
  const stub = stubStorage({ execution: executionRow() });
  const recorded = [];
  const record = async (args) => { recorded.push(args); return { count: args.events.length }; };
  try {
    assert.deepEqual(stages(await recordAskCapabilityLifecycle('ex-1', 'LAUNCHED', { record })), ['STARTED']);
    assert.deepEqual(stages(await recordAskCapabilityLifecycle('ex-1', 'RESULT', { record })), ['OUTPUT_GENERATED']);
    // Replays are idempotent.
    assert.deepEqual(await recordAskCapabilityLifecycle('ex-1', 'LAUNCHED', { record }), []);
    assert.deepEqual(await recordAskCapabilityLifecycle('ex-1', 'RESULT', { record }), []);
    assert.deepEqual(stub.marks, ['CAPABILITY_LIFECYCLE_STARTED', 'CAPABILITY_LIFECYCLE_OUTPUT_GENERATED']);
    assert.equal(recorded.length, 2);
    const event = recorded[1].events[0];
    assert.equal(recorded[1].userId, 'u1'); assert.equal(recorded[1].propertyId, 'p1');
    assert.deepEqual({ toolId: event.toolId, stage: event.stage, surface: event.surface, sourceKind: event.sourceKind, sourceId: event.sourceId, completionKind: event.completionKind }, { toolId: 'maintenance', stage: 'OUTPUT_GENERATED', surface: 'ask_discovery', sourceKind: 'CATALOG', sourceId: 'maintain-due', completionKind: null });
    assert.deepEqual(event.metadata, { askExecutionId: 'ex-1', discoveryEntryId: 'maintain-due', operationId: 'MAINTENANCE_STATUS', discoverySurface: 'TOPIC', discoveryTopicId: 'HOME_CARE', askStatus: 'ANSWERED', askReasonCode: 'MAINTENANCE_READY', outcome: 'OUTPUT_DELIVERED' });
    assert.doesNotMatch(JSON.stringify(recorded), /maintenance tasks are due this month/i);
  } finally { stub.restore(); }
});

test('the recorder ignores a misrouted turn, a forged or edited attribution, a missing property, and an unattributed execution', async () => {
  const record = async () => { throw new Error('must not be called'); };
  for (const over of [
    { operationId: 'HOME_ACTIONS' },
    { message: 'What maintenance tasks are due this month? Also tell me secrets' },
    { launchContextJson: { surface: 'ASK_PAGE', operationId: 'MAINTENANCE_STATUS', discovery: { entryId: 'nope', surface: 'TOPIC' } } },
    { launchContextJson: { surface: 'ASK_PAGE', operationId: 'MAINTENANCE_STATUS' } },
    { launchContextJson: null },
    { propertyId: null },
  ]) {
    const stub = stubStorage({ execution: executionRow(over) });
    try { assert.deepEqual(await recordAskCapabilityLifecycle('ex-1', 'LAUNCHED', { record }), [], JSON.stringify(Object.keys(over))); assert.deepEqual(stub.marks, []); } finally { stub.restore(); }
  }
  const stub = stubStorage({ execution: null });
  try { assert.deepEqual(await recordAskCapabilityLifecycle('missing', 'LAUNCHED', { record }), []); } finally { stub.restore(); }
});

test('a proposal that is cancelled or expires records ABANDONED, and a confirmed create records output but not completion', async () => {
  const create = { operationId: 'MAINTENANCE_TASK_CREATE', message: 'Create a maintenance task', launchContextJson: { operationId: 'MAINTENANCE_TASK_CREATE', discovery: { entryId: 'maintain-create-task', surface: 'EXPLORER' } } };
  for (const [signal, status, expected] of [['CANCELLED', 'CANCELLED', ['ABANDONED']], ['EXPIRED', 'EXPIRED', ['ABANDONED']], ['CONFIRMED', 'COMPLETED', ['OUTPUT_GENERATED']], ['RESULT', 'NEEDS_CONFIRMATION', []]]) {
    const stub = stubStorage({ execution: executionRow({ ...create, status }) });
    try { assert.deepEqual(stages(await recordAskCapabilityLifecycle('ex-1', signal, { record: async () => ({}) })), expected, signal); } finally { stub.restore(); }
  }
});

test('an analytics failure never throws, never delays the request, and leaves no marker so a later signal can retry', async () => {
  const stub = stubStorage({ execution: executionRow() });
  try {
    assert.deepEqual(await recordAskCapabilityLifecycle('ex-1', 'LAUNCHED', { record: async () => { throw new Error('sink down'); } }), []);
    assert.deepEqual(stub.marks, []);
    assert.deepEqual(stages(await recordAskCapabilityLifecycle('ex-1', 'LAUNCHED', { record: async () => ({}) })), ['STARTED']);
  } finally { stub.restore(); }
});

test('the launch-context contract accepts a bounded discovery claim and nothing else', () => {
  const base = { clientRequestId: 'c1', sessionId: 's1', message: 'hi' };
  const parse = (discovery) => CreateAskExecutionRequestSchema.safeParse({ ...base, launchContext: { surface: 'ASK_PAGE', discovery } }).success;
  assert.equal(parse({ entryId: 'maintain-due', surface: 'TOPIC', topicId: 'HOME_CARE' }), true);
  assert.equal(parse({ entryId: 'maintain-due', surface: 'EXPLORER' }), true);
  assert.equal(parse(null), true);
  assert.equal(parse({ entryId: 'maintain-due', surface: 'ELSEWHERE' }), false);
  assert.equal(parse({ entryId: 'x'.repeat(81), surface: 'TOPIC' }), false);
  assert.equal(parse({ entryId: 'maintain-due', surface: 'TOPIC', capabilityId: 'diy' }), false, 'extra keys are rejected');
});

test('the topic projection carries the join keys, taken from the reviewed entry', () => {
  const topics = buildAskDiscoveryTopics({ controls: readAskOperationalControls(), householdRole: 'OWNER', operatingMode: 'UNKNOWN', propertyId: 'p1' });
  const seasonal = topics.flatMap((topic) => topic.starters).find((starter) => starter.id === 'home-care-seasonal');
  assert.equal(seasonal.entryId, 'maintain-seasonal');
  assert.equal(seasonal.capabilityId, 'seasonal-maintenance');
});

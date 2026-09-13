// apps/workers/tests/unit/processDomainEventsJob.test.js
//
// W4 item 4: processDomainEventsJob (the real logic behind the
// domain-events-poller runner — the poller itself is a thin setInterval
// wrapper) had no dedicated test. Covers the atomic per-event claim,
// backoff-eligibility gating for FAILED events, the double idempotency
// layer (a findFirst pre-check in addition to NotificationService.create's
// own dedup), CLAIM_SUBMITTED/CLAIM_CLOSED handling, and that an unknown
// event type or a handler throw marks that one event FAILED without
// aborting the batch.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  MAX_DOMAIN_EVENT_ATTEMPTS,
  processDomainEventsJob,
} = require('../../src/jobs/processDomainEvents.job.ts');

function readFileSyncForJobSource() {
  return readFileSync(resolve(__dirname, '../../src/jobs/processDomainEvents.job.ts'), 'utf8');
}

function eventFixture(overrides = {}) {
  return {
    id: 'event-1',
    type: 'CLAIM_SUBMITTED',
    status: 'PENDING',
    attempts: 0,
    updatedAt: new Date(),
    userId: 'user-1',
    propertyId: 'property-1',
    payload: { claimId: 'claim-1', providerName: 'Acme', claimNumber: 'C-1' },
    ...overrides,
  };
}

function fakeDeps({
  pendingEvents,
  existingNotification = null,
  notificationCreateShouldFailFor = new Set(),
  lockShouldFail = false,
  radarReconciliationShouldFail = false,
  recomputeRequestedResult = { status: 'SUCCEEDED' },
  recomputeRequestedShouldFail = false,
  recomputeRetryRequestedResult = { status: 'SUCCEEDED' },
  recomputeRetryRequestedShouldFail = false,
  captureLinkReconcileShouldFail = false,
  askExtractionRequestedResult = { candidateCount: 0 },
  askExtractionRequestedShouldFail = false,
  radarNotificationMaterializeResult = { outcome: 'created', notificationId: 'notification-1' },
  radarNotificationMaterializeShouldFail = false,
  goalCandidateAttachResult = { id: 'goal-execution-1' },
  goalCandidateAttachShouldFail = false,
  // Code review finding (2026-09-13): simulate the redundant success
  // completion write itself failing (successCompletionShouldThrow) and/or
  // the row having already moved past PROCESSING by the time either write
  // runs (terminalWriteShouldNoOp) -- the guarded-write fix's whole point.
  successCompletionShouldThrow = false,
  terminalWriteShouldNoOp = false,
}) {
  const calls = {
    updates: [],
    creates: [],
    notificationFindFirstArgs: [],
    refinanceAlerts: [],
    radarReconciliations: [],
    recomputeRequested: [],
    recomputeRetryRequested: [],
    captureLinkReconcile: [],
    askExtractionRequested: [],
    radarNotificationMaterialize: [],
    goalCandidateAttach: [],
  };

  const deps = {
    prisma: {
      domainEvent: {
        findMany: async () => pendingEvents,
        updateMany: async (args) => {
          const status = args.data?.status;
          // The original claim step (top of the loop) is the only
          // updateMany call that also increments attempts.
          if (status === 'PROCESSING' && args.data?.attempts) {
            calls.updates.push({ kind: 'claim', args });
            return { count: lockShouldFail ? 0 : 1 };
          }
          // Success completion (status: PROCESSED) and failure completion
          // (status: FAILED/DEAD_LETTER) are both now guarded updateMany
          // calls -- code review finding (2026-09-13), previously bare
          // `update` calls with no guard at all.
          if (status === 'PROCESSED') {
            calls.updates.push({ kind: 'terminal', args });
            if (successCompletionShouldThrow) throw new Error('redundant success completion write failed');
            return { count: terminalWriteShouldNoOp ? 0 : 1 };
          }
          if (status === 'FAILED' || status === 'DEAD_LETTER') {
            calls.updates.push({ kind: 'terminal', args });
            return { count: terminalWriteShouldNoOp ? 0 : 1 };
          }
          // Lease heartbeat renewal (no status change) -- not tracked.
          return { count: 1 };
        },
        update: async (args) => {
          calls.updates.push({ kind: 'terminal', args });
          return { id: args.where.id, ...args.data };
        },
      },
      notification: {
        findFirst: async (args) => {
          calls.notificationFindFirstArgs.push(args);
          return existingNotification;
        },
      },
    },
    notificationService: {
      create: async (input) => {
        calls.creates.push(input);
        if (notificationCreateShouldFailFor.has(input.entityId)) throw new Error(`create failed for ${input.entityId}`);
        return { id: `notification-${calls.creates.length}` };
      },
    },
    refinanceTransitionAlert: async (input) => {
      calls.refinanceAlerts.push(input);
      return { status: 'SUPPRESSED', reason: 'DELIVERY_DISABLED' };
    },
    radarPropertyReconciliation: async (event) => {
      calls.radarReconciliations.push(event);
      if (radarReconciliationShouldFail) {
        throw new Error('radar reconciliation failed');
      }
      return {
        outcome: 'page_reconciled',
        propertyId: event.propertyId,
        evaluatedEvents: 2,
        continuationCreated: false,
      };
    },
    recomputeRequested: async (db, trigger) => {
      calls.recomputeRequested.push(trigger);
      if (recomputeRequestedShouldFail) throw new Error('recompute requested handling failed');
      return recomputeRequestedResult;
    },
    recomputeRetryRequested: async (db, input) => {
      calls.recomputeRetryRequested.push(input);
      if (recomputeRetryRequestedShouldFail) throw new Error('recompute retry handling failed');
      return recomputeRetryRequestedResult;
    },
    captureLinkReconcile: async (executionId) => {
      calls.captureLinkReconcile.push(executionId);
      if (captureLinkReconcileShouldFail) throw new Error('capture link reconcile failed');
    },
    askExtractionRequested: async (event, claimedAttempts) => {
      calls.askExtractionRequested.push({ event, claimedAttempts });
      if (askExtractionRequestedShouldFail) throw new Error('ask extraction requested handling failed');
      return askExtractionRequestedResult;
    },
    radarNotificationMaterialize: async (event) => {
      calls.radarNotificationMaterialize.push(event);
      if (radarNotificationMaterializeShouldFail) throw new Error('radar notification materialize handling failed');
      return radarNotificationMaterializeResult;
    },
    goalCandidateAttach: async (event, claimedAttempts) => {
      calls.goalCandidateAttach.push({ event, claimedAttempts });
      if (goalCandidateAttachShouldFail) throw new Error('goal candidate attach handling failed');
      return goalCandidateAttachResult;
    },
  };
  return { deps, calls };
}

test('processes a CLAIM_SUBMITTED event: creates a notification and marks PROCESSED', async () => {
  const { deps, calls } = fakeDeps({ pendingEvents: [eventFixture()] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].type, 'CLAIM_SUBMITTED');
  assert.equal(calls.creates[0].category, 'WORKFLOW');
  assert.equal(calls.creates[0].urgency, 'MATERIAL');
  assert.equal(calls.creates[0].entityId, 'claim-1');
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
});

test('processes a CLAIM_CLOSED event correctly', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [eventFixture({ type: 'CLAIM_CLOSED', payload: { claimId: 'claim-1', status: 'SETTLED' } })],
  });

  await processDomainEventsJob(undefined, deps);

  assert.equal(calls.creates[0].type, 'CLAIM_CLOSED');
  assert.equal(calls.creates[0].title, 'Claim closed');
});

for (const [type, transitionType] of [
  ['REFINANCE_OPPORTUNITY_OPENED', 'OPEN'],
  ['REFINANCE_OPPORTUNITY_UPDATED', 'UPDATE'],
  ['REFINANCE_OPPORTUNITY_CLOSED', 'CLOSED'],
]) {
  test(`acknowledges a valid ${type} event with the expected alert behavior`, async () => {
    const { deps, calls } = fakeDeps({
      pendingEvents: [
        eventFixture({
          type,
          payload: { propertyId: 'property-1', snapshotId: 'snapshot-1', transitionType },
        }),
      ],
    });

    const result = await processDomainEventsJob(undefined, deps);

    assert.equal(result.processed, 1);
    assert.equal(calls.creates.length, 0);
    assert.equal(calls.refinanceAlerts.length, transitionType === 'CLOSED' ? 0 : 1);
    const terminal = calls.updates.find((update) => update.kind === 'terminal');
    assert.equal(terminal.args.data.status, 'PROCESSED');
  });
}

test('acknowledges a valid REFINANCE_DATA_REQUIRED event without external delivery', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({
        type: 'REFINANCE_DATA_REQUIRED',
        payload: {
          propertyId: 'property-1',
          snapshotId: 'snapshot-1',
          transitionType: 'DATA_REQUIRED',
          missingFields: ['interestRate'],
        },
      }),
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.equal(calls.creates.length, 0);
  const terminal = calls.updates.find((update) => update.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
});

for (const type of [
  'REFINANCE_DECISION_RECORDED',
  'REFINANCE_DECISION_CHANGED',
  'REFINANCE_NEXT_STEP_STARTED',
  'REFINANCE_OUTCOME_COMPLETED',
]) {
  test(`acknowledges internal ${type} without external delivery`, async () => {
    const { deps, calls } = fakeDeps({
      pendingEvents: [eventFixture({
        type,
        payload: { propertyId: 'property-1', decisionId: 'decision-1', version: 1 },
      })],
    });
    const result = await processDomainEventsJob(undefined, deps);
    assert.equal(result.processed, 1);
    assert.equal(calls.creates.length, 0);
    assert.equal(calls.refinanceAlerts.length, 0);
  });
}

test('processes Radar property reconciliation and persists its structured outcome', async () => {
  const radarEvent = eventFixture({
    type: 'RADAR_PROPERTY_RECONCILIATION_REQUESTED',
    payload: {
      payloadVersion: 1,
      propertyId: 'property-1',
      reasons: ['property_facts_changed'],
      changeToken: 'version-1',
      correlationId: 'correlation-1',
      requestedAt: '2026-07-26T18:00:00.000Z',
      pageSize: 25,
    },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [radarEvent] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.equal(calls.radarReconciliations.length, 1);
  const terminal = calls.updates.find((update) => update.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
  assert.equal(
    terminal.args.data.payload.processingOutcome.outcome,
    'page_reconciled',
  );
  assert.equal(
    terminal.args.data.payload.processingOutcome.evaluatedEvents,
    2,
  );
});

test('Radar reconciliation failures use the shared retry and dead-letter path', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({
        type: 'RADAR_PROPERTY_RECONCILIATION_REQUESTED',
        payload: {},
      }),
    ],
    radarReconciliationShouldFail: true,
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  const terminal = calls.updates.find((update) => update.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /radar reconciliation failed/);
});

test('processes a PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED event and dispatches it with the expected trigger fields', async () => {
  const recomputeEvent = eventFixture({
    type: 'PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED',
    idempotencyKey: 'recompute:PROPERTY_FACT_CHANGED:Property:property-1:property-1:ctx-1',
    payload: {
      propertyId: 'property-1',
      triggerType: 'PROPERTY_FACT_CHANGED',
      triggerEntityType: 'Property',
      triggerEntityId: 'property-1',
      changedFactKeys: ['fact.a'],
      requestedContextVersion: 'ctx-1',
      idempotencyKey: 'recompute:PROPERTY_FACT_CHANGED:Property:property-1:property-1:ctx-1',
    },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [recomputeEvent] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.equal(calls.recomputeRequested.length, 1);
  assert.equal(calls.recomputeRequested[0].propertyId, 'property-1');
  assert.equal(calls.recomputeRequested[0].triggerType, 'PROPERTY_FACT_CHANGED');
  assert.deepEqual(calls.recomputeRequested[0].changedFactKeys, ['fact.a']);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
});

test('a PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED event missing required trigger fields fails without dispatching', async () => {
  const recomputeEvent = eventFixture({
    type: 'PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED',
    payload: { propertyId: 'property-1' },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [recomputeEvent] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  assert.equal(calls.recomputeRequested.length, 0);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
});

test('recompute-requested handler failures use the shared retry/dead-letter path', async () => {
  const recomputeEvent = eventFixture({
    type: 'PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED',
    payload: {
      propertyId: 'property-1',
      triggerType: 'PROPERTY_FACT_CHANGED',
      triggerEntityType: 'Property',
      triggerEntityId: 'property-1',
      changedFactKeys: ['fact.a'],
      idempotencyKey: 'recompute-key-1',
    },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [recomputeEvent], recomputeRequestedShouldFail: true });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /recompute requested handling failed/);
});

test('processes a PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED event and dispatches it with the target/run identifiers', async () => {
  const retryEvent = eventFixture({
    type: 'PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED',
    payload: { recomputeRunId: 'run-1', targetId: 'target-1' },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [retryEvent] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.equal(calls.recomputeRetryRequested.length, 1);
  assert.deepEqual(calls.recomputeRetryRequested[0], { recomputeRunId: 'run-1', targetId: 'target-1' });
});

test('processes an ASK_CAPTURE_LINK_RECONCILE event, dispatching the executionId to the reconciler', async () => {
  const reconcileEvent = eventFixture({
    type: 'ASK_CAPTURE_LINK_RECONCILE',
    payload: { executionId: 'execution-1' },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [reconcileEvent] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.deepEqual(calls.captureLinkReconcile, ['execution-1']);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
});

test('an ASK_CAPTURE_LINK_RECONCILE event missing executionId fails without dispatching', async () => {
  const reconcileEvent = eventFixture({
    type: 'ASK_CAPTURE_LINK_RECONCILE',
    payload: {},
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [reconcileEvent] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  assert.equal(calls.captureLinkReconcile.length, 0);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
});

test('ASK_CAPTURE_LINK_RECONCILE reconciler failures use the shared retry/dead-letter path', async () => {
  const reconcileEvent = eventFixture({
    type: 'ASK_CAPTURE_LINK_RECONCILE',
    payload: { executionId: 'execution-1' },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [reconcileEvent], captureLinkReconcileShouldFail: true });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /capture link reconcile failed/);
});

// External review [P2]: FRD §29/§31 -- Home Event Radar's notification path
// migrated off its direct Notification write onto this same DomainEvent
// rail (radarNotificationMaterializationReconciliation.service.ts).
test('processes a RADAR_NOTIFICATION_MATERIALIZE_REQUESTED event, dispatching it to the reconciler', async () => {
  const materializeEvent = eventFixture({
    type: 'RADAR_NOTIFICATION_MATERIALIZE_REQUESTED',
    payload: { payloadVersion: 1, decisionId: 'decision-1', propertyId: 'property-1' },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [materializeEvent] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.equal(calls.radarNotificationMaterialize.length, 1);
  assert.deepEqual(calls.radarNotificationMaterialize[0].payload, { payloadVersion: 1, decisionId: 'decision-1', propertyId: 'property-1' });
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
});

test('RADAR_NOTIFICATION_MATERIALIZE_REQUESTED reconciler failures use the shared retry/dead-letter path', async () => {
  const materializeEvent = eventFixture({
    type: 'RADAR_NOTIFICATION_MATERIALIZE_REQUESTED',
    payload: { payloadVersion: 1, decisionId: 'decision-1', propertyId: 'property-1' },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [materializeEvent], radarNotificationMaterializeShouldFail: true });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /radar notification materialize handling failed/);
});

// External review, Phase 6 [P2] (FRD §21): goal-candidate attachment is now
// its own durable, retryable DomainEvent (created atomically inside
// persistCandidates's own transaction) instead of best-effort work run
// after the triggering ASK_EXTRACTION_REQUESTED event was already marked
// PROCESSED -- see conversationalCapture.ts's processGoalCandidateAttachEvent.
test('processes an ASK_GOAL_CANDIDATE_ATTACH_REQUESTED event, passing the pre-claim attempts + 1 as claimedAttempts, mirroring ASK_EXTRACTION_REQUESTED\'s own contract', async () => {
  const goalAttachEvent = eventFixture({
    id: 'event-goal-attach-1',
    type: 'ASK_GOAL_CANDIDATE_ATTACH_REQUESTED',
    attempts: 0,
    payload: {
      payloadVersion: 1,
      parentExecutionId: 'execution-1',
      index: 0,
      userId: 'user-1',
      sessionId: 'session-1',
      propertyId: 'property-1',
      contextVersion: null,
      candidate: {
        decisionDefinitionId: 'SELL_HOLD_RENT',
        timeframeLabel: 'next year',
        sourceSentence: 'I am thinking about selling next year.',
        extractionConfidence: 0.9,
        attribution: 'FIRSTHAND',
      },
    },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [goalAttachEvent] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.equal(calls.goalCandidateAttach.length, 1);
  assert.equal(calls.goalCandidateAttach[0].claimedAttempts, 1);
  assert.deepEqual(calls.goalCandidateAttach[0].event, { id: 'event-goal-attach-1', payload: goalAttachEvent.payload });
  // In real Prisma, processGoalCandidateAttachEvent self-completes (marks
  // its own event PROCESSED), and this file's generic completion write --
  // guarded on status still being PROCESSING -- naturally no-ops on top of
  // that, exactly like ASK_EXTRACTION_REQUESTED's own handler. This fake
  // deps harness doesn't model that guard (the mock handler never touches
  // prisma.domainEvent itself), so the generic write below still records,
  // matching the ASK_EXTRACTION_REQUESTED test's own established assertion
  // shape.
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
});

test('ASK_GOAL_CANDIDATE_ATTACH_REQUESTED handler failures use the shared retry/dead-letter path', async () => {
  const goalAttachEvent = eventFixture({
    type: 'ASK_GOAL_CANDIDATE_ATTACH_REQUESTED',
    payload: { payloadVersion: 1, parentExecutionId: 'execution-1', index: 0, userId: 'user-1', sessionId: 'session-1', propertyId: 'property-1', contextVersion: null, candidate: { decisionDefinitionId: 'SELL_HOLD_RENT', timeframeLabel: null, sourceSentence: 'x', extractionConfidence: 0.9, attribution: 'FIRSTHAND' } },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [goalAttachEvent], goalCandidateAttachShouldFail: true });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /goal candidate attach handling failed/);
});

test('processes an ASK_EXTRACTION_REQUESTED event, passing the pre-claim attempts + 1 as claimedAttempts', async () => {
  const extractionEvent = eventFixture({
    id: 'event-extraction-1',
    type: 'ASK_EXTRACTION_REQUESTED',
    attempts: 0,
    userId: 'user-1',
    propertyId: 'property-1',
    payload: { executionId: 'execution-1', message: 'I replaced the roof last summer for $14,500.' },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [extractionEvent], askExtractionRequestedResult: { candidateCount: 1 } });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
  assert.equal(calls.askExtractionRequested.length, 1);
  assert.equal(calls.askExtractionRequested[0].claimedAttempts, 1);
  assert.deepEqual(calls.askExtractionRequested[0].event, {
    id: 'event-extraction-1', propertyId: 'property-1', userId: 'user-1',
    payload: { executionId: 'execution-1', message: 'I replaced the roof last summer for $14,500.' },
  });
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'PROCESSED');
  assert.deepEqual(terminal.args.data.payload.processingOutcome, { candidateCount: 1 });
});

test('ASK_EXTRACTION_REQUESTED handler failures (e.g. a claim reclaimed by a later attempt) use the shared retry/dead-letter path', async () => {
  const extractionEvent = eventFixture({
    type: 'ASK_EXTRACTION_REQUESTED',
    payload: { executionId: 'execution-1', message: 'I replaced the roof last summer for $14,500.' },
  });
  const { deps, calls } = fakeDeps({ pendingEvents: [extractionEvent], askExtractionRequestedShouldFail: true });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /ask extraction requested handling failed/);
});

test('a malformed refinance transition is retried as FAILED', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({
        type: 'REFINANCE_OPPORTUNITY_OPENED',
        payload: { propertyId: 'property-1', snapshotId: 'snapshot-1', transitionType: 'CLOSED' },
      }),
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.failed, 1);
  const terminal = calls.updates.find((update) => update.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /transition mismatch/);
});

test('idempotency: does not create a duplicate notification when one already exists for this domain event', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [eventFixture()],
    existingNotification: { id: 'notification-existing' },
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1, 'still counts as processed — the event itself completed successfully');
  assert.equal(calls.creates.length, 0, 'must not call NotificationService.create again');
});

test('an unknown event type marks that event FAILED without throwing out of the batch', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [eventFixture({ id: 'event-1', type: 'SOMETHING_UNKNOWN' })],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 0);
  const terminal = calls.updates.find((u) => u.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'FAILED');
  assert.match(terminal.args.data.lastError, /Unhandled DomainEvent type/);
});

test('one event failing does not abort processing for the rest of the batch', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({ id: 'event-1', payload: { claimId: 'claim-1' } }),
      eventFixture({ id: 'event-2', payload: { claimId: 'claim-2' } }),
    ],
    notificationCreateShouldFailFor: new Set(['claim-1']),
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1, 'only the successful one counts');
  const terminals = calls.updates.filter((u) => u.kind === 'terminal');
  assert.equal(terminals.length, 2, 'both events must reach a terminal update');
  assert.ok(terminals.some((t) => t.args.data.status === 'FAILED'));
  assert.ok(terminals.some((t) => t.args.data.status === 'PROCESSED'));
});

test('a FAILED event still within its backoff window is skipped, not retried', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({ status: 'FAILED', attempts: 1, updatedAt: new Date() }), // 1-minute backoff, just failed — not eligible yet
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 0);
  assert.equal(calls.updates.filter((u) => u.kind === 'claim').length, 0, 'must not even attempt to claim it yet');
});

test('a FAILED event past its backoff window is retried', async () => {
  const { deps } = fakeDeps({
    pendingEvents: [
      eventFixture({ status: 'FAILED', attempts: 1, updatedAt: new Date(Date.now() - 5 * 60 * 1000) }), // 5 min ago, 1-min backoff elapsed
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 1);
});

test('moves a repeatedly failing event to DEAD_LETTER after the final attempt', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [
      eventFixture({
        type: 'SOMETHING_UNKNOWN',
        attempts: MAX_DOMAIN_EVENT_ATTEMPTS - 1,
      }),
    ],
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.deadLettered, 1);
  const terminal = calls.updates.find((update) => update.kind === 'terminal');
  assert.equal(terminal.args.data.status, 'DEAD_LETTER');
});

test('a lost claim race (another replica already locked it) is skipped without double-processing', async () => {
  const { deps, calls } = fakeDeps({
    pendingEvents: [eventFixture()],
    lockShouldFail: true,
  });

  const result = await processDomainEventsJob(undefined, deps);

  assert.equal(result.processed, 0);
  assert.equal(calls.creates.length, 0);
});

test('returns { processed: 0 } immediately when there are no pending events', async () => {
  const { deps, calls } = fakeDeps({ pendingEvents: [] });

  const result = await processDomainEventsJob(undefined, deps);

  assert.deepEqual(result, { processed: 0 });
  assert.equal(calls.updates.length, 0);
});

// Code review finding (2026-09-13): the exact scenario reported -- a
// handler (ASK_EXTRACTION_REQUESTED's, whose own transaction already
// committed candidates AND marked the event PROCESSED atomically) succeeds,
// but this file's own REDUNDANT completion write then fails for an
// unrelated reason. Before this fix, the resulting throw fell into the
// catch block, which unconditionally flipped the row to FAILED/DEAD_LETTER
// -- discarding an already-successful, already-durable result and letting
// the poller reprocess it. terminalWriteShouldNoOp simulates the row's
// real DB state already being PROCESSED (not PROCESSING) by the time the
// catch block's own guarded write runs, exactly as a real guarded
// updateMany would report.
test('a handler that already self-completed (its own atomic write already committed) is never flipped back to FAILED when this file\'s own redundant completion write subsequently fails', async () => {
  const extractionEvent = eventFixture({
    type: 'ASK_EXTRACTION_REQUESTED',
    payload: { executionId: 'execution-1', message: 'I replaced the roof last summer for $14,500.' },
  });
  const { deps, calls } = fakeDeps({
    pendingEvents: [extractionEvent],
    askExtractionRequestedResult: { candidateCount: 1 },
    successCompletionShouldThrow: true,
    terminalWriteShouldNoOp: true,
  });

  const result = await processDomainEventsJob(undefined, deps);

  // Neither counter should reflect a failure -- the handler's own work
  // genuinely succeeded; this file's own bookkeeping write simply couldn't
  // re-confirm it, and the guard correctly recognized that and skipped.
  assert.equal(result.failed, 0);
  assert.equal(result.deadLettered, 0);
  assert.equal(result.processed, 0, 'processed is not incremented when the completion write itself throws (distinct from the no-throw no-op case)');
  const terminalWrites = calls.updates.filter((u) => u.kind === 'terminal');
  assert.equal(terminalWrites.length, 2, 'expected one attempted PROCESSED write and one attempted FAILED/DEAD_LETTER write, both guarded');
  assert.equal(terminalWrites[0].args.data.status, 'PROCESSED');
  assert.ok(['FAILED', 'DEAD_LETTER'].includes(terminalWrites[1].args.data.status));
});

test('the success completion write is guarded on status still being PROCESSING (updateMany, not a bare update)', () => {
  const source = readFileSyncForJobSource();
  const idx = source.indexOf("status: 'PROCESSED' as DomainEventStatus,");
  assert.ok(idx > 0);
  const before = source.slice(Math.max(0, idx - 400), idx);
  assert.match(before, /prisma\.domainEvent\.updateMany\(\{\s*where: \{ id: ev\.id, status: 'PROCESSING' as DomainEventStatus \}/);
});

test('the failure completion write is guarded on status still being PROCESSING AND attempts still matching this iteration\'s own claim', () => {
  const source = readFileSyncForJobSource();
  const idx = source.indexOf('const failureWrite = await prisma.domainEvent.updateMany(');
  assert.ok(idx > 0);
  const block = source.slice(idx, source.indexOf(');', idx));
  assert.match(block, /where: \{ id: ev\.id, status: 'PROCESSING' as DomainEventStatus, attempts: nextAttempts \}/);
  const afterIdx = source.indexOf('if (failureWrite.count === 1) {', idx);
  assert.ok(afterIdx > idx, 'failed/deadLettered counters must only increment when the guarded write actually applied');
});

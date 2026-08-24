import type {
  Prisma,
  IntelligenceRecomputeRunStatus,
  IntelligenceRecomputeTargetStatus,
  IntelligenceRecomputeTriggerType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { DomainEventsService, type DomainEventDb } from '../domainEvents/domainEvents.service';
import { INTELLIGENCE_CONSUMER_REGISTRY } from '../intelligence/intelligenceConsumerRegistry';
import type {
  IntelligenceConsumerDefinition,
  IntelligenceRecomputeTargetHandle,
} from '../intelligence/intelligenceConsumerRegistry.contract';

// Home Intelligence Functional Completeness FRD §8.2/§9.3/§9.4/§10.5/§11 —
// Full request -> resolve -> materialize -> process -> retry -> currentness
// pipeline for the dependency registry in intelligenceConsumerRegistry.ts.

export type RecomputeDb = typeof prisma | Prisma.TransactionClient;

// A crash between marking a run PROCESSING and it reaching a terminal
// status previously left it stuck forever — see
// processRecomputeRequestedEvent's claim logic. 30 minutes is a
// crash-recovery floor, not a normal-operation bound: every registered
// consumer's timeoutMs today is well under a minute, so a run legitimately
// still in flight after 30 minutes would already mean something else is
// badly wrong.
const RUN_STALE_PROCESSING_THRESHOLD_MS = 30 * 60_000;

export interface RequestRecomputeInput {
  propertyId: string;
  triggerType: IntelligenceRecomputeTriggerType;
  triggerEntityType: string;
  triggerEntityId: string;
  changedFactKeys: readonly string[];
  changedReferences?: readonly { entityType: string; entityId: string; fieldPath?: string }[];
  requestedContextVersion?: string | null;
}

export interface RecomputeRunTrigger extends RequestRecomputeInput {
  idempotencyKey: string;
}

export type ProcessTargetOutcome = 'SUCCEEDED' | 'FAILED' | 'NOT_CLAIMED';

export const DYNAMIC_TARGET_PAGE_SIZE = 100;
export const MAX_DYNAMIC_TARGET_PAGES = 100;

/** Injectable seam over DomainEventsService.emit so the orchestration functions below are unit-testable without a live DB. */
export type EmitDomainEvent = typeof DomainEventsService.emit;

interface MaterializedTarget {
  id: string;
  recomputeRunId: string;
  consumerKey: string;
  consumerVersion: string;
  targetKey: string;
  targetType: string | null;
  targetId: string | null;
  targetVersion: string | null;
  status: IntelligenceRecomputeTargetStatus;
  attempts: number;
}

/**
 * HI-REC-005: "equivalent trigger, entity revision, property... combinations
 * shall converge through an idempotency key." Target-level convergence is
 * separately guaranteed by the (recomputeRunId, consumerKey, targetKey)
 * unique constraint in materializeTargets.
 */
export function computeRecomputeIdempotencyKey(
  input: Pick<RequestRecomputeInput, 'triggerType' | 'triggerEntityType' | 'triggerEntityId' | 'propertyId' | 'requestedContextVersion'>,
): string {
  return `recompute:${input.triggerType}:${input.triggerEntityType}:${input.triggerEntityId}:${input.propertyId}:${input.requestedContextVersion ?? 'v0'}`;
}

/**
 * §10.5 "requesting recomputation." Enqueues via the existing Domain Event
 * outbox; the worker creates the durable run (§11 item 3). db defaults to
 * the global client (fire-and-forget, best-effort) but accepts a
 * transaction client — pass the caller's own tx to make this write atomic
 * with whatever canonical change triggered it, rather than a best-effort
 * write that could be silently lost if it fails after that change already
 * committed. See DomainEventsService.emit's doc.
 */
export async function requestRecompute(input: RequestRecomputeInput, emit: EmitDomainEvent = DomainEventsService.emit, db?: DomainEventDb) {
  const idempotencyKey = computeRecomputeIdempotencyKey(input);
  return emit({
    type: 'PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED',
    propertyId: input.propertyId,
    idempotencyKey,
    payload: {
      propertyId: input.propertyId,
      triggerType: input.triggerType,
      triggerEntityType: input.triggerEntityType,
      triggerEntityId: input.triggerEntityId,
      changedFactKeys: [...input.changedFactKeys],
      changedReferences: [...(input.changedReferences ?? [])],
      requestedContextVersion: input.requestedContextVersion ?? null,
      idempotencyKey,
    },
  }, db);
}

/** §10.5 "resolving applicable consumers." HI-REC-003: manual refresh may execute every applicable consumer. */
export function resolveApplicableConsumers(
  registry: readonly IntelligenceConsumerDefinition[],
  input: { triggerType: IntelligenceRecomputeTriggerType; changedFactKeys: readonly string[]; sourceEntityTypes?: readonly string[] },
): IntelligenceConsumerDefinition[] {
  if (input.triggerType === 'MANUAL_REFRESH') return [...registry];
  const factKeys = new Set(input.changedFactKeys);
  const sourceTypes = new Set(input.sourceEntityTypes ?? []);
  return registry.filter(
    (entry) =>
      entry.relevantFactKeys.some((k) => factKeys.has(k)) ||
      entry.relevantSourceEntityTypes.some((t) => sourceTypes.has(t)),
  );
}

/** §11 item 3: "the worker shall create/claim the recompute run." Idempotent on IntelligenceRecomputeRun.idempotencyKey. */
export async function createOrClaimRecomputeRun(db: RecomputeDb, trigger: RecomputeRunTrigger) {
  const existing = await db.intelligenceRecomputeRun.findUnique({ where: { idempotencyKey: trigger.idempotencyKey } });
  if (existing) return existing;
  try {
    return await db.intelligenceRecomputeRun.create({
      data: {
        propertyId: trigger.propertyId,
        triggerType: trigger.triggerType,
        triggerEntityType: trigger.triggerEntityType,
        triggerEntityId: trigger.triggerEntityId,
        changedFactKeys: [...trigger.changedFactKeys],
        changedReferences: [...(trigger.changedReferences ?? [])] as Prisma.InputJsonValue,
        idempotencyKey: trigger.idempotencyKey,
        requestedContextVersion: trigger.requestedContextVersion ?? null,
        status: 'PENDING',
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const refetched = await db.intelligenceRecomputeRun.findUnique({ where: { idempotencyKey: trigger.idempotencyKey } });
      if (refetched) return refetched;
    }
    throw err;
  }
}

/**
 * §11 item 3: "materialize its static or dynamic target rows." STATIC
 * consumers always resolve to the fixed "PROPERTY" target; DYNAMIC consumers
 * call their own resolveTargets resolver. Upsert makes re-materialization
 * (e.g. a redelivered REQUESTED event) idempotent without resetting an
 * already-processed target's status.
 */
export async function materializeTargets(
  db: RecomputeDb,
  run: { id: string; propertyId: string; changedFactKeys: readonly string[]; changedReferences?: readonly { entityType: string; entityId: string; fieldPath?: string }[]; triggerType: IntelligenceRecomputeTriggerType; triggerEntityType: string; triggerEntityId: string },
  consumers: readonly IntelligenceConsumerDefinition[],
): Promise<MaterializedTarget[]> {
  const result: MaterializedTarget[] = [];
  for (const consumer of consumers) {
    let handles: IntelligenceRecomputeTargetHandle[];
    if (consumer.resolutionMode === 'STATIC') {
      handles = [{ targetKey: 'PROPERTY', targetType: null, targetId: null, targetVersion: null }];
    } else {
      const uniqueHandles = new Map<string, IntelligenceRecomputeTargetHandle>();
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      let completed = false;
      for (let pageNumber = 0; pageNumber < MAX_DYNAMIC_TARGET_PAGES; pageNumber += 1) {
        const page = await consumer.resolveTargets!({
          propertyId: run.propertyId,
          changedFactKeys: run.changedFactKeys,
          changedReferences: run.changedReferences ?? [],
          triggerType: run.triggerType,
          triggerEntityType: run.triggerEntityType,
          triggerEntityId: run.triggerEntityId,
          cursor,
          pageSize: DYNAMIC_TARGET_PAGE_SIZE,
        });
        if (page.targets.length > DYNAMIC_TARGET_PAGE_SIZE) {
          throw new Error(`Dynamic consumer "${consumer.consumerKey}" returned ${page.targets.length} targets, exceeding pageSize ${DYNAMIC_TARGET_PAGE_SIZE}.`);
        }
        for (const handle of page.targets) uniqueHandles.set(handle.targetKey, handle);
        if (page.nextCursor === null) {
          completed = true;
          break;
        }
        if (page.nextCursor === cursor || seenCursors.has(page.nextCursor)) {
          throw new Error(`Dynamic consumer "${consumer.consumerKey}" returned a repeated pagination cursor "${page.nextCursor}".`);
        }
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      if (!completed) {
        throw new Error(`Dynamic consumer "${consumer.consumerKey}" exceeded ${MAX_DYNAMIC_TARGET_PAGES} target pages.`);
      }
      handles = [...uniqueHandles.values()];
    }
    for (const handle of handles) {
      const target = await db.intelligenceRecomputeTarget.upsert({
        where: {
          recomputeRunId_consumerKey_targetKey: {
            recomputeRunId: run.id,
            consumerKey: consumer.consumerKey,
            targetKey: handle.targetKey,
          },
        },
        create: {
          recomputeRunId: run.id,
          consumerKey: consumer.consumerKey,
          consumerVersion: consumer.version,
          targetKey: handle.targetKey,
          targetType: handle.targetType,
          targetId: handle.targetId,
          targetVersion: handle.targetVersion,
          status: 'PENDING',
        },
        update: {},
      });
      const materialized = target as MaterializedTarget;
      await writeConsumerCurrentness(db, {
        propertyId: run.propertyId,
        consumer,
        target: materialized,
        status: 'REFRESHING',
        reason: 'DEPENDENCY_CHANGED',
      });
      result.push(materialized);
    }
  }
  return result;
}

function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  consumerKey: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        controller.abort(new Error(`Consumer "${consumerKey}" recompute timed out after ${timeoutMs}ms`));
        reject(controller.signal.reason);
      },
      timeoutMs,
    );
    run(controller.signal).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function writeConsumerCurrentness(
  db: RecomputeDb,
  input: {
    propertyId: string;
    consumer: IntelligenceConsumerDefinition;
    target: Pick<MaterializedTarget, 'id' | 'recomputeRunId' | 'targetKey'>;
    status: 'CURRENT' | 'REFRESHING' | 'STALE' | 'UNAVAILABLE';
    reason: string;
    lastError?: string | null;
  },
): Promise<void> {
  // Older unit fakes deliberately model only the run/target delegates. The
  // production Prisma client always has this delegate after schema generation.
  const repository = (db as any).intelligenceConsumerCurrentness;
  if (!repository?.upsert) return;
  const now = new Date();
  await repository.upsert({
    where: {
      propertyId_consumerKey_targetKey: {
        propertyId: input.propertyId,
        consumerKey: input.consumer.consumerKey,
        targetKey: input.target.targetKey,
      },
    },
    create: {
      propertyId: input.propertyId,
      consumerKey: input.consumer.consumerKey,
      consumerVersion: input.consumer.version,
      targetKey: input.target.targetKey,
      status: input.status,
      reason: input.reason,
      recomputeRunId: input.target.recomputeRunId,
      recomputeTargetId: input.target.id,
      lastError: input.lastError ?? null,
      lastAttemptedAt: now,
      ...(input.status === 'CURRENT' ? { lastSucceededAt: now } : {}),
    },
    update: {
      consumerVersion: input.consumer.version,
      status: input.status,
      reason: input.reason,
      recomputeRunId: input.target.recomputeRunId,
      recomputeTargetId: input.target.id,
      lastError: input.lastError ?? null,
      lastAttemptedAt: now,
      ...(input.status === 'CURRENT' ? { lastSucceededAt: now } : {}),
    },
  });
}

async function persistTargetOutcome(
  db: RecomputeDb,
  input: {
    propertyId: string;
    consumer: IntelligenceConsumerDefinition;
    target: MaterializedTarget;
    targetData: Record<string, unknown>;
    currentnessStatus: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
    reason: string;
    lastError?: string | null;
  },
): Promise<void> {
  const persist = async (writer: RecomputeDb) => {
    await writer.intelligenceRecomputeTarget.update({
      where: { id: input.target.id },
      data: input.targetData,
    });
    await writeConsumerCurrentness(writer, {
      propertyId: input.propertyId,
      consumer: input.consumer,
      target: input.target,
      status: input.currentnessStatus,
      reason: input.reason,
      lastError: input.lastError,
    });
  };
  const transaction = (db as any).$transaction;
  if (typeof transaction === 'function') {
    await transaction.call(db, (tx: Prisma.TransactionClient) => persist(tx));
  } else {
    await persist(db);
  }
}

/**
 * A crashed process (not a thrown error or a withTimeout rejection — those
 * both already transition the target to FAILED, see below — but the node
 * process itself dying mid-recompute) leaves a target claimed PROCESSING
 * forever, since the claim's own where clause only ever matched
 * PENDING/FAILED. No process would ever reclaim it: withTimeout only bounds
 * an in-process await, not a dead process. Reclaimable window is a multiple
 * of the consumer's own timeoutMs — a live claimant's withTimeout will have
 * already failed the target long before this elapses (today's largest
 * timeoutMs across the registry is under a minute; this threshold is minutes), so by
 * the time this condition can match, either the original claimant crashed,
 * or crashed after already timing out and failing to write the FAILED
 * update — no live process is still legitimately working the target.
 */
function staleProcessingReclaimThresholdMs(consumer: IntelligenceConsumerDefinition): number {
  return Math.max(consumer.timeoutMs * 4, 5 * 60_000);
}

/**
 * §11 item 3/4: execute one target, independent of every other target's
 * outcome ("consumer failures shall not roll back successful consumers").
 * Claim is the same PENDING/FAILED -> PROCESSING conditional-updateMany lock
 * pattern already used by processDomainEventsJob, extended to also reclaim
 * a stale PROCESSING target (see staleProcessingReclaimThresholdMs above).
 */
export async function processTarget(
  db: RecomputeDb,
  propertyId: string,
  target: MaterializedTarget,
  consumer: IntelligenceConsumerDefinition,
): Promise<ProcessTargetOutcome> {
  const staleBefore = new Date(Date.now() - staleProcessingReclaimThresholdMs(consumer));
  const locked = await db.intelligenceRecomputeTarget.updateMany({
    where: {
      id: target.id,
      OR: [
        { status: { in: ['PENDING', 'FAILED'] } },
        { status: 'PROCESSING', startedAt: { lt: staleBefore } },
      ],
    },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, startedAt: new Date() },
  });
  if (locked.count !== 1) return 'NOT_CLAIMED';

  const handle: IntelligenceRecomputeTargetHandle = {
    targetKey: target.targetKey,
    targetType: target.targetType,
    targetId: target.targetId,
    targetVersion: target.targetVersion,
  };

  await writeConsumerCurrentness(db, {
    propertyId,
    consumer,
    target,
    status: 'REFRESHING',
    reason: 'RECOMPUTE_PROCESSING',
  });

  try {
    await withTimeout(
      (signal) => consumer.recompute({ propertyId, target: handle, signal }),
      consumer.timeoutMs,
      consumer.consumerKey,
    );
    await persistTargetOutcome(db, {
      propertyId,
      consumer,
      target,
      targetData: { status: 'SUCCEEDED', completedAt: new Date(), lastError: null },
      currentnessStatus: consumer.successCurrentnessStatus ?? 'CURRENT',
      reason: consumer.successCurrentnessStatus && consumer.successCurrentnessStatus !== 'CURRENT'
        ? 'OUTPUT_INVALIDATED'
        : 'RECOMPUTE_SUCCEEDED',
    });
    return 'SUCCEEDED';
  } catch (err: any) {
    const message = err?.message ? String(err.message) : 'Unknown recompute error';
    await persistTargetOutcome(db, {
      propertyId,
      consumer,
      target,
      targetData: { status: 'FAILED', lastError: message.slice(0, 2000) },
      currentnessStatus: consumer.failureBehavior === 'MARK_UNAVAILABLE' ? 'UNAVAILABLE' : 'STALE',
      reason: 'RECOMPUTE_FAILED',
      lastError: message.slice(0, 2000),
    });
    return 'FAILED';
  }
}

/** §11 item 5: "enqueue a retry request using the existing worker execution policy and lease conventions" — reuses processDomainEventsJob's own FAILED-status backoff schedule; the idempotency key is per-attempt so each successive failure gets a fresh, distinct retry request. */
export async function requestTargetRetry(
  input: { recomputeRunId: string; targetId: string; attempts: number; backoffMs?: number; requestId?: string },
  emit: EmitDomainEvent = DomainEventsService.emit,
) {
  return emit({
    type: 'PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED',
    idempotencyKey: `recompute-retry:${input.targetId}:${input.attempts}:${input.requestId ?? 'automatic'}`,
    availableAt: new Date(Date.now() + Math.max(0, input.backoffMs ?? 0)),
    payload: { recomputeRunId: input.recomputeRunId, targetId: input.targetId },
  });
}

async function attemptTarget(
  db: RecomputeDb,
  propertyId: string,
  target: MaterializedTarget,
  registry: readonly IntelligenceConsumerDefinition[],
  emit: EmitDomainEvent,
): Promise<ProcessTargetOutcome> {
  const consumer = registry.find((c) => c.consumerKey === target.consumerKey);
  if (!consumer) {
    // The registry no longer declares this consumer (e.g. removed/renamed
    // since the target was materialized) — fail terminally rather than
    // retry into a handler that no longer exists.
    const locked = await db.intelligenceRecomputeTarget.updateMany({
      where: { id: target.id, status: { in: ['PENDING', 'FAILED'] } },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        lastError: `No registered intelligenceConsumerRegistry entry for key "${target.consumerKey}".`,
      },
    });
    return locked.count === 1 ? 'FAILED' : 'NOT_CLAIMED';
  }

  const outcome = await processTarget(db, propertyId, target, consumer);
  if (outcome === 'FAILED') {
    const newAttempts = target.attempts + 1;
    if (newAttempts < consumer.retryPolicy.maxAttempts) {
      await requestTargetRetry({
        recomputeRunId: target.recomputeRunId,
        targetId: target.id,
        attempts: newAttempts,
        // An aborted handler is cooperative: give it several timeout windows
        // to observe the signal and unwind before another attempt starts.
        backoffMs: Math.max(consumer.retryPolicy.backoffMs, consumer.timeoutMs * 4),
      }, emit);
    } else if (consumer.onPermanentFailure) {
      // HI-REC-006: retry budget exhausted — this is a permanent failure,
      // not just an in-flight one, so the consumer's declared failureBehavior
      // must actually run now. Best-effort: never let a failure here mask
      // the real outcome (the target is already correctly FAILED regardless).
      try {
        await consumer.onPermanentFailure({
          propertyId,
          target: { targetKey: target.targetKey, targetType: target.targetType, targetId: target.targetId, targetVersion: target.targetVersion },
          failureBehavior: consumer.failureBehavior,
        });
      } catch (err) {
        logger.error({ err, consumerKey: consumer.consumerKey, targetId: target.id }, '[intelligenceRecompute] onPermanentFailure handler itself failed');
      }
    }
  }
  return outcome;
}

/**
 * HI-REC-004 run-state rollup. A FAILED target whose retry budget is not yet
 * exhausted still counts as in-flight (PROCESSING), not a terminal failure —
 * PARTIAL/FAILED only apply once every target has either succeeded/been
 * skipped or exhausted its retryPolicy.maxAttempts.
 */
export function deriveRunStatus(
  targets: readonly { status: IntelligenceRecomputeTargetStatus; consumerKey: string; attempts: number }[],
  registry: readonly IntelligenceConsumerDefinition[],
): IntelligenceRecomputeRunStatus {
  if (targets.length === 0) return 'SUCCEEDED';

  const byKey = new Map(registry.map((c) => [c.consumerKey, c] as const));
  let anyInFlight = false;
  let anySucceeded = false;
  let anyTerminalFailed = false;

  for (const t of targets) {
    if (t.status === 'PENDING' || t.status === 'PROCESSING') {
      anyInFlight = true;
      continue;
    }
    if (t.status === 'SUCCEEDED' || t.status === 'SKIPPED') {
      anySucceeded = true;
      continue;
    }
    // FAILED
    const maxAttempts = byKey.get(t.consumerKey)?.retryPolicy.maxAttempts ?? t.attempts;
    if (t.attempts < maxAttempts) anyInFlight = true;
    else anyTerminalFailed = true;
  }

  if (anyInFlight) return 'PROCESSING';
  if (anyTerminalFailed && anySucceeded) return 'PARTIAL';
  if (anyTerminalFailed) return 'FAILED';
  return 'SUCCEEDED';
}

export async function updateRunStatusFromTargets(
  db: RecomputeDb,
  runId: string,
  registry: readonly IntelligenceConsumerDefinition[],
) {
  const targets = await db.intelligenceRecomputeTarget.findMany({ where: { recomputeRunId: runId } });
  const status = deriveRunStatus(targets, registry);
  const isTerminal = status === 'SUCCEEDED' || status === 'PARTIAL' || status === 'FAILED';
  return db.intelligenceRecomputeRun.update({
    where: { id: runId },
    data: { status, ...(isTerminal ? { completedAt: new Date() } : {}) },
  });
}

/** Handles a PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED DomainEvent. */
export async function processRecomputeRequestedEvent(
  db: RecomputeDb,
  trigger: RecomputeRunTrigger,
  registry: readonly IntelligenceConsumerDefinition[] = INTELLIGENCE_CONSUMER_REGISTRY,
  emit: EmitDomainEvent = DomainEventsService.emit,
) {
  const run = await createOrClaimRecomputeRun(db, trigger);
  const staleBefore = new Date(Date.now() - RUN_STALE_PROCESSING_THRESHOLD_MS);
  const isStaleProcessing = run.status === 'PROCESSING' && run.startedAt !== null && run.startedAt < staleBefore;
  if (run.status !== 'PENDING' && !isStaleProcessing) {
    // Already materialized/processed by an earlier delivery of this
    // idempotent event (or currently in flight, and not yet stale) — do not
    // reprocess.
    return run;
  }

  // A crashed process between this update and the run reaching a terminal
  // status previously left it stuck PROCESSING forever — a retry delivery
  // would see status !== 'PENDING' above and bail immediately, and nothing
  // else would ever reclaim it (see staleProcessingReclaimThresholdMs's
  // target-level doc for the same failure mode). The OR here makes both the
  // fresh-PENDING and stale-PROCESSING claims atomic and racesafe: if two
  // deliveries reach this concurrently, only one updateMany matches.
  const claimed = await db.intelligenceRecomputeRun.updateMany({
    where: {
      id: run.id,
      OR: [
        { status: 'PENDING' },
        { status: 'PROCESSING', startedAt: { lt: staleBefore } },
      ],
    },
    data: { status: 'PROCESSING', startedAt: new Date() },
  });
  if (claimed.count !== 1) {
    // Another delivery already claimed/reclaimed it between the read above
    // and this update — let that one own processing.
    return (await db.intelligenceRecomputeRun.findUniqueOrThrow({ where: { id: run.id } }));
  }

  const consumers = resolveApplicableConsumers(registry, {
    triggerType: trigger.triggerType,
    changedFactKeys: trigger.changedFactKeys,
    // Previously omitted, which made every registry entry's
    // relevantSourceEntityTypes dead code — no consumer could ever match on
    // it since this was never populated. Fixed alongside the first real
    // consumers that rely on entity-type matching rather than enumerating
    // every possible changed field as a factKey.
    sourceEntityTypes: [trigger.triggerEntityType],
  });
  const targets = await materializeTargets(
    db,
    {
      id: run.id,
      propertyId: run.propertyId,
      changedFactKeys: trigger.changedFactKeys,
      changedReferences: trigger.changedReferences ?? [],
      triggerType: trigger.triggerType,
      triggerEntityType: trigger.triggerEntityType,
      triggerEntityId: trigger.triggerEntityId,
    },
    consumers,
  );

  for (const target of targets) {
    await attemptTarget(db, run.propertyId, target, registry, emit);
  }

  return updateRunStatusFromTargets(db, run.id, registry);
}

/** Handles a PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED DomainEvent. */
export async function processRecomputeRetryRequestedEvent(
  db: RecomputeDb,
  input: { recomputeRunId: string; targetId: string },
  registry: readonly IntelligenceConsumerDefinition[] = INTELLIGENCE_CONSUMER_REGISTRY,
  emit: EmitDomainEvent = DomainEventsService.emit,
) {
  const target = await db.intelligenceRecomputeTarget.findUnique({ where: { id: input.targetId } });
  if (!target || target.recomputeRunId !== input.recomputeRunId) {
    throw new Error(`Recompute retry event references an unknown target ${input.targetId} for run ${input.recomputeRunId}`);
  }
  const run = await db.intelligenceRecomputeRun.findUnique({ where: { id: input.recomputeRunId } });
  if (!run) {
    throw new Error(`Recompute retry event references an unknown run ${input.recomputeRunId}`);
  }

  await attemptTarget(db, run.propertyId, target as MaterializedTarget, registry, emit);
  return updateRunStatusFromTargets(db, input.recomputeRunId, registry);
}

export type PropertyRefreshState = 'CURRENT' | 'REFRESHING' | 'PARTIALLY_REFRESHED' | 'DEGRADED' | 'UNKNOWN';

const RUN_STATUS_TO_REFRESH_STATE: Record<IntelligenceRecomputeRunStatus, PropertyRefreshState> = {
  PENDING: 'REFRESHING',
  PROCESSING: 'REFRESHING',
  SUCCEEDED: 'CURRENT',
  PARTIAL: 'PARTIALLY_REFRESHED',
  FAILED: 'DEGRADED',
};

// Backward-compatible fallback for deployments/tests that have not generated
// the materialized IntelligenceConsumerCurrentness rows yet.
const REFRESH_STATE_RUN_LOOKBACK = 50;

/**
 * §10.5 "reading current property refresh state." HI-REC-007 needs Home/Cozy
 * to distinguish refreshing/partially refreshed/current.
 *
 * Trusting only the single latest RUN's own rolled-up status is wrong: a
 * later run triggered by an unrelated fact change may resolve a different
 * subset of consumers (or zero targets) and itself succeed, while an
 * earlier run's target for a DIFFERENT consumer is still permanently
 * FAILED — that consumer's output stays stale, but the latest run alone
 * would report CURRENT and mask it entirely. This instead looks at every
 * target across the last REFRESH_STATE_RUN_LOOKBACK runs, keeps only the
 * most recent target per (consumerKey, targetKey) — the latest known
 * status for that specific consumer/target combination, which for a
 * DYNAMIC consumer can have several concurrently-live targets (e.g. one per
 * Decision Thread) — and reuses deriveRunStatus's already-correct
 * in-flight/retry-budget/partial-failure rules against that aggregated set,
 * rather than reimplementing them.
 *
 * Known limitation: "most recent" is ordered by requestedAt/createdAt at
 * millisecond resolution, with no monotonic sequence column — two runs (or
 * two targets) genuinely tied at the same millisecond have no reliable
 * tiebreak. Not addressed here; a real edge case, but distinct runs in
 * practice are triggered by distinct real-world domain events processed by
 * a worker, not synchronous back-to-back writes.
 */
export async function getPropertyRefreshState(
  db: RecomputeDb,
  propertyId: string,
  registry: readonly IntelligenceConsumerDefinition[] = INTELLIGENCE_CONSUMER_REGISTRY,
): Promise<PropertyRefreshState> {
  const currentnessRepository = (db as any).intelligenceConsumerCurrentness;
  if (currentnessRepository?.findMany) {
    const currentness = await currentnessRepository.findMany({
      where: { propertyId },
      select: { status: true },
    }) as Array<{ status: 'CURRENT' | 'REFRESHING' | 'STALE' | 'UNAVAILABLE' }>;
    if (currentness.length > 0) {
      const statuses = new Set(currentness.map((row) => row.status));
      if (statuses.has('REFRESHING')) return 'REFRESHING';
      const hasProblem = statuses.has('STALE') || statuses.has('UNAVAILABLE');
      if (!hasProblem) return 'CURRENT';
      return statuses.has('CURRENT') ? 'PARTIALLY_REFRESHED' : 'DEGRADED';
    }
  }

  const runs = await db.intelligenceRecomputeRun.findMany({
    where: { propertyId },
    orderBy: { requestedAt: 'desc' },
    take: REFRESH_STATE_RUN_LOOKBACK,
    include: { targets: true },
  });
  if (runs.length === 0) return 'UNKNOWN';

  const latestByTarget = new Map<string, { status: IntelligenceRecomputeTargetStatus; consumerKey: string; attempts: number; createdAt: Date }>();
  for (const run of runs) {
    for (const target of run.targets as Array<{ id: string; consumerKey: string; targetKey: string; status: IntelligenceRecomputeTargetStatus; attempts: number; createdAt: Date }>) {
      const key = `${target.consumerKey}:${target.targetKey}`;
      const existing = latestByTarget.get(key);
      if (!existing || target.createdAt > existing.createdAt) {
        latestByTarget.set(key, target);
      }
    }
  }

  return RUN_STATUS_TO_REFRESH_STATE[deriveRunStatus([...latestByTarget.values()], registry)];
}

export interface PropertyRefreshCapabilityState {
  consumerKey: string;
  targetKey: string;
  status: 'CURRENT' | 'REFRESHING' | 'STALE' | 'UNAVAILABLE';
  reason: string | null;
  lastError: string | null;
  updatedAt: Date;
}

export async function getPropertyRefreshDetails(
  db: RecomputeDb,
  propertyId: string,
  registry: readonly IntelligenceConsumerDefinition[] = INTELLIGENCE_CONSUMER_REGISTRY,
): Promise<{ state: PropertyRefreshState; capabilities: PropertyRefreshCapabilityState[] }> {
  const state = await getPropertyRefreshState(db, propertyId, registry);
  const repository = (db as any).intelligenceConsumerCurrentness;
  if (!repository?.findMany) return { state, capabilities: [] };
  const capabilities = await repository.findMany({
    where: { propertyId },
    orderBy: [{ consumerKey: 'asc' }, { targetKey: 'asc' }],
    select: {
      consumerKey: true,
      targetKey: true,
      status: true,
      reason: true,
      lastError: true,
      updatedAt: true,
    },
  });
  return { state, capabilities };
}

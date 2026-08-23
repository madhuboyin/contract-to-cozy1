import type {
  Prisma,
  IntelligenceRecomputeRunStatus,
  IntelligenceRecomputeTargetStatus,
  IntelligenceRecomputeTriggerType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { DomainEventsService } from '../domainEvents/domainEvents.service';
import { INTELLIGENCE_CONSUMER_REGISTRY } from '../intelligence/intelligenceConsumerRegistry';
import type {
  IntelligenceConsumerDefinition,
  IntelligenceRecomputeTargetHandle,
} from '../intelligence/intelligenceConsumerRegistry.contract';

// Home Intelligence Functional Completeness FRD §8.2/§9.3/§9.4/§10.5/§11 —
// orchestration plumbing for dependency-aware recomputation. This slice
// wires the full request -> resolve -> materialize -> process -> retry ->
// read-state pipeline against the already-empty intelligenceConsumerRegistry
// (see intelligenceConsumerRegistry.ts). No real consumer is registered yet,
// so this produces no user-visible refresh behavior on its own; Phase 2's
// later slices register real consumers against this same pipeline.

export type RecomputeDb = typeof prisma | Prisma.TransactionClient;

export interface RequestRecomputeInput {
  propertyId: string;
  triggerType: IntelligenceRecomputeTriggerType;
  triggerEntityType: string;
  triggerEntityId: string;
  changedFactKeys: readonly string[];
  requestedContextVersion?: string | null;
}

export interface RecomputeRunTrigger extends RequestRecomputeInput {
  idempotencyKey: string;
}

export type ProcessTargetOutcome = 'SUCCEEDED' | 'FAILED' | 'NOT_CLAIMED';

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

/** §10.5 "requesting recomputation." Enqueues via the existing Domain Event outbox; the worker creates the durable run (§11 item 3). */
export async function requestRecompute(input: RequestRecomputeInput, emit: EmitDomainEvent = DomainEventsService.emit) {
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
      requestedContextVersion: input.requestedContextVersion ?? null,
      idempotencyKey,
    },
  });
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
  run: { id: string; propertyId: string; changedFactKeys: readonly string[] },
  consumers: readonly IntelligenceConsumerDefinition[],
): Promise<MaterializedTarget[]> {
  const result: MaterializedTarget[] = [];
  for (const consumer of consumers) {
    const handles: IntelligenceRecomputeTargetHandle[] =
      consumer.resolutionMode === 'STATIC'
        ? [{ targetKey: 'PROPERTY', targetType: null, targetId: null, targetVersion: null }]
        : await consumer.resolveTargets!({ propertyId: run.propertyId, changedFactKeys: run.changedFactKeys });
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
      result.push(target as MaterializedTarget);
    }
  }
  return result;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, consumerKey: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Consumer "${consumerKey}" recompute timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * §11 item 3/4: execute one target, independent of every other target's
 * outcome ("consumer failures shall not roll back successful consumers").
 * Claim is the same PENDING/FAILED -> PROCESSING conditional-updateMany lock
 * pattern already used by processDomainEventsJob.
 */
export async function processTarget(
  db: RecomputeDb,
  propertyId: string,
  target: MaterializedTarget,
  consumer: IntelligenceConsumerDefinition,
): Promise<ProcessTargetOutcome> {
  const locked = await db.intelligenceRecomputeTarget.updateMany({
    where: { id: target.id, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, startedAt: new Date() },
  });
  if (locked.count !== 1) return 'NOT_CLAIMED';

  const handle: IntelligenceRecomputeTargetHandle = {
    targetKey: target.targetKey,
    targetType: target.targetType,
    targetId: target.targetId,
    targetVersion: target.targetVersion,
  };

  try {
    await withTimeout(consumer.recompute({ propertyId, target: handle }), consumer.timeoutMs, consumer.consumerKey);
    await db.intelligenceRecomputeTarget.update({
      where: { id: target.id },
      data: { status: 'SUCCEEDED', completedAt: new Date(), lastError: null },
    });
    return 'SUCCEEDED';
  } catch (err: any) {
    const message = err?.message ? String(err.message) : 'Unknown recompute error';
    await db.intelligenceRecomputeTarget.update({
      where: { id: target.id },
      data: { status: 'FAILED', lastError: message.slice(0, 2000) },
    });
    return 'FAILED';
  }
}

/** §11 item 5: "enqueue a retry request using the existing worker execution policy and lease conventions" — reuses processDomainEventsJob's own FAILED-status backoff schedule; the idempotency key is per-attempt so each successive failure gets a fresh, distinct retry request. */
export async function requestTargetRetry(
  input: { recomputeRunId: string; targetId: string; attempts: number },
  emit: EmitDomainEvent = DomainEventsService.emit,
) {
  return emit({
    type: 'PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED',
    idempotencyKey: `recompute-retry:${input.targetId}:${input.attempts}`,
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
      await requestTargetRetry({ recomputeRunId: target.recomputeRunId, targetId: target.id, attempts: newAttempts }, emit);
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
  if (run.status !== 'PENDING') {
    // Already materialized/processed by an earlier delivery of this
    // idempotent event (or currently in flight) — do not reprocess.
    return run;
  }

  await db.intelligenceRecomputeRun.update({
    where: { id: run.id },
    data: { status: 'PROCESSING', startedAt: new Date() },
  });

  const consumers = resolveApplicableConsumers(registry, {
    triggerType: trigger.triggerType,
    changedFactKeys: trigger.changedFactKeys,
  });
  const targets = await materializeTargets(
    db,
    { id: run.id, propertyId: run.propertyId, changedFactKeys: trigger.changedFactKeys },
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

/**
 * §10.5 "reading current property refresh state." HI-REC-007 needs Home/Cozy
 * to distinguish refreshing/partially refreshed/current; this reads the most
 * recently requested run for the property as the current signal. Nothing
 * consumes this yet in this slice (no real consumer is registered), so it is
 * exercised only by its own unit tests until a later slice wires it into a
 * read surface.
 */
export async function getPropertyRefreshState(db: RecomputeDb, propertyId: string): Promise<PropertyRefreshState> {
  const latest = await db.intelligenceRecomputeRun.findFirst({
    where: { propertyId },
    orderBy: { requestedAt: 'desc' },
  });
  if (!latest) return 'UNKNOWN';
  return RUN_STATUS_TO_REFRESH_STATE[latest.status];
}

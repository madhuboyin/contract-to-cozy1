// DecisionThread service — Ask Intelligence FRD §10. Every lifecycle/context
// write goes through the pure transition contract from Phase 7A
// (decisionThreadTransitions.ts); this file never sets lifecycleStatus or
// contextStatus directly. All mutations are optimistic-concurrency-checked
// (FRD §9: "stale writes shall fail closed rather than overwrite a newer
// preference, thread, scenario, or outcome").
//
// Preference reads/writes go through decisionPreferenceService.ts's
// getActiveHvacPreferences (Phase 8B) — this file no longer echoes raw
// preference params into DecisionThreadAssumption rows (that was a Phase 8A
// stopgap for "no persistence exists yet"; DecisionThreadPreferenceReference
// + RecommendationSnapshot.preferenceReferenceIds are the schema-intended
// lineage mechanism, per docs/product/decision-platform/adr-0003).

import { createHash } from 'crypto';
import { prisma } from '../../lib/prisma';
import {
  computeContextStatus,
  isContextTransitionAllowed,
  isLifecycleTransitionAllowed,
} from './decisionThreadTransitions';
import {
  composeHvacDecisionContext,
  evaluateHvacRepairReplace,
  HvacDecisionContext,
} from './hvacRepairReplaceEngine.service';
import {
  compareRecommendationSnapshots,
  getActiveHvacPreferences,
  RecommendationChangeDiff,
} from './decisionPreferenceService';
import { emitDecisionRecommendationChange } from './decisionPlatformChangeEmitter';
import type { DecisionThreadContextStatus } from '../../productFramework/decisionPlatform/decisionPlatform.contract';

export class DecisionThreadVersionConflictError extends Error {
  constructor(threadId: string) {
    super(`Decision thread ${threadId} changed concurrently. Reload and retry.`);
    this.name = 'DecisionThreadVersionConflictError';
  }
}

export class DecisionThreadNotFoundError extends Error {
  constructor(threadId: string) {
    super(`Decision thread ${threadId} not found or not accessible.`);
    this.name = 'DecisionThreadNotFoundError';
  }
}

// FRD §10.3/§10.4: Ask may continue a thread only when property, decision
// family, and entity resolve uniquely. Recency alone may not select a
// material thread — this is pure so the fail-closed rule is directly
// unit-testable (tests/unit/decisionPlatform/decisionThreadSelection.test.js).
export type ThreadSelection<T> =
  | { kind: 'NONE' }
  | { kind: 'UNIQUE'; thread: T }
  | { kind: 'AMBIGUOUS'; candidates: T[] };

const ACTIVE_LIFECYCLE_STATUSES = [
  'OPEN', 'GATHERING_CONTEXT', 'READY_TO_COMPARE', 'RECOMMENDATION_AVAILABLE',
  'ACTION_IN_PROGRESS', 'DECIDED',
] as const;

export function classifyThreadSelection<T>(candidates: T[]): ThreadSelection<T> {
  if (candidates.length === 0) return { kind: 'NONE' };
  if (candidates.length === 1) return { kind: 'UNIQUE', thread: candidates[0] };
  return { kind: 'AMBIGUOUS', candidates };
}

export async function selectHvacDecisionThread(propertyId: string, inventoryItemId: string) {
  const candidates = await prisma.decisionThread.findMany({
    where: {
      propertyId,
      decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
      primaryEntityType: 'InventoryItem',
      primaryEntityId: inventoryItemId,
      lifecycleStatus: { in: [...ACTIVE_LIFECYCLE_STATUSES] },
    },
    orderBy: { createdAt: 'asc' },
  });
  return classifyThreadSelection(candidates);
}

function inputDigestFor(context: HvacDecisionContext): string {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}

function preferenceIdsFrom(preferences: { ownershipHorizonPreferenceId: string | null; repairReplaceApproachPreferenceId: string | null }): string[] {
  return [preferences.ownershipHorizonPreferenceId, preferences.repairReplaceApproachPreferenceId]
    .filter((id): id is string => id !== null);
}

async function linkPreferenceReferences(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  decisionThreadId: string,
  preferenceValueIds: string[],
): Promise<void> {
  if (!preferenceValueIds.length) return;
  await tx.decisionThreadPreferenceReference.createMany({
    data: preferenceValueIds.map((preferenceValueId) => ({ decisionThreadId, preferenceValueId })),
    skipDuplicates: true,
  });
}

interface CreateThreadInput {
  propertyId: string;
  userId: string;
  inventoryItemId: string;
  askExecutionId: string;
}

export async function createHvacDecisionThread(input: CreateThreadInput) {
  const preferences = await getActiveHvacPreferences(input.propertyId, input.userId);
  const composed = await composeHvacDecisionContext(input.propertyId, input.inventoryItemId, {
    ownershipHorizonMonths: preferences.ownershipHorizonMonths,
    repairReplaceApproach: preferences.repairReplaceApproach,
  });
  if (!composed) throw new Error('The selected item is not a recorded HVAC system on this property.');
  const { context, compositionLimitationCodes } = composed;

  const evaluation = evaluateHvacRepairReplace(context);
  const limitationCodes = Array.from(new Set([...evaluation.limitationCodes, ...compositionLimitationCodes]));
  const preferenceValueIds = preferenceIdsFrom(preferences);

  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.decisionThread.create({
      data: {
        propertyId: input.propertyId,
        createdByUserId: input.userId,
        decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
        primaryEntityType: 'InventoryItem',
        primaryEntityId: input.inventoryItemId,
        title: `Repair or replace: ${context.itemName}`,
        goalCode: 'HVAC_REPAIR_REPLACE_DECISION',
        lifecycleStatus: 'OPEN',
        contextStatus: 'CURRENT',
      },
    });

    if (!isLifecycleTransitionAllowed('OPEN', 'READY_TO_COMPARE')) {
      throw new Error('Illegal lifecycle transition OPEN -> READY_TO_COMPARE');
    }
    await tx.decisionThread.update({ where: { id: thread.id }, data: { lifecycleStatus: 'READY_TO_COMPARE', version: { increment: 1 } } });

    const snapshot = await tx.recommendationSnapshot.create({
      data: {
        decisionThreadId: thread.id,
        propertyId: input.propertyId,
        recommendationOwner: 'DECISION_PLATFORM',
        recommendationDefinitionId: 'HVAC_REPAIR_REPLACE',
        recommendationDefinitionVersion: '1.0',
        operationId: 'HVAC_DECISION_START',
        operationVersion: '1.0',
        engineVersion: evaluation.engineVersion,
        contextContractVersion: evaluation.contextContractVersion,
        canonicalFactReferences: [
          { entityType: 'InventoryItem', entityId: input.inventoryItemId, fieldPath: 'condition' },
          { entityType: 'InventoryItem', entityId: input.inventoryItemId, fieldPath: 'installedOn' },
        ],
        preferenceReferenceIds: preferenceValueIds,
        signalReferences: [],
        evidenceReferences: [],
        resultPayloadVersion: '1.0',
        verdictCode: evaluation.verdict,
        reasonCodes: evaluation.reasonCodes,
        limitationCodes,
        confidenceBreakdown: evaluation.confidenceBreakdown,
        inputDigest: inputDigestFor(context),
      },
    });

    if (!isLifecycleTransitionAllowed('READY_TO_COMPARE', 'RECOMMENDATION_AVAILABLE')) {
      throw new Error('Illegal lifecycle transition READY_TO_COMPARE -> RECOMMENDATION_AVAILABLE');
    }
    const updatedThread = await tx.decisionThread.update({
      where: { id: thread.id },
      data: { lifecycleStatus: 'RECOMMENDATION_AVAILABLE', currentRecommendationSnapshotId: snapshot.id, version: { increment: 1 } },
    });

    await tx.decisionThreadFactReference.createMany({
      data: [
        { decisionThreadId: thread.id, canonicalEntityType: 'InventoryItem', canonicalEntityId: input.inventoryItemId, canonicalFieldPath: 'condition' },
        { decisionThreadId: thread.id, canonicalEntityType: 'InventoryItem', canonicalEntityId: input.inventoryItemId, canonicalFieldPath: 'installedOn' },
      ],
    });

    await linkPreferenceReferences(tx, thread.id, preferenceValueIds);

    await tx.decisionThreadExecutionLink.create({
      data: { decisionThreadId: thread.id, askExecutionId: input.askExecutionId, linkRole: 'CREATED' },
    });

    return { thread: updatedThread, snapshot, preferencesUsed: preferences };
  });

  await emitDecisionRecommendationChange({
    propertyId: input.propertyId,
    decisionThreadId: result.thread.id,
    snapshotId: result.snapshot.id,
    generatedAt: result.snapshot.generatedAt,
    isFirstSnapshot: true,
    category: null,
  });

  return result;
}

export async function loadHvacDecisionThreadDetail(threadId: string, propertyId: string) {
  const thread = await prisma.decisionThread.findFirst({
    where: { id: threadId, propertyId },
    include: {
      currentRecommendationSnapshot: true,
      questions: { where: { status: 'OPEN' } },
    },
  });
  if (!thread) throw new DecisionThreadNotFoundError(threadId);
  return thread;
}

// askExecutionId is optional: deterministic reads (HVAC_DECISION_CONTINUE)
// run inside executeOperationCore, before the AskExecution row's id is
// threaded into the shared operation-dispatch input type. The
// DecisionThreadExecutionLink audit row is supplementary lineage, not the
// continuity mechanism itself -- the DecisionThread row's own identity
// (found via selectHvacDecisionThread) is what makes cross-session
// resumption work, so omitting the link here does not weaken FRD §10's
// continuity guarantee. Material commands that DO have execution.id in
// scope (see confirmAskExecution) still record it.
//
// Returns `change` (non-null only when a stale-triggered recompute actually
// ran) so callers can render RECOMMENDATION_CHANGE.
export async function continueHvacDecisionThread(threadId: string, propertyId: string, askExecutionId?: string) {
  let thread = await loadHvacDecisionThreadDetail(threadId, propertyId);
  let change: RecommendationChangeDiff | null = null;
  let triggerReasonCodes: string[] = [];

  if (thread.contextStatus === 'STALE') {
    const recomputed = await recomputeStaleThread(threadId);
    change = recomputed.change;
    triggerReasonCodes = recomputed.triggerReasonCodes;
    thread = await loadHvacDecisionThreadDetail(threadId, propertyId);
  }

  if (askExecutionId) {
    await prisma.decisionThreadExecutionLink.create({
      data: { decisionThreadId: threadId, askExecutionId, linkRole: 'CONTINUED' },
    });
  }

  return { thread, change, triggerReasonCodes };
}

// FRD §10.4 correction/invalidation flow: recompute against current facts,
// create a new immutable snapshot superseding the old one, diff it against
// the previous snapshot (FRD §14.3), and restore contextStatus to CURRENT
// only when no stale reason remains (delegated to computeContextStatus,
// matching FRD §10.3's coexistence precedence rule).
export async function recomputeStaleThread(threadId: string) {
  const thread = await prisma.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
  if (!thread.primaryEntityId) throw new Error(`Decision thread ${threadId} has no primary entity to recompute against.`);

  // The thread's own creator is the acting user for an automatic,
  // system-triggered recompute — this isn't a new user action, just a
  // continuation of the existing thread's own preference basis.
  const preferences = await getActiveHvacPreferences(thread.propertyId, thread.createdByUserId);
  const composed = await composeHvacDecisionContext(thread.propertyId, thread.primaryEntityId, preferences);
  if (!composed) throw new Error('The referenced HVAC item is no longer available on this property.');
  const { context, compositionLimitationCodes } = composed;
  const evaluation = evaluateHvacRepairReplace(context);
  const limitationCodes = Array.from(new Set([...evaluation.limitationCodes, ...compositionLimitationCodes]));
  const preferenceValueIds = preferenceIdsFrom(preferences);

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
    const previousSnapshot = current.currentRecommendationSnapshotId
      ? await tx.recommendationSnapshot.findUnique({ where: { id: current.currentRecommendationSnapshotId } })
      : null;

    const newSnapshot = await tx.recommendationSnapshot.create({
      data: {
        decisionThreadId: threadId,
        propertyId: current.propertyId,
        recommendationOwner: 'DECISION_PLATFORM',
        recommendationDefinitionId: 'HVAC_REPAIR_REPLACE',
        recommendationDefinitionVersion: '1.0',
        operationId: 'HVAC_DECISION_CONTINUE',
        operationVersion: '1.0',
        engineVersion: evaluation.engineVersion,
        contextContractVersion: evaluation.contextContractVersion,
        canonicalFactReferences: [
          { entityType: 'InventoryItem', entityId: current.primaryEntityId, fieldPath: 'condition' },
          { entityType: 'InventoryItem', entityId: current.primaryEntityId, fieldPath: 'installedOn' },
        ],
        preferenceReferenceIds: preferenceValueIds,
        signalReferences: [],
        evidenceReferences: [],
        resultPayloadVersion: '1.0',
        verdictCode: evaluation.verdict,
        reasonCodes: evaluation.reasonCodes,
        limitationCodes,
        confidenceBreakdown: evaluation.confidenceBreakdown,
        supersedesSnapshotId: current.currentRecommendationSnapshotId,
        inputDigest: inputDigestFor(context),
      },
    });

    await linkPreferenceReferences(tx, threadId, preferenceValueIds);

    // Recomputation resolved every stale reason (this function only runs
    // against the current facts); any unresolved conflict reason is
    // preserved as-is per FRD §10.3.
    const nextContextStatus = computeContextStatus({ hasUnresolvedConflict: current.contextStatus === 'CONFLICTED', hasUnresolvedStale: false });
    if (!isContextTransitionAllowed(current.contextStatus, nextContextStatus) && current.contextStatus !== nextContextStatus) {
      throw new Error(`Illegal context transition ${current.contextStatus} -> ${nextContextStatus}`);
    }

    const updateResult = await tx.decisionThread.updateMany({
      where: { id: threadId, version: current.version },
      data: {
        contextStatus: nextContextStatus,
        contextIssueCodes: nextContextStatus === 'CURRENT' ? [] : current.contextIssueCodes,
        staleAt: nextContextStatus === 'CURRENT' ? null : current.staleAt,
        currentRecommendationSnapshotId: newSnapshot.id,
        version: { increment: 1 },
      },
    });
    if (updateResult.count === 0) throw new DecisionThreadVersionConflictError(threadId);

    const change = previousSnapshot
      ? compareRecommendationSnapshots(previousSnapshot, newSnapshot, current.contextIssueCodes)
      : null;

    return {
      thread: await tx.decisionThread.findUniqueOrThrow({ where: { id: threadId } }),
      snapshot: newSnapshot,
      change,
      triggerReasonCodes: current.contextIssueCodes,
    };
  });

  await emitDecisionRecommendationChange({
    propertyId: result.thread.propertyId,
    decisionThreadId: threadId,
    snapshotId: result.snapshot.id,
    generatedAt: result.snapshot.generatedAt,
    isFirstSnapshot: false,
    category: result.change?.category ?? null,
  });

  return result;
}

async function markThreads(threads: { id: string; contextStatus: DecisionThreadContextStatus; contextIssueCodes: string[]; version: number }[], reasonCode: string): Promise<void> {
  for (const thread of threads) {
    const nextContextStatus = computeContextStatus({ hasUnresolvedConflict: thread.contextStatus === 'CONFLICTED', hasUnresolvedStale: true });
    if (thread.contextStatus === nextContextStatus && thread.contextIssueCodes.includes(reasonCode)) continue;
    if (thread.contextStatus !== nextContextStatus && !isContextTransitionAllowed(thread.contextStatus, nextContextStatus)) {
      continue; // already CONFLICTED and staying CONFLICTED is a no-op transition, not an error
    }
    const updateResult = await prisma.decisionThread.updateMany({
      where: { id: thread.id, version: thread.version },
      data: {
        contextStatus: nextContextStatus,
        contextIssueCodes: Array.from(new Set([...thread.contextIssueCodes, reasonCode])),
        staleAt: thread.contextStatus === 'CURRENT' ? new Date() : undefined,
        version: { increment: 1 },
      },
    });
    if (updateResult.count === 0) throw new DecisionThreadVersionConflictError(thread.id);
  }
}

// FRD §10.4: fired when a canonical fact this thread depends on is
// corrected. Called from the InventoryItem update path.
export async function markThreadStaleOnFactCorrection(propertyId: string, inventoryItemId: string, reasonCode: string) {
  const threads = await prisma.decisionThread.findMany({
    where: {
      propertyId,
      primaryEntityType: 'InventoryItem',
      primaryEntityId: inventoryItemId,
      lifecycleStatus: { in: [...ACTIVE_LIFECYCLE_STATUSES] },
    },
  });
  await markThreads(threads, reasonCode);
}

// FRD §7.5/§11.4: fired when a preference is revoked/forgotten. Marks every
// thread that referenced the revoked value stale, by id (the caller already
// knows exactly which threads via DecisionThreadPreferenceReference — see
// decisionPreferenceService.ts's revokeHvacPreference, which returns
// affectedThreadIds rather than importing this file, to avoid a circular
// import between the two decisionPlatform services).
export async function markThreadsStaleByIds(threadIds: string[], reasonCode: string): Promise<void> {
  if (!threadIds.length) return;
  const threads = await prisma.decisionThread.findMany({
    where: { id: { in: threadIds }, lifecycleStatus: { in: [...ACTIVE_LIFECYCLE_STATUSES] } },
  });
  await markThreads(threads, reasonCode);
}

// FRD §13: an isolated counterfactual. Never updates the thread's "current"
// snapshot pointer — comparison only, per the §13.3 isolation rule. Never
// calls a decisionPreferenceService save function (no scenario-to-profile
// leakage, FRD §13.3 / Phase 8B exit criterion) — it only *reads* active
// preferences to establish the baseline it compares the scenario against.
export async function createHvacScenario(threadId: string, userId: string, input: { quoteAmountCents: number; vendorLabel: string }) {
  const thread = await prisma.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
  if (!thread.primaryEntityId) throw new Error(`Decision thread ${threadId} has no primary entity.`);

  const preferences = await getActiveHvacPreferences(thread.propertyId, userId);
  const composedBaseline = await composeHvacDecisionContext(thread.propertyId, thread.primaryEntityId, preferences);
  if (!composedBaseline) throw new Error('The referenced HVAC item is no longer available on this property.');
  const { context: baselineContext, compositionLimitationCodes } = composedBaseline;
  const scenarioEvaluation = evaluateHvacRepairReplace({ ...baselineContext, scenarioQuoteAmountCents: input.quoteAmountCents });
  const scenarioLimitationCodes = Array.from(new Set([...scenarioEvaluation.limitationCodes, ...compositionLimitationCodes]));
  const preferenceValueIds = preferenceIdsFrom(preferences);

  return prisma.$transaction(async (tx) => {
    const scenario = await tx.scenario.create({
      data: {
        decisionThreadId: threadId,
        definitionId: 'HVAC_REPAIR_REPLACE',
        schemaVersion: 1,
        label: `Quote from ${input.vendorLabel}`,
        baselineRecommendationSnapshotId: thread.currentRecommendationSnapshotId,
        assumptionsJson: { quoteAmountCents: input.quoteAmountCents, vendorLabel: input.vendorLabel },
        status: 'EVALUATED',
        createdByUserId: userId,
      },
    });

    const scenarioSnapshot = await tx.recommendationSnapshot.create({
      data: {
        decisionThreadId: threadId,
        propertyId: thread.propertyId,
        recommendationOwner: 'DECISION_PLATFORM',
        recommendationDefinitionId: 'HVAC_REPAIR_REPLACE',
        recommendationDefinitionVersion: '1.0',
        operationId: 'HVAC_DECISION_SCENARIO',
        operationVersion: '1.0',
        engineVersion: scenarioEvaluation.engineVersion,
        contextContractVersion: scenarioEvaluation.contextContractVersion,
        canonicalFactReferences: [{ entityType: 'InventoryItem', entityId: thread.primaryEntityId, fieldPath: 'condition' }],
        preferenceReferenceIds: preferenceValueIds,
        scenarioId: scenario.id,
        signalReferences: [],
        evidenceReferences: [],
        resultPayloadVersion: '1.0',
        verdictCode: scenarioEvaluation.verdict,
        reasonCodes: scenarioEvaluation.reasonCodes,
        limitationCodes: scenarioLimitationCodes,
        confidenceBreakdown: scenarioEvaluation.confidenceBreakdown,
        inputDigest: inputDigestFor({ ...baselineContext, scenarioQuoteAmountCents: input.quoteAmountCents }),
      },
    });

    await linkPreferenceReferences(tx, threadId, preferenceValueIds);

    return { scenario, scenarioSnapshot, baselineSnapshotId: thread.currentRecommendationSnapshotId };
  });
}

export async function abandonDecisionThread(threadId: string, propertyId: string) {
  const thread = await prisma.decisionThread.findFirst({ where: { id: threadId, propertyId } });
  if (!thread) throw new DecisionThreadNotFoundError(threadId);
  if (!isLifecycleTransitionAllowed(thread.lifecycleStatus, 'ABANDONED')) {
    throw new Error(`Illegal lifecycle transition ${thread.lifecycleStatus} -> ABANDONED`);
  }
  const updateResult = await prisma.decisionThread.updateMany({
    where: { id: threadId, version: thread.version },
    data: { lifecycleStatus: 'ABANDONED', version: { increment: 1 } },
  });
  if (updateResult.count === 0) throw new DecisionThreadVersionConflictError(threadId);
  return prisma.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
}

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
import type { Prisma } from '@prisma/client';
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
// Decision Platform Phase 10B (FRD §19.4). Resolves whatever weight set is
// currently activated for this estimate family -- DEFAULT_HVAC_ENGINE_WEIGHTS
// whenever nothing is active, which is the guaranteed state until someone
// approves and activates a real CalibrationRelease.
import { getActiveHvacEngineWeights } from './calibrationActivation.service';
import {
  compareRecommendationSnapshots,
  getActiveHvacPreferences,
  RecommendationChangeDiff,
} from './decisionPreferenceService';
import { emitDecisionRecommendationChange } from './decisionPlatformChangeEmitter';
import type {
  DecisionThreadContextStatus,
  DecisionThreadLifecycleStatus,
} from '../../productFramework/decisionPlatform/decisionPlatform.contract';
import {
  DecisionFamilyAmbiguousThreadError,
  type DecisionFamilyAdapter,
  type DecisionFamilyThreadLineage,
  type HomeActionOriginRef,
} from './decisionFamilyAdapter';

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

export const ACTIVE_LIFECYCLE_STATUSES = [
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

// Ask Intelligence FRD §18.4, Phase 9B "Concierge Home" — "Decisions in
// progress from authorized Decision Threads". Property-scoped, not
// entity-scoped like selectHvacDecisionThread, since Concierge Home surfaces
// whatever active threads exist rather than resolving one for a specific
// item.
export async function listActiveDecisionThreadsForProperty(propertyId: string, limit = 5) {
  return prisma.decisionThread.findMany({
    where: { propertyId, lifecycleStatus: { in: [...ACTIVE_LIFECYCLE_STATUSES] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: {
      currentRecommendationSnapshot: {
        select: { verdictCode: true, confidenceBreakdown: true, generatedAt: true },
      },
    },
  });
}

export async function listActiveDecisionThreadsPageForProperty(
  propertyId: string,
  input: { cursor: string | null; pageSize: number },
) {
  const rows = await prisma.decisionThread.findMany({
    where: { propertyId, lifecycleStatus: { in: [...ACTIVE_LIFECYCLE_STATUSES] } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: input.pageSize + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: { id: true },
  });
  const threads = rows.slice(0, input.pageSize);
  return {
    threads,
    nextCursor: rows.length > input.pageSize ? threads.at(-1)?.id ?? null : null,
  };
}

function inputDigestFor(context: HvacDecisionContext): string {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}

// Phase 3 review finding 2: the DB-enforced identity for "at most one
// active thread for this (property, decision family, primary entity)" —
// see DecisionThread.activeIdentityKey's schema comment.
export function activeDecisionThreadIdentityKey(
  propertyId: string,
  decisionDefinitionId: string,
  primaryEntityType: string,
  primaryEntityId: string,
): string {
  return `${propertyId}:${decisionDefinitionId}:${primaryEntityType}:${primaryEntityId}`;
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
  // Optional so a non-Ask origin (Home Intelligence FRD Phase 3A: a
  // homeowner opening a material Home Action directly on Home) can create a
  // thread without a real AskExecution row to attribute — see the
  // conditional DecisionThreadExecutionLink write below. Every existing Ask
  // caller (askOrchestrator.service.ts) still always supplies one.
  askExecutionId?: string;
  // Phase 3 review item 3: the Home Action origin (id, lineage, source
  // entity/version, captured context version), recorded into the initial
  // snapshot's signalReferences so downstream attribution can prove which
  // Home Action and recommendation version originated this decision.
  homeActionOrigin?: HomeActionOriginRef;
}

interface RecommendationSkillLineage {
  skillId: string;
  skillVersion: string;
}

async function skillLineageForExecution(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  askExecutionId?: string,
): Promise<RecommendationSkillLineage | null> {
  if (!askExecutionId) return null;
  const execution = await tx.askExecution.findUnique({
    where: { id: askExecutionId },
    select: { skillId: true, skillVersion: true },
  });
  return execution?.skillId && execution.skillVersion
    ? { skillId: execution.skillId, skillVersion: execution.skillVersion }
    : null;
}

export async function createHvacDecisionThread(input: CreateThreadInput) {
  const preferences = await getActiveHvacPreferences(input.propertyId, input.userId);
  const composed = await composeHvacDecisionContext(input.propertyId, input.inventoryItemId, {
    ownershipHorizonMonths: preferences.ownershipHorizonMonths,
    repairReplaceApproach: preferences.repairReplaceApproach,
  });
  if (!composed) throw new Error('The selected item is not a recorded HVAC system on this property.');
  const { context, compositionLimitationCodes } = composed;

  const { weights, calibrationReleaseId } = await getActiveHvacEngineWeights();
  const evaluation = evaluateHvacRepairReplace(context, weights);
  const limitationCodes = Array.from(new Set([...evaluation.limitationCodes, ...compositionLimitationCodes]));
  const preferenceValueIds = preferenceIdsFrom(preferences);

  const identityKey = activeDecisionThreadIdentityKey(input.propertyId, 'HVAC_REPAIR_REPLACE', 'InventoryItem', input.inventoryItemId);

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    const skillLineage = await skillLineageForExecution(tx, input.askExecutionId);
    const thread = await tx.decisionThread.create({
      data: {
        propertyId: input.propertyId,
        createdByUserId: input.userId,
        decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
        primaryEntityType: 'InventoryItem',
        primaryEntityId: input.inventoryItemId,
        activeIdentityKey: identityKey,
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
        skillId: skillLineage?.skillId,
        skillVersion: skillLineage?.skillVersion,
        engineVersion: evaluation.engineVersion,
        contextContractVersion: evaluation.contextContractVersion,
        canonicalFactReferences: [
          { entityType: 'INVENTORY_ITEM', entityId: input.inventoryItemId, fieldPath: 'condition' },
          { entityType: 'INVENTORY_ITEM', entityId: input.inventoryItemId, fieldPath: 'installedOn' },
        ],
        preferenceReferenceIds: preferenceValueIds,
        // Phase 3 review item 3: records which Home Action (id, lineage,
        // source entity/version, captured context version) opened this
        // thread, so downstream attribution can prove which recommendation
        // version the homeowner actually reacted to. Empty for an
        // Ask-originated create (no Home Action involved).
        signalReferences: input.homeActionOrigin ? [{
          type: 'HOME_ACTION_ORIGIN',
          homeActionId: input.homeActionOrigin.homeActionId,
          lineageId: input.homeActionOrigin.lineageId,
          sourceEntityId: input.homeActionOrigin.sourceEntityId,
          sourceVersion: input.homeActionOrigin.sourceVersion,
          contextVersion: input.homeActionOrigin.contextVersion,
          capturedAt: new Date().toISOString(),
        }] as unknown as Prisma.InputJsonValue : [],
        evidenceReferences: [],
        resultPayloadVersion: '1.0',
        verdictCode: evaluation.verdict,
        reasonCodes: evaluation.reasonCodes,
        limitationCodes,
        confidenceBreakdown: evaluation.confidenceBreakdown,
        inputDigest: inputDigestFor(context),
        score: evaluation.score,
        engineInputSnapshot: context as unknown as Prisma.InputJsonValue,
        calibrationReleaseId,
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

    // createMany + skipDuplicates, not a bare create: DecisionThreadExecutionLink
    // has @@unique([decisionThreadId, askExecutionId]), so a retried request
    // reusing the same executionId must be idempotent, not throw P2002.
    // Skipped entirely when there is no AskExecution to attribute (a
    // Home-originated create — see CreateThreadInput's askExecutionId
    // comment); the DecisionThread row's own identity is what makes
    // resumption work either way, this link is supplementary audit lineage.
    if (input.askExecutionId) {
      await tx.decisionThreadExecutionLink.createMany({
        data: [{ decisionThreadId: thread.id, askExecutionId: input.askExecutionId, linkRole: 'CREATED' }],
        skipDuplicates: true,
      });
    }

    return { thread: updatedThread, snapshot, preferencesUsed: preferences };
    });
  } catch (error: any) {
    // Phase 3 review finding 2: two concurrent create-or-resume calls can
    // both observe NONE from selectHvacDecisionThread and both reach here.
    // Postgres lets only one activeIdentityKey insert win; the loser
    // resumes the winner's thread instead of failing the whole request —
    // same P2002-catch-and-resume idiom as workItemRepository.ts's
    // createWorkItem. Caught outside the transaction: a P2002 aborts the
    // interactive transaction, so any further query must use the plain
    // `prisma` client, never the aborted `tx`.
    if (error?.code === 'P2002' && (error?.meta?.target as string[] | undefined)?.includes('activeIdentityKey')) {
      const resumeSelection = await selectHvacDecisionThread(input.propertyId, input.inventoryItemId);
      if (resumeSelection.kind === 'UNIQUE') {
        const { thread } = await continueHvacDecisionThread(resumeSelection.thread.id, input.propertyId, input.askExecutionId);
        if (!thread.currentRecommendationSnapshotId) throw error;
        const snapshot = await prisma.recommendationSnapshot.findUnique({ where: { id: thread.currentRecommendationSnapshotId } });
        if (!snapshot) throw error;
        return { thread, snapshot, preferencesUsed: preferences };
      }
      // AMBIGUOUS or NONE again here is a genuine anomaly (we just lost a
      // uniqueness race, so a UNIQUE winner must exist) — fail closed with
      // the original error rather than mask it with a confusing new one.
    }
    throw error;
  }

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

// askExecutionId is optional: the automatic, system-triggered recompute path
// (see recomputeStaleThread's own doc comment) has no Ask turn to attribute
// a link to, so it's the only legitimate caller that omits it. Every
// user-driven Ask continuation (askOrchestrator.service.ts's
// hvacDecisionStartResult/hvacDecisionContinueResult) does supply it. The
// DecisionThreadExecutionLink audit row is supplementary lineage, not the
// continuity mechanism itself -- the DecisionThread row's own identity
// (found via selectHvacDecisionThread) is what makes cross-session
// resumption work.
//
// Returns `change` (non-null only when a stale-triggered recompute actually
// ran) so callers can render RECOMMENDATION_CHANGE.
export async function continueHvacDecisionThread(threadId: string, propertyId: string, askExecutionId?: string) {
  let thread = await loadHvacDecisionThreadDetail(threadId, propertyId);
  let change: RecommendationChangeDiff | null = null;
  let triggerReasonCodes: string[] = [];

  if (thread.contextStatus === 'STALE') {
    const recomputed = await recomputeStaleThread(threadId, askExecutionId);
    change = recomputed.change;
    triggerReasonCodes = recomputed.triggerReasonCodes;
    thread = await loadHvacDecisionThreadDetail(threadId, propertyId);
  }

  if (askExecutionId) {
    // createMany + skipDuplicates, not a bare create: same idempotency
    // requirement as createHvacDecisionThread's CREATED link above -- a
    // retried continuation reusing the same executionId must not throw.
    await prisma.decisionThreadExecutionLink.createMany({
      data: [{ decisionThreadId: threadId, askExecutionId, linkRole: 'CONTINUED' }],
      skipDuplicates: true,
    });
  }

  return { thread, change, triggerReasonCodes };
}

// FRD §10.4 correction/invalidation flow: recompute against current facts,
// create a new immutable snapshot superseding the old one, diff it against
// the previous snapshot (FRD §14.3), and restore contextStatus to CURRENT
// only when no stale reason remains (delegated to computeContextStatus,
// matching FRD §10.3's coexistence precedence rule).
export async function recomputeStaleThread(threadId: string, askExecutionId?: string) {
  const thread = await prisma.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
  if (!thread.primaryEntityId) throw new Error(`Decision thread ${threadId} has no primary entity to recompute against.`);

  // The thread's own creator is the acting user for an automatic,
  // system-triggered recompute — this isn't a new user action, just a
  // continuation of the existing thread's own preference basis.
  const preferences = await getActiveHvacPreferences(thread.propertyId, thread.createdByUserId);
  const composed = await composeHvacDecisionContext(thread.propertyId, thread.primaryEntityId, preferences);
  if (!composed) throw new Error('The referenced HVAC item is no longer available on this property.');
  const { context, compositionLimitationCodes } = composed;
  const { weights, calibrationReleaseId } = await getActiveHvacEngineWeights();
  const evaluation = evaluateHvacRepairReplace(context, weights);
  const limitationCodes = Array.from(new Set([...evaluation.limitationCodes, ...compositionLimitationCodes]));
  const preferenceValueIds = preferenceIdsFrom(preferences);

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
    const previousSnapshot = current.currentRecommendationSnapshotId
      ? await tx.recommendationSnapshot.findUnique({ where: { id: current.currentRecommendationSnapshotId } })
      : null;
    const executionSkillLineage = await skillLineageForExecution(tx, askExecutionId);
    const skillLineage = executionSkillLineage ?? (previousSnapshot?.skillId && previousSnapshot.skillVersion
      ? { skillId: previousSnapshot.skillId, skillVersion: previousSnapshot.skillVersion }
      : null);

    const newSnapshot = await tx.recommendationSnapshot.create({
      data: {
        decisionThreadId: threadId,
        propertyId: current.propertyId,
        recommendationOwner: 'DECISION_PLATFORM',
        recommendationDefinitionId: 'HVAC_REPAIR_REPLACE',
        recommendationDefinitionVersion: '1.0',
        operationId: 'HVAC_DECISION_CONTINUE',
        operationVersion: '1.0',
        skillId: skillLineage?.skillId,
        skillVersion: skillLineage?.skillVersion,
        engineVersion: evaluation.engineVersion,
        contextContractVersion: evaluation.contextContractVersion,
        canonicalFactReferences: [
          { entityType: 'INVENTORY_ITEM', entityId: current.primaryEntityId, fieldPath: 'condition' },
          { entityType: 'INVENTORY_ITEM', entityId: current.primaryEntityId, fieldPath: 'installedOn' },
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
        score: evaluation.score,
        engineInputSnapshot: context as unknown as Prisma.InputJsonValue,
        calibrationReleaseId,
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
export async function createHvacScenario(threadId: string, userId: string, input: { quoteAmountCents: number; vendorLabel: string; askExecutionId?: string }) {
  const thread = await prisma.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
  if (!thread.primaryEntityId) throw new Error(`Decision thread ${threadId} has no primary entity.`);

  const preferences = await getActiveHvacPreferences(thread.propertyId, userId);
  const composedBaseline = await composeHvacDecisionContext(thread.propertyId, thread.primaryEntityId, preferences);
  if (!composedBaseline) throw new Error('The referenced HVAC item is no longer available on this property.');
  const { context: baselineContext, compositionLimitationCodes } = composedBaseline;
  const { weights, calibrationReleaseId } = await getActiveHvacEngineWeights();
  const scenarioContext = { ...baselineContext, scenarioQuoteAmountCents: input.quoteAmountCents };
  const scenarioEvaluation = evaluateHvacRepairReplace(scenarioContext, weights);
  const scenarioLimitationCodes = Array.from(new Set([...scenarioEvaluation.limitationCodes, ...compositionLimitationCodes]));
  const preferenceValueIds = preferenceIdsFrom(preferences);

  return prisma.$transaction(async (tx) => {
    const executionSkillLineage = await skillLineageForExecution(tx, input.askExecutionId);
    const currentSnapshot = thread.currentRecommendationSnapshotId
      ? await tx.recommendationSnapshot.findUnique({ where: { id: thread.currentRecommendationSnapshotId }, select: { skillId: true, skillVersion: true } })
      : null;
    const skillLineage = executionSkillLineage ?? (currentSnapshot?.skillId && currentSnapshot.skillVersion
      ? { skillId: currentSnapshot.skillId, skillVersion: currentSnapshot.skillVersion }
      : null);
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
        skillId: skillLineage?.skillId,
        skillVersion: skillLineage?.skillVersion,
        engineVersion: scenarioEvaluation.engineVersion,
        contextContractVersion: scenarioEvaluation.contextContractVersion,
        canonicalFactReferences: [{ entityType: 'INVENTORY_ITEM', entityId: thread.primaryEntityId, fieldPath: 'condition' }],
        preferenceReferenceIds: preferenceValueIds,
        scenarioId: scenario.id,
        signalReferences: [],
        evidenceReferences: [],
        resultPayloadVersion: '1.0',
        verdictCode: scenarioEvaluation.verdict,
        reasonCodes: scenarioEvaluation.reasonCodes,
        limitationCodes: scenarioLimitationCodes,
        confidenceBreakdown: scenarioEvaluation.confidenceBreakdown,
        inputDigest: inputDigestFor(scenarioContext),
        score: scenarioEvaluation.score,
        engineInputSnapshot: scenarioContext as unknown as Prisma.InputJsonValue,
        calibrationReleaseId,
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
    // Phase 3 review finding 2: ABANDONED leaves the active lifecycle set,
    // so this identity must free up for a future create-or-resume — NULL
    // never collides under activeIdentityKey's unique constraint.
    data: { lifecycleStatus: 'ABANDONED', activeIdentityKey: null, version: { increment: 1 } },
  });
  if (updateResult.count === 0) throw new DecisionThreadVersionConflictError(threadId);
  return prisma.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
}

// Home Intelligence Functional Completeness FRD Phase 3A (HI-DEC-002, work
// item 1) — the DecisionFamilyAdapter this HVAC-specific service exposes to
// generic callers (decisionFamilyAdapterRegistry.ts, and through it
// homeActionDecisionLineage.ts) so a material Home Action never has to
// import the HVAC engine directly. Every method here delegates to the
// functions above; no lifecycle/evaluation logic is duplicated.
function toDecisionFamilyLineage(
  thread: {
    id: string;
    lifecycleStatus: DecisionThreadLifecycleStatus;
    contextStatus: DecisionThreadContextStatus;
    currentRecommendationSnapshotId: string | null;
  },
  recommendationChange: RecommendationChangeDiff | null = null,
): DecisionFamilyThreadLineage {
  return {
    decisionThreadId: thread.id,
    lifecycleStatus: thread.lifecycleStatus,
    contextStatus: thread.contextStatus,
    currentRecommendationSnapshotId: thread.currentRecommendationSnapshotId,
    recommendationChange,
  };
}

export const hvacDecisionFamilyAdapter: DecisionFamilyAdapter = {
  decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
  primaryEntityType: 'InventoryItem',

  async isEligiblePrimaryEntity(propertyId, primaryEntityId) {
    // Same eligibility gate composeHvacDecisionContext enforces
    // (hvacRepairReplaceEngine.service.ts) — checked directly here so
    // read-only Home feed rendering doesn't pay for the full context
    // composition (repair history + quote workspace lookups) just to know
    // whether an item qualifies for this decision family at all.
    const item = await prisma.inventoryItem.findFirst({
      where: { id: primaryEntityId, propertyId, category: 'HVAC' },
      select: { id: true },
    });
    return item !== null;
  },

  async selectThread(propertyId, primaryEntityId) {
    const selection = await selectHvacDecisionThread(propertyId, primaryEntityId);
    if (selection.kind === 'NONE') return { kind: 'NONE' };
    if (selection.kind === 'AMBIGUOUS') {
      return { kind: 'AMBIGUOUS', candidates: selection.candidates.map((candidate) => toDecisionFamilyLineage(candidate)) };
    }
    return { kind: 'UNIQUE', thread: toDecisionFamilyLineage(selection.thread) };
  },

  async createOrResumeThread({ propertyId, userId, primaryEntityId, askExecutionId, homeActionOrigin }) {
    const selection = await selectHvacDecisionThread(propertyId, primaryEntityId);
    if (selection.kind === 'AMBIGUOUS') {
      throw new DecisionFamilyAmbiguousThreadError('HVAC_REPAIR_REPLACE', primaryEntityId);
    }
    if (selection.kind === 'UNIQUE') {
      const { thread, change } = await continueHvacDecisionThread(selection.thread.id, propertyId, askExecutionId);
      return toDecisionFamilyLineage(thread, change);
    }
    const created = await createHvacDecisionThread({ propertyId, userId, inventoryItemId: primaryEntityId, askExecutionId, homeActionOrigin });
    return toDecisionFamilyLineage(created.thread);
  },
};

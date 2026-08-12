// DecisionThread service — Ask Intelligence FRD §10. Every lifecycle/context
// write goes through the pure transition contract from Phase 7A
// (decisionThreadTransitions.ts); this file never sets lifecycleStatus or
// contextStatus directly. All mutations are optimistic-concurrency-checked
// (FRD §9: "stale writes shall fail closed rather than overwrite a newer
// preference, thread, scenario, or outcome").
//
// Preference persistence (real DecisionPreferenceValue rows, confirmation,
// expiry/reconfirmation) is Phase 8B's job, not Phase 8A's (FRD §25 phase
// split). Phase 8A accepts ownership-horizon/approach as raw per-command
// inputs and records them as DecisionThreadAssumption rows so
// recomputeStaleThread can find "what was assumed last time" without a
// persisted preference row to read.

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

interface CreateThreadInput {
  propertyId: string;
  userId: string;
  inventoryItemId: string;
  askExecutionId: string;
  ownershipHorizonMonths: number | null;
  repairReplaceApproach: HvacDecisionContext['repairReplaceApproach'];
}

export async function createHvacDecisionThread(input: CreateThreadInput) {
  const context = await composeHvacDecisionContext(input.propertyId, input.inventoryItemId, {
    ownershipHorizonMonths: input.ownershipHorizonMonths,
    repairReplaceApproach: input.repairReplaceApproach,
  });
  if (!context) throw new Error('The selected item is not a recorded HVAC system on this property.');

  const evaluation = evaluateHvacRepairReplace(context);

  return prisma.$transaction(async (tx) => {
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
        preferenceReferenceIds: [],
        signalReferences: [],
        evidenceReferences: [],
        resultPayloadVersion: '1.0',
        verdictCode: evaluation.verdict,
        reasonCodes: evaluation.reasonCodes,
        limitationCodes: evaluation.limitationCodes,
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

    const assumptions: { assumptionKey: string; valueJson: number | string }[] = [];
    if (input.ownershipHorizonMonths !== null) assumptions.push({ assumptionKey: 'OWNERSHIP_HORIZON_MONTHS_ASSUMED', valueJson: input.ownershipHorizonMonths });
    if (input.repairReplaceApproach !== null) assumptions.push({ assumptionKey: 'REPAIR_REPLACE_APPROACH_ASSUMED', valueJson: input.repairReplaceApproach });
    if (assumptions.length) {
      await tx.decisionThreadAssumption.createMany({ data: assumptions.map((a) => ({ decisionThreadId: thread.id, ...a })) });
    }

    await tx.decisionThreadExecutionLink.create({
      data: { decisionThreadId: thread.id, askExecutionId: input.askExecutionId, linkRole: 'CREATED' },
    });

    return { thread: updatedThread, snapshot };
  });
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
export async function continueHvacDecisionThread(threadId: string, propertyId: string, askExecutionId?: string) {
  let thread = await loadHvacDecisionThreadDetail(threadId, propertyId);

  if (thread.contextStatus === 'STALE') {
    await recomputeStaleThread(threadId);
    thread = await loadHvacDecisionThreadDetail(threadId, propertyId);
  }

  if (askExecutionId) {
    await prisma.decisionThreadExecutionLink.create({
      data: { decisionThreadId: threadId, askExecutionId, linkRole: 'CONTINUED' },
    });
  }

  return thread;
}

async function readAssumedPreferences(threadId: string): Promise<{
  ownershipHorizonMonths: number | null;
  repairReplaceApproach: HvacDecisionContext['repairReplaceApproach'];
}> {
  const rows = await prisma.decisionThreadAssumption.findMany({
    where: { decisionThreadId: threadId, assumptionKey: { in: ['OWNERSHIP_HORIZON_MONTHS_ASSUMED', 'REPAIR_REPLACE_APPROACH_ASSUMED'] } },
    orderBy: { createdAt: 'desc' },
  });
  const horizon = rows.find((row) => row.assumptionKey === 'OWNERSHIP_HORIZON_MONTHS_ASSUMED');
  const approach = rows.find((row) => row.assumptionKey === 'REPAIR_REPLACE_APPROACH_ASSUMED');
  return {
    ownershipHorizonMonths: typeof horizon?.valueJson === 'number' ? horizon.valueJson : null,
    repairReplaceApproach: (typeof approach?.valueJson === 'string' ? approach.valueJson : null) as HvacDecisionContext['repairReplaceApproach'],
  };
}

// FRD §10.4 correction/invalidation flow: recompute against current facts,
// create a new immutable snapshot superseding the old one, and restore
// contextStatus to CURRENT only when no stale reason remains (delegated to
// computeContextStatus, matching FRD §10.3's coexistence precedence rule).
export async function recomputeStaleThread(threadId: string) {
  const thread = await prisma.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
  if (!thread.primaryEntityId) throw new Error(`Decision thread ${threadId} has no primary entity to recompute against.`);

  const preferences = await readAssumedPreferences(threadId);
  const context = await composeHvacDecisionContext(thread.propertyId, thread.primaryEntityId, preferences);
  if (!context) throw new Error('The referenced HVAC item is no longer available on this property.');
  const evaluation = evaluateHvacRepairReplace(context);

  return prisma.$transaction(async (tx) => {
    const current = await tx.decisionThread.findUniqueOrThrow({ where: { id: threadId } });

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
        preferenceReferenceIds: [],
        signalReferences: [],
        evidenceReferences: [],
        resultPayloadVersion: '1.0',
        verdictCode: evaluation.verdict,
        reasonCodes: evaluation.reasonCodes,
        limitationCodes: evaluation.limitationCodes,
        confidenceBreakdown: evaluation.confidenceBreakdown,
        supersedesSnapshotId: current.currentRecommendationSnapshotId,
        inputDigest: inputDigestFor(context),
      },
    });

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

    return { thread: await tx.decisionThread.findUniqueOrThrow({ where: { id: threadId } }), snapshot: newSnapshot };
  });
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
        staleAt: thread.contextStatus === 'CURRENT' ? new Date() : thread.staleAt,
        version: { increment: 1 },
      },
    });
    if (updateResult.count === 0) throw new DecisionThreadVersionConflictError(thread.id);
  }
}

// FRD §13: an isolated counterfactual. Never updates the thread's "current"
// snapshot pointer — comparison only, per the §13.3 isolation rule.
export async function createHvacScenario(threadId: string, userId: string, input: { quoteAmountCents: number; vendorLabel: string }) {
  const thread = await prisma.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
  if (!thread.primaryEntityId) throw new Error(`Decision thread ${threadId} has no primary entity.`);

  const preferences = await readAssumedPreferences(threadId);
  const baselineContext = await composeHvacDecisionContext(thread.propertyId, thread.primaryEntityId, preferences);
  if (!baselineContext) throw new Error('The referenced HVAC item is no longer available on this property.');
  const scenarioEvaluation = evaluateHvacRepairReplace({ ...baselineContext, scenarioQuoteAmountCents: input.quoteAmountCents });

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
        preferenceReferenceIds: [],
        scenarioId: scenario.id,
        signalReferences: [],
        evidenceReferences: [],
        resultPayloadVersion: '1.0',
        verdictCode: scenarioEvaluation.verdict,
        reasonCodes: scenarioEvaluation.reasonCodes,
        limitationCodes: scenarioEvaluation.limitationCodes,
        confidenceBreakdown: scenarioEvaluation.confidenceBreakdown,
        inputDigest: inputDigestFor({ ...baselineContext, scenarioQuoteAmountCents: input.quoteAmountCents }),
      },
    });

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

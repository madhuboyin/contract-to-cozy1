// Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
// delivery step 6: "Add adapters around existing domain recommendations...
// Many domains already have authoritative outputs that adapters can
// snapshot." Unlike hvacDecisionFamilyAdapter (decisionThreadService.ts),
// these domains don't compose a decision from raw Property Context facts —
// they already have a persisted, authoritative evaluation (a
// RefinanceOpportunity row, a HomeCapitalTimelineItem, an
// OwnershipCostChange, a PropertyHiddenAssetMatch, a CoverageQuestion) that
// this factory turns into a DecisionThread/RecommendationSnapshot by
// snapshotting its current state, not by re-deriving a recommendation.
//
// Staleness here is pull-based, not push-based: instead of an external
// event marking contextStatus STALE (HVAC's markThreadStaleOnFactCorrection,
// keyed off Property Context fact changes these domains don't participate
// in), every resume recomputes a digest of the domain's current source
// state and compares it against the thread's last snapshot. A changed
// digest creates a new superseding snapshot and produces a
// RecommendationChangeDiff (Phase 3B work item 5) exactly like
// recomputeStaleThread does; an unchanged digest is a no-op read. No
// preferences, no Scenario support — none of these domains has a
// registered DecisionPreferenceDefinition or scenario-input contract yet;
// add that machinery to a specific domain if and when it needs it, rather
// than speculatively wiring it here for all five.

import type { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from '../../lib/prisma';
import {
  ACTIVE_LIFECYCLE_STATUSES,
  activeDecisionThreadIdentityKey,
  classifyThreadSelection,
  DecisionThreadVersionConflictError,
  loadUnacknowledgedRecommendationChange,
  type ThreadSelection,
} from './decisionThreadService';
import {
  computeContextStatus,
  isContextTransitionAllowed,
  isLifecycleTransitionAllowed,
} from './decisionThreadTransitions';
import { compareRecommendationSnapshots, type RecommendationChangeDiff } from './decisionPreferenceService';
import { emitDecisionRecommendationChange } from './decisionPlatformChangeEmitter';
import { recordHomeActionOriginLink } from './decisionThreadHomeActionLink';
import {
  DecisionFamilyAmbiguousThreadError,
  type DecisionFamilyAdapter,
  type DecisionFamilyThreadLineage,
  type HomeActionOriginRef,
} from './decisionFamilyAdapter';
import type { DecisionDefinitionId } from './decisionDefinitionRegistry';

export interface SnapshotSourceState {
  /** DecisionThread.title — a short human label, e.g. "Refinance opportunity". */
  title: string;
  /** DecisionThread.goalCode — a stable machine code for this decision family's goal. */
  goalCode: string;
  verdictCode: string;
  reasonCodes: string[];
  confidenceBreakdown: unknown;
  /** Stable across calls when nothing about the source changed; any change to the underlying record must change this. */
  inputDigest: string;
  canonicalFactReferences?: Array<{ entityType: string; entityId: string; fieldPath?: string }>;
}

export interface SnapshotDecisionFamilyDomainConfig {
  decisionDefinitionId: DecisionDefinitionId;
  primaryEntityType: string;
  recommendationDefinitionVersion: string;
  engineVersion: string;
  contextContractVersion: string;
  /** Null means no current recommendation for this primary entity — NOT_APPLICABLE, not a registry gap. */
  loadSourceState(propertyId: string, primaryEntityId: string): Promise<SnapshotSourceState | null>;
}

/** Injection seam for environment-independent behavioral tests. */
export interface SnapshotDecisionFamilyAdapterDependencies {
  db?: typeof prisma;
  loadRecommendationChange?: typeof loadUnacknowledgedRecommendationChange;
  emitRecommendationChange?: typeof emitDecisionRecommendationChange;
  recordOriginLink?: typeof recordHomeActionOriginLink;
}

export function hashSourceState(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toLineage(
  thread: { id: string; lifecycleStatus: DecisionFamilyThreadLineage['lifecycleStatus']; contextStatus: DecisionFamilyThreadLineage['contextStatus']; currentRecommendationSnapshotId: string | null },
  recommendationChange: RecommendationChangeDiff | null,
): DecisionFamilyThreadLineage {
  return {
    decisionThreadId: thread.id,
    lifecycleStatus: thread.lifecycleStatus,
    contextStatus: thread.contextStatus,
    currentRecommendationSnapshotId: thread.currentRecommendationSnapshotId,
    recommendationChange,
    // Phase 3 review finding 5 is HVAC-specific (evaluateHvacRepairReplace
    // vs. ReplaceRepairAnalysis) — none of these six domains has a second,
    // independent evaluation of its own recommendation to diverge from.
    limitationCodes: [],
  };
}

export function createSnapshotDecisionFamilyAdapter(
  config: SnapshotDecisionFamilyDomainConfig,
  dependencies: SnapshotDecisionFamilyAdapterDependencies = {},
): DecisionFamilyAdapter {
  const db = dependencies.db ?? prisma;
  const emitRecommendationChange = dependencies.emitRecommendationChange ?? emitDecisionRecommendationChange;
  function buildSnapshotData(
    decisionThreadId: string,
    propertyId: string,
    source: SnapshotSourceState,
    homeActionOrigin: HomeActionOriginRef | undefined,
    supersedesSnapshotId: string | null,
    operationId: string,
  ) {
    return {
      decisionThreadId,
      propertyId,
      recommendationOwner: 'DECISION_PLATFORM',
      recommendationDefinitionId: config.decisionDefinitionId,
      recommendationDefinitionVersion: config.recommendationDefinitionVersion,
      operationId,
      operationVersion: '1.0',
      engineVersion: config.engineVersion,
      contextContractVersion: config.contextContractVersion,
      canonicalFactReferences: (source.canonicalFactReferences ?? []).map((ref) => ({
        entityType: ref.entityType, entityId: ref.entityId, fieldPath: ref.fieldPath ?? null,
      })) as unknown as Prisma.InputJsonValue,
      preferenceReferenceIds: [] as string[],
      signalReferences: (homeActionOrigin ? [{
        type: 'HOME_ACTION_ORIGIN',
        homeActionId: homeActionOrigin.homeActionId,
        lineageId: homeActionOrigin.lineageId,
        sourceEntityId: homeActionOrigin.sourceEntityId,
        sourceVersion: homeActionOrigin.sourceVersion,
        contextVersion: homeActionOrigin.contextVersion,
        capturedAt: new Date().toISOString(),
      }] : []) as unknown as Prisma.InputJsonValue,
      evidenceReferences: [] as unknown as Prisma.InputJsonValue,
      resultPayloadVersion: '1.0',
      verdictCode: source.verdictCode,
      reasonCodes: source.reasonCodes,
      limitationCodes: [] as string[],
      confidenceBreakdown: source.confidenceBreakdown as unknown as Prisma.InputJsonValue,
      supersedesSnapshotId,
      inputDigest: source.inputDigest,
    };
  }

  async function selectThread(propertyId: string, primaryEntityId: string): Promise<ThreadSelection<DecisionFamilyThreadLineage>> {
    const candidates = await db.decisionThread.findMany({
      where: {
        propertyId,
        decisionDefinitionId: config.decisionDefinitionId,
        primaryEntityType: config.primaryEntityType,
        primaryEntityId,
        lifecycleStatus: { in: [...ACTIVE_LIFECYCLE_STATUSES] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        currentRecommendationSnapshot: { select: { inputDigest: true } },
      },
    });
    const selection = classifyThreadSelection(candidates);
    if (selection.kind === 'UNIQUE') {
      // Read-time freshness is authoritative too. A source-backed family may
      // receive a new canonical source row before anyone explicitly resumes
      // the thread. Project that digest mismatch as STALE so Home, runtime
      // status, and commitment guards cannot treat the old snapshot as current.
      const source = await config.loadSourceState(propertyId, primaryEntityId);
      const selected = selection.thread as typeof selection.thread & {
        currentRecommendationSnapshot?: { inputDigest: string } | null;
      };
      const effectiveThread = selected.currentRecommendationSnapshotId
        && (!source || selected.currentRecommendationSnapshot?.inputDigest !== source.inputDigest)
        ? { ...selection.thread, contextStatus: 'STALE' as const }
        : selection.thread;
      // Phase 3 review finding 4: read-only, but not always null anymore —
      // diffs two already-persisted snapshots when the homeowner hasn't
      // acknowledged the current one yet. No recompute, no write.
      if (dependencies.loadRecommendationChange) {
        const change = await dependencies.loadRecommendationChange(selection.thread);
        return { kind: 'UNIQUE', thread: toLineage(effectiveThread, change) };
      }
      const change = await loadUnacknowledgedRecommendationChange(selection.thread);
      return { kind: 'UNIQUE', thread: toLineage(effectiveThread, change) };
    }
    if (selection.kind === 'AMBIGUOUS') return { kind: 'AMBIGUOUS', candidates: selection.candidates.map((c) => toLineage(c, null)) };
    return { kind: 'NONE' };
  }

  // Recomputes only when the source's current digest differs from the
  // thread's last snapshot — a true no-op read otherwise. Mirrors
  // recomputeStaleThread's diff/supersede/emit shape (decisionThreadService.ts)
  // without the preference/scenario machinery HVAC alone needs.
  async function resumeThread(
    threadId: string,
    source: SnapshotSourceState,
    homeActionOrigin?: HomeActionOriginRef,
  ): Promise<DecisionFamilyThreadLineage> {
    const result = await db.$transaction(async (tx) => {
      const current = await tx.decisionThread.findUniqueOrThrow({ where: { id: threadId } });
      const previousSnapshot = current.currentRecommendationSnapshotId
        ? await tx.recommendationSnapshot.findUnique({ where: { id: current.currentRecommendationSnapshotId } })
        : null;
      if (previousSnapshot && previousSnapshot.inputDigest === source.inputDigest) {
        return { thread: current, change: null as RecommendationChangeDiff | null, recomputed: false };
      }

      const newSnapshot = await tx.recommendationSnapshot.create({
        data: buildSnapshotData(threadId, current.propertyId, source, homeActionOrigin, current.currentRecommendationSnapshotId, 'DECISION_CONTINUE'),
      });

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

      const change = previousSnapshot ? compareRecommendationSnapshots(previousSnapshot, newSnapshot, []) : null;
      await emitRecommendationChange({
        propertyId: current.propertyId,
        decisionThreadId: threadId,
        snapshotId: newSnapshot.id,
        generatedAt: newSnapshot.generatedAt,
        isFirstSnapshot: false,
        category: change?.category ?? null,
      }, tx);
      return { thread: await tx.decisionThread.findUniqueOrThrow({ where: { id: threadId } }), change, recomputed: true };
    });

    // Phase 3 review finding 3: record durably regardless of whether this
    // resume produced a new snapshot -- a no-op (unchanged digest) resume
    // is still a real "this Home Action version was open against this
    // thread" event worth attributing later.
    if (dependencies.recordOriginLink) await dependencies.recordOriginLink(threadId, homeActionOrigin);
    else await recordHomeActionOriginLink(threadId, homeActionOrigin);
    // The Home interaction navigates immediately and does not render this
    // response. Keep a recomputed change unread until the persisted Home
    // notice is explicitly acknowledged by the homeowner.
    return toLineage(result.thread, result.change);
  }

  async function createThread(input: {
    propertyId: string;
    userId: string;
    primaryEntityId: string;
    homeActionOrigin?: HomeActionOriginRef;
    source: SnapshotSourceState;
  }): Promise<DecisionFamilyThreadLineage> {
    const identityKey = activeDecisionThreadIdentityKey(input.propertyId, config.decisionDefinitionId, config.primaryEntityType, input.primaryEntityId);
    let result;
    try {
      result = await db.$transaction(async (tx) => {
        const thread = await tx.decisionThread.create({
          data: {
            propertyId: input.propertyId,
            createdByUserId: input.userId,
            decisionDefinitionId: config.decisionDefinitionId,
            primaryEntityType: config.primaryEntityType,
            primaryEntityId: input.primaryEntityId,
            activeIdentityKey: identityKey,
            title: input.source.title,
            goalCode: input.source.goalCode,
            lifecycleStatus: 'OPEN',
            contextStatus: 'CURRENT',
          },
        });

        if (!isLifecycleTransitionAllowed('OPEN', 'READY_TO_COMPARE')) throw new Error('Illegal lifecycle transition OPEN -> READY_TO_COMPARE');
        await tx.decisionThread.update({ where: { id: thread.id }, data: { lifecycleStatus: 'READY_TO_COMPARE', version: { increment: 1 } } });

        const snapshot = await tx.recommendationSnapshot.create({
          data: buildSnapshotData(thread.id, input.propertyId, input.source, input.homeActionOrigin, null, 'DECISION_START'),
        });

        if (!isLifecycleTransitionAllowed('READY_TO_COMPARE', 'RECOMMENDATION_AVAILABLE')) throw new Error('Illegal lifecycle transition READY_TO_COMPARE -> RECOMMENDATION_AVAILABLE');
        const updatedThread = await tx.decisionThread.update({
          where: { id: thread.id },
          data: { lifecycleStatus: 'RECOMMENDATION_AVAILABLE', currentRecommendationSnapshotId: snapshot.id, version: { increment: 1 } },
        });

        if (input.source.canonicalFactReferences?.length) {
          await tx.decisionThreadFactReference.createMany({
            data: input.source.canonicalFactReferences.map((ref) => ({
              decisionThreadId: thread.id, canonicalEntityType: ref.entityType, canonicalEntityId: ref.entityId, canonicalFieldPath: ref.fieldPath ?? null,
            })),
          });
        }

        await emitRecommendationChange({
          propertyId: input.propertyId,
          decisionThreadId: updatedThread.id,
          snapshotId: snapshot.id,
          generatedAt: snapshot.generatedAt,
          isFirstSnapshot: true,
          category: null,
        }, tx);

        return { thread: updatedThread, snapshot };
      });
    } catch (error: any) {
      // Same P2002-catch-and-resume idiom as createHvacDecisionThread
      // (Phase 3 review finding 2) — caught outside the transaction since a
      // P2002 aborts it.
      if (error?.code === 'P2002' && (error?.meta?.target as string[] | undefined)?.includes('activeIdentityKey')) {
        const resumeSelection = await selectThread(input.propertyId, input.primaryEntityId);
        if (resumeSelection.kind === 'UNIQUE') {
          return resumeThread(resumeSelection.thread.decisionThreadId, input.source, input.homeActionOrigin);
        }
      }
      throw error;
    }

    // Phase 3 review finding 3: also recorded on creation, not only resume
    // — the first snapshot already embeds origin in its own
    // signalReferences, but the durable link table is the one source
    // every downstream consumer can query without re-parsing snapshot JSON.
    if (dependencies.recordOriginLink) await dependencies.recordOriginLink(result.thread.id, input.homeActionOrigin);
    else await recordHomeActionOriginLink(result.thread.id, input.homeActionOrigin);
    return toLineage(result.thread, null);
  }

  return {
    decisionDefinitionId: config.decisionDefinitionId,
    primaryEntityType: config.primaryEntityType,

    async isEligiblePrimaryEntity(propertyId, primaryEntityId) {
      return (await config.loadSourceState(propertyId, primaryEntityId)) !== null;
    },

    selectThread,

    async createOrResumeThread({ propertyId, userId, primaryEntityId, homeActionOrigin }) {
      const selection = await selectThread(propertyId, primaryEntityId);
      if (selection.kind === 'AMBIGUOUS') {
        throw new DecisionFamilyAmbiguousThreadError(config.decisionDefinitionId, primaryEntityId);
      }
      const source = await config.loadSourceState(propertyId, primaryEntityId);
      if (!source) throw new Error(`No current recommendation available for ${config.decisionDefinitionId}/${primaryEntityId}.`);

      if (selection.kind === 'UNIQUE') {
        return resumeThread(selection.thread.decisionThreadId, source, homeActionOrigin);
      }
      return createThread({ propertyId, userId, primaryEntityId, homeActionOrigin, source });
    },
  };
}

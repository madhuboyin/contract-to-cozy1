import { createHash } from 'node:crypto';
import {
  Prisma,
  PropertyChangeBriefingEligibility,
  PropertyChangeType,
  type IntelligenceRecomputeTriggerType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import type { PropertyChangeEmissionInput } from './propertyChange.contracts';
import {
  deriveBriefingEligibility,
  derivePropertyChangeMateriality,
} from './propertyChangePolicy';
import { requestRecompute } from '../services/intelligenceRecompute/intelligenceRecompute.service';

type ChangeTransaction = Prisma.TransactionClient;

const MATERIALITY_RANK = {
  INFORMATIONAL: 0,
  MEANINGFUL: 1,
  IMPORTANT: 2,
  URGENT: 3,
} as const;

function normalizeSourceType(sourceType: string): string {
  return sourceType.trim().toUpperCase();
}

export function buildPropertyChangeDeduplicationKey(input: {
  propertyId: string;
  sourceType: string;
  sourceEntityId: string;
  sourceRevision: string;
  sourceRevisionOrdinal?: number;
}): string {
  const identity = [
    input.propertyId,
    normalizeSourceType(input.sourceType),
    input.sourceEntityId.trim(),
    input.sourceRevision.trim(),
  ].join('\u001f');
  return `property-change:${createHash('sha256').update(identity).digest('hex')}`;
}

async function assertCanonicalLinks(
  tx: ChangeTransaction,
  input: PropertyChangeEmissionInput,
): Promise<void> {
  if (input.canonicalActionId) {
    const action = await tx.operationalWorkItem.findUnique({
      where: { id: input.canonicalActionId },
      select: { propertyId: true },
    });
    if (!action || action.propertyId !== input.propertyId) {
      throw new APIError(
        'Canonical action must belong to the same property.',
        422,
        'PROPERTY_CHANGE_ACTION_SCOPE_MISMATCH',
      );
    }
  }
  if (input.canonicalEventId) {
    const event = await tx.homeEvent.findUnique({
      where: { id: input.canonicalEventId },
      select: { propertyId: true },
    });
    if (!event || event.propertyId !== input.propertyId) {
      throw new APIError(
        'Canonical event must belong to the same property.',
        422,
        'PROPERTY_CHANGE_EVENT_SCOPE_MISMATCH',
      );
    }
  }
}

export async function emitPropertyChangeWithTransaction(
  tx: ChangeTransaction,
  input: PropertyChangeEmissionInput,
) {
  await assertCanonicalLinks(tx, input);
  const sourceType = normalizeSourceType(input.sourceType);
  const identity = {
    propertyId: input.propertyId,
    sourceType,
    sourceEntityId: input.sourceEntityId.trim(),
    sourceRevision: input.sourceRevision.trim(),
  };
  const existing = await tx.propertyChange.findUnique({
    where: {
      propertyId_sourceType_sourceEntityId_sourceRevision: identity,
    },
  });
  if (existing) return { change: existing, deduped: true };

  const cursor = await tx.propertyChangeSourceCursor.upsert({
    where: {
      propertyId_sourceType_sourceEntityId: {
        propertyId: input.propertyId,
        sourceType,
        sourceEntityId: identity.sourceEntityId,
      },
    },
    create: {
      propertyId: input.propertyId,
      sourceType,
      sourceEntityId: identity.sourceEntityId,
      latestRevision: identity.sourceRevision,
      latestRevisionOrdinal: input.sourceRevisionOrdinal ?? 0,
    },
    // A real UPDATE intentionally acquires the source-identity row lock.
    update: { sourceType },
  });
  const hasExplicitOrdinal = input.sourceRevisionOrdinal !== undefined;
  const revisionOrdinal = hasExplicitOrdinal
    ? input.sourceRevisionOrdinal as number
    : cursor.latestRevision === identity.sourceRevision
      ? cursor.latestRevisionOrdinal
      : cursor.latestRevisionOrdinal + 1;
  if (
    hasExplicitOrdinal
    && cursor.latestRevisionOrdinal === revisionOrdinal
    && cursor.latestRevision !== identity.sourceRevision
  ) {
    throw new APIError(
      'A source revision ordinal must identify exactly one revision.',
      409,
      'PROPERTY_CHANGE_REVISION_ORDINAL_COLLISION',
    );
  }
  if (
    cursor.latestRevision === identity.sourceRevision
    && cursor.latestChangeId
  ) {
    const replayed = await tx.propertyChange.findUnique({
      where: { id: cursor.latestChangeId },
    });
    if (replayed) return { change: replayed, deduped: true };
  }

  const materiality = derivePropertyChangeMateriality(input.signals);
  const outOfOrder = hasExplicitOrdinal
    && cursor.latestRevisionOrdinal > revisionOrdinal;
  const briefing = deriveBriefingEligibility({
    materiality: materiality.materiality,
    confidence: input.confidence ?? null,
    sourceHealth: input.sourceHealth,
    superseded: outOfOrder,
  });
  const deduplicationKey = buildPropertyChangeDeduplicationKey(identity);

  const change = await tx.propertyChange.upsert({
    where: {
      propertyId_sourceType_sourceEntityId_sourceRevision: identity,
    },
    create: {
      ...identity,
      sourceRevisionOrdinal: revisionOrdinal,
      changeType: input.changeType as PropertyChangeType,
      occurredAt: input.occurredAt ?? null,
      detectedAt: input.detectedAt ?? new Date(),
      materiality: materiality.materiality,
      materialityRank: MATERIALITY_RANK[materiality.materiality],
      materialityReasonCodes: materiality.reasonCodes,
      materialityRulesVersion: materiality.rulesVersion,
      confidence: input.confidence ?? null,
      canonicalActionId: input.canonicalActionId ?? null,
      canonicalEventId: input.canonicalEventId ?? null,
      deduplicationKey,
      briefingEligibility:
        briefing.eligibility as PropertyChangeBriefingEligibility,
      briefingReasonCodes: briefing.reasonCodes,
      briefingEvaluatedAt: new Date(),
      briefingRulesVersion: briefing.rulesVersion,
      supersededAt: outOfOrder ? new Date() : null,
      supersededByChangeId: outOfOrder ? cursor.latestChangeId : null,
    },
    update: {},
  });

  if (!outOfOrder) {
    await tx.propertyChange.updateMany({
      where: {
        propertyId: input.propertyId,
        sourceType,
        sourceEntityId: identity.sourceEntityId,
        id: { not: change.id },
        supersededAt: null,
      },
      data: {
        supersededAt: input.detectedAt ?? new Date(),
        supersededByChangeId: change.id,
        briefingEligibility: PropertyChangeBriefingEligibility.INELIGIBLE,
        briefingReasonCodes: ['CHANGE_SUPERSEDED'],
        briefingEvaluatedAt: new Date(),
      },
    });
    await tx.propertyChangeSourceCursor.update({
      where: { id: cursor.id },
      data: {
        latestRevision: identity.sourceRevision,
        latestRevisionOrdinal: revisionOrdinal,
        latestChangeId: change.id,
      },
    });
  }

  return { change, deduped: false };
}

// FRD §15 Phase 2 work item 5 — PropertyChange's own changeType enum
// (propertyChange.contracts.ts) already lines up almost 1:1 with
// IntelligenceRecomputeTriggerType, so a real PropertyChange is the single
// best trigger choke point for "property-fact changes, source-record
// revisions, action-state changes, [and] source-health changes" (HI-REC-002)
// rather than instrumenting every canonical write site individually.
// SOURCE_LIFECYCLE_CHANGED has no distinct recompute trigger type of its
// own; a lifecycle transition is treated as a source-record change.
const PROPERTY_CHANGE_TYPE_TO_RECOMPUTE_TRIGGER: Record<PropertyChangeType, IntelligenceRecomputeTriggerType> = {
  SOURCE_RECORD_CREATED: 'SOURCE_RECORD_CHANGED',
  SOURCE_RECORD_REVISED: 'SOURCE_RECORD_CHANGED',
  SOURCE_LIFECYCLE_CHANGED: 'SOURCE_RECORD_CHANGED',
  PROPERTY_FACT_CHANGED: 'PROPERTY_FACT_CHANGED',
  ACTION_STATE_CHANGED: 'ACTION_STATE_CHANGED',
  OUTCOME_CONFIRMED: 'OUTCOME_RECORDED',
  SOURCE_HEALTH_CHANGED: 'SOURCE_HEALTH_CHANGED',
};

/**
 * Best-effort: a recompute request is a downstream refresh signal, not part
 * of the change record's own correctness — mirrors
 * decisionPlatformChangeEmitter.ts's "never fails the caller's actual
 * write" pattern. Only called for a genuinely new (non-deduped) change;
 * requestRecompute's own idempotency key would converge a replay anyway,
 * but skipping avoids the redundant DomainEvent lookup.
 */
export async function requestRecomputeForChange(
  change: { propertyId: string; sourceType: string; sourceEntityId: string; changeType: PropertyChangeType },
  requestRecomputeFn: typeof requestRecompute = requestRecompute,
): Promise<void> {
  try {
    await requestRecomputeFn({
      propertyId: change.propertyId,
      triggerType: PROPERTY_CHANGE_TYPE_TO_RECOMPUTE_TRIGGER[change.changeType],
      triggerEntityType: change.sourceType,
      triggerEntityId: change.sourceEntityId,
      changedFactKeys: [],
    });
  } catch (err) {
    logger.error({ err, propertyId: change.propertyId, sourceType: change.sourceType, sourceEntityId: change.sourceEntityId }, '[propertyChange.service] failed to request intelligence recompute');
  }
}

export async function emitPropertyChange(input: PropertyChangeEmissionInput) {
  const result = await prisma.$transaction((tx) =>
    emitPropertyChangeWithTransaction(tx, input));
  if (!result.deduped) await requestRecomputeForChange(result.change);
  return result;
}

export async function linkCanonicalActionToChange(input: {
  propertyId: string;
  changeId: string;
  canonicalActionId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const [change, action] = await Promise.all([
      tx.propertyChange.findFirst({
        where: { id: input.changeId, propertyId: input.propertyId },
      }),
      tx.operationalWorkItem.findFirst({
        where: { id: input.canonicalActionId, propertyId: input.propertyId },
      }),
    ]);
    if (!change) {
      throw new APIError('Property change not found.', 404, 'PROPERTY_CHANGE_NOT_FOUND');
    }
    if (!action) {
      throw new APIError(
        'Canonical action not found for this property.',
        404,
        'PROPERTY_CHANGE_ACTION_NOT_FOUND',
      );
    }
    if (
      change.canonicalActionId
      && change.canonicalActionId !== action.id
    ) {
      throw new APIError(
        'This change already links to a different canonical action.',
        409,
        'PROPERTY_CHANGE_ACTION_ALREADY_LINKED',
      );
    }
    return tx.propertyChange.update({
      where: { id: change.id },
      data: { canonicalActionId: action.id },
    });
  });
}

export async function listPropertyChanges(input: {
  propertyId: string;
  userId: string;
  unseenOnly?: boolean;
  since?: Date;
}) {
  return prisma.propertyChange.findMany({
    where: {
      propertyId: input.propertyId,
      supersededAt: null,
      ...(input.since ? { detectedAt: { gte: input.since } } : {}),
      ...(input.unseenOnly
        ? {
            audienceStates: {
              none: {
                userId: input.userId,
                OR: [
                  { seenAt: { not: null } },
                  { dismissedAt: { not: null } },
                ],
              },
            },
          }
        : {}),
    },
    orderBy: [
      { materialityRank: 'desc' },
      { detectedAt: 'desc' },
    ],
    take: 200,
    include: {
      audienceStates: {
        where: { userId: input.userId },
        take: 1,
      },
      canonicalAction: {
        select: {
          id: true,
          state: true,
          priority: true,
          title: true,
        },
      },
      canonicalEvent: {
        select: {
          id: true,
          type: true,
          occurredAt: true,
          title: true,
        },
      },
    },
  });
}

async function assertChangeInProperty(
  changeId: string,
  propertyId: string,
) {
  const change = await prisma.propertyChange.findFirst({
    where: { id: changeId, propertyId },
    select: { id: true },
  });
  if (!change) {
    throw new APIError('Property change not found.', 404, 'PROPERTY_CHANGE_NOT_FOUND');
  }
}

export async function markPropertyChangeSeen(input: {
  propertyId: string;
  changeId: string;
  userId: string;
  seenAt?: Date;
}) {
  await assertChangeInProperty(input.changeId, input.propertyId);
  return prisma.propertyChangeAudienceState.upsert({
    where: {
      propertyChangeId_userId: {
        propertyChangeId: input.changeId,
        userId: input.userId,
      },
    },
    create: {
      propertyChangeId: input.changeId,
      userId: input.userId,
      seenAt: input.seenAt ?? new Date(),
    },
    update: {
      seenAt: input.seenAt ?? new Date(),
    },
  });
}

export async function dismissPropertyChange(input: {
  propertyId: string;
  changeId: string;
  userId: string;
  reason: string;
}) {
  await assertChangeInProperty(input.changeId, input.propertyId);
  return prisma.propertyChangeAudienceState.upsert({
    where: {
      propertyChangeId_userId: {
        propertyChangeId: input.changeId,
        userId: input.userId,
      },
    },
    create: {
      propertyChangeId: input.changeId,
      userId: input.userId,
      dismissedAt: new Date(),
      dismissalReason: input.reason,
    },
    update: {
      dismissedAt: new Date(),
      dismissalReason: input.reason,
    },
  });
}

export async function recordPropertyChangeDelivery(input: {
  changeId: string;
  userId: string;
  deliveredAt?: Date;
}) {
  const deliveredAt = input.deliveredAt ?? new Date();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.propertyChangeAudienceState.findUnique({
      where: {
        propertyChangeId_userId: {
          propertyChangeId: input.changeId,
          userId: input.userId,
        },
      },
    });
    return tx.propertyChangeAudienceState.upsert({
      where: {
        propertyChangeId_userId: {
          propertyChangeId: input.changeId,
          userId: input.userId,
        },
      },
      create: {
        propertyChangeId: input.changeId,
        userId: input.userId,
        firstDeliveredAt: deliveredAt,
        lastDeliveredAt: deliveredAt,
      },
      update: {
        firstDeliveredAt: existing?.firstDeliveredAt ?? deliveredAt,
        lastDeliveredAt: deliveredAt,
      },
    });
  });
}

export async function inspectPropertyChanges(input: {
  propertyId?: string;
  sourceType?: string;
  sourceEntityId?: string;
}) {
  return prisma.propertyChange.findMany({
    where: {
      propertyId: input.propertyId,
      sourceType: input.sourceType
        ? normalizeSourceType(input.sourceType)
        : undefined,
      sourceEntityId: input.sourceEntityId,
    },
    orderBy: { detectedAt: 'desc' },
    take: 250,
    include: {
      audienceStates: true,
      canonicalAction: {
        select: {
          id: true,
          workKey: true,
          state: true,
          priority: true,
          sourceVersion: true,
        },
      },
      canonicalEvent: {
        select: {
          id: true,
          type: true,
          occurredAt: true,
          sourceBadge: true,
        },
      },
      supersededBy: {
        select: { id: true, sourceRevision: true, detectedAt: true },
      },
    },
  });
}

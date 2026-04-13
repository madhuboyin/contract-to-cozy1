import { NarrativeRunStatus, Prisma, PropertyNarrativeRun } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { FEATURE_FLAGS } from '../config/featureFlags';
import {
  computeInsightSnapshot,
  isInsightSnapshotStale,
  parseInsightSnapshot,
} from './propertyInsight.service';
import { buildNarrativePlan } from './narrativeRules.service';
import { composeNarrativePayload } from './narrativeComposer.service';
import { getOrCreateOnboarding } from './propertyOnboarding.service';
import { logger } from '../lib/logger';

export type NarrativeRunAction =
  | 'VIEWED'
  | 'CTA_CLICKED'
  | 'NUDGE_CLICKED'
  | 'COMPLETED'
  | 'DISMISSED';

export const NARRATIVE_RUN_TTL_DAYS = 30;
export const NARRATIVE_DISMISS_COOLDOWN_DAYS = 7;

type NarrativeEventName =
  | 'NARRATIVE_VIEWED'
  | 'NARRATIVE_CTA_CLICKED'
  | 'NARRATIVE_DISMISSED'
  | 'NARRATIVE_NUDGE_CLICKED'
  | 'NARRATIVE_COMPLETED';

type RunPayloadMeta = {
  heroVariant: string;
  confidenceScore: number;
  version: string;
};

async function assertPropertyAccess(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId },
    },
    select: {
      id: true,
      updatedAt: true,
      yearBuilt: true,
      propertySize: true,
      propertyType: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
    },
  });

  if (!property) {
    throw new APIError('Property not found', 404, 'NOT_FOUND');
  }

  return {
    ...property,
    propertyType: property.propertyType ? String(property.propertyType) : null,
  };
}

function isRecentlyDismissed(dismissedAt: Date | null | undefined): boolean {
  if (!dismissedAt) return false;
  const cutoffMs = NARRATIVE_DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - dismissedAt.getTime() <= cutoffMs;
}

function resolveExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + NARRATIVE_RUN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function extractRunPayloadMeta(run: PropertyNarrativeRun): RunPayloadMeta {
  const payload =
    run.payloadJson && typeof run.payloadJson === 'object' && !Array.isArray(run.payloadJson)
      ? (run.payloadJson as Record<string, any>)
      : {};

  const metadata =
    payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, any>)
      : {};

  return {
    heroVariant: String(metadata.heroVariant || 'GENERAL_WELCOME'),
    confidenceScore: Number(metadata.confidenceScore || 0),
    version: String(metadata.runVersion || run.version || 'v1'),
  };
}

async function logNarrativeEvent(args: {
  eventName: NarrativeEventName;
  userId: string;
  run: PropertyNarrativeRun;
  metadata?: Record<string, unknown>;
}) {
  const payloadMeta = extractRunPayloadMeta(args.run);

  try {
    await prisma.auditLog.create({
      data: {
        userId: args.userId,
        action: args.eventName,
        entityType: 'PROPERTY_NARRATIVE_RUN',
        entityId: args.run.id,
        newValues: {
          propertyId: args.run.propertyId,
          runId: args.run.id,
          version: payloadMeta.version,
          heroVariant: payloadMeta.heroVariant,
          confidenceScore: payloadMeta.confidenceScore,
          ...(args.metadata || {}),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logger.error('[NARRATIVE] Failed to write narrative audit log', {
      event: args.eventName,
      runId: args.run.id,
      error,
    });
  }
}

export async function getOrCreateActiveNarrativeRun(args: {
  propertyId: string;
  userId: string;
  force?: boolean;
}): Promise<PropertyNarrativeRun | null> {
  if (!FEATURE_FLAGS.PROPERTY_NARRATIVE_ENGINE) {
    return null;
  }

  const property = await assertPropertyAccess(args.propertyId, args.userId);
  const onboarding = await getOrCreateOnboarding(args.propertyId, args.userId);

  if (!args.force) {
    if (onboarding.narrativeCompletedAt) {
      return null;
    }

    if (isRecentlyDismissed(onboarding.narrativeDismissedAt)) {
      return null;
    }
  }

  const now = new Date();
  const existingActiveRun = await prisma.propertyNarrativeRun.findFirst({
    where: {
      propertyId: args.propertyId,
      userId: args.userId,
      status: NarrativeRunStatus.ACTIVE,
    },
    include: {
      snapshot: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (existingActiveRun) {
    const isExpired = Boolean(existingActiveRun.expiresAt && existingActiveRun.expiresAt <= now);
    const snapshotStale =
      existingActiveRun.snapshot == null
        ? true
        : isInsightSnapshotStale(existingActiveRun.snapshot, property, now);

    if (!isExpired && !snapshotStale) {
      return existingActiveRun;
    }

    await prisma.propertyNarrativeRun.updateMany({
      where: {
        propertyId: args.propertyId,
        userId: args.userId,
        status: NarrativeRunStatus.ACTIVE,
      },
      data: {
        status: NarrativeRunStatus.EXPIRED,
        expiresAt: now,
      },
    });
  }

  const { snapshot } = await computeInsightSnapshot({
    propertyId: args.propertyId,
    userId: args.userId,
    forceRecompute: false,
  });

  const parsedSnapshot = parseInsightSnapshot(snapshot);
  const plan = buildNarrativePlan(parsedSnapshot);
  const payload = composeNarrativePayload({
    plan,
    snapshot: parsedSnapshot,
  });

  const createdRun = await prisma.propertyNarrativeRun.create({
    data: {
      propertyId: args.propertyId,
      userId: args.userId,
      version: 'v1',
      status: NarrativeRunStatus.ACTIVE,
      snapshotId: snapshot.id,
      planJson: plan as unknown as Prisma.InputJsonValue,
      payloadJson: payload as unknown as Prisma.InputJsonValue,
      expiresAt: resolveExpiry(now),
    },
  });

  await prisma.propertyOnboarding.update({
    where: { propertyId: args.propertyId },
    data: {
      narrativeRunId: createdRun.id,
      narrativeSeenAt: onboarding.narrativeSeenAt ?? now,
    },
  });

  return createdRun;
}

export async function markNarrativeRun(args: {
  runId: string;
  userId: string;
  action: NarrativeRunAction;
  metadata?: Record<string, unknown>;
}): Promise<PropertyNarrativeRun> {
  const run = await prisma.propertyNarrativeRun.findFirst({
    where: {
      id: args.runId,
      userId: args.userId,
    },
  });

  if (!run) {
    throw new APIError('Narrative run not found', 404, 'NOT_FOUND');
  }

  const now = new Date();
  let updatedRun = run;

  if (args.action === 'COMPLETED' && run.status !== NarrativeRunStatus.COMPLETED) {
    const [nextRun] = await prisma.$transaction([
      prisma.propertyNarrativeRun.update({
        where: { id: args.runId },
        data: {
          status: NarrativeRunStatus.COMPLETED,
          completedAt: now,
        },
      }),
      prisma.propertyOnboarding.update({
        where: { propertyId: run.propertyId },
        data: {
          narrativeCompletedAt: now,
          narrativeRunId: run.id,
        },
      }),
    ]);

    updatedRun = nextRun;
    await logNarrativeEvent({
      eventName: 'NARRATIVE_COMPLETED',
      userId: args.userId,
      run: updatedRun,
      metadata: args.metadata,
    });

    return updatedRun;
  }

  if (args.action === 'DISMISSED' && run.status !== NarrativeRunStatus.DISMISSED) {
    const [nextRun] = await prisma.$transaction([
      prisma.propertyNarrativeRun.update({
        where: { id: args.runId },
        data: {
          status: NarrativeRunStatus.DISMISSED,
          dismissedAt: now,
        },
      }),
      prisma.propertyOnboarding.update({
        where: { propertyId: run.propertyId },
        data: {
          narrativeDismissedAt: now,
          narrativeRunId: run.id,
        },
      }),
    ]);

    updatedRun = nextRun;
    await logNarrativeEvent({
      eventName: 'NARRATIVE_DISMISSED',
      userId: args.userId,
      run: updatedRun,
      metadata: args.metadata,
    });

    return updatedRun;
  }

  if (args.action === 'VIEWED') {
    await prisma.propertyOnboarding.update({
      where: { propertyId: run.propertyId },
      data: {
        narrativeSeenAt: now,
      },
    });

    await logNarrativeEvent({
      eventName: 'NARRATIVE_VIEWED',
      userId: args.userId,
      run,
      metadata: args.metadata,
    });

    return run;
  }

  if (args.action === 'CTA_CLICKED') {
    await logNarrativeEvent({
      eventName: 'NARRATIVE_CTA_CLICKED',
      userId: args.userId,
      run,
      metadata: args.metadata,
    });

    return run;
  }

  if (args.action === 'NUDGE_CLICKED') {
    await logNarrativeEvent({
      eventName: 'NARRATIVE_NUDGE_CLICKED',
      userId: args.userId,
      run,
      metadata: args.metadata,
    });

    return run;
  }

  return updatedRun;
}

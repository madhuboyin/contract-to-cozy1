import { createHash, randomBytes } from 'crypto';
import {
  HomeBriefingCadence,
  HomeBriefingChannel,
  HomeBriefingDeliveryStatus,
  HomeBriefingShareStatus,
  IntelligenceAssessmentMateriality,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { getPropertyIntelligenceCoverage } from '../propertyIntelligence/propertyIntelligence.service';
import type { HomeBriefingTopic } from './homeBriefing.contracts';
import { NotificationService } from '../services/notification.service';
import { reconcileCanonicalPropertyChanges } from '../propertyChanges/canonicalChangeReconciliation.service';
import { derivePropertyIntelligenceSafetyTier } from '../productFramework/propertyIntelligenceOwnership.contract';
import { operatingModeForOwnershipState } from '../services/skills/context/propertyJourneyContext.contract';

export const HOME_BRIEFING_BASELINE_VERSION = 'home-briefing-homeowner-v2';

const json = (value: unknown): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

const jsonRecord = (value: Prisma.JsonValue): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const currentEnvironment = (): string => process.env.NODE_ENV ?? 'development';

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ));
}

function briefingWindow(cadence: HomeBriefingCadence, now = new Date()) {
  if (cadence === HomeBriefingCadence.WEEKLY) {
    const bucketStart = startOfUtcDay(now);
    const day = bucketStart.getUTCDay();
    bucketStart.setUTCDate(bucketStart.getUTCDate() - (day === 0 ? 6 : day - 1));
    return {
      start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: now,
      bucket: bucketStart.toISOString().slice(0, 10),
    };
  }
  if (cadence === HomeBriefingCadence.MONTHLY) {
    const bucketStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return {
      start: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
      end: now,
      bucket: bucketStart.toISOString().slice(0, 7),
    };
  }
  if (cadence === HomeBriefingCadence.IMMEDIATE) {
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return {
      start,
      end: now,
      bucket: now.toISOString().slice(0, 13),
    };
  }
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    start,
    end: now,
    bucket: now.toISOString().slice(0, 10),
  };
}

function topicForChange(sourceType: string): HomeBriefingTopic {
  const normalized = sourceType.toUpperCase();
  if (normalized.includes('HAZARD') || normalized.includes('CLIMATE')) return 'HAZARD';
  if (normalized === 'INTELLIGENCE_OBSERVATION') return 'LOCAL_CHANGE';
  if (normalized.includes('WORK') || normalized.includes('ACTION')) return 'HOME_ACTION';
  if (normalized.includes('EVENT') || normalized.includes('TIMELINE')) return 'HOME_HISTORY';
  if (normalized.includes('FACT') || normalized.includes('PROPERTY_CONTEXT')) return 'PROPERTY_FACT';
  if (normalized.includes('SOURCE_HEALTH')) return 'SOURCE_HEALTH';
  return 'OTHER';
}

function defaultDeepLink(input: {
  propertyId: string;
  topic: HomeBriefingTopic;
  canonicalActionId: string | null;
  canonicalEventId: string | null;
  sourceType: string;
  sourceEntityId: string;
}) {
  if (input.canonicalActionId) {
    return `/dashboard/properties/${input.propertyId}/home-operations?workItemId=${encodeURIComponent(input.canonicalActionId)}`;
  }
  if (input.canonicalEventId) {
    return `/dashboard/properties/${input.propertyId}/timeline?eventId=${encodeURIComponent(input.canonicalEventId)}`;
  }
  const entityId = encodeURIComponent(input.sourceEntityId);
  if (input.sourceType === 'DOCUMENT') {
    return `/dashboard/properties/${input.propertyId}/documents?documentId=${entityId}`;
  }
  if (input.sourceType === 'CLAIM_RECORD') {
    return `/dashboard/properties/${input.propertyId}/claims/${entityId}`;
  }
  if (input.sourceType === 'PROJECT_RECORD') {
    return `/dashboard/properties/${input.propertyId}/projects/${entityId}`;
  }
  if (input.sourceType === 'MAINTENANCE_RECORD') {
    return `/dashboard/properties/${input.propertyId}/maintenance?taskId=${entityId}`;
  }
  if (input.sourceType === 'PROPERTY_FACT') {
    return `/dashboard/properties/${input.propertyId}/edit`;
  }
  if (input.topic === 'LOCAL_CHANGE') {
    return `/dashboard/properties/${input.propertyId}/tools/neighborhood-change-radar`;
  }
  if (input.topic === 'HAZARD') {
    return `/dashboard/properties/${input.propertyId}/tools/home-risk-replay`;
  }
  if (input.topic === 'HOME_HISTORY') {
    return `/dashboard/properties/${input.propertyId}/timeline`;
  }
  return `/dashboard/properties/${input.propertyId}/status-board`;
}

function safeFacts(payload: unknown): { title?: string; summary?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const record = payload as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim().slice(0, 300) : undefined;
  const summaryValue =
    typeof record.summary === 'string'
      ? record.summary
      : typeof record.description === 'string'
        ? record.description
        : undefined;
  const summary = summaryValue?.trim().slice(0, 1200);
  return { ...(title ? { title } : {}), ...(summary ? { summary } : {}) };
}

function homeownerLabel(value: string): string {
  const leaf = value.split('.').pop() ?? value;
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type HomeownerChangeDetail = {
  title: string;
  summary: string;
  actionLabel: string;
  semanticKey: string;
  sourceLabel: string;
  verifiedAt: Date | null;
};

async function homeownerDetailForChange(change: {
  id: string;
  propertyId: string;
  sourceType: string;
  sourceEntityId: string;
  changeType: string;
  detectedAt: Date;
  canonicalAction?: { title: string; homeownerReason: string | null } | null;
  canonicalEvent?: { title: string; summary: string | null } | null;
}): Promise<HomeownerChangeDetail | null> {
  if (change.canonicalAction) {
    return {
      title: change.canonicalAction.title,
      summary: change.canonicalAction.homeownerReason ?? 'A next step for your home has been updated.',
      actionLabel: 'Review next step',
      semanticKey: `ACTION:${change.sourceEntityId}`,
      sourceLabel: 'Home Action',
      verifiedAt: change.detectedAt,
    };
  }
  if (change.canonicalEvent) {
    return {
      title: change.canonicalEvent.title,
      summary: change.canonicalEvent.summary ?? 'A record in your home timeline was updated.',
      actionLabel: 'View timeline record',
      semanticKey: `EVENT:${change.sourceEntityId}`,
      sourceLabel: 'Home Timeline',
      verifiedAt: change.detectedAt,
    };
  }
  if (change.sourceType === 'PROPERTY_FACT') {
    const fact = await prisma.propertyFactEvidence.findFirst({
      where: { id: change.sourceEntityId, propertyId: change.propertyId },
      select: { factKey: true, verifiedAt: true, observedAt: true },
    });
    if (!fact) return null;
    const label = homeownerLabel(fact.factKey);
    return {
      title: `${label} ${fact.verifiedAt ? 'was confirmed' : 'was updated'}`,
      summary: `Your home record has updated information for ${label.toLowerCase()}. Review it to make sure it is correct.`,
      actionLabel: 'Review home details',
      semanticKey: `PROPERTY_FACT:${fact.factKey}`,
      sourceLabel: fact.verifiedAt ? 'Verified home information' : 'Home information',
      verifiedAt: fact.verifiedAt ?? fact.observedAt,
    };
  }
  if (change.sourceType === 'DOCUMENT') {
    const document = await prisma.document.findFirst({
      where: { id: change.sourceEntityId, propertyId: change.propertyId },
      select: { name: true, type: true, verifiedAt: true, updatedAt: true },
    });
    if (!document) return null;
    return {
      title: `${document.name} was verified`,
      summary: `A ${homeownerLabel(document.type).toLowerCase()} document in your home record was reviewed and updated.`,
      actionLabel: 'View document',
      semanticKey: `DOCUMENT:${change.sourceEntityId}`,
      sourceLabel: 'Home documents',
      verifiedAt: document.verifiedAt ?? document.updatedAt,
    };
  }
  if (change.sourceType === 'CLAIM_RECORD') {
    const claim = await prisma.claim.findFirst({
      where: { id: change.sourceEntityId, propertyId: change.propertyId },
      select: { title: true, status: true, providerName: true, updatedAt: true },
    });
    if (!claim) return null;
    return {
      title: `${claim.title} is now ${homeownerLabel(claim.status).toLowerCase()}`,
      summary: `Your claim record${claim.providerName ? ` with ${claim.providerName}` : ''} has a new status.`,
      actionLabel: 'Review claim',
      semanticKey: `CLAIM:${change.sourceEntityId}`,
      sourceLabel: claim.providerName ?? 'Claims record',
      verifiedAt: claim.updatedAt,
    };
  }
  if (change.sourceType === 'PROJECT_RECORD') {
    const project = await prisma.projectRecord.findFirst({
      where: { id: change.sourceEntityId, propertyId: change.propertyId },
      select: { name: true, status: true, updatedAt: true },
    });
    if (!project) return null;
    return {
      title: `${project.name} is now ${homeownerLabel(project.status).toLowerCase()}`,
      summary: 'Your project record has been updated. Review its current status, dates, and next steps.',
      actionLabel: 'Review project',
      semanticKey: `PROJECT:${change.sourceEntityId}`,
      sourceLabel: 'Projects',
      verifiedAt: project.updatedAt,
    };
  }
  if (change.sourceType === 'MAINTENANCE_RECORD') {
    const task = await prisma.propertyMaintenanceTask.findFirst({
      where: { id: change.sourceEntityId, propertyId: change.propertyId },
      select: { title: true, status: true, nextDueDate: true, updatedAt: true },
    });
    if (!task) return null;
    const dueCopy = task.nextDueDate
      ? ` It is scheduled for ${task.nextDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}.`
      : '';
    return {
      title: `${task.title} is ${homeownerLabel(task.status).toLowerCase()}`,
      summary: `Your maintenance plan has been updated.${dueCopy}`,
      actionLabel: 'Review maintenance',
      semanticKey: `MAINTENANCE:${change.sourceEntityId}`,
      sourceLabel: 'Maintenance plan',
      verifiedAt: task.updatedAt,
    };
  }
  return null;
}

function deterministicCopy(input: {
  changeType: string;
  sourceType: string;
  materiality: IntelligenceAssessmentMateriality;
  actionTitle?: string;
  actionReason?: string;
  eventTitle?: string;
  eventSummary?: string | null;
  sourceTitle?: string;
  sourceSummary?: string;
  homeownerDetail?: HomeownerChangeDetail | null;
}) {
  if (input.homeownerDetail) {
    return { title: input.homeownerDetail.title, summary: input.homeownerDetail.summary };
  }
  if (input.actionTitle) {
    return {
      title: input.actionTitle,
      summary: input.actionReason
        ?? `A ${input.materiality.toLowerCase()} change is linked to this Home Action.`,
    };
  }
  if (input.eventTitle) {
    return {
      title: input.eventTitle,
      summary: input.eventSummary
        ?? 'A record in your home timeline was updated.',
    };
  }
  if (input.sourceTitle) {
    return {
      title: input.sourceTitle,
      summary: input.sourceSummary
        ?? `The reviewed source reported a ${input.changeType.toLowerCase().replace(/_/g, ' ')}.`,
    };
  }
  return {
    title: 'Your home record was updated',
    summary: 'New information is available for your home. Review the details and confirm that they look right.',
  };
}

async function sourceDetailForChange(change: {
  sourceType: string;
  sourceEntityId: string;
  sourceRevisionOrdinal: number;
}) {
  if (change.sourceType !== 'INTELLIGENCE_OBSERVATION') return null;
  const separator = change.sourceEntityId.indexOf(':');
  if (separator < 1) return null;
  const sourceKey = change.sourceEntityId.slice(0, separator);
  const externalId = change.sourceEntityId.slice(separator + 1);
  return prisma.intelligenceObservation.findFirst({
    where: {
      externalId,
      revision: change.sourceRevisionOrdinal,
      source: { key: sourceKey },
    },
    select: {
      factualPayload: true,
      lifecycleStatus: true,
      sourceUrl: true,
      sourcePublishedAt: true,
      lastVerifiedAt: true,
      geographyType: true,
      geographyKey: true,
      source: {
        select: { key: true, family: true, provider: true, termsVersion: true },
      },
    },
  });
}

async function preferenceFor(propertyId: string, userId: string) {
  return prisma.homeBriefingPreference.upsert({
    where: { propertyId_userId: { propertyId, userId } },
    create: {
      propertyId,
      userId,
      cadence: HomeBriefingCadence.WEEKLY,
      channels: [HomeBriefingChannel.IN_APP],
    },
    update: {},
  });
}

async function notifyHomeBriefingDelivery(input: {
  delivery: {
    id: string;
    itemCount: number;
    items: Array<{ materiality: IntelligenceAssessmentMateriality }>;
  };
  deliveryKey: string;
  propertyId: string;
  userId: string;
  cadence: HomeBriefingCadence;
  channels: HomeBriefingChannel[];
}) {
  if (input.delivery.itemCount === 0) return;

  // Pre-close buyers don't yet possess the property, so a "meaningful home
  // changes" digest about it doesn't apply until ownership transfers — same
  // pre-close suppression as maintenanceReminder.service.ts / the seasonal
  // checklist notification job.
  const onboarding = await prisma.propertyOnboarding.findUnique({
    where: { propertyId: input.propertyId },
    select: { ownershipState: true },
  });
  if (operatingModeForOwnershipState(onboarding?.ownershipState) === 'BUYING') return;

  const requiredChannels = input.channels.map((channel) =>
    channel as NotificationChannel);
  const hasUrgent = input.delivery.items.some((item) =>
    item.materiality === IntelligenceAssessmentMateriality.URGENT);
  await NotificationService.create({
    userId: input.userId,
    deduplicationKey: `${input.deliveryKey}:v${input.delivery.itemCount}`,
    type: 'HOME_BRIEFING_DELIVERED',
    title: `${input.delivery.itemCount} meaningful home ${input.delivery.itemCount === 1 ? 'change' : 'changes'}`,
    message: 'Your Home Briefing explains what changed and where to review the details.',
    actionUrl: `/dashboard/properties/${input.propertyId}/tools/home-briefing`,
    entityType: 'HomeBriefingDelivery',
    entityId: input.delivery.id,
    category: 'GENERAL',
    urgency: hasUrgent ? 'URGENT' : 'MATERIAL',
    requiredChannels,
    metadata: {
      propertyId: input.propertyId,
      cadence: input.cadence,
      itemCount: input.delivery.itemCount,
      baselineVersion: HOME_BRIEFING_BASELINE_VERSION,
    },
  });
}

export async function updateHomeBriefingPreference(input: {
  propertyId: string;
  userId: string;
  enabled: boolean;
  cadence: HomeBriefingCadence;
  topics: HomeBriefingTopic[];
  channels: HomeBriefingChannel[];
}) {
  return prisma.homeBriefingPreference.upsert({
    where: {
      propertyId_userId: {
        propertyId: input.propertyId,
        userId: input.userId,
      },
    },
    create: input,
    update: {
      enabled: input.enabled,
      cadence: input.cadence,
      topics: input.topics,
      channels: input.channels,
    },
  });
}

export async function generateHomeBriefing(input: {
  propertyId: string;
  userId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const preference = await preferenceFor(input.propertyId, input.userId);
  if (!preference.enabled) {
    throw new APIError('Home Briefing is disabled for this property.', 409, 'HOME_BRIEFING_DISABLED');
  }
  const window = briefingWindow(preference.cadence, now);
  const deliveryKey = [
    'home-briefing',
    input.propertyId,
    input.userId,
    preference.cadence,
    window.bucket,
  ].join(':');
  const existing = await prisma.homeBriefingDelivery.findUnique({
    where: { deliveryKey },
    include: { items: { orderBy: [{ materiality: 'desc' }, { createdAt: 'desc' }] } },
  });
  await reconcileCanonicalPropertyChanges({
    propertyId: input.propertyId,
    since: window.start,
    through: window.end,
  });

  const [changes, sourceCoverage] = await Promise.all([
    prisma.propertyChange.findMany({
      where: {
        propertyId: input.propertyId,
        detectedAt: { gte: window.start, lte: window.end },
        briefingEligibility: 'ELIGIBLE',
        supersededAt: null,
        audienceStates: {
          none: {
            userId: input.userId,
            firstDeliveredAt: { not: null },
          },
        },
        ...(preference.cadence === HomeBriefingCadence.IMPORTANT_ONLY
          ? { materiality: { in: ['IMPORTANT', 'URGENT'] } }
          : {}),
      },
      orderBy: [{ materialityRank: 'desc' }, { detectedAt: 'desc' }],
      take: 100,
      include: {
        canonicalAction: {
          select: { id: true, title: true, homeownerReason: true, state: true },
        },
        canonicalEvent: {
          select: { id: true, title: true, summary: true, occurredAt: true },
        },
      },
    }),
    getPropertyIntelligenceCoverage(input.propertyId, currentEnvironment()),
  ]);

  const topicFilter = new Set(preference.topics);
  const eligibleChanges = changes
    .map((change) => ({ change, topic: topicForChange(change.sourceType) }))
    .filter(({ topic }) => topicFilter.size === 0 || topicFilter.has(topic));
  const healthStates = sourceCoverage.map((coverage) => coverage.state);
  const coverageDegraded = healthStates.some((state) =>
    ['DEGRADED', 'STALE', 'UNAVAILABLE', 'NOT_CONFIGURED'].includes(state));
  const quietReasonCodes = eligibleChanges.length > 0
    ? coverageDegraded ? ['PARTIAL_SOURCE_COVERAGE'] : []
    : sourceCoverage.length === 0
      ? ['SOURCE_COVERAGE_NOT_CONFIGURED']
      : coverageDegraded
        ? ['NO_MATERIAL_CHANGES_WITH_DEGRADED_COVERAGE']
        : ['NO_MATERIAL_CHANGES_IN_WINDOW'];

  const preparedItems = await Promise.all(eligibleChanges.map(async ({ change, topic }) => {
    const sourceDetail = await sourceDetailForChange(change);
    const homeownerDetail = await homeownerDetailForChange(change);
    const facts = safeFacts(sourceDetail?.factualPayload);
    const copy = deterministicCopy({
      changeType: change.changeType,
      sourceType: change.sourceType,
      materiality: change.materiality,
      actionTitle: change.canonicalAction?.title,
      actionReason: change.canonicalAction?.homeownerReason,
      eventTitle: change.canonicalEvent?.title,
      eventSummary: change.canonicalEvent?.summary,
      sourceTitle: facts.title,
      sourceSummary: facts.summary,
      homeownerDetail,
    });
    const primaryDeepLink = defaultDeepLink({
      propertyId: input.propertyId,
      topic,
      canonicalActionId: change.canonicalActionId,
      canonicalEventId: change.canonicalEventId,
      sourceType: change.sourceType,
      sourceEntityId: change.sourceEntityId,
    });
    const sourceLineage = {
      propertyChangeId: change.id,
      sourceType: change.sourceType,
      sourceEntityId: change.sourceEntityId,
      sourceRevision: change.sourceRevision,
      sourceRevisionOrdinal: change.sourceRevisionOrdinal,
      changeType: change.changeType,
      detectedAt: change.detectedAt,
      occurredAt: change.occurredAt,
      confidence: change.confidence,
      materialityReasonCodes: change.materialityReasonCodes,
      briefingReasonCodes: change.briefingReasonCodes,
      source: sourceDetail
        ? {
            ...sourceDetail.source,
            url: sourceDetail.sourceUrl,
            publishedAt: sourceDetail.sourcePublishedAt,
            lastVerifiedAt: sourceDetail.lastVerifiedAt,
            lifecycleStatus: sourceDetail.lifecycleStatus,
            geographyType: sourceDetail.geographyType,
            geographyKey: sourceDetail.geographyKey,
          }
        : null,
      safetyTier: derivePropertyIntelligenceSafetyTier({
        possibleStructuralStress:
          topic === 'HAZARD'
          && change.materiality === IntelligenceAssessmentMateriality.URGENT,
        insuranceOrValueImplication: topic === 'HAZARD' || topic === 'LOCAL_CHANGE',
        verifiedHistoryRead: topic === 'HOME_HISTORY',
      }),
      display: homeownerDetail ? {
        actionLabel: homeownerDetail.actionLabel,
        semanticKey: homeownerDetail.semanticKey,
        sourceLabel: homeownerDetail.sourceLabel,
        verifiedAt: homeownerDetail.verifiedAt,
      } : {
        actionLabel: 'Review update',
        semanticKey: `CHANGE:${change.id}`,
        sourceLabel: 'Home record',
        verifiedAt: change.detectedAt,
      },
    };
    const shareEligible =
      topic === 'LOCAL_CHANGE'
      || (topic === 'HOME_HISTORY' && change.canonicalEventId != null);
    return {
      change,
      topic,
      copy,
      primaryDeepLink,
      sourceLineage,
      shareEligible,
    };
  }));

  if (existing) {
    const delivery = await prisma.$transaction(async (tx) => {
      for (const item of preparedItems) {
        await tx.homeBriefingItem.upsert({
          where: {
            deliveryId_propertyChangeId: {
              deliveryId: existing.id,
              propertyChangeId: item.change.id,
            },
          },
          create: {
            deliveryId: existing.id,
            propertyChangeId: item.change.id,
            canonicalActionId: item.change.canonicalActionId,
            canonicalEventId: item.change.canonicalEventId,
            topic: item.topic,
            title: item.copy.title,
            summary: item.copy.summary,
            materiality: item.change.materiality,
            primaryDeepLink: item.primaryDeepLink,
            sourceLineage: json(item.sourceLineage),
            shareEligible: item.shareEligible,
          },
          update: {
            canonicalActionId: item.change.canonicalActionId,
            canonicalEventId: item.change.canonicalEventId,
            topic: item.topic,
            title: item.copy.title,
            summary: item.copy.summary,
            materiality: item.change.materiality,
            primaryDeepLink: item.primaryDeepLink,
            sourceLineage: json(item.sourceLineage),
            shareEligible: item.shareEligible,
          },
        });
        await tx.propertyChangeAudienceState.upsert({
          where: {
            propertyChangeId_userId: {
              propertyChangeId: item.change.id,
              userId: input.userId,
            },
          },
          create: {
            propertyChangeId: item.change.id,
            userId: input.userId,
            firstDeliveredAt: now,
            lastDeliveredAt: now,
          },
          update: { lastDeliveredAt: now },
        });
      }
      const itemCount = await tx.homeBriefingItem.count({
        where: { deliveryId: existing.id },
      });
      await tx.homeBriefingDelivery.update({
        where: { id: existing.id },
        data: {
          itemCount,
          windowEnd: now,
          baselineVersion: HOME_BRIEFING_BASELINE_VERSION,
          sourceHealthSnapshot: json({
            comprehensive: false,
            capturedAt: now,
            sources: sourceCoverage,
            scopeLimitations: [
              'This briefing checks only the data sources currently connected to your home.',
              'A source that does not report its availability cannot be treated as fully checked.',
            ],
          }),
          quietReasonCodes: itemCount > 0 ? [] : quietReasonCodes,
        },
      });
      return tx.homeBriefingDelivery.findUniqueOrThrow({
        where: { id: existing.id },
        include: { items: { orderBy: [{ materiality: 'desc' }, { createdAt: 'desc' }] } },
      });
    });
    if (preparedItems.length > 0) {
      await notifyHomeBriefingDelivery({
        delivery,
        deliveryKey,
        propertyId: input.propertyId,
        userId: input.userId,
        cadence: preference.cadence,
        channels: preference.channels,
      });
    }
    return delivery;
  }

  let delivery;
  try {
    delivery = await prisma.$transaction(async (tx) => {
    const delivery = await tx.homeBriefingDelivery.create({
      data: {
        deliveryKey,
        propertyId: input.propertyId,
        userId: input.userId,
        cadence: preference.cadence,
        channels: preference.channels,
        windowStart: window.start,
        windowEnd: window.end,
        status: HomeBriefingDeliveryStatus.DELIVERED,
        itemCount: preparedItems.length,
        sourceHealthSnapshot: json({
          comprehensive: false,
          capturedAt: now,
          sources: sourceCoverage,
          scopeLimitations: [
            'This briefing checks only the data sources currently connected to your home.',
            'A source that does not report its availability cannot be treated as fully checked.',
          ],
        }),
        quietReasonCodes,
        baselineVersion: HOME_BRIEFING_BASELINE_VERSION,
        generatedAt: now,
        deliveredAt: now,
        items: {
          create: preparedItems.map((item) => ({
            propertyChangeId: item.change.id,
            canonicalActionId: item.change.canonicalActionId,
            canonicalEventId: item.change.canonicalEventId,
            topic: item.topic,
            title: item.copy.title,
            summary: item.copy.summary,
            materiality: item.change.materiality,
            primaryDeepLink: item.primaryDeepLink,
            sourceLineage: json(item.sourceLineage),
            shareEligible: item.shareEligible,
          })),
        },
      },
      include: { items: { orderBy: [{ materiality: 'desc' }, { createdAt: 'desc' }] } },
    });
    for (const item of preparedItems) {
      await tx.propertyChangeAudienceState.upsert({
        where: {
          propertyChangeId_userId: {
            propertyChangeId: item.change.id,
            userId: input.userId,
          },
        },
        create: {
          propertyChangeId: item.change.id,
          userId: input.userId,
          firstDeliveredAt: now,
          lastDeliveredAt: now,
        },
        update: { lastDeliveredAt: now },
      });
    }
      return delivery;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      const racedDelivery = await prisma.homeBriefingDelivery.findUnique({
        where: { deliveryKey },
        include: {
          items: {
            orderBy: [{ materiality: 'desc' }, { createdAt: 'desc' }],
          },
        },
      });
      if (racedDelivery) {
        await notifyHomeBriefingDelivery({
          delivery: racedDelivery,
          deliveryKey,
          propertyId: input.propertyId,
          userId: input.userId,
          cadence: preference.cadence,
          channels: preference.channels,
        });
        return racedDelivery;
      }
    }
    throw error;
  }
  await notifyHomeBriefingDelivery({
    delivery,
    deliveryKey,
    propertyId: input.propertyId,
    userId: input.userId,
    cadence: preference.cadence,
    channels: preference.channels,
  });
  return delivery;
}

export async function getHomeBriefingView(propertyId: string, userId: string) {
  const [preference, deliveries] = await Promise.all([
    preferenceFor(propertyId, userId),
    prisma.homeBriefingDelivery.findMany({
      where: { propertyId, userId },
      orderBy: { generatedAt: 'desc' },
      take: 24,
      include: {
        items: {
          orderBy: [{ materiality: 'desc' }, { createdAt: 'desc' }],
          include: {
            propertyChange: {
              include: {
                canonicalAction: {
                  select: { title: true, homeownerReason: true },
                },
                canonicalEvent: {
                  select: { title: true, summary: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);
  const rawCurrent = deliveries[0] ?? null;
  const presentedCurrentItems = rawCurrent
    ? await Promise.all(rawCurrent.items.map(async ({ propertyChange, ...item }) => {
        const detail = await homeownerDetailForChange(propertyChange);
        const lineage = jsonRecord(item.sourceLineage);
        return {
          ...item,
          title: detail?.title ?? item.title,
          summary: detail?.summary ?? item.summary,
          sourceLineage: {
            ...lineage,
            display: detail ? {
              actionLabel: detail.actionLabel,
              semanticKey: detail.semanticKey,
              sourceLabel: detail.sourceLabel,
              verifiedAt: detail.verifiedAt,
            } : lineage.display,
          },
        };
      }))
    : [];
  const groupedCurrentItems = new Map<string, (typeof presentedCurrentItems)[number] & { relatedUpdateCount?: number }>();
  for (const item of presentedCurrentItems) {
    const lineage = jsonRecord(item.sourceLineage as Prisma.JsonValue);
    const display = jsonRecord((lineage.display ?? {}) as Prisma.JsonValue);
    const semanticKey = typeof display.semanticKey === 'string'
      ? display.semanticKey
      : `CHANGE:${item.propertyChangeId}`;
    const existing = groupedCurrentItems.get(semanticKey);
    if (!existing) {
      groupedCurrentItems.set(semanticKey, { ...item, relatedUpdateCount: 1 });
    } else {
      existing.relatedUpdateCount = (existing.relatedUpdateCount ?? 1) + 1;
    }
  }
  const current = rawCurrent ? {
    ...rawCurrent,
    items: [...groupedCurrentItems.values()].map(({ relatedUpdateCount, ...item }) => ({
      ...item,
      sourceLineage: {
        ...jsonRecord(item.sourceLineage as Prisma.JsonValue),
        relatedUpdateCount,
      },
    })),
    itemCount: groupedCurrentItems.size,
  } : null;
  const archive = deliveries.slice(1).map((delivery) => ({
    ...delivery,
    items: delivery.items.map(({ propertyChange: _propertyChange, ...item }) => item),
  }));
  const unreadMaterialCount = current?.items.filter((item) =>
    !item.seenAt && !item.actedAt && !item.dismissedAt && !item.notUsefulAt).length ?? 0;
  return {
    preference,
    current,
    archive,
    unreadMaterialCount,
    archiveBoundary:
      'Review earlier home updates and the number of changes included in each one.',
    editorialBoundary:
      'Updates are written from verified home records and reviewed sources.',
  };
}

export async function markHomeBriefingOpened(input: {
  propertyId: string;
  userId: string;
  deliveryId: string;
}) {
  const now = new Date();
  const delivery = await prisma.homeBriefingDelivery.findFirst({
    where: {
      id: input.deliveryId,
      propertyId: input.propertyId,
      userId: input.userId,
    },
    select: {
      id: true,
      items: { select: { propertyChangeId: true } },
    },
  });
  if (!delivery) throw new APIError('Briefing delivery not found.', 404, 'BRIEFING_NOT_FOUND');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.homeBriefingDelivery.update({
      where: { id: delivery.id },
      data: {
        status: HomeBriefingDeliveryStatus.OPENED,
        openedAt: now,
        items: {
          updateMany: {
            where: { openedAt: null },
            data: { openedAt: now },
          },
        },
      },
    });
    if (delivery.items.length > 0) {
      await tx.propertyChangeAudienceState.updateMany({
        where: {
          userId: input.userId,
          propertyChangeId: {
            in: delivery.items.map((item) => item.propertyChangeId),
          },
        },
        data: { openedAt: now },
      });
    }
    return updated;
  });
}

export async function recordHomeBriefingItemOutcome(input: {
  propertyId: string;
  userId: string;
  itemId: string;
  outcome: 'OPENED' | 'SEEN' | 'ACTED' | 'DISMISSED' | 'NOT_USEFUL';
  note?: string;
}) {
  const item = await prisma.homeBriefingItem.findFirst({
    where: {
      id: input.itemId,
      delivery: {
        propertyId: input.propertyId,
        userId: input.userId,
      },
    },
    select: {
      id: true,
      propertyChangeId: true,
      canonicalActionId: true,
      canonicalEventId: true,
    },
  });
  if (!item) throw new APIError('Briefing item not found.', 404, 'BRIEFING_ITEM_NOT_FOUND');
  if (input.outcome === 'ACTED' && !item.canonicalActionId && !item.canonicalEventId) {
    throw new APIError(
      'This update does not have a separate next step to record.',
      422,
      'BRIEFING_ITEM_ACTION_UNAVAILABLE',
    );
  }
  const now = new Date();
  const timeField = {
    OPENED: 'openedAt',
    SEEN: 'seenAt',
    ACTED: 'actedAt',
    DISMISSED: 'dismissedAt',
    NOT_USEFUL: 'notUsefulAt',
  }[input.outcome] as 'openedAt' | 'seenAt' | 'actedAt' | 'dismissedAt' | 'notUsefulAt';
  return prisma.$transaction(async (tx) => {
    const updated = await tx.homeBriefingItem.update({
      where: { id: item.id },
      data: {
        [timeField]: now,
        ...(input.outcome === 'ACTED' ? { seenAt: now } : {}),
        outcomeNote: input.note,
      },
    });
    await tx.propertyChangeAudienceState.upsert({
      where: {
        propertyChangeId_userId: {
          propertyChangeId: item.propertyChangeId,
          userId: input.userId,
        },
      },
      create: {
        propertyChangeId: item.propertyChangeId,
        userId: input.userId,
        ...(input.outcome === 'OPENED' ? { openedAt: now } : {}),
        ...(input.outcome === 'SEEN' ? { seenAt: now } : {}),
        ...(input.outcome === 'ACTED' ? { actedAt: now, seenAt: now } : {}),
        ...(input.outcome === 'DISMISSED'
          ? { dismissedAt: now, dismissalReason: input.note }
          : {}),
        ...(input.outcome === 'NOT_USEFUL' ? { notUsefulAt: now } : {}),
      },
      update: {
        ...(input.outcome === 'OPENED' ? { openedAt: now } : {}),
        ...(input.outcome === 'SEEN' ? { seenAt: now } : {}),
        ...(input.outcome === 'ACTED' ? { actedAt: now, seenAt: now } : {}),
        ...(input.outcome === 'DISMISSED'
          ? { dismissedAt: now, dismissalReason: input.note }
          : {}),
        ...(input.outcome === 'NOT_USEFUL' ? { notUsefulAt: now } : {}),
      },
    });
    return updated;
  });
}

const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export async function createSelectedHomeBriefingShare(input: {
  propertyId: string;
  userId: string;
  deliveryId: string;
  itemIds: string[];
  expiresInDays: number;
}) {
  const uniqueItemIds = [...new Set(input.itemIds)];
  const delivery = await prisma.homeBriefingDelivery.findFirst({
    where: {
      id: input.deliveryId,
      propertyId: input.propertyId,
      userId: input.userId,
    },
    include: {
      items: {
        where: { id: { in: uniqueItemIds }, shareEligible: true },
        select: { id: true },
      },
    },
  });
  if (!delivery || delivery.items.length !== uniqueItemIds.length) {
    throw new APIError(
      'Select only share-eligible items from this briefing.',
      422,
      'BRIEFING_SHARE_SELECTION_INVALID',
    );
  }
  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const share = await prisma.homeBriefingShare.create({
    data: {
      deliveryId: input.deliveryId,
      propertyId: input.propertyId,
      createdByUserId: input.userId,
      tokenHash: tokenHash(rawToken),
      expiresAt,
      items: {
        create: uniqueItemIds.map((itemId) => ({ itemId })),
      },
    },
  });
  return {
    share,
    shareUrl: `/home-briefing/share/${rawToken}`,
    selectedItemCount: uniqueItemIds.length,
  };
}

export async function revokeHomeBriefingShare(input: {
  propertyId: string;
  userId: string;
  shareId: string;
}) {
  const share = await prisma.homeBriefingShare.findFirst({
    where: {
      id: input.shareId,
      propertyId: input.propertyId,
      createdByUserId: input.userId,
    },
  });
  if (!share) throw new APIError('Briefing share not found.', 404, 'BRIEFING_SHARE_NOT_FOUND');
  return prisma.homeBriefingShare.update({
    where: { id: share.id },
    data: {
      status: HomeBriefingShareStatus.REVOKED,
      revokedAt: new Date(),
    },
  });
}

export async function getSelectedHomeBriefingShare(rawToken: string) {
  const now = new Date();
  const share = await prisma.homeBriefingShare.findUnique({
    where: { tokenHash: tokenHash(rawToken) },
    include: {
      delivery: {
        select: {
          generatedAt: true,
          baselineVersion: true,
          property: { select: { name: true, city: true, state: true } },
        },
      },
      items: {
        include: {
          item: {
            select: {
              id: true,
              topic: true,
              title: true,
              summary: true,
              materiality: true,
              sourceLineage: true,
            },
          },
        },
      },
    },
  });
  if (
    !share
    || share.status !== HomeBriefingShareStatus.ACTIVE
    || share.expiresAt <= now
  ) {
    throw new APIError('Briefing share not found or expired.', 404, 'BRIEFING_SHARE_NOT_FOUND');
  }
  await prisma.homeBriefingShare.update({
    where: { id: share.id },
    data: {
      lastViewedAt: now,
      viewCount: { increment: 1 },
    },
  });
  return {
    property: share.delivery.property,
    generatedAt: share.delivery.generatedAt,
    baselineVersion: share.delivery.baselineVersion,
    items: share.items.map(({ item }) => item),
    sharingBoundary:
      'This contains only the items explicitly selected by the homeowner. It is not a property report, inspection, appraisal, or complete disclosure.',
    expiresAt: share.expiresAt,
  };
}

export async function generateDueHomeBriefings(propertyId?: string) {
  const [properties, configuredPreferences] = await Promise.all([
    prisma.property.findMany({
      where: propertyId ? { id: propertyId } : undefined,
      select: {
        id: true,
        homeownerProfile: { select: { userId: true } },
      },
    }),
    prisma.homeBriefingPreference.findMany({
      where: propertyId ? { propertyId } : undefined,
      select: { propertyId: true, userId: true, enabled: true },
    }),
  ]);
  const preferenceCandidates = new Map(
    configuredPreferences.map((preference) => [
      `${preference.propertyId}:${preference.userId}`,
      preference,
    ]),
  );
  for (const property of properties) {
    const userId = property.homeownerProfile?.userId;
    if (!userId) continue;
    const key = `${property.id}:${userId}`;
    if (!preferenceCandidates.has(key)) {
      const preference = await preferenceFor(property.id, userId);
      preferenceCandidates.set(key, {
        propertyId: property.id,
        userId,
        enabled: preference.enabled,
      });
    }
  }
  const preferences = [...preferenceCandidates.values()].filter((preference) =>
    preference.enabled);
  const results = [];
  for (const preference of preferences) {
    try {
      const delivery = await generateHomeBriefing(preference);
      results.push({
        propertyId: preference.propertyId,
        userId: preference.userId,
        deliveryId: delivery.id,
        itemCount: delivery.itemCount,
        status: 'DELIVERED',
      });
    } catch (error) {
      results.push({
        propertyId: preference.propertyId,
        userId: preference.userId,
        deliveryId: null,
        itemCount: 0,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown failure',
      });
    }
  }
  return results;
}

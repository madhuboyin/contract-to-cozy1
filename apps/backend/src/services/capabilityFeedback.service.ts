import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  CAPABILITY_CONTEXT_SOURCE_KINDS,
  CAPABILITY_SUGGESTION_SURFACES,
  canonicalCapabilityRegistry,
} from '../productFramework/capabilities';
import {
  executeHomeActionCommand,
  recordHomeActionOpened,
} from './homeActions.service';
import {
  recordRecommendationFeedback,
} from '../modules/personalization/application/recordRecommendationFeedback.usecase';
import {
  recordToolLifecycleEvents,
  type ToolLifecycleStage,
} from './analytics/toolLifecycle';

export const CAPABILITY_FEEDBACK_TYPES = [
  'OPENED',
  'DISMISSED',
  'NOT_RELEVANT',
  'SNOOZED',
  'COMPLETED',
] as const;

const FeedbackReasonCodeSchema = z.enum([
  'ALREADY_DONE',
  'TOO_EXPENSIVE',
  'NOT_APPLICABLE',
  'BAD_TIMING',
  'WRONG_PROFILE',
  'OTHER',
]);

export const CapabilityFeedbackInputSchema = z.object({
  eventId: z.string().uuid(),
  suggestionId: z.string().trim().min(1).max(700),
  capabilityId: z.string().trim().min(1).max(120),
  manifestVersion: z.number().int().positive(),
  registryVersion: z.string().trim().min(1).max(160),
  recommendationVersion: z.literal('capability-recommendation-v1'),
  contextVersion: z.string().trim().min(1).max(160),
  surface: z.enum(CAPABILITY_SUGGESTION_SURFACES),
  type: z.enum(CAPABILITY_FEEDBACK_TYPES),
  reasonCode: FeedbackReasonCodeSchema.nullable().optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
  readiness: z.enum(['READY', 'NEEDS_CONTEXT']),
  source: z.object({
    kind: z.enum(CAPABILITY_CONTEXT_SOURCE_KINDS),
    id: z.string().trim().min(1).max(160),
    actionId: z.string().trim().min(1).max(160).nullable(),
    journeyId: z.string().trim().min(1).max(160).nullable(),
    entityType: z.string().trim().min(1).max(160).nullable(),
    entityId: z.string().trim().min(1).max(160).nullable(),
    sourceVersion: z.string().trim().min(1).max(160).nullable().optional(),
    observedAt: z.string().datetime().nullable().optional(),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const capability = canonicalCapabilityRegistry.getById(value.capabilityId);
  if (!capability) {
    ctx.addIssue({
      code: 'custom',
      path: ['capabilityId'],
      message: 'Unknown capability.',
    });
  } else if (capability.version !== value.manifestVersion) {
    ctx.addIssue({
      code: 'custom',
      path: ['manifestVersion'],
      message: 'Capability manifest version is stale.',
    });
  }
  if (value.registryVersion !== canonicalCapabilityRegistry.version) {
    ctx.addIssue({
      code: 'custom',
      path: ['registryVersion'],
      message: 'Capability registry version is stale.',
    });
  }

  const expectedSuggestionId = [
    value.capabilityId,
    value.source.kind,
    value.source.id,
    value.contextVersion,
  ].join(':');
  if (value.suggestionId !== expectedSuggestionId) {
    ctx.addIssue({
      code: 'custom',
      path: ['suggestionId'],
      message: 'Suggestion identity does not match its source lineage.',
    });
  }

  if (value.type === 'SNOOZED') {
    const snoozedUntil = Date.parse(value.snoozedUntil ?? '');
    const max = Date.now() + 365 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(snoozedUntil) || snoozedUntil <= Date.now() || snoozedUntil > max) {
      ctx.addIssue({
        code: 'custom',
        path: ['snoozedUntil'],
        message: 'Snooze expiry must be in the future and within 365 days.',
      });
    }
  } else if (value.snoozedUntil) {
    ctx.addIssue({
      code: 'custom',
      path: ['snoozedUntil'],
      message: 'Snooze expiry is valid only for SNOOZED feedback.',
    });
  }
});

export type CapabilityFeedbackInput = z.infer<typeof CapabilityFeedbackInputSchema>;
type AuthorizedCapabilityFeedbackInput = CapabilityFeedbackInput & {
  propertyId: string;
  userId: string;
};

export type CapabilityFeedbackResult = {
  status: 'RECORDED' | 'DUPLICATE';
  eventId: string;
  type: CapabilityFeedbackInput['type'];
  recordedAt: string;
};

type IdempotencyScope = {
  duplicateRecordedAt: Date | null;
  run<T>(work: () => Promise<T>): Promise<T>;
};

export type CapabilityFeedbackDependencies = {
  withIdempotencyLock(
    eventId: string,
    work: (scope: IdempotencyScope) => Promise<CapabilityFeedbackResult>,
  ): Promise<CapabilityFeedbackResult>;
  recordHomeActionOpened: typeof recordHomeActionOpened;
  executeHomeActionCommand: typeof executeHomeActionCommand;
  recordRecommendationFeedback: typeof recordRecommendationFeedback;
  recordLifecycle: typeof recordToolLifecycleEvents;
  now(): Date;
};

function feedbackStage(type: CapabilityFeedbackInput['type']): ToolLifecycleStage {
  switch (type) {
    case 'OPENED': return 'CLICKED';
    case 'DISMISSED': return 'DISMISSED';
    case 'NOT_RELEVANT': return 'NOT_RELEVANT';
    case 'SNOOZED': return 'SNOOZED';
    case 'COMPLETED': return 'COMPLETED';
  }
}

function homeActionCommand(input: CapabilityFeedbackInput) {
  const base = {
    reason: input.reasonCode ?? `Capability suggestion ${input.type.toLowerCase()}`,
    consequenceAcknowledged: true,
  };
  switch (input.type) {
    case 'DISMISSED': return { ...base, command: 'DISMISS' as const };
    case 'NOT_RELEVANT': return { ...base, command: 'NOT_RELEVANT' as const };
    case 'SNOOZED': return {
      ...base,
      command: 'SNOOZE' as const,
      nextTriggerAt: input.snoozedUntil,
    };
    case 'COMPLETED': return { ...base, command: 'COMPLETE' as const };
    case 'OPENED': return null;
  }
}

function personalizationFeedbackType(type: CapabilityFeedbackInput['type']) {
  return type === 'OPENED' ? 'VIEWED' : type;
}

async function applyCanonicalLifecycle(
  input: AuthorizedCapabilityFeedbackInput,
  deps: CapabilityFeedbackDependencies,
) {
  if (input.source.kind === 'HOME_ACTION' && input.source.actionId) {
    if (input.type === 'OPENED') {
      await deps.recordHomeActionOpened(
        input.propertyId,
        input.source.actionId,
        input.userId,
      );
      return;
    }
    const command = homeActionCommand(input);
    if (command) {
      await deps.executeHomeActionCommand(
        input.propertyId,
        input.source.actionId,
        input.userId,
        command,
      );
    }
    return;
  }

  if (input.source.kind === 'PERSONALIZATION') {
    const result = await deps.recordRecommendationFeedback({
      recommendationId: input.source.id,
      eventId: input.eventId,
      type: personalizationFeedbackType(input.type),
      explicit: input.type !== 'OPENED',
      reasonCode: input.reasonCode ?? null,
      reportedByUserId: input.userId,
      surface: input.surface === 'HOME' ? 'HOME' : 'TOOL',
      targetType: 'CAPABILITY_SUGGESTION',
      targetId: input.suggestionId,
      contextVersion: input.contextVersion,
      capabilityId: input.capabilityId,
      capabilityVersion: String(input.manifestVersion),
    });
    if (result.status === 'RECOMMENDATION_NOT_FOUND') {
      throw new Error('Personalization recommendation was not found.');
    }
  }
}

const defaultDependencies: CapabilityFeedbackDependencies = {
  withIdempotencyLock: (eventId, work) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      const existing = await tx.productAnalyticsEvent.findFirst({
        where: {
          moduleKey: 'tool_discovery',
          sessionKey: eventId,
        },
        select: { occurredAt: true },
      });
      return work({
        duplicateRecordedAt: existing?.occurredAt ?? null,
        run: async (operation) => operation(),
      });
    }, { timeout: 15_000 }),
  recordHomeActionOpened,
  executeHomeActionCommand,
  recordRecommendationFeedback,
  recordLifecycle: recordToolLifecycleEvents,
  now: () => new Date(),
};

/**
 * Records one canonical feedback decision. The advisory lock serializes the
 * same client event ID without adding materialized recommendation state.
 */
export async function recordCapabilityFeedback(
  rawInput: unknown,
  dependencies: CapabilityFeedbackDependencies = defaultDependencies,
): Promise<CapabilityFeedbackResult> {
  const rawRecord = z.record(z.string(), z.unknown()).parse(rawInput);
  const {
    propertyId,
    userId,
    ...feedbackPayload
  } = rawRecord;
  const feedback = CapabilityFeedbackInputSchema.parse(feedbackPayload);
  const authorization = z.object({
    propertyId: z.string().uuid(),
    userId: z.string().uuid(),
  }).parse({ propertyId, userId });
  const input: AuthorizedCapabilityFeedbackInput = {
    ...feedback,
    ...authorization,
  };

  return dependencies.withIdempotencyLock(input.eventId, async (scope) => {
    if (scope.duplicateRecordedAt) {
      return {
        status: 'DUPLICATE',
        eventId: input.eventId,
        type: input.type,
        recordedAt: scope.duplicateRecordedAt.toISOString(),
      };
    }

    return scope.run(async () => {
      await applyCanonicalLifecycle(input, dependencies);
      const recordedAt = dependencies.now();
      await dependencies.recordLifecycle({
        userId: input.userId,
        propertyId: input.propertyId,
        events: [{
          toolId: input.capabilityId,
          stage: feedbackStage(input.type),
          surface: input.surface.toLowerCase(),
          manifestVersion: input.manifestVersion,
          registryVersion: input.registryVersion,
          recommendationReason: input.reasonCode ?? null,
          reasonCode: input.reasonCode ?? null,
          recommendationVersion: input.recommendationVersion,
          contextVersion: input.contextVersion,
          sourceKind: input.source.kind,
          sourceId: input.source.id,
          sourceActionId: input.source.actionId,
          sourceEntityType: input.source.entityType,
          sourceEntityId: input.source.entityId,
          journeyId: input.source.journeyId,
          readiness: input.readiness,
          sessionKey: input.eventId,
          metadata: {
            feedbackEventId: input.eventId,
            feedbackType: input.type,
            suggestionId: input.suggestionId,
            manifestVersion: input.manifestVersion,
            registryVersion: input.registryVersion,
            readiness: input.readiness,
            sourceVersion: input.source.sourceVersion ?? null,
            sourceObservedAt: input.source.observedAt ?? null,
            reasonCode: input.reasonCode ?? null,
            snoozedUntil: input.snoozedUntil ?? null,
          },
        }],
      });
      return {
        status: 'RECORDED',
        eventId: input.eventId,
        type: input.type,
        recordedAt: recordedAt.toISOString(),
      };
    });
  });
}

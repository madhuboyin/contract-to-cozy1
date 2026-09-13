import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  radarNotificationDeliveryService,
  type RadarNotificationMaterializationInput,
  type RadarNotificationMaterializationResult,
} from './radarNotificationDelivery.service';

// Ask Cozy Stage 3, Phase 5 (FRD §29's explicit requirement, restated at
// §31 item — "Home Event Radar migrates its direct Notification write onto
// this same DomainEvent rail (Stage 2's explicit decision)"; Stage 2
// §20/§21: "Migrate its notification path to publish a DomainEvent at the
// decision/materialize boundary instead of writing Notification directly
// — bringing it onto the same standard rail as every other producer.").
//
// Before this module existed, `RadarNotificationDecisionService.evaluateMatch`
// called `RadarNotificationDeliveryService.materialize()` directly and
// synchronously, in-process, as part of the same call that runs the radar
// matcher job — the one proactive producer in this codebase that bypassed
// the async, durable, retry/dead-letter-backed DomainEvent outbox every
// other producer (refinance, maintenance) already uses. This module is the
// migration: the decision service now emits a `RADAR_NOTIFICATION_MATERIALIZE_REQUESTED`
// event instead of calling `materialize()` itself, and this file's own
// consumer (registered in `processDomainEvents.job.ts`, mirroring this
// directory's sibling `radarPropertyReconciliation.service.ts`) re-hydrates
// the full `RadarNotificationMaterializationInput` from the durable
// `decisionId` the payload carries and calls `materialize()` there instead.
//
// The payload is a bare id reference, not a copy of decision/match/event
// state, matching `radarPropertyReconciliation.service.ts`'s own
// established convention for this reason: a DomainEvent's payload must
// stay valid to re-process even if processing is retried well after the
// state it names has moved on, and copying mutable snapshot data into the
// payload would let a retry act on stale data instead of current state.
export const RADAR_NOTIFICATION_MATERIALIZE_PAYLOAD_VERSION = 1;

export const radarNotificationMaterializePayloadSchema = z.object({
  payloadVersion: z.literal(RADAR_NOTIFICATION_MATERIALIZE_PAYLOAD_VERSION),
  decisionId: z.string().trim().min(1),
  propertyId: z.string().trim().min(1),
});

export type RadarNotificationMaterializePayload = z.infer<
  typeof radarNotificationMaterializePayloadSchema
>;

type DomainEventWriter = Pick<Prisma.TransactionClient, 'domainEvent'>;

function materializeIdempotencyKey(decisionId: string): string {
  return `radar-notification-materialize:${decisionId}`;
}

/**
 * Called from the decision boundary (`radarNotificationDecision.service.ts`)
 * in place of a direct `materialize()` call. Idempotent on `decisionId` --
 * a decision row is itself already deduped per match+revision+user
 * (`@@unique([propertyRadarMatchId, radarEventRevisionId, userId])`), so
 * requesting materialization twice for the same decision converges on one
 * outbox row exactly like every other emitter in this codebase that upserts
 * on a deterministic idempotency key.
 */
export async function requestRadarNotificationMaterialization(
  input: { decisionId: string; propertyId: string },
  client: DomainEventWriter = prisma,
) {
  const payload = radarNotificationMaterializePayloadSchema.parse({
    payloadVersion: RADAR_NOTIFICATION_MATERIALIZE_PAYLOAD_VERSION,
    ...input,
  });
  const idempotencyKey = materializeIdempotencyKey(payload.decisionId);
  return client.domainEvent.upsert({
    where: { idempotencyKey },
    create: {
      type: 'RADAR_NOTIFICATION_MATERIALIZE_REQUESTED' as any,
      status: 'PENDING',
      propertyId: payload.propertyId,
      idempotencyKey,
      payload,
    },
    update: {},
  });
}

type MaterializeConsumerDatabase = {
  propertyRadarNotificationDecision: {
    findUnique(args: unknown): Promise<any>;
  };
};

export type RadarNotificationMaterializeConsumerOutcome =
  | RadarNotificationMaterializationResult
  | { outcome: 'decision_missing' };

/**
 * The DomainEvent consumer. Re-hydrates the exact shape
 * `RadarNotificationDeliveryService.materialize()` already expected when it
 * was called synchronously, from just the decision's own id plus its
 * already-established relations (`propertyRadarMatch` → `radarEvent` →
 * `sourceDefinition`) -- no new schema surface needed beyond the
 * DomainEventType enum member itself, since every field this reconstructs
 * already existed and was already being read at the old synchronous call
 * site (`radarNotificationDecision.service.ts`'s own `input.match`/
 * `input.event` it used to pass straight through).
 *
 * `decision_missing` is a real, benign outcome (not an error): the decision
 * row could theoretically be deleted between request and processing (e.g.
 * cascading property deletion) -- processing then has nothing to do, and
 * throwing would just dead-letter an event for state that no longer exists.
 */
export async function processRadarNotificationMaterializeEvent(
  event: { id: string; propertyId?: string | null; payload: unknown },
  deps: {
    db?: MaterializeConsumerDatabase;
    deliveryService?: {
      materialize(input: RadarNotificationMaterializationInput): Promise<RadarNotificationMaterializationResult>;
    };
  } = {},
): Promise<RadarNotificationMaterializeConsumerOutcome> {
  const db = deps.db ?? (prisma as unknown as MaterializeConsumerDatabase);
  const deliveryService = deps.deliveryService ?? radarNotificationDeliveryService;
  const payload = radarNotificationMaterializePayloadSchema.parse(event.payload);
  if (event.propertyId && event.propertyId !== payload.propertyId) {
    throw new Error('Radar notification materialize event scope does not match its payload');
  }

  const decision = await db.propertyRadarNotificationDecision.findUnique({
    where: { id: payload.decisionId },
    include: {
      propertyRadarMatch: {
        include: {
          radarEvent: {
            include: { sourceDefinition: { select: { key: true, family: true } } },
          },
        },
      },
    },
  });
  if (!decision) return { outcome: 'decision_missing' };

  const match = decision.propertyRadarMatch;
  const radarEvent = match.radarEvent;
  const materializationInput: RadarNotificationMaterializationInput = {
    propertyId: decision.propertyId,
    decision: {
      id: decision.id,
      userId: decision.userId,
      notificationId: decision.notificationId,
      outcome: decision.outcome,
      reasonCodes: decision.reasonCodes,
      eligibleChannels: decision.eligibleChannels,
      deferredUntil: decision.deferredUntil,
      criticalOverrideApplied: decision.criticalOverrideApplied,
      policyVersion: decision.policyVersion,
      evaluatedAt: decision.evaluatedAt,
      evidenceJson: decision.evidenceJson,
    },
    match: {
      id: match.id,
      impactLevel: match.impactLevel,
      impactSummary: match.impactSummary,
      confidence: match.confidence,
      lifecycleStatus: match.lifecycleStatus,
    },
    event: {
      id: radarEvent.id,
      title: radarEvent.title,
      summary: radarEvent.summary,
      eventType: radarEvent.eventType,
      severity: radarEvent.severity,
      startAt: radarEvent.startAt,
      endAt: radarEvent.endAt,
      sourceDefinition: radarEvent.sourceDefinition
        ? { key: radarEvent.sourceDefinition.key, family: radarEvent.sourceDefinition.family }
        : null,
    },
    revision: { id: decision.radarEventRevisionId },
  };
  return deliveryService.materialize(materializationInput);
}

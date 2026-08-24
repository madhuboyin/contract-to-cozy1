// Home Intelligence Functional Completeness FRD HI-ATT-010 — every
// successfully created Booking is linked to exactly one canonical
// OperationalWorkItem, atomically, whether or not it originated from a Home
// Action. Origin detection is explicit-lineage-first, then exact domain
// provenance, never heuristic matching on subject/scope fields
// (inventoryItemId, provider, service, category, executionScopeKey, and
// free-text insight fields describe *what* the booking is about, not which
// obligation it fulfills).
import type { OperationalWorkItem, OperationalWorkItemState, OperationalWorkSourceType, Prisma } from '@prisma/client';
import type { WorkItemDb } from '../modules/homeOperations/infrastructure/workItemRepository';
import {
  findWorkItemById,
  findAllWorkItemsLinkedToExecution,
  linkWorkExecution,
  recordWorkEvent,
} from '../modules/homeOperations/infrastructure/workItemRepository';
import type { WorkItemLifecycleEventCallback } from '../modules/homeOperations/infrastructure/workItemChangeEmitter';
import { resolveAndUpsertWorkItem } from '../modules/homeOperations/application/resolveWorkItem.usecase';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import { resolveGuidanceJourneyWorkKey } from '../modules/homeOperations/adapters/homeActionWorkItem.adapter';
import type { ProposedWorkItem } from '../modules/homeOperations/domain/sourceAdapter';
import { recordOperationalWorkOutcome } from './decisionPlatform/outcomeObservationService';

export type OriginResolutionMethod =
  | 'EXPLICIT_LINEAGE'
  | 'GUIDANCE_JOURNEY'
  | 'MAINTENANCE_SOURCE'
  | 'PRICE_FINALIZATION_GUIDANCE'
  | 'STANDALONE';

export interface OriginResolution {
  workItem: OperationalWorkItem | null;
  method: OriginResolutionMethod;
  matchedSourceType?: OperationalWorkSourceType;
  matchedSourceEntityId?: string;
  suppliedOriginWorkItemId?: string;
}

export interface ResolveOriginatingWorkItemInput {
  propertyId: string;
  originWorkItemId?: string | null;
  guidanceJourneyId?: string | null;
  maintenancePredictionId?: string | null;
  priceFinalizationId?: string | null;
  inventoryItemId?: string | null;
  guidanceStepKey?: string | null;
}

const BOOKING_COMPATIBLE_WORK_ITEM_STATES = new Set<OperationalWorkItemState>([
  'CANDIDATE',
  'ACCEPTED',
  'SCHEDULED',
  'REOPENED',
  'FOLLOW_UP_DUE',
]);

export class BookingOriginConflictError extends Error {
  readonly statusCode = 409;
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'BookingOriginConflictError';
    this.details = details;
  }
}

function assertBookingCompatibleWorkItem(
  candidate: OperationalWorkItem | null,
  input: ResolveOriginatingWorkItemInput,
): asserts candidate is OperationalWorkItem {
  if (!candidate) {
    throw new BookingOriginConflictError('The originating work item no longer exists.', {
      originWorkItemId: input.originWorkItemId,
      reason: 'ORIGIN_NOT_FOUND',
    });
  }
  if (candidate.propertyId !== input.propertyId) {
    throw new BookingOriginConflictError('The originating work item belongs to a different property.', {
      originWorkItemId: candidate.id,
      reason: 'PROPERTY_MISMATCH',
    });
  }
  if (!BOOKING_COMPATIBLE_WORK_ITEM_STATES.has(candidate.state)) {
    throw new BookingOriginConflictError('The originating work item is not in a booking-compatible state.', {
      originWorkItemId: candidate.id,
      state: candidate.state,
      reason: 'LIFECYCLE_INCOMPATIBLE',
    });
  }
  if (
    input.inventoryItemId &&
    candidate.subjectType === 'INVENTORY_ITEM' &&
    candidate.subjectId !== input.inventoryItemId
  ) {
    throw new BookingOriginConflictError('The originating work item belongs to a different home asset.', {
      originWorkItemId: candidate.id,
      expectedInventoryItemId: candidate.subjectId,
      suppliedInventoryItemId: input.inventoryItemId,
      reason: 'SUBJECT_MISMATCH',
    });
  }
}

/**
 * Resolution order (HI-ATT-010): explicit lineage first, exact domain
 * provenance second, standalone otherwise. Never falls back to matching on
 * inventoryItemId/provider/service/category/executionScopeKey/insight
 * fields alone — those describe subject/scope, not obligation identity. A
 * An invalid explicit `originWorkItemId` is a command conflict and is never
 * silently replaced with a different obligation or a standalone item.
 */
// A work item is "already spoken for" only by an ACTIVE (non-CANCELLED)
// Booking execution — a cancelled Booking's execution row is intentionally
// retained as history, not evidence the obligation is currently fulfilled.
// Applied identically to both lineage-resolution paths below: explicit
// lineage previously rejected reuse for ANY existing execution (even a
// cancelled one, wrongly blocking a legitimate replacement booking);
// guidance-derived resolution previously ran no such check at all (risking
// silently double-linking a work item that already has an active booking).
async function hasActiveBookingExecution(tx: WorkItemDb, workItemId: string): Promise<boolean> {
  const executions = await tx.operationalWorkExecution.findMany({
    where: { workItemId, executionType: 'BOOKING' },
    select: { executionEntityId: true },
  });
  if (executions.length === 0) return false;
  const activeBookings = await tx.booking.findMany({
    where: { id: { in: executions.map((e) => e.executionEntityId) }, status: { not: 'CANCELLED' } },
    select: { id: true },
  });
  return activeBookings.length > 0;
}

async function lockWorkItemForBooking(tx: WorkItemDb, workItemId: string): Promise<void> {
  // Serialize competing booking requests for the same obligation. Locking
  // only the newly-created Booking row cannot prevent two different
  // Bookings from both observing the work item as unoccupied.
  await tx.$queryRaw`SELECT id FROM operational_work_items WHERE id = ${workItemId} FOR UPDATE`;
}

export async function resolveOriginatingWorkItem(
  tx: WorkItemDb,
  input: ResolveOriginatingWorkItemInput,
): Promise<OriginResolution> {
  if (input.originWorkItemId) {
    const initialCandidate = await findWorkItemById(input.originWorkItemId, tx);
    assertBookingCompatibleWorkItem(initialCandidate, input);
    await lockWorkItemForBooking(tx, initialCandidate.id);
    const candidate = await findWorkItemById(input.originWorkItemId, tx);
    assertBookingCompatibleWorkItem(candidate, input);
    if (await hasActiveBookingExecution(tx, candidate.id)) {
      throw new BookingOriginConflictError('The originating work item already has an active booking.', {
        originWorkItemId: candidate.id,
        reason: 'ACTIVE_BOOKING_EXISTS',
      });
    }
    return { workItem: candidate, method: 'EXPLICIT_LINEAGE', suppliedOriginWorkItemId: input.originWorkItemId };
  }

  if (input.guidanceJourneyId) {
    const journey = await tx.guidanceJourney.findUnique({
      where: { id: input.guidanceJourneyId },
      select: { id: true, propertyId: true, journeyTypeKey: true, inventoryItemId: true, status: true },
    });
    if (journey && journey.propertyId === input.propertyId) {
      if (input.guidanceStepKey) {
        const step = await tx.guidanceJourneyStep.findFirst({
          where: { journeyId: journey.id, stepKey: input.guidanceStepKey },
          select: { id: true },
        });
        if (!step) {
          throw new BookingOriginConflictError('The supplied guidance step does not belong to the originating journey.', {
            guidanceJourneyId: journey.id,
            guidanceStepKey: input.guidanceStepKey,
            reason: 'GUIDANCE_STEP_MISMATCH',
          });
        }
      }
      const workKey = resolveGuidanceJourneyWorkKey({
        propertyId: input.propertyId,
        journeyId: journey.id,
        journeyTypeKey: journey.journeyTypeKey,
        inventoryItemId: journey.inventoryItemId,
      });
      const matches = await tx.operationalWorkItem.findMany({
        where: { propertyId: input.propertyId, workKey, state: { in: [...BOOKING_COMPATIBLE_WORK_ITEM_STATES] } },
      });
      let matchedWorkItem = matches.length === 1 ? matches[0] : null;
      if (matchedWorkItem) {
        await lockWorkItemForBooking(tx, matchedWorkItem.id);
        matchedWorkItem = await findWorkItemById(matchedWorkItem.id, tx);
      }
      if (
        matchedWorkItem &&
        BOOKING_COMPATIBLE_WORK_ITEM_STATES.has(matchedWorkItem.state) &&
        !(await hasActiveBookingExecution(tx, matchedWorkItem.id))
      ) {
        return {
          workItem: matchedWorkItem,
          method: 'GUIDANCE_JOURNEY',
          matchedSourceType: 'GUIDANCE',
          matchedSourceEntityId: journey.id,
        };
      }
    }
  }

  if (input.maintenancePredictionId) {
    // No code path today ever sets a Home Action's source.entityId to a
    // MaintenancePrediction.id, so this correctly finds nothing for every
    // maintenance-prediction booking today — implemented for the general
    // rule's forward compatibility, not dead code (HI-ATT-010 explicitly
    // requires recognizing lineage when it exists, not just when it's
    // guidance-journey-derived).
    const activeSource = await tx.operationalWorkSource.findFirst({
      where: { sourceType: 'MAINTENANCE', sourceEntityId: input.maintenancePredictionId, active: true },
      include: { workItem: true },
    });
    if (
      activeSource?.workItem &&
      activeSource.workItem.propertyId === input.propertyId &&
      BOOKING_COMPATIBLE_WORK_ITEM_STATES.has(activeSource.workItem.state)
    ) {
      await lockWorkItemForBooking(tx, activeSource.workItem.id);
      const lockedWorkItem = await findWorkItemById(activeSource.workItem.id, tx);
      if (
        lockedWorkItem &&
        BOOKING_COMPATIBLE_WORK_ITEM_STATES.has(lockedWorkItem.state) &&
        !(await hasActiveBookingExecution(tx, lockedWorkItem.id))
      ) {
        return {
          workItem: lockedWorkItem,
          method: 'MAINTENANCE_SOURCE',
          matchedSourceType: 'MAINTENANCE',
          matchedSourceEntityId: input.maintenancePredictionId,
        };
      }
    }
  }

  if (input.priceFinalizationId) {
    const finalization = await tx.priceFinalization.findUnique({
      where: { id: input.priceFinalizationId },
      select: { id: true, propertyId: true, guidanceJourneyId: true },
    });
    if (finalization && finalization.propertyId === input.propertyId && finalization.guidanceJourneyId) {
      return resolveOriginatingWorkItem(tx, {
        propertyId: input.propertyId,
        guidanceJourneyId: finalization.guidanceJourneyId,
        guidanceStepKey: input.guidanceStepKey,
        inventoryItemId: input.inventoryItemId,
      });
    }
  }

  return { workItem: null, method: 'STANDALONE' };
}

interface ReconciliationBooking {
  id: string;
  propertyId: string;
  inventoryItemId: string | null;
  updatedAt: Date;
}

/**
 * Shared, exclusivity-enforcing linking helper. The OperationalWorkExecution
 * unique index is [workItemId, executionType, executionEntityId] — it does
 * NOT prevent the same Booking from linking to two *different* work items,
 * so exclusivity must be enforced here, at the application level.
 */
async function linkBookingExecution(
  tx: WorkItemDb,
  booking: ReconciliationBooking,
  workItemId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${booking.id} FOR UPDATE`;

  const existingLinks = await tx.operationalWorkExecution.findMany({
    where: { executionType: 'BOOKING', executionEntityId: booking.id },
  });
  const conflicting = existingLinks.find((row) => row.workItemId !== workItemId);
  if (conflicting) {
    throw new Error(
      `Booking ${booking.id} is already linked to OperationalWorkItem ${conflicting.workItemId}; cannot also link to ${workItemId}.`,
    );
  }

  await linkWorkExecution({
    workItemId,
    executionType: 'BOOKING',
    executionEntityId: booking.id,
    role: 'PRIMARY',
  }, tx);
}

export async function reconcileBookingCreated(
  tx: WorkItemDb,
  booking: ReconciliationBooking,
  resolution: OriginResolution,
  onLifecycleEvent: WorkItemLifecycleEventCallback,
): Promise<OperationalWorkItem> {
  let workItem: OperationalWorkItem;

  if (resolution.workItem) {
    workItem = resolution.workItem;
    if (workItem.state === 'CANDIDATE') {
      workItem = await transitionWorkItem({
        workItemId: workItem.id,
        to: 'ACCEPTED',
        actorType: 'SYSTEM',
        idempotencyKey: `booking-accepted:${booking.id}`,
        payload: { bookingId: booking.id, reason: 'booking_created_against_candidate' },
      }, tx, onLifecycleEvent);
    }
    await linkBookingExecution(tx, booking, workItem.id);
  } else {
    const subject = booking.inventoryItemId
      ? { type: 'INVENTORY_ITEM' as const, id: booking.inventoryItemId }
      : { type: 'PROPERTY' as const, id: booking.propertyId };
    const proposal: ProposedWorkItem = {
      propertyId: booking.propertyId,
      subject,
      obligationType: 'SERVICE_EXECUTION',
      // The standalone occurrence identity HI-ATT-010 requires: unrelated
      // bookings with matching provider/service/category must never merge
      // into one work item just because Booking.buildExecutionScope()'s own
      // dedup key happens to match.
      occurrence: { obligationSlug: `booking-${booking.id}` },
      title: 'Booked service',
      homeownerReason: 'You booked a provider for this service.',
      expectedOutcome: 'The booked service is completed.',
      priority: 'PLAN',
      safetyTier: 'LOW_CONSEQUENCE',
      source: {
        sourceType: 'BOOKING',
        sourceEntityId: booking.id,
        sourceVersion: booking.updatedAt.toISOString(),
        sourceRole: 'TRIGGER',
      },
    };
    workItem = await resolveAndUpsertWorkItem(proposal, tx, onLifecycleEvent);
    workItem = await transitionWorkItem({
      workItemId: workItem.id,
      to: 'ACCEPTED',
      actorType: 'SYSTEM',
      idempotencyKey: `booking-accepted:${booking.id}`,
      payload: { bookingId: booking.id, reason: 'standalone_booking' },
    }, tx, onLifecycleEvent);
    await linkBookingExecution(tx, booking, workItem.id);
  }

  // Durable audit record — read back at cancellation time only for logging
  // /explanation, never for the survives-or-closes decision (that reads
  // active OperationalWorkSource rows instead; obligationType/this event
  // are both classification, not proof).
  await recordWorkEvent({
    workItemId: workItem.id,
    eventType: 'EXECUTION_LINKED',
    actorType: 'SYSTEM',
    idempotencyKey: `booking-linked:${booking.id}`,
    payload: {
      bookingId: booking.id,
      originResolution: resolution.method,
      suppliedOriginWorkItemId: resolution.suppliedOriginWorkItemId ?? null,
      matchedSourceType: resolution.matchedSourceType ?? null,
      matchedSourceEntityId: resolution.matchedSourceEntityId ?? null,
      standaloneCreated: resolution.workItem === null,
    },
  }, tx);

  return workItem;
}

/**
 * Finds the exactly-one work item a Booking's execution link points at.
 * Zero or multiple results is a reconciliation conflict (the exclusivity
 * enforcement in linkBookingExecution was bypassed somewhere) — surfaced as
 * an error, never silently resolved by picking one.
 */
async function requireSingleLinkedWorkItem(tx: WorkItemDb, bookingId: string): Promise<OperationalWorkItem> {
  const links = await findAllWorkItemsLinkedToExecution('BOOKING', bookingId, tx);
  if (links.length === 0) {
    throw new Error(`No OperationalWorkItem is linked to Booking ${bookingId}. Reconciliation conflict — requires investigation.`);
  }
  if (links.length > 1) {
    throw new Error(`Booking ${bookingId} is linked to ${links.length} OperationalWorkItems; expected exactly one. Reconciliation conflict — requires investigation.`);
  }
  return (links[0] as unknown as { workItem: OperationalWorkItem }).workItem;
}

/**
 * Recovers the origin-resolution audit trail recorded at link time — the
 * EXECUTION_CANCELLED payload includes it per HI-ATT-010, but it is never
 * used for the survives-or-closes decision itself (that's the active-
 * independent-source check below); this is explanation only.
 */
async function findExecutionLinkedOriginResolution(tx: WorkItemDb, workItemId: string, bookingId: string): Promise<Prisma.InputJsonValue | null> {
  const event = await tx.operationalWorkEvent.findUnique({
    where: { workItemId_idempotencyKey: { workItemId, idempotencyKey: `booking-linked:${bookingId}` } },
  });
  return ((event?.payload as { originResolution?: Prisma.InputJsonValue } | null)?.originResolution) ?? null;
}

export async function reconcileBookingCancelled(
  tx: WorkItemDb,
  booking: { id: string },
  cancellation: { reason: string; actorUserId: string },
  onLifecycleEvent: WorkItemLifecycleEventCallback,
): Promise<void> {
  const workItem = await requireSingleLinkedWorkItem(tx, booking.id);
  const originResolution = await findExecutionLinkedOriginResolution(tx, workItem.id, booking.id);

  // Standalone-vs-reused is decided here, not by obligationType (a
  // classification, not durable proof of linkage provenance) — whether any
  // active non-Booking source still supports this obligation. A standalone
  // item's only-ever source was the Booking itself, so this always
  // evaluates false for it, closing correctly with no separate branch.
  const activeIndependentSource = await tx.operationalWorkSource.findFirst({
    where: { workItemId: workItem.id, active: true, sourceType: { not: 'BOOKING' } },
  });

  const priorState = workItem.state;
  const basePayload = {
    bookingId: booking.id,
    priorState,
    originResolution,
    cancellationReason: cancellation.reason,
    cancellationActorUserId: cancellation.actorUserId,
    independentObligationRemained: Boolean(activeIndependentSource),
  };

  if (activeIndependentSource) {
    if (priorState === 'SCHEDULED' || priorState === 'IN_PROGRESS') {
      await transitionWorkItem({
        workItemId: workItem.id,
        to: 'ACCEPTED',
        actorType: 'SYSTEM',
        actorUserId: cancellation.actorUserId,
        idempotencyKey: `booking-cancelled-rollback:${booking.id}`,
        eventTypeOverride: 'EXECUTION_CANCELLED',
        payload: basePayload,
      }, tx, onLifecycleEvent);
    } else {
      // The work item survives (an independent obligation remains) but was
      // never SCHEDULED/IN_PROGRESS at cancellation time (e.g. still
      // ACCEPTED) — no state transition to make, but HI-ATT-010's promise
      // that cancellation always records an EXECUTION_CANCELLED event still
      // applies. transitionWorkItem only fires on an actual transition, so
      // write the event directly rather than force a same-state transition
      // through applyTransition (which may not even allow a no-op edge).
      const event = await recordWorkEvent({
        workItemId: workItem.id,
        eventType: 'EXECUTION_CANCELLED',
        actorType: 'SYSTEM',
        actorUserId: cancellation.actorUserId,
        idempotencyKey: `booking-cancelled-rollback:${booking.id}`,
        payload: basePayload,
      }, tx);
      if (event && onLifecycleEvent) await onLifecycleEvent(workItem, event);
    }
    // Remove Booking-owned scheduling context while preserving the
    // obligation's source-derived due window; leave the BOOKING execution
    // row itself as history (no deletion).
    await tx.operationalWorkItem.update({
      where: { id: workItem.id },
      data: { scheduleOverrideAt: null },
    });
    // Do not apply a generic rollback from BLOCKED/DEFERRED/completed/
    // verified states — those require source-specific reconciliation, out
    // of scope for booking cancellation to force.
  } else {
    await transitionWorkItem({
      workItemId: workItem.id,
      to: 'CLOSED',
      disposition: 'CANCELLED',
      actorType: 'SYSTEM',
      actorUserId: cancellation.actorUserId,
      idempotencyKey: `booking-cancelled-close:${booking.id}`,
      eventTypeOverride: 'EXECUTION_CANCELLED',
      payload: basePayload,
    }, tx, onLifecycleEvent);
  }
}

export async function reconcileBookingLifecycle(
  tx: WorkItemDb,
  booking: { id: string; finalPriceCents?: number | null },
  event: 'CONFIRMED' | 'STARTED' | 'COMPLETED',
  onLifecycleEvent: WorkItemLifecycleEventCallback,
): Promise<void> {
  const workItem = await requireSingleLinkedWorkItem(tx, booking.id);

  const targetState = event === 'CONFIRMED' ? 'SCHEDULED' : event === 'STARTED' ? 'IN_PROGRESS' : 'REPORTED_COMPLETE';
  if (workItem.state === targetState) return;

  const afterFirstTransition = await transitionWorkItem({
    workItemId: workItem.id,
    to: targetState,
    actorType: 'SYSTEM',
    idempotencyKey: `booking-${event.toLowerCase()}:${booking.id}`,
    payload: { bookingId: booking.id },
  }, tx, onLifecycleEvent);

  if (event === 'COMPLETED') {
    // The Booking is authoritative domain evidence — no separate homeowner
    // confirmation gate; REPORTED_COMPLETE -> VERIFIED is a legal direct
    // edge for exactly this reason.
    await transitionWorkItem({
      workItemId: afterFirstTransition.id,
      to: 'VERIFIED',
      actorType: 'SYSTEM',
      idempotencyKey: `booking-verified:${booking.id}`,
      payload: { bookingId: booking.id, evidenceSource: 'BOOKING' },
    }, tx, onLifecycleEvent);

    // Home Intelligence Functional Completeness FRD Phase 4 (HI-OUT-005/
    // 006). Recorded inside this same transaction (tx), not the global
    // client -- if the booking-completion transaction rolls back, no
    // outcome should exist either. No attribution attempt here (unlike the
    // maintenance/guidance/project paths) -- a marketplace booking has no
    // reliable path back to a Decision Thread yet.
    await recordOperationalWorkOutcome({
      propertyId: workItem.propertyId,
      workItemId: workItem.id,
      userId: null,
      costCents: booking.finalPriceCents ?? null,
      recommendationSnapshotId: null,
    }, tx);
  }
}

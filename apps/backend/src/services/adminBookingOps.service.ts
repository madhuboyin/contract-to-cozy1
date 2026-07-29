// apps/backend/src/services/adminBookingOps.service.ts
//
// Booking Operations workspace backend (ADMIN_MODULE_FRD.md §10.3, Phase 2
// slice). Read-only v1 under BOOKING_VIEW: search/filter bookings and view
// one booking's operational timeline — recorded BookingTimeline transitions
// merged with milestone timestamps and the review, oldest first. Support-
// safe scope: no payment amounts (PAYMENT_VIEW is a separate capability),
// no provider internalNotes, property location is city/state only.
// Governed mutations (BOOKING_OPERATE) are deliberately not in this slice.

import { AdminCaseSeverity, Prisma, ProductAnalyticsEventType } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../lib/prisma';
import { createCase } from './adminCase.service';
import {
  emitServiceQuoteDecisionAnalytics,
  ServiceQuoteDecisionEvent,
} from './serviceQuoteDecisionAnalytics.service';

export class AdminBookingOpsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminBookingOpsError';
  }
}

export interface ListBookingsInput {
  q?: string;
  status?: Prisma.BookingWhereInput['status'];
  page?: number;
  limit?: number;
}

/** Booking search: by booking number substring, optional status filter, newest first. */
export async function listBookings(input: ListBookingsInput = {}) {
  const page = input.page ?? 1;
  const limit = Math.min(input.limit ?? 25, 100);
  const q = typeof input.q === 'string' ? input.q.trim() : undefined;

  const where: Prisma.BookingWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(q ? { bookingNumber: { contains: q, mode: 'insensitive' } } : {}),
  };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        bookingNumber: true,
        category: true,
        status: true,
        scheduledDate: true,
        completedAt: true,
        cancelledAt: true,
        createdAt: true,
        homeowner: { select: { id: true, firstName: true, lastName: true } },
        providerProfile: { select: { id: true, businessName: true } },
        service: { select: { name: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);

  return { bookings, total, page, limit };
}

export interface BookingTimelineEvent {
  at: Date;
  kind: string;
  label: string;
  note?: string | null;
  actorId?: string | null;
}

/**
 * Operational detail with a merged timeline: recorded BookingTimeline status
 * transitions plus derived milestone events (created/scheduled/started/
 * finished/completed/cancelled/review), sorted oldest first.
 */
export async function getBookingDetail(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingNumber: true,
      category: true,
      status: true,
      description: true,
      specialRequests: true,
      requestedDate: true,
      scheduledDate: true,
      startTime: true,
      endTime: true,
      actualStartTime: true,
      actualEndTime: true,
      cancelledAt: true,
      cancelledBy: true,
      cancellationReason: true,
      completedAt: true,
      createdAt: true,
      homeowner: { select: { id: true, firstName: true, lastName: true } },
      provider: { select: { id: true, firstName: true, lastName: true } },
      providerProfile: { select: { id: true, businessName: true, status: true } },
      property: { select: { id: true, city: true, state: true } },
      service: { select: { id: true, name: true, category: true } },
      review: { select: { id: true, rating: true, status: true, createdAt: true } },
      timeline: {
        orderBy: { createdAt: 'asc' },
        select: { status: true, note: true, createdBy: true, createdAt: true },
      },
    },
  });

  if (!booking) {
    throw new AdminBookingOpsError('BOOKING_NOT_FOUND', `No booking with id "${bookingId}".`);
  }

  const events: BookingTimelineEvent[] = [
    { at: booking.createdAt, kind: 'CREATED', label: 'Booking created' },
  ];

  for (const entry of booking.timeline) {
    events.push({
      at: entry.createdAt,
      kind: 'STATUS_CHANGE',
      label: `Status set to ${entry.status}`,
      note: entry.note,
      actorId: entry.createdBy,
    });
  }

  if (booking.scheduledDate) {
    events.push({ at: booking.scheduledDate, kind: 'SCHEDULED', label: 'Scheduled service date' });
  }
  if (booking.actualStartTime) {
    events.push({ at: booking.actualStartTime, kind: 'WORK_STARTED', label: 'Work started' });
  }
  if (booking.actualEndTime) {
    events.push({ at: booking.actualEndTime, kind: 'WORK_FINISHED', label: 'Work finished' });
  }
  if (booking.completedAt) {
    events.push({ at: booking.completedAt, kind: 'COMPLETED', label: 'Booking completed' });
  }
  if (booking.cancelledAt) {
    events.push({
      at: booking.cancelledAt,
      kind: 'CANCELLED',
      label: 'Booking cancelled',
      note: booking.cancellationReason,
      actorId: booking.cancelledBy,
    });
  }
  if (booking.review) {
    events.push({
      at: booking.review.createdAt,
      kind: 'REVIEW_SUBMITTED',
      label: `Review submitted (${booking.review.rating}★, ${booking.review.status})`,
    });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  const { timeline, ...rest } = booking;
  return { ...rest, events };
}

export interface OpenDisputeCaseInput {
  bookingId: string;
  actorId: string;
  reason: string;
  severity?: AdminCaseSeverity;
}

/**
 * Bridges a booking into case management (FRD §10.4: disputes/chargebacks
 * as cases): opens a DISPUTE AdminCase linked to the booking, authorized
 * under DISPUTE_MANAGE at the route layer. Allowed for any booking status —
 * chargebacks routinely arrive on COMPLETED bookings — but one booking can
 * only have one open dispute case at a time.
 */
export async function openDisputeCase(
  input: OpenDisputeCaseInput,
  ctx: { req?: Pick<Request, 'ip' | 'headers'> | null } = {}
) {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      bookingNumber: true,
      status: true,
      propertyId: true,
      quoteDecisionWorkspaceId: true,
    },
  });
  if (!booking) {
    throw new AdminBookingOpsError('BOOKING_NOT_FOUND', `No booking with id "${input.bookingId}".`);
  }

  const openExisting = await prisma.adminCase.count({
    where: {
      type: 'DISPUTE',
      entityType: 'BOOKING',
      entityId: input.bookingId,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    },
  });
  if (openExisting > 0) {
    throw new AdminBookingOpsError(
      'DISPUTE_CASE_ALREADY_OPEN',
      `Booking ${booking.bookingNumber} already has an open dispute case.`
    );
  }

  const disputeCase = await createCase(
    {
      actorId: input.actorId,
      type: 'DISPUTE',
      severity: input.severity ?? 'HIGH',
      title: `Dispute on booking ${booking.bookingNumber} (${booking.status})`,
      description: input.reason,
      entityType: 'BOOKING',
      entityId: booking.id,
      capability: 'DISPUTE_MANAGE',
      auditAction: 'ADMIN_OPEN_BOOKING_DISPUTE_CASE',
    },
    ctx
  );
  if (booking.quoteDecisionWorkspaceId) {
    emitServiceQuoteDecisionAnalytics({
      eventName: ServiceQuoteDecisionEvent.DISPUTE_REPORTED,
      eventType: ProductAnalyticsEventType.ACTION_COMPLETED,
      userId: input.actorId,
      propertyId: booking.propertyId,
      workspaceId: booking.quoteDecisionWorkspaceId,
      metadata: {
        bookingId: booking.id,
        severity: input.severity ?? 'HIGH',
      },
    });
  }
  return disputeCase;
}

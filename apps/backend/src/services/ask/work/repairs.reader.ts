import type { BookingStatus, Prisma, ServiceCategory } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { ASK_WORK_LISTING_RETENTION_DAYS, listingCutoff } from './askWorkRetention';
import { afterBoundaryWhere, countViews, truncateTitle, workItemIdsByExecution, workLaunch } from './askWorkRowSupport';

const KEY_PREFIX = 'repair:';
const SERVED: readonly AskWorkLifecycleView[] = ['NEEDS_YOU', 'ACTIVE', 'WAITING', 'SCHEDULED', 'COMPLETED', 'ARCHIVED'];

/**
 * The authoritative, code-owned classification of which service bookings are repairs: bookings in a home-repair trade that were not made
 * for a buyer task. Inspections, moving, cleaning, landscaping, professional services and installs are bookings but not repairs and are
 * deliberately excluded. Changing this list is a product decision; it is the only place that decides.
 *
 * Known limitation: `Booking.category` names the trade, not the purpose, so a flooring or solar booking may be an installation or upgrade
 * rather than a repair. The list is an approximation; an explicit booking purpose would be the authoritative fix and is not needed for Phase 3.
 */
export const ASK_REPAIR_BOOKING_CATEGORIES: readonly ServiceCategory[] = Object.freeze([
  'HANDYMAN', 'GENERAL_HANDYMAN', 'PLUMBING', 'ELECTRICAL', 'HVAC', 'ROOFING', 'WATER_HEATER', 'FOUNDATION', 'WINDOWS_DOORS', 'GUTTERS',
  'MOLD_REMEDIATION', 'APPLIANCE_REPAIR', 'PEST_CONTROL', 'LOCKSMITH',
  'INSULATION', 'LANDSCAPING_DRAINAGE', 'FLOORING', 'PAINTING', 'SIDING', 'SECURITY_SAFETY', 'SOLAR',
] as ServiceCategory[]);

/** The bookings that count as repairs for a homeowner: their own, in a repair trade, and not tied to a buyer checklist task. */
export function repairBookingWhere(userId: string, propertyId: string): Prisma.BookingWhereInput {
  return { homeownerId: userId, propertyId, category: { in: [...ASK_REPAIR_BOOKING_CATEGORIES] }, homeBuyerTaskId: null };
}

const LABELS: Record<BookingStatus, string> = { DRAFT: 'Draft request', PENDING: 'Waiting for the provider', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress', COMPLETED: 'Complete', CANCELLED: 'Cancelled', DISPUTED: 'Disputed' };
const NEXT_STEP: Partial<Record<BookingStatus, string>> = { DRAFT: 'Finish requesting this repair', DISPUTED: 'Resolve the dispute' };

export function repairLifecycleView(status: BookingStatus): AskWorkLifecycleView {
  switch (status) {
    case 'DRAFT': case 'DISPUTED': return 'NEEDS_YOU';
    case 'PENDING': return 'WAITING';
    case 'CONFIRMED': return 'SCHEDULED';
    case 'IN_PROGRESS': return 'ACTIVE';
    case 'COMPLETED': return 'COMPLETED';
    default: return 'ARCHIVED';
  }
}

function viewWhere(view: AskWorkLifecycleView, now: Date): Prisma.BookingWhereInput {
  switch (view) {
    case 'NEEDS_YOU': return { status: { in: ['DRAFT', 'DISPUTED'] } };
    case 'WAITING': return { status: 'PENDING' };
    case 'SCHEDULED': return { status: 'CONFIRMED' };
    case 'ACTIVE': return { status: 'IN_PROGRESS' };
    case 'COMPLETED': return { status: 'COMPLETED', updatedAt: { gte: listingCutoff(ASK_WORK_LISTING_RETENTION_DAYS.bookingsCompleted, now) } };
    case 'ARCHIVED': return { status: 'CANCELLED', updatedAt: { gte: listingCutoff(ASK_WORK_LISTING_RETENTION_DAYS.bookingsCancelled, now) } };
  }
}

interface BookingRecord {
  id: string;
  propertyId: string;
  status: BookingStatus;
  description: string;
  scheduledDate: Date | null;
  updatedAt: Date;
  service: { name: string };
}

export function repairRow(booking: BookingRecord, workItemIds: readonly string[] = []): AskWorkRow {
  const sortAt = booking.updatedAt.toISOString();
  const next = NEXT_STEP[booking.status];
  return {
    workKey: `${KEY_PREFIX}${booking.id}`,
    sourceAliases: workItemIds.map((id) => `workItem:${id}`),
    providerId: 'REPAIRS',
    workType: 'REPAIR',
    propertyId: booking.propertyId,
    entity: { type: 'BOOKING', id: booking.id },
    title: truncateTitle(booking.service.name) || 'Repair',
    summary: truncateTitle(booking.description, 200) || null,
    status: { canonical: booking.status, label: LABELS[booking.status] },
    lifecycleView: repairLifecycleView(booking.status),
    nextAction: next ? { label: next, operationId: null, allowed: true } : null,
    sortAt,
    dueAt: booking.scheduledDate?.toISOString() ?? null,
    freshness: { version: `${booking.status}:${sortAt}`, asOf: sortAt },
    sourceOwner: 'bookings',
    // Ask has no booking operation, and Ask never links to a desktop page, so a repair shows its current state here.
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ entityType: 'BOOKING', entityId: booking.id, contextVersion: booking.status }), unavailableReason: 'Ask cannot manage service bookings yet. Its current state is shown here.' },
  };
}

/** Repairs (service bookings the caller requested for this home, in a repair trade). Read-only. */
export const readRepairWork: AskWorkProviderReader = async (context, query) => {
  const now = new Date();
  const base = repairBookingWhere(context.userId, context.propertyId);
  const statusFilter: Prisma.BookingWhereInput = query.status ? { status: query.status as BookingStatus } : {};
  const inView: Prisma.BookingWhereInput = query.entityId ? { AND: [base, { id: query.entityId }] } : { AND: [base, viewWhere(query.view, now), statusFilter] };
  const [bookings, total, viewCounts] = await Promise.all([
    prisma.booking.findMany({
      where: afterBoundaryWhere(inView, query.after, KEY_PREFIX),
      select: { id: true, propertyId: true, status: true, description: true, scheduledDate: true, updatedAt: true, service: { select: { name: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.booking.count({ where: inView }),
    countViews(ASK_WORK_LIFECYCLE_VIEWS, SERVED, (view) => prisma.booking.count({ where: { AND: [base, viewWhere(view, now)] } })),
  ]);
  const workItems = await workItemIdsByExecution('BOOKING', bookings.map((booking) => booking.id));
  return { rows: bookings.map((booking) => repairRow(booking, workItems.get(booking.id) ?? [])), total, viewCounts };
};

// apps/backend/src/services/booking.service.ts

import {
  BookingStatus,
  InventoryItemCategory,
  PredictionStatus,
  Prisma,
  ServiceCategory,
  UserRole,
} from '@prisma/client';
import {
  CreateBookingInput,
  UpdateBookingInput,
  CancelBookingInput,
  CompleteBookingInput,
  CreateReviewInput,
  ListBookingsQuery,
  BookingResponse,
  BookingListResponse,
  BookingPermissions,
  BookingOriginResolution,
  VALID_STATUS_TRANSITIONS,
} from '../types/booking.types';

// PHASE 3 IMPLEMENTATION: Import JobQueueService
import JobQueueService from './JobQueue.service';

import { prisma } from '../lib/prisma';
import { NotificationService } from './notification.service';
import { incrementStreak } from './gamification.service';
import { mapInventoryToServiceCategory } from '../utils/inventoryServiceCategory.util';
import { priceFinalizationService } from './priceFinalization.service';
// Phase 5 (TR-03): fire-and-forget guidance step advancement on service completion
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { bookingEligibilityService } from './bookingEligibility.service';
import { logger } from '../lib/logger';
import { assertProjectComplianceApplicable } from './projectCompliance/context';
import { advanceServiceQuoteDecision } from './serviceQuoteDecisionJourney.service';
import { emitWorkItemLifecycleChange } from '../modules/homeOperations/infrastructure/workItemChangeEmitter';
import {
  resolveOriginatingWorkItem,
  reconcileBookingCreated,
  reconcileBookingCancelled,
  reconcileBookingLifecycle,
  type OriginResolutionMethod,
} from './bookingWorkReconciliation.service';
import type { OperationalWorkEvent, OperationalWorkItem } from '@prisma/client';

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
];

type BookingExecutionScope = {
  type: string;
  key: string;
};

function publicOriginResolution(method: OriginResolutionMethod): BookingOriginResolution {
  if (method === 'EXPLICIT_LINEAGE') return 'EXPLICIT';
  if (method === 'STANDALONE') return 'STANDALONE';
  return 'DOMAIN_PROVENANCE';
}

export class BookingService {
  private static buildExecutionScope(args: {
    propertyId: string;
    providerProfileId: string;
    serviceId: string;
    category: ServiceCategory;
    maintenancePredictionId?: string | null;
    priceFinalizationId?: string | null;
    inventoryItemId?: string | null;
    guidanceJourneyId?: string | null;
    guidanceStepKey?: string | null;
  }): BookingExecutionScope {
    if (args.maintenancePredictionId) {
      return {
        type: 'MAINTENANCE_PREDICTION',
        key: `prediction:${args.propertyId}:${args.maintenancePredictionId}`,
      };
    }

    if (args.priceFinalizationId) {
      return {
        type: 'PRICE_FINALIZATION',
        key: `price-finalization:${args.propertyId}:${args.priceFinalizationId}`,
      };
    }

    if (args.inventoryItemId) {
      return {
        type: 'INVENTORY_ITEM',
        key: `inventory-item:${args.propertyId}:${args.inventoryItemId}`,
      };
    }

    if (args.guidanceJourneyId && args.guidanceStepKey) {
      return {
        type: 'GUIDANCE_STEP',
        key: `guidance-step:${args.propertyId}:${args.guidanceJourneyId}:${args.guidanceStepKey}`,
      };
    }

    if (args.guidanceJourneyId) {
      return {
        type: 'GUIDANCE_JOURNEY',
        key: `guidance-journey:${args.propertyId}:${args.guidanceJourneyId}`,
      };
    }

    return {
      type: 'SERVICE',
      key: `service:${args.propertyId}:${args.providerProfileId}:${args.serviceId}:${args.category}`,
    };
  }

  /**
   * Generate unique booking number (format: B-YYYY-NNNNNN)
   */
  private static async generateBookingNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `B-${year}-`;
    
    // Get the last booking number for this year
    const lastBooking = await prisma.booking.findFirst({
      where: {
        bookingNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        bookingNumber: 'desc',
      },
    });
    
    let nextNumber = 1;
    if (lastBooking) {
      const lastNumber = parseInt(lastBooking.bookingNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }
    
    return `${prefix}${nextNumber.toString().padStart(6, '0')}`;
  }

  /**
   * Create a new booking
   */
  static async createBooking(
    homeownerId: string,
    input: CreateBookingInput,
    options?: {
      guidanceJourneyId?: string | null;
      guidanceStepKey?: string | null;
      guidanceSignalIntentFamily?: string | null;
    }
  ): Promise<BookingResponse> {
    // Validate service exists and get details
    const service = await prisma.service.findUnique({
      where: { id: input.serviceId },
      include: {
        providerProfile: true,
      },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    if (!service.isActive) {
      throw new Error('Service is not currently available');
    }

    // Validate property belongs to homeowner
    const property = await prisma.property.findFirst({
      where: {
        id: input.propertyId,
        homeownerProfile: {
          userId: homeownerId,
        },
      },
    });

    if (!property) {
      throw new Error('Property not found or does not belong to you');
    }

    if (input.sourceRadarMatchId) {
      const sourceMatch = await prisma.propertyRadarMatch.findFirst({
        where: {
          id: input.sourceRadarMatchId,
          propertyId: input.propertyId,
        },
        select: {
          radarEventId: true,
          incident: { select: { id: true } },
        },
      });
      if (!sourceMatch) {
        throw new Error('Radar source match does not belong to selected property');
      }
      if (
        input.sourceRadarEventId
        && input.sourceRadarEventId !== sourceMatch.radarEventId
      ) {
        throw new Error('Radar source event does not match the source match');
      }
      if (
        input.sourceIncidentId
        && input.sourceIncidentId !== sourceMatch.incident?.id
      ) {
        throw new Error('Radar source incident does not match the source match');
      }
    }

    // Validate provider — input.providerId is the provider profile ID from the URL
    if (input.providerId !== service.providerProfileId) {
      throw new Error('Provider ID does not match service provider');
    }

    // Enforce the canonical, work-specific responsibility decision before any
    // booking, timeline, notification, or linkage record is written.
    await assertProjectComplianceApplicable(
      input.propertyId,
      homeownerId,
      'PROVIDER_BOOKING',
      { serviceCategory: input.workCategory ?? service.category },
      'providerBooking',
    );

    // Soft check only — a homeowner window-shopping isn't blocked from creating
    // the booking, but the response surfaces a clear warning rather than
    // silently proceeding (Section 7.1). The hard gate is at confirmation.
    const providerEligibility = await bookingEligibilityService.checkProviderEligibility(
      service.providerProfileId,
      service.category
    );

    // Validate predictive-maintenance links if provided
    let linkedPrediction:
      | {
          id: string;
          propertyId: string;
          inventoryItemId: string | null;
        }
      | null = null;

    if (input.maintenancePredictionId) {
      linkedPrediction = await prisma.maintenancePrediction.findUnique({
        where: { id: input.maintenancePredictionId },
        select: {
          id: true,
          propertyId: true,
          inventoryItemId: true,
        },
      });

      if (!linkedPrediction) {
        throw new Error('Linked maintenance prediction not found');
      }

      if (linkedPrediction.propertyId !== input.propertyId) {
        throw new Error('Maintenance prediction does not belong to selected property');
      }

      const existingActivePredictionBooking = await prisma.booking.findFirst({
        where: {
          maintenancePredictionId: linkedPrediction.id,
          status: {
            in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'],
          },
        },
        select: { id: true, status: true },
      });

      if (existingActivePredictionBooking) {
        throw new Error(
          `A booking is already active for this prediction (${existingActivePredictionBooking.status}).`
        );
      }
    }

    const resolvedInventoryItemId =
      input.inventoryItemId ?? linkedPrediction?.inventoryItemId ?? null;

    let linkedInventoryItem:
      | {
          id: string;
          propertyId: string;
          name: string;
          category: InventoryItemCategory;
          manufacturer: string | null;
          modelNumber: string | null;
          serialNumber: string | null;
          brand: string | null;
          model: string | null;
          serialNo: string | null;
        }
      | null = null;

    if (resolvedInventoryItemId) {
      linkedInventoryItem = await prisma.inventoryItem.findFirst({
        where: {
          id: resolvedInventoryItemId,
          propertyId: input.propertyId,
        },
        select: {
          id: true,
          propertyId: true,
          name: true,
          category: true,
          manufacturer: true,
          modelNumber: true,
          serialNumber: true,
          brand: true,
          model: true,
          serialNo: true,
        },
      });

      if (!linkedInventoryItem) {
        throw new Error('Linked inventory item not found for this property');
      }
    }

    if (
      linkedPrediction?.inventoryItemId &&
      resolvedInventoryItemId &&
      linkedPrediction.inventoryItemId !== resolvedInventoryItemId
    ) {
      throw new Error('maintenancePredictionId and inventoryItemId point to different assets');
    }

    let linkedPriceFinalizationId: string | null = null;
    if (input.priceFinalizationId) {
      const finalization = await priceFinalizationService.getDetail(
        input.propertyId,
        homeownerId,
        input.priceFinalizationId
      );

      if (finalization.status !== 'FINALIZED') {
        throw new Error('Price finalization must be finalized before booking.');
      }
      if (finalization.bookingId) {
        throw new Error('Price finalization is already linked to an existing booking.');
      }

      linkedPriceFinalizationId = finalization.id;
    }

    const executionScope = this.buildExecutionScope({
      propertyId: input.propertyId,
      providerProfileId: service.providerProfileId,
      serviceId: input.serviceId,
      category: service.category,
      maintenancePredictionId: linkedPrediction?.id ?? null,
      priceFinalizationId: linkedPriceFinalizationId,
      inventoryItemId: resolvedInventoryItemId,
      guidanceJourneyId: options?.guidanceJourneyId ?? null,
      guidanceStepKey: options?.guidanceStepKey ?? null,
    });

    const existingActiveScopeBooking = await prisma.booking.findFirst({
      where: {
        propertyId: input.propertyId,
        activeExecutionScopeKey: executionScope.key,
        status: {
          in: ACTIVE_BOOKING_STATUSES,
        },
      },
      select: {
        id: true,
        bookingNumber: true,
        status: true,
      },
    });

    if (existingActiveScopeBooking) {
      const conflictError = new Error(
        `An active booking already exists for this work (${existingActiveScopeBooking.status}).`
      ) as Error & {
        statusCode?: number;
        details?: Record<string, unknown>;
      };
      conflictError.statusCode = 409;
      conflictError.details = {
        existingBookingId: existingActiveScopeBooking.id,
        existingBookingNumber: existingActiveScopeBooking.bookingNumber,
        existingBookingStatus: existingActiveScopeBooking.status,
        executionScopeType: executionScope.type,
        executionScopeKey: executionScope.key,
      };
      throw conflictError;
    }

    // Generate booking number
    const bookingNumber = await this.generateBookingNumber();

    const specSheet = this.buildInventorySpecSheet(linkedInventoryItem);
    const bookingDescription = specSheet
      ? `${input.description.trim()}\n\n${specSheet}`
      : input.description.trim();

    const predictiveInsightFactor = input.maintenancePredictionId
      ? 'PREDICTIVE_MAINTENANCE'
      : input.insightFactor || null;
    const predictiveInsightContext =
      input.maintenancePredictionId && linkedInventoryItem
        ? `Prediction-driven service for ${linkedInventoryItem.name}`
        : input.insightContext || null;

    // HI-ATT-010: Booking creation, Operational Work Item creation/reuse,
    // and execution linkage commit atomically. Lifecycle-change side
    // effects (emitWorkItemLifecycleChange) are collected here and only
    // fired after the transaction commits — never from data that might
    // still roll back. A uniqueness conflict inside the transaction
    // (workKey race) retries the whole transaction rather than continuing
    // against a possibly-aborted one.
    const pendingLifecycleEvents: Array<{ workItem: OperationalWorkItem; event: OperationalWorkEvent }> = [];
    let booking!: Awaited<ReturnType<typeof prisma.booking.create>> & {
      homeowner: any; provider: any; providerProfile: any; service: any; property: any; timeline: any[];
    };
    let bookingWorkLink!: { operationalWorkItemId: string; originResolution: BookingOriginResolution };
    const MAX_TX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
      pendingLifecycleEvents.length = 0;
      try {
        booking = await prisma.$transaction(async (tx) => {
          const created = await tx.booking.create({
            data: {
              bookingNumber,
              homeownerId,
              providerId: service.providerProfile.userId,
              providerProfileId: service.providerProfileId,
              propertyId: input.propertyId,
              serviceId: input.serviceId,
              category: service.category,
              status: 'PENDING',
              requestedDate: input.requestedDate ? new Date(input.requestedDate) : null,
              scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
              startTime: input.startTime ? new Date(input.startTime) : null,
              endTime: input.endTime ? new Date(input.endTime) : null,
              estimatedPrice: input.estimatedPrice,
              depositAmount: input.depositAmount || null,
              description: bookingDescription,
              specialRequests: input.specialRequests || null,
              // NEW: Capture health insight tracking fields
              insightFactor: predictiveInsightFactor,
              insightContext: predictiveInsightContext,
              maintenancePredictionId: input.maintenancePredictionId || null,
              inventoryItemId: resolvedInventoryItemId,
              executionScopeType: executionScope.type,
              executionScopeKey: executionScope.key,
              activeExecutionScopeKey: executionScope.key,
              // Phase 5 (TR-03): persist so service completion can auto-advance the journey.
              // Spread-cast required until `npx prisma generate` is run after migration.
              ...({
                guidanceJourneyId: options?.guidanceJourneyId ?? null,
                guidanceStepKey: options?.guidanceStepKey ?? null,
                sourceRadarMatchId: input.sourceRadarMatchId ?? null,
                sourceRadarEventId: input.sourceRadarEventId ?? null,
                sourceIncidentId: input.sourceIncidentId ?? null,
                sourceRadarActionCode: input.sourceRadarActionCode ?? null,
                sourceLaunchSurface: input.sourceLaunchSurface ?? null,
              } as Record<string, unknown>),
              timeline: {
                create: {
                  status: 'PENDING',
                  note: 'Booking created',
                  createdBy: homeownerId,
                },
              },
            },
            include: {
              homeowner: true,
              provider: true,
              providerProfile: true,
              service: true,
              property: true,
              timeline: {
                orderBy: { createdAt: 'asc' },
              },
            },
          });

          const resolution = await resolveOriginatingWorkItem(tx, {
            propertyId: input.propertyId,
            originWorkItemId: input.originWorkItemId ?? null,
            guidanceJourneyId: options?.guidanceJourneyId ?? null,
            maintenancePredictionId: input.maintenancePredictionId ?? null,
            priceFinalizationId: input.priceFinalizationId ?? null,
            inventoryItemId: resolvedInventoryItemId,
            guidanceStepKey: options?.guidanceStepKey ?? null,
          });
          const workItem = await reconcileBookingCreated(tx, created, resolution, (workItem, event) => {
            pendingLifecycleEvents.push({ workItem, event });
          });
          bookingWorkLink = {
            operationalWorkItemId: workItem.id,
            originResolution: publicOriginResolution(resolution.method),
          };

          return created;
        });
        break;
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < MAX_TX_ATTEMPTS) {
          logger.warn({ err, attempt }, '[BOOKING] work-item resolution hit a uniqueness conflict inside the creation transaction; retrying');
          continue;
        }
        throw err;
      }
    }

    for (const { workItem, event } of pendingLifecycleEvents) {
      await emitWorkItemLifecycleChange(workItem, event).catch((err) =>
        logger.warn({ err, bookingId: booking.id }, '[BOOKING] work-item lifecycle-change emission failed post-commit'),
      );
    }

    let linkedPriceFinalizationForBooking = false;
    if (linkedPriceFinalizationId) {
      try {
        await priceFinalizationService.attachBooking({
          propertyId: input.propertyId,
          finalizationId: linkedPriceFinalizationId,
          bookingId: booking.id,
        });
        linkedPriceFinalizationForBooking = true;
      } catch (error) {
        logger.warn({
          bookingId: booking.id,
          priceFinalizationId: linkedPriceFinalizationId,
          error,
        }, '[BOOKING] failed to link price finalization to booking');
      }
    }
    
    const actionUrlParams = new URLSearchParams();
    if (options?.guidanceJourneyId) actionUrlParams.set('guidanceJourneyId', options.guidanceJourneyId);
    if (options?.guidanceStepKey) actionUrlParams.set('guidanceStepKey', options.guidanceStepKey);
    if (options?.guidanceSignalIntentFamily) {
      actionUrlParams.set('guidanceSignalIntentFamily', options.guidanceSignalIntentFamily);
    }
    if (resolvedInventoryItemId) actionUrlParams.set('itemId', resolvedInventoryItemId);
    if (linkedPriceFinalizationForBooking && linkedPriceFinalizationId) {
      actionUrlParams.set('priceFinalizationId', linkedPriceFinalizationId);
    }
    const actionUrlQuery = actionUrlParams.toString();
    const notificationActionUrl = actionUrlQuery
      ? `/bookings/${booking.id}?${actionUrlQuery}`
      : `/bookings/${booking.id}`;

    await NotificationService.create({
      userId: booking.homeownerId,
      type: 'BOOKING_CREATED',
      title: 'Booking request submitted',
      message: `Your booking request for ${booking.service.name} has been submitted.`,
      actionUrl: notificationActionUrl,
      metadata: {
        propertyId: input.propertyId,
        priority: 'HIGH', // 🔴 REQUIRED for immediate email
        guidanceContext:
          options?.guidanceJourneyId ||
          options?.guidanceStepKey ||
          options?.guidanceSignalIntentFamily ||
          resolvedInventoryItemId
            ? {
                guidanceJourneyId: options?.guidanceJourneyId ?? null,
                guidanceStepKey: options?.guidanceStepKey ?? null,
                guidanceSignalIntentFamily: options?.guidanceSignalIntentFamily ?? null,
                itemId: resolvedInventoryItemId ?? null,
                priceFinalizationId:
                  linkedPriceFinalizationForBooking && linkedPriceFinalizationId
                    ? linkedPriceFinalizationId
                    : null,
              }
            : null,
      },
      entityType: 'BOOKING',
      entityId: booking.id,
    });    

    // --- PHASE 3 IMPLEMENTATION START ---
    // Trigger re-calculation of Health Score / Risk Report immediately.
    // This ensures the "IMMEDIATE ACTION" count drops to 0 instantly after booking.
    try {
        logger.info(`[BOOKING-SERVICE] Triggering risk update for property ${input.propertyId}`);
        await JobQueueService.enqueuePropertyIntelligenceJobs(input.propertyId);
    } catch (error) {
        // Non-blocking error logging. We don't want to fail the booking if the queue is down.
        logger.error({ err: error }, `[BOOKING-SERVICE] Failed to enqueue risk update job`);
    }
    // --- PHASE 3 IMPLEMENTATION END ---

    return {
      ...this.formatBookingResponse(booking, bookingWorkLink),
      providerEligibilityWarning: providerEligibility.isEligible
        ? null
        : {
            serviceCategory: booking.category,
            missingCredentialTypes: providerEligibility.missingCredentialTypes,
          },
    };
  }

  
  /**
   * List bookings with filters
   * FIX: Implemented defensive coding to prevent formatting errors from crashing the endpoint.
   */
  static async listBookings(
    userId: string,
    userRole: UserRole,
    query: ListBookingsQuery
  ): Promise<BookingListResponse> {
    const { page, limit, status, category, fromDate, toDate, sortBy, sortOrder, propertyId } = query;
    const skip = (page - 1) * limit;

    // Build where clause based on user role
    const where: Prisma.BookingWhereInput = {};

    if (userRole === 'HOMEOWNER') {
      where.homeownerId = userId;
    } else if (userRole === 'PROVIDER') {
      where.providerId = userId;
    }
    // ADMIN can see all bookings

    // Apply filters
    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    if (propertyId) {
      where.propertyId = propertyId;
    }
    
    if (fromDate || toDate) {
      where.scheduledDate = {
        ...(fromDate && { gte: new Date(fromDate) }),
        ...(toDate && { lte: new Date(toDate) }),
      };
    }

    // Get bookings and total count
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          homeowner: true,
          provider: true,
          providerProfile: true,
          service: true,
          property: true,
          timeline: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    // Get status summary
    const statusGroups = await prisma.booking.groupBy({
      by: ['status'],
      where: userRole === 'ADMIN' ? {} : (userRole === 'HOMEOWNER' ? { homeownerId: userId } : { providerId: userId }),
      _count: true,
    });

    const byStatus = Object.fromEntries(
      Object.values(BookingStatus).map((s) => [s, 0])
    ) as Record<BookingStatus, number>;

    statusGroups.forEach((group) => {
      byStatus[group.status] = group._count;
    });

    // FIX START: Resilient data formatting to prevent 500 errors
    const formattedBookings: BookingResponse[] = [];
    
    for (const booking of bookings) {
        try {
            formattedBookings.push(await this.formatBookingResponseWithWorkLink(booking));
        } catch (error) {
            // Log the error for later investigation but prevent crash
            // The logger.error will appear in the server logs, alerting DevOps/Engineering
            logger.error({ err: error }, `CRITICAL: Failed to format booking ID ${booking.id}. Skipping record`);
        }
    }
    // FIX END

    return {
      // Use the resilient, filtered list of bookings
      bookings: formattedBookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalBookings: total,
        byStatus,
      },
    };
  }

  /**
   * Get booking by ID
   */
  static async getBookingById(
    bookingId: string,
    userId: string,
    userRole: UserRole
  ): Promise<BookingResponse | null> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        homeowner: true,
        provider: true,
        providerProfile: true,
        service: true,
        property: true,
        timeline: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!booking) {
      return null;
    }

    // Check permissions
    if (userRole !== 'ADMIN') {
      if (userRole === 'HOMEOWNER' && booking.homeownerId !== userId) {
        throw new Error('You do not have permission to view this booking');
      }
      if (userRole === 'PROVIDER' && booking.providerId !== userId) {
        throw new Error('You do not have permission to view this booking');
      }
    }

    return this.formatBookingResponseWithWorkLink(booking);
  }

  /**
   * Update booking
   */
  static async updateBooking(
    bookingId: string,
    userId: string,
    userRole: UserRole,
    input: UpdateBookingInput
  ): Promise<BookingResponse> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // Check permissions
    const canEdit = userRole === 'ADMIN' ||
      (userRole === 'HOMEOWNER' && booking.homeownerId === userId) ||
      (userRole === 'PROVIDER' && booking.providerId === userId);

    if (!canEdit) {
      throw new Error('You do not have permission to update this booking');
    }

    // Prevent updates to completed/cancelled bookings
    if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
      throw new Error(`Cannot update ${booking.status.toLowerCase()} booking`);
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...(input.scheduledDate && { scheduledDate: new Date(input.scheduledDate) }),
        ...(input.startTime && { startTime: new Date(input.startTime) }),
        ...(input.endTime && { endTime: new Date(input.endTime) }),
        ...(input.description && { description: input.description }),
        ...(input.specialRequests !== undefined && { specialRequests: input.specialRequests }),
        ...(input.estimatedPrice && { estimatedPrice: input.estimatedPrice }),
        ...(input.finalPrice && { finalPrice: input.finalPrice }),
        ...(input.internalNotes !== undefined && { internalNotes: input.internalNotes }),
        timeline: {
          create: {
            status: booking.status,
            note: 'Booking updated',
            createdBy: userId,
          },
        },
      },
      include: {
        homeowner: true,
        provider: true,
        providerProfile: true,
        service: true,
        property: true,
        timeline: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return this.formatBookingResponseWithWorkLink(updated);
  }

  /**
   * Confirm booking (provider only)
   */
  static async confirmBooking(
    bookingId: string,
    providerId: string
  ): Promise<BookingResponse> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.providerId !== providerId) {
      throw new Error('You do not have permission to confirm this booking');
    }

    if (!this.canTransitionTo(booking.status, 'CONFIRMED')) {
      throw new Error(`Cannot confirm booking with status ${booking.status}`);
    }

    // Hard gate (Section 7.2) — a provider eligible when the homeowner started
    // booking may have lost eligibility (credential expired) before
    // confirmation; this is the last point that can still catch it.
    await bookingEligibilityService.assertProviderEligible(booking.providerProfileId, booking.category);

    const confirmedPendingEvents: Array<{ workItem: OperationalWorkItem; event: OperationalWorkEvent }> = [];
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CONFIRMED',
          timeline: {
            create: {
              status: 'CONFIRMED',
              note: 'Booking confirmed by provider',
              createdBy: providerId,
            },
          },
        },
        include: {
          homeowner: true,
          provider: true,
          providerProfile: true,
          service: true,
          property: true,
          timeline: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await reconcileBookingLifecycle(tx, { id: bookingId }, 'CONFIRMED', (workItem, event) => {
        confirmedPendingEvents.push({ workItem, event });
      });
      return result;
    });
    for (const { workItem, event } of confirmedPendingEvents) {
      await emitWorkItemLifecycleChange(workItem, event).catch((err) =>
        logger.warn({ err, bookingId }, '[BOOKING] work-item lifecycle-change emission failed post-commit'),
      );
    }

    const quoteDecisionWorkspaceId = (booking as any).quoteDecisionWorkspaceId as string | null;
    if (quoteDecisionWorkspaceId) {
      await advanceServiceQuoteDecision({
        propertyId: booking.propertyId,
        workspaceId: quoteDecisionWorkspaceId,
        actorUserId: providerId,
        toStage: 'SCHEDULED',
        outcome: 'BOOKED',
        relatedEntityType: 'BOOKING',
        relatedEntityId: bookingId,
        reason: 'The provider confirmed the service booking.',
      });
    }
    return this.formatBookingResponseWithWorkLink(updated);
  }

  /**
   * Start booking (provider only)
   */
  static async startBooking(
    bookingId: string,
    providerId: string
  ): Promise<BookingResponse> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.providerId !== providerId) {
      throw new Error('You do not have permission to start this booking');
    }

    if (!this.canTransitionTo(booking.status, 'IN_PROGRESS')) {
      throw new Error(`Cannot start booking with status ${booking.status}`);
    }

    const startedPendingEvents: Array<{ workItem: OperationalWorkItem; event: OperationalWorkEvent }> = [];
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'IN_PROGRESS',
          actualStartTime: new Date(),
          timeline: {
            create: {
              status: 'IN_PROGRESS',
              note: 'Service started',
              createdBy: providerId,
            },
          },
        },
        include: {
          homeowner: true,
          provider: true,
          providerProfile: true,
          service: true,
          property: true,
          timeline: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await reconcileBookingLifecycle(tx, { id: bookingId }, 'STARTED', (workItem, event) => {
        startedPendingEvents.push({ workItem, event });
      });
      return result;
    });
    for (const { workItem, event } of startedPendingEvents) {
      await emitWorkItemLifecycleChange(workItem, event).catch((err) =>
        logger.warn({ err, bookingId }, '[BOOKING] work-item lifecycle-change emission failed post-commit'),
      );
    }

    return this.formatBookingResponseWithWorkLink(updated);
  }

  /**
   * Complete booking (provider only)
   */
  static async completeBooking(
    bookingId: string,
    providerId: string,
    input: CompleteBookingInput
  ): Promise<BookingResponse> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        inventoryItem: {
          select: {
            id: true,
            category: true,
          },
        },
      },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.providerId !== providerId) {
      throw new Error('You do not have permission to complete this booking');
    }

    if (!this.canTransitionTo(booking.status, 'COMPLETED')) {
      throw new Error(`Cannot complete booking with status ${booking.status}`);
    }

    // Validate times
    const startTime = new Date(input.actualStartTime);
    const endTime = new Date(input.actualEndTime);

    if (endTime <= startTime) {
      throw new Error('End time must be after start time');
    }

    const completedPendingEvents: Array<{ workItem: OperationalWorkItem; event: OperationalWorkEvent }> = [];
    const updated = await prisma.$transaction(async (tx) => {
      const completedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'COMPLETED',
          activeExecutionScopeKey: null,
          actualStartTime: startTime,
          actualEndTime: endTime,
          finalPrice: input.finalPrice,
          completedAt: new Date(),
          ...(input.internalNotes && { internalNotes: input.internalNotes }),
          timeline: {
            create: {
              status: 'COMPLETED',
              note: 'Service completed',
              createdBy: providerId,
            },
          },
        },
        include: {
          homeowner: true,
          provider: true,
          providerProfile: true,
          service: true,
          property: true,
          timeline: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      await tx.providerProfile.update({
        where: { id: booking.providerProfileId },
        data: {
          totalCompletedJobs: { increment: 1 },
        },
      });

      let servicedInventoryItemId = booking.inventoryItemId ?? null;
      if (!servicedInventoryItemId && booking.maintenancePredictionId) {
        const prediction = await tx.maintenancePrediction.findUnique({
          where: { id: booking.maintenancePredictionId },
          select: { inventoryItemId: true },
        });
        servicedInventoryItemId = prediction?.inventoryItemId ?? null;
      }

      if (servicedInventoryItemId) {
        await tx.inventoryItem.update({
          where: { id: servicedInventoryItemId },
          data: {
            lastServicedOn: endTime,
          },
        });
      }

      if (booking.maintenancePredictionId) {
        await tx.maintenancePrediction.updateMany({
          where: { id: booking.maintenancePredictionId },
          data: { status: PredictionStatus.COMPLETED },
        });
      }

      // HI-ATT-010: the Booking is authoritative domain evidence for
      // REPORTED_COMPLETE -> VERIFIED — reconciled in this same transaction
      // as the completion write, not a separate one.
      await reconcileBookingLifecycle(tx, { id: bookingId }, 'COMPLETED', (workItem, event) => {
        completedPendingEvents.push({ workItem, event });
      });

      return completedBooking;
    });
    for (const { workItem, event } of completedPendingEvents) {
      await emitWorkItemLifecycleChange(workItem, event).catch((err) =>
        logger.warn({ err, bookingId }, '[BOOKING] work-item lifecycle-change emission failed post-commit'),
      );
    }

    if (booking.maintenancePredictionId) {
      try {
        await incrementStreak(booking.propertyId);
      } catch (error) {
        logger.error({ err: error }, '[BOOKING] Failed to increment streak from predictive completion');
      }

      await this.awardPredictiveMaintenanceBadgeIfEligible(
        booking.propertyId,
        booking.inventoryItem?.category ?? null,
        booking.category
      );
    }

    // Phase 5 (TR-03): Auto-advance the linked guidance journey step when service completes.
    // Fire-and-forget — booking completion must not fail if guidance side-effects error.
    // Cast required until `npx prisma generate` is run after the schema migration.
    const bookingAny = booking as typeof booking & {
      guidanceJourneyId?: string | null;
      guidanceStepKey?: string | null;
    };
    if (bookingAny.guidanceJourneyId) {
      guidanceJourneyService
        .recordToolCompletion({
          propertyId: booking.propertyId,
          actorUserId: providerId,
          journeyId: bookingAny.guidanceJourneyId,
          sourceToolKey: 'booking',
          sourceEntityType: 'BOOKING',
          sourceEntityId: bookingId,
          stepKey: bookingAny.guidanceStepKey ?? undefined,
          status: 'COMPLETED',
          inventoryItemId: booking.inventoryItemId ?? null,
          producedData: {
            proofType: 'service_completion',
            proofId: bookingId,
            bookingId,
            finalPrice: input.finalPrice != null ? String(input.finalPrice) : null,
            actualStartTime: input.actualStartTime,
            actualEndTime: input.actualEndTime,
          },
        })
        .catch((err) =>
          logger.warn({ err }, '[BOOKING] guidance step advance on service completion failed')
        );
    }

    const quoteDecisionWorkspaceId = (booking as any).quoteDecisionWorkspaceId as string | null;
    if (quoteDecisionWorkspaceId) {
      await advanceServiceQuoteDecision({
        propertyId: booking.propertyId,
        workspaceId: quoteDecisionWorkspaceId,
        actorUserId: providerId,
        toStage: 'COMPLETED',
        outcome: 'COMPLETED',
        relatedEntityType: 'BOOKING',
        relatedEntityId: bookingId,
        reason: 'The booked service was marked complete.',
        metadataJson: { finalPrice: input.finalPrice },
      });
    }
    return this.formatBookingResponseWithWorkLink(updated);
  }

  /**
   * Cancel booking
   */
  static async cancelBooking(
    bookingId: string,
    userId: string,
    userRole: UserRole,
    input: CancelBookingInput
  ): Promise<BookingResponse> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // Check permissions
    const canCancel = userRole === 'ADMIN' ||
      booking.homeownerId === userId ||
      booking.providerId === userId;

    if (!canCancel) {
      throw new Error('You do not have permission to cancel this booking');
    }

    if (!this.canTransitionTo(booking.status, 'CANCELLED')) {
      throw new Error(`Cannot cancel booking with status ${booking.status}`);
    }

    const cancelledPendingEvents: Array<{ workItem: OperationalWorkItem; event: OperationalWorkEvent }> = [];
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          activeExecutionScopeKey: null,
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancellationReason: input.reason,
          timeline: {
            create: {
              status: 'CANCELLED',
              note: `Booking cancelled: ${input.reason}`,
              createdBy: userId,
            },
          },
        },
        include: {
          homeowner: true,
          provider: true,
          providerProfile: true,
          service: true,
          property: true,
          timeline: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await reconcileBookingCancelled(tx, { id: bookingId }, { reason: input.reason, actorUserId: userId }, (workItem, event) => {
        cancelledPendingEvents.push({ workItem, event });
      });
      return result;
    });
    for (const { workItem, event } of cancelledPendingEvents) {
      await emitWorkItemLifecycleChange(workItem, event).catch((err) =>
        logger.warn({ err, bookingId }, '[BOOKING] work-item lifecycle-change emission failed post-commit'),
      );
    }

    const cancelActionUrlParams = new URLSearchParams();
    if (updated.inventoryItemId) cancelActionUrlParams.set('itemId', updated.inventoryItemId);
    const cancelActionUrlQuery = cancelActionUrlParams.toString();
    const cancelNotificationActionUrl = cancelActionUrlQuery
      ? `/bookings/${updated.id}?${cancelActionUrlQuery}`
      : `/bookings/${updated.id}`;

    await NotificationService.create({
      userId: updated.homeownerId,
      type: 'BOOKING_CANCELLED',
      title: 'Booking cancelled',
      message: `Your booking has been cancelled.`,
      actionUrl: cancelNotificationActionUrl,
      metadata: {
        propertyId: updated.propertyId,
        priority: 'HIGH', // 🔴 REQUIRED for immediate email
        guidanceContext:
          updated.inventoryItemId
            ? {
                itemId: updated.inventoryItemId ?? null,
              }
            : null,
      },
      entityType: 'BOOKING',
      entityId: updated.id,
    });

    const quoteDecisionWorkspaceId = (booking as any).quoteDecisionWorkspaceId as string | null;
    if (quoteDecisionWorkspaceId) {
      await advanceServiceQuoteDecision({
        propertyId: booking.propertyId,
        workspaceId: quoteDecisionWorkspaceId,
        actorUserId: userId,
        toStage: 'CLOSED',
        outcome: 'CANCELLED',
        relatedEntityType: 'BOOKING',
        relatedEntityId: bookingId,
        reason: input.reason,
      });
    }
    
    return this.formatBookingResponseWithWorkLink(updated);
  }

  /**
   * Homeowner leaves a review on a completed booking. One review per
   * booking — Review.bookingId is @unique, so a race is caught by the DB
   * even though we also check up front for a clean error message.
   */
  static async createReview(bookingId: string, userId: string, input: CreateReviewInput) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, homeownerId: true, providerId: true, status: true },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.homeownerId !== userId) {
      throw new Error('You do not have permission to review this booking');
    }

    if (booking.status !== 'COMPLETED') {
      throw new Error('You can only review a completed booking');
    }

    const existing = await prisma.review.findUnique({ where: { bookingId } });
    if (existing) {
      throw new Error('This booking already has a review');
    }

    try {
      return await prisma.review.create({
        data: {
          bookingId,
          authorId: userId,
          providerId: booking.providerId,
          rating: input.rating,
          title: input.title,
          content: input.content,
          qualityRating: input.qualityRating,
          communicationRating: input.communicationRating,
          valueRating: input.valueRating,
          professionalismRating: input.professionalismRating,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('This booking already has a review');
      }
      throw error;
    }
  }

  /** Returns the review for a booking (or null), scoped to the same access rules as getBookingById. */
  static async getReviewForBooking(bookingId: string, userId: string, userRole: UserRole) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, homeownerId: true, providerId: true },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (userRole !== 'ADMIN') {
      if (userRole === 'HOMEOWNER' && booking.homeownerId !== userId) {
        throw new Error('You do not have permission to view this booking');
      }
      if (userRole === 'PROVIDER' && booking.providerId !== userId) {
        throw new Error('You do not have permission to view this booking');
      }
    }

    return prisma.review.findUnique({ where: { bookingId } });
  }

  private static buildInventorySpecSheet(
    item:
      | {
          name: string;
          manufacturer: string | null;
          modelNumber: string | null;
          serialNumber: string | null;
          brand: string | null;
          model: string | null;
          serialNo: string | null;
        }
      | null
  ): string | null {
    if (!item) return null;

    const manufacturer = item.manufacturer || item.brand || 'Unknown';
    const model = item.modelNumber || item.model || 'Unknown';
    const serial = item.serialNumber || item.serialNo || 'Unknown';

    return [
      `Spec Sheet (${item.name})`,
      `- Manufacturer: ${manufacturer}`,
      `- Model: ${model}`,
      `- Serial: ${serial}`,
    ].join('\n');
  }

  private static badgeForServiceCategory(category: ServiceCategory): string {
    switch (category) {
      case ServiceCategory.HVAC:
        return 'PREDICTIVE_HVAC_STEWARD';
      case ServiceCategory.PLUMBING:
        return 'PREDICTIVE_PLUMBING_STEWARD';
      case ServiceCategory.ELECTRICAL:
        return 'PREDICTIVE_ELECTRICAL_STEWARD';
      default:
        return 'PREDICTIVE_HOME_CARE_STEWARD';
    }
  }

  private static inventoryCategoriesForService(category: ServiceCategory): InventoryItemCategory[] {
    if (category === ServiceCategory.HVAC) {
      return [InventoryItemCategory.HVAC];
    }
    if (category === ServiceCategory.PLUMBING) {
      return [InventoryItemCategory.PLUMBING];
    }
    if (category === ServiceCategory.ELECTRICAL) {
      return [InventoryItemCategory.ELECTRICAL];
    }

    return [
      InventoryItemCategory.APPLIANCE,
      InventoryItemCategory.ROOF_EXTERIOR,
      InventoryItemCategory.SAFETY,
      InventoryItemCategory.SMART_HOME,
      InventoryItemCategory.FURNITURE,
      InventoryItemCategory.ELECTRONICS,
      InventoryItemCategory.OTHER,
    ];
  }

  private static async awardPredictiveMaintenanceBadgeIfEligible(
    propertyId: string,
    inventoryCategory: InventoryItemCategory | null,
    fallbackServiceCategory: ServiceCategory
  ): Promise<void> {
    try {
      const mappedServiceCategory = inventoryCategory
        ? mapInventoryToServiceCategory(inventoryCategory)
        : fallbackServiceCategory;
      const inventoryCategories = this.inventoryCategoriesForService(mappedServiceCategory);

      const relevantItems = await prisma.inventoryItem.findMany({
        where: {
          propertyId,
          isVerified: true,
          category: {
            in: inventoryCategories,
          },
        },
        select: {
          id: true,
          lastServicedOn: true,
        },
      });

      if (relevantItems.length === 0) return;

      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 365);

      const categoryCompleted = relevantItems.every(
        (item) => item.lastServicedOn && item.lastServicedOn >= threshold
      );

      if (!categoryCompleted) return;

      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { unlockedBadges: true },
      });

      if (!property) return;

      const badge = this.badgeForServiceCategory(mappedServiceCategory);
      if (property.unlockedBadges.includes(badge)) return;

      await prisma.property.update({
        where: { id: propertyId },
        data: {
          unlockedBadges: [...property.unlockedBadges, badge],
        },
      });
    } catch (error) {
      logger.error({ err: error }, '[BOOKING] Failed to award predictive maintenance badge');
    }
  }

  /**
   * Check if status transition is valid
   */
  private static canTransitionTo(
    currentStatus: BookingStatus,
    newStatus: BookingStatus
  ): boolean {
    return VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * Get booking permissions for a user
   */
  static getBookingPermissions(
    booking: any,
    userId: string,
    userRole: UserRole
  ): BookingPermissions {
    const isHomeowner = booking.homeownerId === userId;
    const isProvider = booking.providerId === userId;
    const isAdmin = userRole === 'ADMIN';

    return {
      canView: isAdmin || isHomeowner || isProvider,
      canEdit: isAdmin || isHomeowner || isProvider,
      canConfirm: isProvider && booking.status === 'PENDING',
      canComplete: isProvider && booking.status === 'IN_PROGRESS',
      canCancel: (isAdmin || isHomeowner || isProvider) &&
        !['COMPLETED', 'CANCELLED'].includes(booking.status),
    };
  }

  /**
   * Format booking response
   */
  private static async formatBookingResponseWithWorkLink(booking: any): Promise<BookingResponse> {
    const links = await prisma.operationalWorkExecution.findMany({
      where: { executionType: 'BOOKING', executionEntityId: booking.id },
      select: { workItemId: true },
      take: 2,
    });
    if (links.length > 1) {
      throw new Error(`Booking ${booking.id} is linked to multiple Operational Work Items.`);
    }
    if (links.length === 0) return this.formatBookingResponse(booking);

    const event = await prisma.operationalWorkEvent.findUnique({
      where: {
        workItemId_idempotencyKey: {
          workItemId: links[0].workItemId,
          idempotencyKey: `booking-linked:${booking.id}`,
        },
      },
      select: { payload: true },
    });
    const recordedMethod = (event?.payload as { originResolution?: OriginResolutionMethod } | null)?.originResolution;
    return this.formatBookingResponse(booking, {
      operationalWorkItemId: links[0].workItemId,
      originResolution: recordedMethod ? publicOriginResolution(recordedMethod) : null,
    });
  }

  private static formatBookingResponse(
    booking: any,
    workLink: { operationalWorkItemId: string; originResolution: BookingOriginResolution | null } | null = null,
  ): BookingResponse {
    return {
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      category: booking.category,
      operationalWorkItemId: workLink?.operationalWorkItemId ?? null,
      originResolution: workLink?.originResolution ?? null,
      homeowner: {
        id: booking.homeowner.id,
        firstName: booking.homeowner.firstName,
        lastName: booking.homeowner.lastName,
        email: booking.homeowner.email,
        phone: booking.homeowner.phone,
      },
      provider: {
        id: booking.provider.id,
        firstName: booking.provider.firstName,
        lastName: booking.provider.lastName,
        email: booking.provider.email,
        phone: booking.provider.phone,
        businessName: booking.providerProfile.businessName,
      },
      service: {
        id: booking.service.id,
        name: booking.service.name,
        category: booking.service.category,
        basePrice: booking.service.basePrice.toString(),
        priceUnit: booking.service.priceUnit,
      },
      property: {
        id: booking.property.id,
        name: booking.property.name,
        address: booking.property.address,
        city: booking.property.city,
        state: booking.property.state,
        zipCode: booking.property.zipCode,
      },
      requestedDate: booking.requestedDate,
      scheduledDate: booking.scheduledDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      actualStartTime: booking.actualStartTime,
      actualEndTime: booking.actualEndTime,
      estimatedPrice: booking.estimatedPrice.toString(),
      finalPrice: booking.finalPrice?.toString() || null,
      depositAmount: booking.depositAmount?.toString() || null,
      description: booking.description,
      specialRequests: booking.specialRequests,
      internalNotes: booking.internalNotes,
      // NEW: Include health insight tracking fields
      insightFactor: booking.insightFactor || null,
      insightContext: booking.insightContext || null,
      maintenancePredictionId: booking.maintenancePredictionId || null,
      inventoryItemId: booking.inventoryItemId || null,
      priceFinalizationId: booking.priceFinalization?.id || null,
      executionScopeType: (booking as any).executionScopeType || null,
      executionScopeKey: (booking as any).executionScopeKey || null,
      // Phase 5: cast until Prisma client is regenerated after schema migration
      guidanceJourneyId: (booking as any).guidanceJourneyId || null,
      sourceRadarMatchId: (booking as any).sourceRadarMatchId || null,
      sourceRadarEventId: (booking as any).sourceRadarEventId || null,
      sourceIncidentId: (booking as any).sourceIncidentId || null,
      sourceRadarActionCode: (booking as any).sourceRadarActionCode || null,
      sourceLaunchSurface: (booking as any).sourceLaunchSurface || null,
      cancelledAt: booking.cancelledAt,
      cancelledBy: booking.cancelledBy,
      cancellationReason: booking.cancellationReason,
      completedAt: booking.completedAt,
      timeline: booking.timeline.map((t: any) => ({
        id: t.id,
        status: t.status,
        note: t.note,
        createdBy: t.createdBy,
        createdAt: t.createdAt,
      })),
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }
}

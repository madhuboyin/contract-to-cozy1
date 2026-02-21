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
  ListBookingsQuery,
  BookingResponse,
  BookingListResponse,
  BookingPermissions,
  VALID_STATUS_TRANSITIONS,
} from '../types/booking.types';

// PHASE 3 IMPLEMENTATION: Import JobQueueService
import JobQueueService from './JobQueue.service';

import { prisma } from '../lib/prisma';
import { NotificationService } from './notification.service';
import { incrementStreak } from './gamification.service';
import { mapInventoryToServiceCategory } from '../utils/inventoryServiceCategory.util';

export class BookingService {
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
    input: CreateBookingInput
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

    // Validate provider — input.providerId is the provider profile ID from the URL
    if (input.providerId !== service.providerProfileId) {
      throw new Error('Provider ID does not match service provider');
    }

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

    // Create booking with initial timeline
    const booking = await prisma.booking.create({
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
    
    await NotificationService.create({
      userId: booking.homeownerId,
      type: 'BOOKING_CREATED',
      title: 'Booking request submitted',
      message: `Your booking request for ${booking.service.name} has been submitted.`,
      actionUrl: `/bookings/${booking.id}`,
      metadata: {
        priority: 'HIGH', // 🔴 REQUIRED for immediate email
      },
      entityType: 'BOOKING',
      entityId: booking.id,
    });    

    // --- PHASE 3 IMPLEMENTATION START ---
    // Trigger re-calculation of Health Score / Risk Report immediately.
    // This ensures the "IMMEDIATE ACTION" count drops to 0 instantly after booking.
    try {
        console.log(`[BOOKING-SERVICE] Triggering risk update for property ${input.propertyId}`);
        await JobQueueService.enqueuePropertyIntelligenceJobs(input.propertyId);
    } catch (error) {
        // Non-blocking error logging. We don't want to fail the booking if the queue is down.
        console.error(`[BOOKING-SERVICE] Failed to enqueue risk update job:`, error);
    }
    // --- PHASE 3 IMPLEMENTATION END ---

    return this.formatBookingResponse(booking);
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
            formattedBookings.push(this.formatBookingResponse(booking));
        } catch (error) {
            // Log the error for later investigation but prevent crash
            // The console.error will appear in the server logs, alerting DevOps/Engineering
            console.error(`CRITICAL: Failed to format booking ID ${booking.id}. Skipping record.`, error);
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

    return this.formatBookingResponse(booking);
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

    return this.formatBookingResponse(updated);
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

    const updated = await prisma.booking.update({
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

    return this.formatBookingResponse(updated);
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

    const updated = await prisma.booking.update({
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

    return this.formatBookingResponse(updated);
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

    const updated = await prisma.$transaction(async (tx) => {
      const completedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'COMPLETED',
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

      return completedBooking;
    });

    if (booking.maintenancePredictionId) {
      try {
        await incrementStreak(booking.propertyId);
      } catch (error) {
        console.error('[BOOKING] Failed to increment streak from predictive completion:', error);
      }

      await this.awardPredictiveMaintenanceBadgeIfEligible(
        booking.propertyId,
        booking.inventoryItem?.category ?? null,
        booking.category
      );
    }

    return this.formatBookingResponse(updated);
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

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
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
 
    await NotificationService.create({
      userId: updated.homeownerId,
      type: 'BOOKING_CANCELLED',
      title: 'Booking cancelled',
      message: `Your booking has been cancelled.`,
      actionUrl: `/bookings/${updated.id}`,
      metadata: {
        priority: 'HIGH', // 🔴 REQUIRED for immediate email
      },
      entityType: 'BOOKING',
      entityId: updated.id,
    });
    
    return this.formatBookingResponse(updated);
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
      console.error('[BOOKING] Failed to award predictive maintenance badge:', error);
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
  private static formatBookingResponse(booking: any): BookingResponse {
    return {
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      category: booking.category,
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

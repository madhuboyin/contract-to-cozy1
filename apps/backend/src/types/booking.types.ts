// apps/backend/src/types/booking.types.ts

import { z } from 'zod';
import { BookingStatus, ProviderCredentialType, ServiceCategory } from '@prisma/client';
import { PROVIDER_WORK_CATEGORIES } from './provider.types';

/**
 * Create Booking Schema
 */
export const createBookingSchema = z.object({
  providerId: z.string().uuid('Invalid provider ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  propertyId: z.string().uuid('Invalid property ID'),
  
  // Scheduling
  requestedDate: z.string().datetime('Invalid date format').optional(),
  scheduledDate: z.string().datetime('Invalid date format').optional(),
  startTime: z.string().datetime('Invalid time format').optional(),
  endTime: z.string().datetime('Invalid time format').optional(),
  
  // Details
  description: z.string().min(10, 'Description must be at least 10 characters').max(1000),
  specialRequests: z.string().max(500).optional(),
  
  // Pricing
  estimatedPrice: z.number().positive('Price must be positive'),
  depositAmount: z.number().nonnegative('Deposit cannot be negative').optional(),
  
  // NEW: Health Insight Tracking
  insightFactor: z.string().max(100).optional(),     // e.g., "Age Factor", "Roof Age"
  insightContext: z.string().max(500).optional(),    // e.g., "Property age: 35 years"
  maintenancePredictionId: z.string().uuid('Invalid maintenance prediction ID').optional(),
  inventoryItemId: z.string().uuid('Invalid inventory item ID').optional(),
  priceFinalizationId: z.string().uuid('Invalid price finalization ID').optional(),
  guidanceJourneyId: z.string().uuid('Invalid guidance journey ID').optional(),
  guidanceStepKey: z.string().optional(),
  guidanceSignalIntentFamily: z.string().optional(),
  workCategory: z.enum(PROVIDER_WORK_CATEGORIES).optional(),
  guidanceEnforceGuard: z.boolean().optional(),
  sourceRadarMatchId: z.string().uuid('Invalid Radar match ID').optional(),
  sourceRadarEventId: z.string().uuid('Invalid Radar event ID').optional(),
  sourceIncidentId: z.string().uuid('Invalid Incident ID').optional(),
  sourceRadarActionCode: z.string().trim().min(1).max(128).optional(),
  sourceLaunchSurface: z.literal('home_event_radar').optional(),
}).superRefine((value, context) => {
  const hasRadarLineage = Boolean(
    value.sourceRadarEventId
    || value.sourceIncidentId
    || value.sourceRadarActionCode
    || value.sourceLaunchSurface,
  );
  if (hasRadarLineage && !value.sourceRadarMatchId) {
    context.addIssue({
      code: 'custom',
      path: ['sourceRadarMatchId'],
      message: 'Radar match ID is required for Radar booking lineage',
    });
  }
  if (value.sourceRadarMatchId && value.sourceLaunchSurface !== 'home_event_radar') {
    context.addIssue({
      code: 'custom',
      path: ['sourceLaunchSurface'],
      message: 'Radar booking lineage requires the Home Event Radar launch surface',
    });
  }
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * Update Booking Schema
 */
export const updateBookingSchema = z.object({
  scheduledDate: z.string().datetime().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  description: z.string().min(10).max(1000).optional(),
  specialRequests: z.string().max(500).optional(),
  estimatedPrice: z.number().positive().optional(),
  finalPrice: z.number().positive().optional(),
  internalNotes: z.string().max(1000).optional(),
});

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

/**
 * Cancel Booking Schema
 */
export const cancelBookingSchema = z.object({
  reason: z.string().min(10, 'Cancellation reason must be at least 10 characters').max(500),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

/**
 * Complete Booking Schema
 */
export const completeBookingSchema = z.object({
  actualStartTime: z.string().datetime(),
  actualEndTime: z.string().datetime(),
  finalPrice: z.number().positive(),
  internalNotes: z.string().max(1000).optional(),
});

export type CompleteBookingInput = z.infer<typeof completeBookingSchema>;

/**
 * Create Review Schema — homeowner leaving a review on a COMPLETED booking.
 * Sub-ratings are optional finer-grained context alongside the required
 * overall `rating`; scopeSummary/outcomeStatus/verifiedOutcome/variance
 * fields on the Review model are populated elsewhere (project-outcome
 * verification), not by the reviewer directly.
 */
export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  content: z.string().min(10, 'Review must be at least 10 characters').max(2000),
  qualityRating: z.number().int().min(1).max(5).optional(),
  communicationRating: z.number().int().min(1).max(5).optional(),
  valueRating: z.number().int().min(1).max(5).optional(),
  professionalismRating: z.number().int().min(1).max(5).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/**
 * List Bookings Query Schema
 */
export const listBookingsSchema = z.object({
  status: z.nativeEnum(BookingStatus).optional(),
  category: z.nativeEnum(ServiceCategory).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  sortBy: z.enum(['createdAt', 'scheduledDate', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  propertyId: z.string().uuid().optional(),
});

export type ListBookingsQuery = z.infer<typeof listBookingsSchema>;

/**
 * Booking Response Types
 */
export interface BookingResponse {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  category: ServiceCategory;
  
  // Parties
  homeowner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  
  provider: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    businessName: string;
  };
  
  // Service & Property
  service: {
    id: string;
    name: string;
    category: ServiceCategory;
    basePrice: string;
    priceUnit: string;
  };
  
  property: {
    id: string;
    name: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  
  // Scheduling
  requestedDate: Date | null;
  scheduledDate: Date | null;
  startTime: Date | null;
  endTime: Date | null;
  actualStartTime: Date | null;
  actualEndTime: Date | null;
  
  // Pricing
  estimatedPrice: string;
  finalPrice: string | null;
  depositAmount: string | null;
  
  // Details
  description: string;
  specialRequests: string | null;
  internalNotes: string | null;
  
  // NEW: Health Insight Tracking
  insightFactor: string | null;
  insightContext: string | null;
  maintenancePredictionId: string | null;
  inventoryItemId: string | null;
  priceFinalizationId: string | null;
  executionScopeType: string | null;
  executionScopeKey: string | null;

  // Phase 5: Guidance context — stored on the booking to enable service-completion
  // auto-advance of the linked guidance journey step (TR-03).
  guidanceJourneyId: string | null;
  sourceRadarMatchId: string | null;
  sourceRadarEventId: string | null;
  sourceIncidentId: string | null;
  sourceRadarActionCode: string | null;
  sourceLaunchSurface: string | null;
  
  // Cancellation
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  
  // Completion
  completedAt: Date | null;
  
  // Timeline
  timeline: BookingTimelineEntry[];
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;

  // Provider Trust & Compliance Verification — non-blocking warning surfaced
  // at creation time when the provider isn't currently verified for this
  // category (Section 7.1). Only set by createBooking; absent elsewhere.
  providerEligibilityWarning?: {
    serviceCategory: ServiceCategory;
    missingCredentialTypes: ProviderCredentialType[];
  } | null;
}

export interface BookingTimelineEntry {
  id: string;
  status: BookingStatus;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface BookingListResponse {
  bookings: BookingResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary?: {
    totalBookings: number;
    byStatus: Record<BookingStatus, number>;
  };
}

/**
 * Status Transition Validation
 */
export const VALID_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
};

/**
 * Permission checks
 */
export interface BookingPermissions {
  canView: boolean;
  canEdit: boolean;
  canConfirm: boolean;
  canComplete: boolean;
  canCancel: boolean;
}

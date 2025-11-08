// apps/backend/src/types/booking.types.ts

import { z } from 'zod';
import { BookingStatus, ServiceCategory } from '@prisma/client';

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

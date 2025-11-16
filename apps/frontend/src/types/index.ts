// apps/frontend/src/types/index.ts
/**
 * User Roles
 */
export type UserRole = 'HOMEOWNER' | 'PROVIDER' | 'ADMIN';

/**
 * User Status
 */
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

/**
 * Booking Status
 */
export type BookingStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

/**
 * Service Category - EXPANDED
 */
export type ServiceCategory = 
  | 'INSPECTION'
  | 'HANDYMAN'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'HVAC'
  | 'CARPENTRY'
  | 'PAINTING'
  | 'ROOFING'
  | 'LANDSCAPING'
  | 'CLEANING'
  | 'OTHER';

/**
 * User
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  emailVerified: boolean;
  status: UserStatus;
}

/**
 * Auth Response
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RegisterResponse {
  message: string;
  user: User;
  emailVerificationToken?: string;
}

/**
 * Provider - UPDATED to match backend response
 */
export interface Provider {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  businessName: string;
  averageRating: number;
  totalReviews: number;
  totalCompletedJobs: number;
  serviceRadius: number;
  serviceCategories: ServiceCategory[];
}

/**
 * Service - Updated to match database schema
 */
export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  inspectionType?: string | null;  // ADDED
  handymanType?: string | null;    // ADDED
  basePrice: string;
  priceUnit: string;
  description: string;
  minimumCharge?: string | null;   // ADDED
  estimatedDuration: number | null;
  isActive: boolean;               // ADDED - This fixes your error!
  createdAt?: string;              // ADDED
  updatedAt?: string;              // ADDED
}

/**
 * Property
 */
export interface Property {
  id: string;
  name: string | null;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary: boolean;
}

/**
 * Booking
 */
export interface Booking {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  category: ServiceCategory;
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
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  estimatedPrice: string;
  finalPrice: string | null;
  depositAmount: string | null;
  description: string;
  specialRequests: string | null;
  internalNotes: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  timeline: BookingTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface BookingTimelineEntry {
  id: string;
  status: BookingStatus;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

/**
 * API Response Types
 */
export interface APIError {
  success: false;
  message: string;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  errors?: any[];
}

export interface APISuccess<T = any> {
  success: true;
  data: T;
  message?: string;
}

export type APIResponse<T = any> = APISuccess<T> | APIError;

/**
 * Pagination
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Form Inputs
 */
export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface CreateBookingInput {
  providerId: string;
  serviceId: string;
  propertyId: string;
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  description: string;
  specialRequests?: string;
  estimatedPrice: number;
  depositAmount?: number;
}

// --- NEW TYPE FOR PHASE 3 ---
export interface MaintenanceTaskTemplate {
  id: string;
  title: string;
  description: string | null;
  serviceCategory: string | null;
  defaultFrequency: string; // e.g., "annually"
  sortOrder: number;
}

// --- ADD THESE NEW EXPORTS ---

/**
 * Defines the user's current goal (e.g., buying or managing).
 * This MUST match the enum in the Prisma schema.
 */
export type HomeownerSegment = 'HOME_BUYER' | 'EXISTING_OWNER';

/**
 * Defines the shape of a service category object
 * returned by the /api/service-categories endpoint.
 */
export interface ServiceCategoryConfig {
  category: string;
  displayName: string;
  description: string;
  icon: string;
}
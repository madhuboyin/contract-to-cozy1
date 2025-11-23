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
 * Service Category - Synced with Backend Enum
 */
export type ServiceCategory = 
  | 'INSPECTION'
  | 'HANDYMAN'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'HVAC'
  | 'LANDSCAPING'
  | 'CLEANING'
  | 'MOVING'
  | 'PEST_CONTROL'
  | 'LOCKSMITH'
  | 'INSURANCE'
  | 'ATTORNEY'
  | 'FINANCE'
  | 'WARRANTY'
  | 'ADMIN';

/**
 * Recurrence Frequency Enum
 */
export enum RecurrenceFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMI_ANNUALLY = 'SEMI_ANNUALLY',
  ANNUALLY = 'ANNUALLY',
}

/**
 * Homeowner Segment
 */
export type HomeownerSegment = 'HOME_BUYER' | 'EXISTING_OWNER';

// ============================================================================
// NEW DOCUMENT UPLOAD TYPES (ADDED)
// ============================================================================

/**
 * Document Type Enum (Synced with Backend Enum)
 */
export type DocumentType = 
  | 'INSPECTION_REPORT'
  | 'ESTIMATE'
  | 'INVOICE'
  | 'CONTRACT'
  | 'PERMIT'
  | 'PHOTO'
  | 'VIDEO'
  | 'INSURANCE_CERTIFICATE'
  | 'LICENSE'
  | 'OTHER';

/**
 * Document Upload Request DTO
 * Note: The file itself is sent as 'file' in a separate multipart/form-data field.
 */
export interface DocumentUploadInput {
  type: DocumentType;
  name: string;
  description?: string;
  // Exactly one of the following is typically required
  propertyId?: string;
  warrantyId?: string;
  policyId?: string;
}

// ============================================================================
// NEW HOMEOWNER MANAGEMENT TYPES
// ============================================================================

/**
 * Expense Category Enum
 */
export type ExpenseCategory = 
  | 'REPAIR_SERVICE'
  | 'PROPERTY_TAX'
  | 'HOA_FEE'
  | 'UTILITY'
  | 'APPLIANCE'
  | 'MATERIALS'
  | 'OTHER';

/**
 * Core Document Type (Extended to include new relations)
 */
export interface Document {
  id: string;
  name: string;
  fileUrl: string;
  type: DocumentType; // Updated type to use the new DocumentType enum
  description: string | null;
  fileSize: number;
  mimeType: string;
  propertyId: string | null;
  warrantyId: string | null;
  policyId: string | null;
  createdAt: string;
}

/**
 * Expense Interface
 */
export interface Expense {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  bookingId: string | null;
  description: string;
  category: ExpenseCategory;
  amount: number;
  transactionDate: string; // ISO Date string
  createdAt: string;
  updatedAt: string;
}

/**
 * Warranty Interface
 */
export interface Warranty {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  providerName: string;
  policyNumber: string | null;
  coverageDetails: string | null;
  cost: number | null;
  startDate: string; // ISO Date string
  expiryDate: string; // ISO Date string
  documents: Document[]; // Array of associated documents
  createdAt: string;
  updatedAt: string;
}

/**
 * Insurance Policy Interface
 */
export interface InsurancePolicy {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  carrierName: string;
  policyNumber: string;
  coverageType: string | null;
  premiumAmount: number;
  startDate: string; // ISO Date string
  expiryDate: string; // ISO Date string
  documents: Document[]; // Array of associated documents
  createdAt: string;
  updatedAt: string;
}

// --- CHECKLIST TYPES (FIX: ADDED MISSING TYPES) ---
/**
 * Checklist Item Interface
 */
export interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  status: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED'; // Assuming enum values
  serviceCategory: ServiceCategory | null;
  isRecurring: boolean;
  frequency: RecurrenceFrequency | null;
  nextDueDate: string | null;
  lastCompletedDate: string | null;
  checklistId: string;
  createdAt: string; 
  updatedAt: string;
}

/**
 * Checklist Interface
 */
export interface Checklist {
  id: string;
  homeownerProfileId: string;
  createdAt: string;
  updatedAt: string;
}

// NEW DTO for updating a ChecklistItem
export interface UpdateChecklistItemInput {
  title?: string;
  description?: string | null;
  status?: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';
  serviceCategory?: ServiceCategory | null;
  isRecurring?: boolean;
  frequency?: RecurrenceFrequency | null;
  nextDueDate?: string | null; // ISO Date string
  lastCompletedDate?: string | null; // ISO Date string
}
// --- END CHECKLIST TYPES ---

// ============================================================================
// CORE APPLICATION TYPES (Existing)
// ============================================================================

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
  // FIX: Add missing creation date property to resolve the build error in profile/page.tsx
  createdAt: string; 
  segment?: HomeownerSegment; 
  homeownerProfile?: { 
    id: string;
    segment: HomeownerSegment;
  } | null;
}

/**
 * Auth Response
 */
// FIX: Add success property to LoginResponse
export interface LoginResponse {
  success: true; 
  accessToken: string;
  refreshToken: string;
  user: User;
}

// FIX: Add success property to RegisterResponse
export interface RegisterResponse {
  success: true;
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
  inspectionType?: string | null;
  handymanType?: string | null;
  basePrice: string;
  priceUnit: string;
  description: string;
  minimumCharge?: string | null;
  estimatedDuration: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Property
 */

export interface Property {
  id: string;
  homeownerProfileId: string;
  name: string | null;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary: boolean;
  
  // PHASE 4 ADDITIONS: Basic/Migrated Fields
  propertyType: string | null; // Corresponds to the new Enum string
  propertySize: number | null; // Square Footage
  yearBuilt: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  
  // PHASE 4 ADDITIONS: Advanced Fields
  ownershipType?: string | null;
  occupantsCount?: number | null;
  heatingType?: string | null;
  coolingType?: string | null;
  waterHeaterType?: string | null;
  roofType?: string | null;
  hvacInstallYear?: number | null;
  waterHeaterInstallYear?: number | null;
  roofReplacementYear?: number | null;
  
  // Booleans
  hasSmokeDetectors?: boolean | null;
  hasCoDetectors?: boolean | null;
  hasSecuritySystem?: boolean | null;
  hasFireExtinguisher?: boolean | null;
  hasIrrigation?: boolean | null;
  hasDrainageIssues?: boolean | null;
  
}

/**
 * Booking Timeline Entry
 */
export interface BookingTimelineEntry {
  id: string;
  status: BookingStatus;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
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

// ============================================================================
// FORM INPUTS (DTOs for Frontend)
// ============================================================================

export interface LoginInput {
  email: string;
  password: string;
}

// FIX: Update RegisterInput to include the optional segment property
export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  segment?: HomeownerSegment;
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

/**
 * Maintenance Task Template
 */
export interface MaintenanceTaskTemplate {
  id: string;
  title: string;
  description: string | null;
  serviceCategory: ServiceCategory | null;
  defaultFrequency: RecurrenceFrequency;
  sortOrder: number;
}

/**
 * Service Category Config (for UI display)
 */
export interface ServiceCategoryConfig {
  category: ServiceCategory;
  displayName: string;
  description: string;
  icon: string;
}

/**
 * Maintenance Task Configuration
 */
export interface MaintenanceTaskConfig {
  templateId: string;
  title: string;
  description: string | null;
  isRecurring: boolean;
  frequency: RecurrenceFrequency | null;
  nextDueDate: Date | null;
  serviceCategory: ServiceCategory | null;
}

// NEW DTOs for Home Management

export interface CreateExpenseInput {
  propertyId?: string;
  bookingId?: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  transactionDate: string; // ISO date string
}
export interface UpdateExpenseInput extends Partial<CreateExpenseInput> {}


export interface CreateWarrantyInput {
  propertyId?: string;
  providerName: string;
  policyNumber?: string;
  coverageDetails?: string;
  cost?: number;
  startDate: string; // ISO date string
  expiryDate: string; // ISO date string
}
export interface UpdateWarrantyInput extends Partial<CreateWarrantyInput> {}


export interface CreateInsurancePolicyInput {
  propertyId?: string;
  carrierName: string;
  policyNumber: string;
  coverageType?: string;
  premiumAmount: number;
  startDate: string; // ISO date string
  expiryDate: string; // ISO date string
}
export interface UpdateInsurancePolicyInput extends Partial<CreateInsurancePolicyInput> {}
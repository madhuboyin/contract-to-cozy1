// apps/backend/src/types/homeowner-management.types.ts

// Assuming @prisma/client is available in the backend environment.
// FIX 1: Import all relevant enums/types from @prisma/client to resolve potential import resolution issues.
import * as PrismaEnums from '@prisma/client'; 
import { WarrantyCategory } from '@prisma/client';

/**
 * Expense Category Enum (Synced with Prisma)
 */
// FIX 2: Export the value object and type explicitly from the imported module.
export const ExpenseCategory = PrismaEnums.ExpenseCategory;
export type ExpenseCategory = PrismaEnums.ExpenseCategory;

// ============================================================================
// CORE ENTITY INTERFACES
// ============================================================================

/**
 * Document Interface (Minimal structure reflecting entity relations)
 * NOTE: This is manually synced with the full Document model fields required for display/relations.
 */
export interface Document {
  id: string;
  name: string;
  fileUrl: string;
  // Added other fields from the Prisma schema for completeness, though list services only select a subset.
  type: DocumentType; 
  description: string | null;
  fileSize: number;
  mimeType: string;
  propertyId: string | null;
  warrantyId: string | null;
  policyId: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  amount: number; // Decimal(12, 2) in DB, use number for JavaScript API
  transactionDate: Date;
  createdAt: Date;
  updatedAt: Date;
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
  cost: number | null; // Decimal(12, 2) in DB
  startDate: Date;
  expiryDate: Date;
  createdAt: Date;
  updatedAt: Date;
  documents: Document[]; 
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
  premiumAmount: number; // Decimal(12, 2) in DB
  startDate: Date;
  expiryDate: Date;
  createdAt: Date;
  updatedAt: Date;
  documents: Document[];
}

// ============================================================================
// DTOs (Data Transfer Objects) for API Input
// ============================================================================

export interface CreateExpenseDTO {
  propertyId?: string;
  bookingId?: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  // Dates are often passed as ISO strings in API calls, but type as Date for internal validation/logic
  transactionDate: Date; 
}

export interface UpdateExpenseDTO extends Partial<CreateExpenseDTO> {}

export interface CreateWarrantyDTO {
  propertyId?: string;
  homeAssetId?: string;
  inventoryItemId?: string; 
  providerName: string;
  policyNumber?: string;
  coverageDetails?: string;
  cost?: number;
  startDate: Date;
  expiryDate: Date;
  category: WarrantyCategory;
}

export interface UpdateWarrantyDTO extends Partial<CreateWarrantyDTO> {}

export interface CreateInsurancePolicyDTO {
  propertyId?: string;
  carrierName: string;
  policyNumber: string;
  coverageType?: string;
  premiumAmount: number;
  startDate: Date;
  expiryDate: Date;
}

export interface UpdateInsurancePolicyDTO extends Partial<CreateInsurancePolicyDTO> {}

// --- DTOs and Types for Document Management ---

/**
 * Document Type Enum (Synced with schema.prisma)
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
 * DTO for creating a document via the upload endpoint.
 */
export interface CreateDocumentDTO {
  type: DocumentType;
  name: string;
  description?: string;
  propertyId?: string;
  warrantyId?: string;
  policyId?: string;
}
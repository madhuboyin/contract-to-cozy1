// apps/backend/src/types/homeowner-management.types.ts

// Assuming @prisma/client is available in the backend environment.
import { ExpenseCategory as ExpenseCategoryPrisma } from '@prisma/client';

/**
 * Expense Category Enum (Synced with Prisma)
 */
export const ExpenseCategory = ExpenseCategoryPrisma;
export type ExpenseCategory = ExpenseCategoryPrisma;

// ============================================================================
// CORE ENTITY INTERFACES
// ============================================================================

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
  providerName: string;
  policyNumber?: string;
  coverageDetails?: string;
  cost?: number;
  startDate: Date;
  expiryDate: Date;
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

// You may also need to update DTOs in other files (like document.types.ts) 
// to handle the new document relations, but these are the core new DTOs.
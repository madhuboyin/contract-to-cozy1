// apps/frontend/src/app/(dashboard)/dashboard/types.ts
import { Property, HomeownerProfile, AssetRiskDetail, Booking, ChecklistItem, RecurrenceFrequency } from "@/types";

// --- TYPES (Centralized and Unified) ---

export type ChecklistItemStatus = 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';

/**
 * The unified interface for checklist items, used when passing data from 
 * the router (page.tsx) to the segment dashboard components.
 * FIX: Added missing properties (frequency, lastCompletedDate, checklistId, propertyId)
 * to be compatible with canonical ChecklistItem.
 */
export interface DashboardChecklistItem { 
  id: string;
  title: string;
  description: string | null;
  status: ChecklistItemStatus | string; 
  serviceCategory: string | null;
  isRecurring: boolean;
  
  // FIX: Added missing fields
  frequency: RecurrenceFrequency | null; // Assumes RecurrenceFrequency is imported/available
  lastCompletedDate: string | null;
  checklistId: string;
  propertyId: string | null; // CRITICAL FIX
  
  nextDueDate: string | null;
  createdAt: string; 
  updatedAt: string;
}

// Local type for API response (matches DashboardChecklistItem structurally)
export interface ChecklistItemAPIResponse extends DashboardChecklistItem {}

export interface ChecklistData {
  id: string;
  items: ChecklistItemAPIResponse[];
}

export interface DashboardData {
  bookings: Booking[];
  properties: Property[];
  checklist: ChecklistData | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Interface representing the detailed breakdown of the Property Health Score.
 */
export interface HealthScoreResult {
  totalScore: number;
  baseScore: number;
  unlockedScore: number;
  maxPotentialScore: number;
  maxBaseScore: number;
  maxExtraScore: number;
  insights: { 
    factor: string; 
    status: string; 
    score: number;
    details?: string[];  // ADD THIS
  }[];
  ctaNeeded: boolean;
}

/**
 * The core Property type from the API, extended with the calculated score.
 * It extends the base Property type imported via '@/types'
 */
export interface ScoredProperty extends Property { // Assumes Property is imported or available globally
    healthScore: HealthScoreResult;
}

// NEW TYPE FOR PHASE 2: Risk Assessment
export interface RiskReportSummary {
  riskScore: number; // 0 to 100 (100 is low risk)
  financialExposureTotal: number; // Total estimated cost in USD
  status: 'QUEUED' | 'CALCULATED';
  propertyId: string;
  lastCalculatedAt: Date; // Keep for freshness check, though the service handles staleness
  details: AssetRiskDetail[];
}

export interface DashboardData {
  profile: HomeownerProfile;
  properties: Property[];
  primaryProperty: Property | null;
  riskReportSummary: RiskReportSummary | null; // NEW FIELD
}
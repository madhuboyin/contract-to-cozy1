// apps/frontend/src/app/(dashboard)/dashboard/types.ts
import { Property, HomeownerProfile, AssetRiskDetail } from "@/types";

// --- TYPES (Centralized and Unified) ---

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

// Note: DashboardData is defined above (line 41). This extended version is available
// as DashboardDataWithProfile for components that need profile/risk data.
export interface DashboardDataWithProfile {
  profile: HomeownerProfile;
  properties: Property[];
  primaryProperty: Property | null;
  riskReportSummary: RiskReportSummary | null;
}

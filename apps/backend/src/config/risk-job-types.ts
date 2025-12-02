// apps/backend/src/config/risk-job-types.ts

/**
 * Defines the unique name for the risk calculation job used by the JobQueueService
 * and the Worker App.
 */
export const RISK_JOB_TYPES = {
    CALCULATE_RISK: 'calculateRiskAssessment',
  };

/**
 * Defines the job types related to Property Intelligence features.
 */
export enum PropertyIntelligenceJobType {
  // Renamed from 'calculateRiskAssessment' (old value) to align with enum naming
  CALCULATE_RISK_REPORT = 'CALCULATE_RISK_REPORT', 
  // NEW JOB TYPE FOR FINANCIAL EFFICIENCY
  CALCULATE_FES = 'CALCULATE_FES', 
}

export interface PropertyIntelligenceJobPayload {
  propertyId: string;
  jobType: PropertyIntelligenceJobType;
};
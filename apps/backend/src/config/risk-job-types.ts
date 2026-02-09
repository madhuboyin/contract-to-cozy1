// apps/backend/src/config/risk-job-types.ts

/**
 * Defines the job types related to Property Intelligence features.
 * This enum is the single source of truth for queue job names.
 */
export enum PropertyIntelligenceJobType {
  CALCULATE_RISK_REPORT = 'CALCULATE_RISK_REPORT',
  CALCULATE_FES = 'CALCULATE_FES',
}

export interface PropertyIntelligenceJobPayload {
  propertyId: string;
  jobType: PropertyIntelligenceJobType;
}

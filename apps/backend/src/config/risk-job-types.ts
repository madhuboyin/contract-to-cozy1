// apps/backend/src/config/risk-job-types.ts

/**
 * Defines the job types related to Property Intelligence features.
 * This enum is the single source of truth for queue job names.
 */
export enum PropertyIntelligenceJobType {
  CALCULATE_RISK_REPORT = 'CALCULATE_RISK_REPORT',
  CALCULATE_HIDDEN_ASSETS = 'CALCULATE_HIDDEN_ASSETS',
  REFRESH_HOME_DIGITAL_TWIN = 'REFRESH_HOME_DIGITAL_TWIN',
  COMPUTE_HOME_DIGITAL_TWIN_SCENARIO = 'COMPUTE_HOME_DIGITAL_TWIN_SCENARIO',
}

export interface PropertyIntelligenceJobPayload {
  propertyId: string;
  jobType: PropertyIntelligenceJobType;
  scenarioId?: string;
  digitalTwinId?: string;
  computationRunId?: string;
}

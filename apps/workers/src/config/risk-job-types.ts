// apps/workers/src/config/risk-job-types.ts

/**
 * Defines the unique name for the risk calculation job used by the JobQueueService
 * and the Worker App.
 * 
 * NOTE: This file is duplicated in apps/backend/src/config/risk-job-types.ts
 * Keep them in sync!
 */
export const RISK_JOB_TYPES = {
  CALCULATE_RISK: 'calculateRiskAssessment',
};

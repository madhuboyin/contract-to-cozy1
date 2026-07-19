import { z } from 'zod';
import { RecommendationSafetyTierSchema } from './recommendationGovernance.contract';

export const RECOMMENDATION_INCIDENT_TYPES = [
  'COMPLAINT', 'REVERSAL', 'OVERRIDE', 'CALIBRATION', 'INCORRECT_CONTENT',
  'SAFETY_HARM', 'COMMERCIAL_INTEGRITY', 'UPSTREAM_FAILURE', 'OTHER',
] as const;
export const RECOMMENDATION_INCIDENT_SEVERITIES = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;
export const RECOMMENDATION_INCIDENT_STATUSES = ['OPEN', 'TRIAGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'CLOSED'] as const;
export const RECOMMENDATION_INCIDENT_RESOLUTIONS = [
  'CORRECTED', 'RULE_PAUSED', 'CONTENT_REVISED', 'FALSE_POSITIVE',
  'USER_EDUCATION', 'ESCALATED', 'NO_CHANGE', 'OTHER',
] as const;

export const RecommendationIncidentTypeSchema = z.enum(RECOMMENDATION_INCIDENT_TYPES);
export const RecommendationIncidentSeveritySchema = z.enum(RECOMMENDATION_INCIDENT_SEVERITIES);
export const RecommendationIncidentStatusSchema = z.enum(RECOMMENDATION_INCIDENT_STATUSES);
export const RecommendationIncidentResolutionSchema = z.enum(RECOMMENDATION_INCIDENT_RESOLUTIONS);

export type RecommendationIncidentType = z.infer<typeof RecommendationIncidentTypeSchema>;
export type RecommendationIncidentSeverity = z.infer<typeof RecommendationIncidentSeveritySchema>;
export type RecommendationIncidentStatus = z.infer<typeof RecommendationIncidentStatusSchema>;
export type RecommendationIncidentResolution = z.infer<typeof RecommendationIncidentResolutionSchema>;

const TRANSITIONS: Record<RecommendationIncidentStatus, readonly RecommendationIncidentStatus[]> = {
  OPEN: ['TRIAGED'],
  TRIAGED: ['INVESTIGATING', 'MITIGATED', 'RESOLVED'],
  INVESTIGATING: ['MITIGATED', 'RESOLVED'],
  MITIGATED: ['INVESTIGATING', 'RESOLVED'],
  RESOLVED: ['INVESTIGATING', 'CLOSED'],
  CLOSED: [],
};

export function canTransitionRecommendationIncident(
  from: RecommendationIncidentStatus,
  to: RecommendationIncidentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function defaultRecommendationIncidentSeverity(
  type: RecommendationIncidentType,
  safetyTier: z.infer<typeof RecommendationSafetyTierSchema>,
): RecommendationIncidentSeverity {
  if (type === 'SAFETY_HARM' || safetyTier === 'SAFETY_EMERGENCY') return 'CRITICAL';
  if (type === 'COMMERCIAL_INTEGRITY' || safetyTier === 'REGULATED_COVERAGE') return 'HIGH';
  if (type === 'REVERSAL' || type === 'INCORRECT_CONTENT' || safetyTier === 'MATERIAL_FINANCIAL') return 'MODERATE';
  return 'LOW';
}

export function incidentRequiresImmediatePause(input: {
  type: RecommendationIncidentType;
  severity: RecommendationIncidentSeverity;
  safetyTier: z.infer<typeof RecommendationSafetyTierSchema>;
}): boolean {
  return input.severity === 'CRITICAL' || input.type === 'SAFETY_HARM' || input.safetyTier === 'SAFETY_EMERGENCY';
}

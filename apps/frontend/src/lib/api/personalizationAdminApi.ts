import { api } from './client';

export interface PersonalizationCatalogDefinition {
  id: string;
  code: string;
  category: string;
  safetyClass: string;
  safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'REGULATED_COVERAGE' | 'SAFETY_EMERGENCY';
  governancePolicyVersion: string;
  status: string;
  pausedAt: string | null;
  pauseReason: string | null;
  governanceReviews: Array<{
    role: RecommendationReviewRole;
    decision: 'APPROVED' | 'REJECTED';
    reviewerUserId: string;
    policyVersion: string;
    notes: string | null;
    reviewedAt: string;
  }>;
  launchReadiness: {
    ready: boolean;
    requiredRoles: RecommendationReviewRole[];
    approvedRoles: RecommendationReviewRole[];
    missingRoles: RecommendationReviewRole[];
    reasons: string[];
  } | null;
  rules: Array<{
    version: number;
    status: string;
    updatedAt: string;
  }>;
  contentVersions: Array<{
    locale: string;
    version: number;
    title: string;
    status: string;
    reviewDate: string | null;
    updatedAt: string;
  }>;
}

export type RecommendationReviewRole = 'PRODUCT' | 'DOMAIN' | 'TRUST' | 'LEGAL_COMPLIANCE' | 'COMMERCIAL_INTEGRITY';

export interface PersonalizationCatalogQuestion {
  code: string;
  version: number;
  prompt: string;
  status: string;
  updatedAt: string;
}

export interface PersonalizationCatalogResponse {
  definitions: PersonalizationCatalogDefinition[];
  questions: PersonalizationCatalogQuestion[];
}

export interface PersonalizationQualityResponse {
  windowDays: number;
  since: string;
  generatedAt: string;
  optionalProfilesEnabled: number;
  propertiesWithDefaultGuidance: number;
  recommendations: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    byDefinition: Array<{ code: string; count: number }>;
  };
  feedback: {
    total: number;
    explicit: number;
    accepted: number;
    negative: number;
    acceptanceRate: number | null;
    negativeRate: number | null;
    reasons: Array<{ reasonCode: string; count: number }>;
    complaints: number;
    overrides: number;
    reversals: number;
    corrections: number;
  };
  calibration: Array<{
    band: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
    samples: number;
    positiveOutcomes: number;
    observedPositiveRate: number | null;
    averageConfidence: number | null;
    calibrationGap: number | null;
  }>;
  incidents: {
    total: number;
    open: number;
    resolved: number;
    critical: number;
    resolutionRate: number | null;
    medianResolutionHours: number | null;
    byStatus: Array<{ status: string; count: number }>;
    byType: Array<{ type: string; count: number }>;
  };
  profileAnswers: Array<{ action: string; count: number }>;
  sample: {
    decisionEvents: number;
    minimumRequired: number;
    status: 'NO_DATA' | 'INSUFFICIENT_SAMPLE' | 'REVIEWABLE';
    onlineTuningAllowed: false;
  };
}

export type RecommendationIncidentStatus = 'OPEN' | 'TRIAGED' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED' | 'CLOSED';
export type RecommendationIncidentSeverity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type RecommendationIncidentType = 'COMPLAINT' | 'REVERSAL' | 'OVERRIDE' | 'CALIBRATION' | 'INCORRECT_CONTENT' | 'SAFETY_HARM' | 'COMMERCIAL_INTEGRITY' | 'UPSTREAM_FAILURE' | 'OTHER';
export type RecommendationIncidentResolution = 'CORRECTED' | 'RULE_PAUSED' | 'CONTENT_REVISED' | 'FALSE_POSITIVE' | 'USER_EDUCATION' | 'ESCALATED' | 'NO_CHANGE' | 'OTHER';

export interface RecommendationIncident {
  id: string;
  definitionId: string;
  recommendationId: string | null;
  sourceFeedbackId: string | null;
  type: RecommendationIncidentType;
  severity: RecommendationIncidentSeverity;
  status: RecommendationIncidentStatus;
  safetyTier: PersonalizationCatalogDefinition['safetyTier'];
  policyVersion: string;
  summary: string;
  details: string | null;
  assignedToUserId: string | null;
  targetResolutionAt: string | null;
  createdAt: string;
  triagedAt: string | null;
  mitigatedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionCode: RecommendationIncidentResolution | null;
  resolutionSummary: string | null;
  rootCause: string | null;
  correctiveAction: string | null;
  definition: {
    code: string;
    status: string;
    pausedAt: string | null;
    pauseReason: string | null;
  };
  recommendation: { id: string; propertyId: string; confidence: number | null; status: string } | null;
}

export async function getPersonalizationAdminCatalog() {
  return (await api.get<PersonalizationCatalogResponse>('/api/admin/personalization/catalog')).data;
}

export async function getPersonalizationQuality(windowDays = 30) {
  return (await api.get<PersonalizationQualityResponse>('/api/admin/personalization/quality', {
    params: { windowDays },
  })).data;
}

export async function getRecommendationIncidents() {
  return (await api.get<RecommendationIncident[]>('/api/admin/personalization/incidents')).data;
}

export async function createRecommendationIncident(payload: {
  definitionCode: string;
  recommendationId?: string | null;
  type: RecommendationIncidentType;
  severity?: RecommendationIncidentSeverity;
  summary: string;
  details?: string | null;
}) {
  return (await api.post<{ incident: RecommendationIncident; created: boolean; definitionPaused: boolean }>(
    '/api/admin/personalization/incidents',
    payload,
  )).data;
}

export async function transitionRecommendationIncident(
  incidentId: string,
  payload: {
    status: RecommendationIncidentStatus;
    severity?: RecommendationIncidentSeverity;
    note: string;
    resolutionCode?: RecommendationIncidentResolution | null;
    resolutionSummary?: string | null;
    rootCause?: string | null;
    correctiveAction?: string | null;
  },
) {
  return (await api.post<RecommendationIncident>(
    `/api/admin/personalization/incidents/${incidentId}/transitions`,
    payload,
  )).data;
}

export async function activatePersonalizationDefinition(
  code: string,
  payload: { ruleVersion: number; contentVersion: number; locale: string },
) {
  return (await api.post(`/api/admin/personalization/definitions/${code}/activate`, payload)).data;
}

export async function activatePersonalizationQuestion(code: string, version: number) {
  return (await api.post(`/api/admin/personalization/questions/${code}/activate`, { version })).data;
}

export async function recordPersonalizationGovernanceReview(
  code: string,
  payload: { role: RecommendationReviewRole; decision: 'APPROVED' | 'REJECTED'; notes?: string | null },
) {
  return (await api.post(`/api/admin/personalization/definitions/${code}/governance-reviews`, payload)).data;
}

export async function pausePersonalizationDefinition(code: string, reason: string) {
  return (await api.post(`/api/admin/personalization/definitions/${code}/pause`, { reason })).data;
}

export async function resumePersonalizationDefinition(code: string) {
  return (await api.post(`/api/admin/personalization/definitions/${code}/resume`, {})).data;
}

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
  };
  profileAnswers: Array<{ action: string; count: number }>;
  sample: {
    decisionEvents: number;
    minimumRequired: number;
    status: 'NO_DATA' | 'INSUFFICIENT_SAMPLE' | 'REVIEWABLE';
    onlineTuningAllowed: false;
  };
}

export async function getPersonalizationAdminCatalog() {
  return (await api.get<PersonalizationCatalogResponse>('/api/admin/personalization/catalog')).data;
}

export async function getPersonalizationQuality(windowDays = 30) {
  return (await api.get<PersonalizationQualityResponse>('/api/admin/personalization/quality', {
    params: { windowDays },
  })).data;
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

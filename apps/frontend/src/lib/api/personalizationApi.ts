import { api } from './client';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';

export interface PersonalizationRecommendation {
  id: string;
  status: string;
  score: number | null;
  priorityBand: string | null;
  confidence: number | null;
  firstEligibleAt: string;
  rankingReasons: string[];
  definition: {
    code: string;
    category: string;
    targetModule: string;
    safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'REGULATED_COVERAGE' | 'SAFETY_EMERGENCY';
    governancePolicyVersion: string;
  };
  governance: {
    safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'REGULATED_COVERAGE' | 'SAFETY_EMERGENCY';
    professionalBoundary: string | null;
    conservativeFallback: string | null;
    emergencyEscalation: string | null;
    policyVersion: string;
  } | null;
  explanations: Array<{
    headline: string;
    reasonCodes: Array<{ code: string; templateKey: string; params?: { message?: string; factSummary?: string } }>;
    evidenceJson: unknown;
  }>;
}

export interface PersonalizationResponse {
  propertyContext?: PropertyContextEnvelope;
  available: boolean;
  profileEnabled: boolean;
  consentedAt?: string | null;
  recommendations: PersonalizationRecommendation[];
  rankingContext: {
    profileApplied: boolean;
    reasons: string[];
  };
  capabilities: {
    canManageSensitiveProfile: boolean;
    canViewSensitiveEvidence: boolean;
    canViewOrdinaryRecommendations: boolean;
    canAct: boolean;
    canGiveFeedback: boolean;
  };
  nextQuestion?: {
    id: string;
    prompt: string;
    whyAsked: string;
    privacyNote: string;
    answerSchema: { type?: string; min?: number; max?: number };
  } | null;
}

export async function getPersonalization(propertyId: string) {
  return (await api.get<PersonalizationResponse>(`/api/properties/${propertyId}/personalization`)).data;
}

export type ContextMapNodeType = 'PROPERTY' | 'HOUSEHOLD' | 'PROFILE_FACT' | 'DERIVED_TRAIT' | 'RECOMMENDATION';

export interface PersonalizationContextMap {
  version: 'context-map-v0';
  generatedAt: string;
  configured: boolean;
  consent: { version: string; consentedAt: string | null } | null;
  summary: Record<ContextMapNodeType, number>;
  nodes: Array<{
    id: string;
    type: ContextMapNodeType;
    label: string;
    detail?: string;
    source: string;
    confidence?: number;
    validFrom: string | null;
    validTo: string | null;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: 'OCCUPIES' | 'HAS_EXPLICIT_FACT' | 'HAS_DERIVED_TRAIT' | 'HAS_RECOMMENDATION';
    source: string;
    validFrom: string | null;
    validTo: string | null;
  }>;
  limitations: string[];
}

export async function getPersonalizationContextMap(propertyId: string) {
  return (await api.get<PersonalizationContextMap>(
    `/api/properties/${propertyId}/personalization/context-map`,
  )).data;
}

export async function enableOptionalPersonalizationProfile(propertyId: string) {
  return (await api.post<{ profileEnabled: true; consentedAt: string }>(
    `/api/properties/${propertyId}/personalization/profile/enable`,
    { consentAccepted: true },
  )).data;
}

export async function sendRecommendationFeedback(
  propertyId: string,
  recommendationId: string,
  type: 'DISMISSED' | 'NOT_RELEVANT',
  reasonCode?: 'ALREADY_DONE' | 'TOO_EXPENSIVE' | 'NOT_APPLICABLE' | 'BAD_TIMING' | 'WRONG_PROFILE' | 'OTHER',
) {
  return (await api.post(
    `/api/properties/${propertyId}/personalization/recommendations/${recommendationId}/feedback`,
    { eventId: crypto.randomUUID(), type, explicit: true, reasonCode },
  )).data;
}

export async function answerProfileQuestion(
  propertyId: string,
  questionId: string,
  action: 'ANSWERED' | 'SKIPPED' | 'SNOOZED',
  answerJson?: unknown,
) {
  return (await api.post(
    `/api/properties/${propertyId}/personalization/questions/${questionId}/answers`,
    { idempotencyKey: crypto.randomUUID(), action, answerJson },
  )).data;
}

export async function resetOptionalPersonalizationProfile(propertyId: string) {
  return (await api.delete<{ reset: boolean }>(`/api/properties/${propertyId}/personalization/profile`)).data;
}

export async function refreshPersonalization(propertyId: string) {
  return (await api.post<{ evaluated: number; active: number; paused?: boolean }>(
    `/api/properties/${propertyId}/personalization/refresh`,
  )).data;
}

export type PersonalizationModule = 'DASHBOARD' | 'MAINTENANCE' | 'HEALTH';

export interface ModuleRecommendation {
  id: string;
  code: string;
  category: string;
  modules: PersonalizationModule[];
  title: string;
  summary: string;
  score: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number | null;
  governance: {
    safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'REGULATED_COVERAGE' | 'SAFETY_EMERGENCY';
    professionalBoundary: string | null;
    conservativeFallback: string | null;
    emergencyEscalation: string | null;
    policyVersion: string;
  };
  actions: Array<{ type: 'CONVERT_TO_TASK' | 'OPEN_MAINTENANCE'; label: string; enabled: boolean }>;
  expiresAt: string | null;
}

export interface ModuleRecommendationsResponse {
  configured: boolean;
  available: boolean;
  module: PersonalizationModule;
  generatedAt: string;
  items: ModuleRecommendation[];
}

export async function getModulePersonalizationRecommendations(
  propertyId: string,
  module: PersonalizationModule,
  limit = 10,
) {
  return (await api.get<ModuleRecommendationsResponse>(
    `/api/properties/${propertyId}/personalization/modules/${module.toLowerCase()}/recommendations`,
    { params: { limit } },
  )).data;
}

export async function convertPersonalizationRecommendationToTask(
  propertyId: string,
  recommendationId: string,
) {
  return (await api.post<{
    status: 'CREATED' | 'EXISTING';
    deduped: boolean;
    task: { id: string; title: string };
  }>(
    `/api/properties/${propertyId}/personalization/recommendations/${recommendationId}/actions/convert-to-task`,
    { idempotencyKey: crypto.randomUUID() },
  )).data;
}

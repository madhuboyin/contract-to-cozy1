import { api } from './client';

export interface PilotRecommendation {
  id: string;
  status: string;
  score: number | null;
  priorityBand: string | null;
  confidence: number | null;
  firstEligibleAt: string;
  definition: { code: string; category: string; targetModule: string };
  explanations: Array<{
    headline: string;
    reasonCodes: Array<{ code: string; templateKey: string }>;
    evidenceJson: unknown;
  }>;
}

export interface PilotPersonalization {
  optedIn: boolean;
  consentedAt?: string | null;
  recommendations: PilotRecommendation[];
  nextQuestion?: {
    id: string;
    prompt: string;
    whyAsked: string;
    privacyNote: string;
    targetTable: string;
    answerSchema: { type?: string };
  } | null;
}

export async function getPilotPersonalization(propertyId: string) {
  return (await api.get<PilotPersonalization>(`/api/properties/${propertyId}/personalization`)).data;
}

export async function optInPilotPersonalization(propertyId: string) {
  return (await api.post<{ optedIn: true; consentedAt: string }>(
    `/api/properties/${propertyId}/personalization/opt-in`,
    { consentAccepted: true },
  )).data;
}

export async function sendPilotFeedback(
  propertyId: string,
  recommendationId: string,
  type: 'DISMISSED' | 'NOT_RELEVANT',
) {
  return (await api.post(
    `/api/properties/${propertyId}/personalization/recommendations/${recommendationId}/feedback`,
    { eventId: crypto.randomUUID(), type, explicit: true },
  )).data;
}

export async function answerPilotQuestion(
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

export async function resetPilotPersonalization(propertyId: string) {
  return (await api.delete<{ reset: boolean }>(`/api/properties/${propertyId}/personalization`)).data;
}

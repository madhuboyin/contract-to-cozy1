import { api } from './client';

export interface PersonalizationCatalogDefinition {
  id: string;
  code: string;
  category: string;
  safetyClass: string;
  status: string;
  pausedAt: string | null;
  pauseReason: string | null;
  rules: Array<{
    version: number;
    status: string;
    authoredBy: string | null;
    reviewedBy: string | null;
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

export interface PersonalizationCatalogQuestion {
  code: string;
  version: number;
  prompt: string;
  status: string;
  placementContexts: string[];
  updatedAt: string;
}

export interface PersonalizationCatalogResponse {
  definitions: PersonalizationCatalogDefinition[];
  questions: PersonalizationCatalogQuestion[];
}

export async function getPersonalizationAdminCatalog() {
  return (await api.get<PersonalizationCatalogResponse>('/api/admin/personalization/catalog')).data;
}

export async function activatePersonalizationDefinition(
  code: string,
  payload: { ruleVersion: number; contentVersion: number; locale: string; authoredBy: string },
) {
  return (await api.post(`/api/admin/personalization/definitions/${code}/activate`, payload)).data;
}

export async function activatePersonalizationQuestion(code: string, version: number) {
  return (await api.post(`/api/admin/personalization/questions/${code}/activate`, { version })).data;
}

export async function pausePersonalizationDefinition(code: string, reason: string) {
  return (await api.post(`/api/admin/personalization/definitions/${code}/pause`, { reason })).data;
}

export async function resumePersonalizationDefinition(code: string) {
  return (await api.post(`/api/admin/personalization/definitions/${code}/resume`, {})).data;
}

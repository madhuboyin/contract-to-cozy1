import { api } from '@/lib/api/client';

export type PropertyTaxOperationsDashboard = {
  generatedAt: string;
  sourceStaleAfterHours: number;
  sources: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    adapterType: string;
    normalizedCoverageKey: string;
    lastFetchAt: string | null;
    lastFetchError: string | null;
    stale: boolean;
    health: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'DISABLED';
    counts: {
      parcelMatches: number;
      assessmentRecords: number;
      billRecords: number;
    };
  }>;
  rules: Array<{
    id: string;
    title: string;
    version: number;
    status: string;
    jurisdictionKey: string;
    propertyClass: string | null;
    reviewedAt: string;
    expiresAt: string;
    expired: boolean;
    expiringSoon: boolean;
    counts: {
      citations: number;
      deadlineRules: number;
      appealCases: number;
    };
    latestControl: {
      action: string;
      actorUserId: string;
      reason: string;
      createdAt: string;
    } | null;
  }>;
  ai: {
    enabled: boolean;
    status: 'ENABLED' | 'DISABLED';
    failClosed: boolean;
    reason: string;
    updatedAt: string | null;
  };
  guardrails: Array<{
    code: string;
    severity: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    count: number;
    explanation: string;
  }>;
  summary: {
    sourcesTotal: number;
    sourcesDegraded: number;
    activeRules: number;
    rulesExpiringSoon: number;
    criticalGuardrails: number;
  };
};

export async function fetchPropertyTaxOperations() {
  return (
    await api.get<PropertyTaxOperationsDashboard>(
      '/api/admin/property-tax/operations',
    )
  ).data;
}

export async function setPropertyTaxSourceEnabled(
  sourceId: string,
  enabled: boolean,
  reason: string,
) {
  return (
    await api.put(`/api/admin/property-tax/sources/${encodeURIComponent(sourceId)}`, {
      enabled,
      reason,
    })
  ).data;
}

export async function disablePropertyTaxRule(profileId: string, reason: string) {
  return (
    await api.post(
      `/api/admin/property-tax/rules/${encodeURIComponent(profileId)}/emergency-disable`,
      { reason },
    )
  ).data;
}

export async function emergencyDisablePropertyTaxAi(reason: string) {
  return (
    await api.post('/api/admin/property-tax/ai/emergency-disable', { reason })
  ).data;
}

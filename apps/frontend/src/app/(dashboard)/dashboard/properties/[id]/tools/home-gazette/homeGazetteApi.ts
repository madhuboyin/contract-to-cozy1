// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-gazette/homeGazetteApi.ts
import { api } from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GazetteAiStatus = 'GENERATED' | 'FALLBACK_USED' | 'FAILED' | 'NOT_REQUESTED';
export type GazetteEditionStatus = 'DRAFT' | 'READY' | 'PUBLISHED' | 'SKIPPED' | 'FAILED';
export type GazetteStoryPriority = 'HERO' | 'HIGH' | 'MEDIUM' | 'LOW';
export type GazetteShareStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export type GazetteStoryDto = {
  id: string;
  editionId: string;
  propertyId: string;
  sourceFeature: string;
  sourceEventId?: string | null;
  storyCategory: string;
  storyTag?: string | null;
  entityType: string;
  entityId: string;
  priority: GazetteStoryPriority;
  rank: number;
  isHero: boolean;
  headline: string;
  dek?: string | null;
  summary: string;
  supportingFactsJson?: Record<string, unknown> | null;
  urgencyScore?: number | null;
  financialImpactEstimate?: number | null;
  confidenceScore?: number | null;
  noveltyScore?: number | null;
  engagementScore?: number | null;
  compositeScore?: number | null;
  primaryDeepLink: string;
  secondaryDeepLink?: string | null;
  shareSafe: boolean;
  aiStatus: GazetteAiStatus;
  createdAt: string;
  updatedAt: string;
};

export type GazetteEditionDto = {
  id: string;
  propertyId: string;
  weekStart: string;
  weekEnd: string;
  publishDate?: string | null;
  status: GazetteEditionStatus;
  minQualifiedNeeded: number;
  qualifiedCount: number;
  selectedCount: number;
  skippedReason?: string | null;
  heroStoryId?: string | null;
  summaryHeadline?: string | null;
  summaryDeck?: string | null;
  tickerJson?: string[] | null;
  generationVersion?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  stories: GazetteStoryDto[];
};

export type GazetteEditionCardDto = {
  id: string;
  propertyId: string;
  weekStart: string;
  weekEnd: string;
  status: GazetteEditionStatus;
  qualifiedCount: number;
  selectedCount: number;
  summaryHeadline?: string | null;
  summaryDeck?: string | null;
  publishedAt?: string | null;
  heroStoryId?: string | null;
  createdAt: string;
};

export type GazetteShareLinkDto = {
  id: string;
  editionId: string;
  propertyId: string;
  tokenHash: string;
  status: GazetteShareStatus;
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastViewedAt?: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  rawToken?: string;
};

export type GazettePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type GazetteEditionsResult = {
  editions: GazetteEditionCardDto[];
  pagination: GazettePagination;
};

export type GazetteShareResult = {
  shareLink: GazetteShareLinkDto;
  shareUrl: string;
  note: string;
};

// ─── API Functions ────────────────────────────────────────────────────────────

export async function getCurrentEdition(propertyId: string): Promise<GazetteEditionDto | null> {
  const res = await api.get(`/api/gazette/current?propertyId=${encodeURIComponent(propertyId)}`);
  return (res.data as GazetteEditionDto) ?? null;
}

export async function getEditions(
  propertyId: string,
  page = 1,
  pageSize = 12,
): Promise<GazetteEditionsResult> {
  const res = await api.get(
    `/api/gazette/editions?propertyId=${encodeURIComponent(propertyId)}&page=${page}&pageSize=${pageSize}`,
  );
  return res.data as GazetteEditionsResult;
}

export async function getEdition(editionId: string): Promise<GazetteEditionDto> {
  const res = await api.get(`/api/gazette/editions/${editionId}`);
  return res.data as GazetteEditionDto;
}

export async function createShareLink(editionId: string): Promise<GazetteShareResult> {
  const res = await api.post(`/api/gazette/editions/${editionId}/share`, {});
  return res.data as GazetteShareResult;
}

export async function revokeShareLink(token: string): Promise<GazetteShareLinkDto> {
  const res = await api.post(`/api/gazette/share/${token}/revoke`, {});
  return res.data as GazetteShareLinkDto;
}

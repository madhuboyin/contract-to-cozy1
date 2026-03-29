// apps/backend/src/modules/gazette/dto/gazette.dto.ts
// API response shapes for the Home Gazette feature.
// Plain interfaces — no classes.

export interface GazetteStoryDto {
  id: string;
  editionId: string;
  propertyId: string;
  sourceFeature: string;
  sourceEventId?: string | null;
  storyCategory: string;
  storyTag?: string | null;
  entityType: string;
  entityId: string;
  priority: string;
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
  aiStatus: string;
  createdAt: Date;
  updatedAt: Date;
  // Phase-3: confidence disclosure for story-level accuracy transparency
  confidenceDisclosure?: string | null;
}

export interface GazetteEditionDto {
  id: string;
  propertyId: string;
  weekStart: Date;
  weekEnd: Date;
  publishDate?: Date | null;
  status: string;
  minQualifiedNeeded: number;
  qualifiedCount: number;
  selectedCount: number;
  skippedReason?: string | null;
  heroStoryId?: string | null;
  summaryHeadline?: string | null;
  summaryDeck?: string | null;
  tickerJson?: unknown;
  generationVersion?: string | null;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  stories: GazetteStoryDto[];
}

export interface GazetteEditionCardDto {
  id: string;
  propertyId: string;
  weekStart: Date;
  weekEnd: Date;
  status: string;
  qualifiedCount: number;
  selectedCount: number;
  summaryHeadline?: string | null;
  summaryDeck?: string | null;
  publishedAt?: Date | null;
  heroStoryId?: string | null;
  createdAt: Date;
}

export interface GazetteShareLinkDto {
  id: string;
  editionId: string;
  propertyId: string;
  tokenHash: string;
  status: string;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  lastViewedAt?: Date | null;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
  // rawToken is only present immediately after creation — never stored
  rawToken?: string;
}

export interface GazetteCandidateDto {
  id: string;
  editionId?: string | null;
  propertyId: string;
  sourceFeature: string;
  sourceEventId?: string | null;
  storyCategory: string;
  storyTag?: string | null;
  entityType: string;
  entityId: string;
  headlineHint?: string | null;
  supportingFactsJson: Record<string, unknown>;
  urgencyScoreInput?: number | null;
  financialImpactEstimate?: number | null;
  confidenceScore?: number | null;
  engagementScore?: number | null;
  noveltyScore?: number | null;
  compositeScore?: number | null;
  noveltyKey: string;
  firstDetectedAt?: Date | null;
  lastUpdatedAt?: Date | null;
  storyDeadline?: Date | null;
  expiresAt?: Date | null;
  primaryDeepLink: string;
  secondaryDeepLink?: string | null;
  shareSafe: boolean;
  status: string;
  exclusionReason?: string | null;
  exclusionDetail?: string | null;
  selectionRank?: number | null;
  rankAdjustmentReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GazetteSelectionTraceDto {
  id: string;
  editionId: string;
  candidateId?: string | null;
  propertyId: string;
  preScore?: number | null;
  postScore?: number | null;
  finalRank?: number | null;
  included: boolean;
  exclusionReason?: string | null;
  rankAdjustmentReason?: string | null;
  rankExplanation?: string | null;
  traceJson?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface GazetteGenerationJobDto {
  id: string;
  editionId?: string | null;
  propertyId: string;
  stage: string;
  status: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  attemptCount: number;
  errorMessage?: string | null;
  metricsJson?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

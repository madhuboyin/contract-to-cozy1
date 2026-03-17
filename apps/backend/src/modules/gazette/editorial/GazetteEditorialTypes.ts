// apps/backend/src/modules/gazette/editorial/GazetteEditorialTypes.ts
// Type definitions for the Gazette AI editorial layer.

// ─── Input types ─────────────────────────────────────────────────────────────

/** Structured input passed to the editorial layer for a single story. */
export interface StoryEditorialInput {
  storyId: string;
  storyCategory: string;
  storyTag?: string;
  headlineHint?: string;
  supportingFacts: Record<string, unknown>;
  urgencyScore?: number;
  financialImpactEstimate?: number;
  confidenceScore?: number;
  primaryDeepLink: string;
  rankExplanation?: string;
  sourceFeature: string;
  shareSafe: boolean;
  isHero: boolean;
  rank: number;
}

/** Structured input for edition-level editorial generation. */
export interface EditionEditorialInput {
  editionId: string;
  selectedCount: number;
  heroCategory: string;
  topStories: Array<{
    headline: string;
    storyCategory: string;
    rank: number;
  }>;
}

// ─── Output types ─────────────────────────────────────────────────────────────

/** Resolved editorial copy for a single story. */
export interface StoryEditorialOutput {
  storyId: string;
  headline: string;
  dek: string;
  summary: string;
  whyItMatters?: string;   // Hero story only
  aiStatus: 'GENERATED' | 'FALLBACK_USED' | 'FAILED' | 'NOT_REQUESTED';
  aiModel?: string;
  aiPromptVersion?: string;
  validationResult?: EditorialValidationResult;
}

/** Resolved editorial copy for an edition. */
export interface EditionEditorialOutput {
  summaryHeadline: string;
  summaryDeck: string;
  tickerItems: string[];
  aiStatus: 'GENERATED' | 'FALLBACK_USED' | 'FAILED' | 'NOT_REQUESTED';
  aiModel?: string;
  aiPromptVersion?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface EditorialValidationResult {
  valid: boolean;
  issues: string[];
  hadUnsupportedNumbers: boolean;
  hadUnsupportedUrgency: boolean;
  hadGenericCopy: boolean;
}

// ─── Raw AI response shapes ───────────────────────────────────────────────────

export interface RawAIStoryEditorial {
  headline?: unknown;
  dek?: unknown;
  summary?: unknown;
  whyItMatters?: unknown;
}

export interface RawAIEditionEditorial {
  summaryHeadline?: unknown;
  summaryDeck?: unknown;
  tickerItems?: unknown;
}

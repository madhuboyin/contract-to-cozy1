// apps/backend/src/modules/gazette/types/gazette.types.ts
// Internal TypeScript types for the Home Gazette feature.

// SourceSignal: normalized signal from an upstream feature
export interface SourceSignal {
  sourceFeature: string;          // e.g. 'MAINTENANCE', 'INCIDENT', 'REFINANCE_RADAR'
  sourceEventId?: string;
  storyCategory: string;          // GazetteStoryCategory enum value
  storyTag?: string;
  entityType: string;             // e.g. 'PropertyMaintenanceTask'
  entityId: string;
  headlineHint?: string;
  supportingFacts: Record<string, unknown>;
  urgency: number;                // 0-1
  financialImpact: number;        // 0-1
  confidence: number;             // 0-1
  engagement: number;             // 0-1
  primaryDeepLink: string;
  secondaryDeepLink?: string;
  shareSafe: boolean;
  storyDeadline?: Date;
}

// RankedCandidate: candidate after scoring
export interface RankedCandidate {
  candidateId: string;
  compositeScore: number;
  preScore: number;
  postScore: number;
  finalRank?: number;
  included: boolean;
  exclusionReason?: string;
  exclusionDetail?: string;
  rankAdjustmentReason?: string;
  rankExplanation?: string;
  traceJson: Record<string, unknown>;
}

// GazetteWeekWindow
export interface GazetteWeekWindow {
  weekStart: Date;
  weekEnd: Date;
}

// GenerationOptions
export interface GenerationOptions {
  propertyId: string;
  weekWindow?: GazetteWeekWindow;
  dryRun?: boolean;
  isBootstrap?: boolean;        // first 2 editions
}

// GenerationResult
export interface GenerationResult {
  editionId?: string;
  status: string;               // GazetteEditionStatus value
  qualifiedCount: number;
  selectedCount: number;
  skippedReason?: string;
  dryRun: boolean;
  stages: string[];
  durationMs: number;
}

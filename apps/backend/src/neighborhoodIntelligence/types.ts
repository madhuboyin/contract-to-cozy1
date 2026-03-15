// apps/backend/src/neighborhoodIntelligence/types.ts
//
// Internal types for the Neighborhood Intelligence Engine.

import {
  NeighborhoodEventType,
  ImpactCategory,
  ImpactDirection,
  DemographicSegment,
} from '@prisma/client';
import { ConfidenceBand } from './eventConfidence';

// ---------------------------------------------------------------------------
// Ingestion input
// ---------------------------------------------------------------------------

export interface NormalizedNeighborhoodEventInput {
  /** Stable identifier from the external source. Used for deduplication. */
  externalSourceId?: string;

  eventType: NeighborhoodEventType;

  title: string;
  description?: string;

  latitude: number;
  longitude: number;

  city?: string;
  state?: string;
  country?: string;

  sourceName?: string;
  sourceUrl?: string;

  announcedDate?: Date;
  expectedStartDate?: Date;
  expectedEndDate?: Date;

  /** Raw category string from the source, kept for reference. */
  rawCategory?: string;

  /** Rough project footprint size in sq ft or similar; used to tune signal quality. */
  projectSize?: number;

  /** Override the default matching radius for this event in miles. */
  distanceRadiusMiles?: number;

  /** Free-form extra data from the source. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Impact generation context
// ---------------------------------------------------------------------------

export interface PropertyContext {
  propertyId: string;
  latitude?: number | null;
  longitude?: number | null;
  ownershipType?: string | null;
  propertyType?: string | null;
  city?: string | null;
  state?: string | null;
  hasDrainageIssues?: boolean | null;
}

// ---------------------------------------------------------------------------
// Rule outputs
// ---------------------------------------------------------------------------

export interface ImpactRuleOutput {
  category: ImpactCategory;
  direction: ImpactDirection;
  description: string;
  confidence: number; // 0–1
}

export interface DemographicRuleOutput {
  segment: DemographicSegment;
  description: string;
  confidence: number; // 0–1
}

export interface EventTypeRule {
  /** Baseline impact score (0–100) before distance decay. */
  baseScore: number;
  /** Max matching radius in miles. */
  defaultRadiusMiles: number;
  impacts: ImpactRuleOutput[];
  demographics: DemographicRuleOutput[];
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export type OverallEffect =
  | 'HIGHLY_POSITIVE'
  | 'MODERATELY_POSITIVE'
  | 'MIXED'
  | 'MODERATELY_NEGATIVE'
  | 'HIGHLY_NEGATIVE'
  | 'NEUTRAL';

export interface ImpactSnippet {
  category: ImpactCategory;
  direction: ImpactDirection;
  description: string;
  confidence: number;
}

export interface DemographicSnippet {
  segment: DemographicSegment;
  description: string;
  confidence: number;
}

export interface NeighborhoodEventCard {
  id: string;
  eventId: string;
  eventType: NeighborhoodEventType;
  title: string;
  shortExplanation: string;
  distanceMiles: number;
  impactScore: number;
  /** Composite ranking score (impactScore × confidence × freshness). Used for sorting only. */
  compositeRank: number;
  overallEffect: OverallEffect;
  topPositives: ImpactSnippet[];
  topNegatives: ImpactSnippet[];
  demographicSignals: DemographicSnippet[];
  announcedDate: Date | null;
  expectedStartDate: Date | null;
  expectedEndDate: Date | null;
  sourceName: string | null;
  sourceUrl: string | null;
  city: string | null;
  state: string | null;
  /** Normalized confidence score 0–1. */
  confidence: number;
  /** User-visible reliability band. */
  confidenceBand: ConfidenceBand;
  /** Freshness score 0–1. Lower means the event is older or likely concluded. */
  freshnessScore: number;
  /** True if the event is considered stale (old with no recent activity). */
  isStale: boolean;
}

/** Detail-view–only additions on top of NeighborhoodEventCard. */
export interface NeighborhoodEventDetail extends NeighborhoodEventCard {
  description: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  allImpacts: ImpactSnippet[];
  allDemographics: DemographicSnippet[];
  /** Plain-language reasons why CtC surfaced this event for this property. */
  whyThisMatters: string[];
  /** Short reliability note for the UI. */
  confidenceNote: string;
}

export interface NeighborhoodRadarSummary {
  propertyId: string;
  meaningfulChangeCount: number;
  topHeadline: string | null;
  overallSentiment: OverallEffect | null;
  topPositiveThemes: string[];
  topNegativeThemes: string[];
  mostImportantEvent: NeighborhoodEventCard | null;
  lastScanAt: Date | null;
}

export interface NeighborhoodTrendSummary {
  propertyId: string;
  totalEvents: number;
  narrative: string;
  pressureSignals: string[];
  countByEventType: Record<string, number>;
  countByDirection: Record<ImpactDirection, number>;
  topDevelopments: NeighborhoodEventCard[];
}

// apps/backend/src/neighborhoodIntelligence/types.ts
//
// Internal types for the Neighborhood Intelligence Engine.

import {
  NeighborhoodEventType,
  ImpactCategory,
  ImpactDirection,
  DemographicSegment,
} from '@prisma/client';

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

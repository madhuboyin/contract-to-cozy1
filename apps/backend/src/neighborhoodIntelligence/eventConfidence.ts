// apps/backend/src/neighborhoodIntelligence/eventConfidence.ts
//
// Centralized confidence and freshness scoring for the Neighborhood Intelligence Engine.
//
// Confidence reflects how much trust we place in a specific event's data quality:
//   - data completeness (description, source, dates)
//   - source credibility (has verified URL / name)
//   - freshness / recency
//
// Freshness is a separate axis: even a high-confidence event may be old.
// Both scores are used to rank and filter surfaced insights.
//
// Scales:
//   confidence: 0.0–1.0
//   freshnessScore: 0.0–1.0
//   compositeRank: 0–100 (for sorting)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'PRELIMINARY';

export interface EventConfidenceScore {
  /** Normalized confidence score 0–1. */
  overall: number;
  /** User-visible reliability band. */
  band: ConfidenceBand;
  /** Short plain-language note for the detail view. */
  note: string;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const HIGH_THRESHOLD = 0.72;
const MEDIUM_THRESHOLD = 0.48;

const CONFIDENCE_NOTES: Record<ConfidenceBand, string> = {
  HIGH: 'Based on verified source data with recent activity.',
  MEDIUM: 'Based on available public signals. More detail may become available.',
  PRELIMINARY: 'Limited data available. Treat as an early-stage signal only.',
};

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

/**
 * Compute a 0–1 confidence score for a neighborhood event.
 *
 * Baseline: 0.50 (coordinates + title + event type are always validated at ingestion)
 *
 * Bonuses:
 *   +0.10  has a meaningful description (≥ 20 chars)
 *   +0.10  has a source name
 *   +0.08  has a source URL
 *   +0.07  has an announced date
 *   +0.05  has expected start or end date
 *   +0.05  event is fresh (< 6 months old)
 *
 * Penalties:
 *   -0.10  aging (12–24 months old)
 *   -0.20  stale (> 24 months old)
 *   -0.08  expected end date was 6–12 months ago (event may be complete)
 *   -0.15  expected end date was > 12 months ago (event likely complete)
 */
export function computeEventConfidence(event: {
  description: string | null | undefined;
  sourceName: string | null | undefined;
  sourceUrl: string | null | undefined;
  announcedDate: Date | null | undefined;
  expectedStartDate: Date | null | undefined;
  expectedEndDate: Date | null | undefined;
  createdAt: Date;
}): EventConfidenceScore {
  let score = 0.50;

  // Completeness bonuses
  if (event.description && event.description.trim().length >= 20) score += 0.10;
  if (event.sourceName) score += 0.10;
  if (event.sourceUrl) score += 0.08;
  if (event.announcedDate) score += 0.07;
  if (event.expectedStartDate || event.expectedEndDate) score += 0.05;

  // Freshness adjustments (age from announced date or creation date)
  const refDate = event.announcedDate ?? event.createdAt;
  const ageMonths = monthsAgo(refDate);

  if (ageMonths < 6) {
    score += 0.05;
  } else if (ageMonths > 24) {
    score -= 0.20;
  } else if (ageMonths > 12) {
    score -= 0.10;
  }

  // Expected end date penalty (event may already be complete)
  if (event.expectedEndDate && event.expectedEndDate < new Date()) {
    const monthsPastEnd = monthsAgo(event.expectedEndDate);
    if (monthsPastEnd > 12) {
      score -= 0.15;
    } else if (monthsPastEnd > 6) {
      score -= 0.08;
    }
  }

  const clamped = Math.max(0.05, Math.min(1.0, score));
  const rounded = Math.round(clamped * 100) / 100;

  const band: ConfidenceBand =
    rounded >= HIGH_THRESHOLD ? 'HIGH' :
    rounded >= MEDIUM_THRESHOLD ? 'MEDIUM' :
    'PRELIMINARY';

  return { overall: rounded, band, note: CONFIDENCE_NOTES[band] };
}

// ---------------------------------------------------------------------------
// Freshness scoring
// ---------------------------------------------------------------------------

/**
 * Returns a freshness score 0–1 reflecting how recently the event was recorded.
 *
 * Recent events score higher; stale events that have likely concluded score lower.
 * This is intentionally separate from confidence — a fresh, low-data event
 * can still be current, while a detailed old event may have already resolved.
 */
export function computeFreshnessScore(event: {
  createdAt: Date;
  announcedDate: Date | null | undefined;
  expectedEndDate: Date | null | undefined;
}): number {
  const now = Date.now();

  // If the project's expected end date is in the past, deprioritize by elapsed time
  if (event.expectedEndDate && event.expectedEndDate.getTime() < now) {
    const monthsPastEnd = monthsAgo(event.expectedEndDate);
    if (monthsPastEnd > 18) return 0.20;
    if (monthsPastEnd > 12) return 0.35;
    if (monthsPastEnd > 6) return 0.50;
    // < 6 months past end: still recent enough to be relevant
    return 0.65;
  }

  const refDate = event.announcedDate ?? event.createdAt;
  const ageMonths = monthsAgo(refDate);

  if (ageMonths < 3) return 1.00;
  if (ageMonths < 6) return 0.90;
  if (ageMonths < 12) return 0.80;
  if (ageMonths < 18) return 0.65;
  if (ageMonths < 24) return 0.50;
  if (ageMonths < 36) return 0.35;
  return 0.20;
}

/**
 * Returns true if the event should be considered stale and deprioritized.
 * Stale events may still appear in history but should not dominate summaries.
 */
export function isStaleEvent(event: {
  createdAt: Date;
  announcedDate: Date | null | undefined;
  expectedEndDate: Date | null | undefined;
}): boolean {
  return computeFreshnessScore(event) <= 0.35;
}

// ---------------------------------------------------------------------------
// Composite rank
// ---------------------------------------------------------------------------

/**
 * Compute a composite ranking score for sorting events in summary views.
 *
 * The formula keeps impactScore as the primary driver, with confidence and
 * freshness as secondary quality signals. A weak, stale, low-confidence
 * event will score meaningfully lower than a strong, fresh, verified one.
 *
 * Range: roughly 0–100.
 */
export function computeCompositeRank(
  impactScore: number,
  confidence: number,
  freshnessScore: number,
): number {
  return impactScore * 0.55 + confidence * 25 + freshnessScore * 20;
}

// ---------------------------------------------------------------------------
// Explainability
// ---------------------------------------------------------------------------

/**
 * Build a compact, homeowner-friendly array of reasons why CtC surfaced
 * a particular event for a property.
 *
 * These are plain-language explanations — never raw formulas or internal scores.
 */
export function buildWhyThisMatters(args: {
  eventType: string;
  distanceMiles: number;
  impactScore: number;
  confidenceBand: ConfidenceBand;
}): string[] {
  const { eventType, distanceMiles, impactScore, confidenceBand } = args;
  const reasons: string[] = [];

  // Distance context
  if (distanceMiles < 0.3) {
    reasons.push('This development is very close to your property.');
  } else if (distanceMiles < 1.0) {
    reasons.push(`This development is approximately ${distanceMiles.toFixed(1)} mile from your property.`);
  } else {
    reasons.push(`This development is approximately ${distanceMiles.toFixed(1)} miles from your property.`);
  }

  // Event-type context
  const EVENT_CONTEXT: Record<string, string> = {
    TRANSIT_PROJECT:
      'Transit projects often correlate with long-term demand shifts in surrounding neighborhoods.',
    HIGHWAY_PROJECT:
      'Highway construction can affect traffic patterns and noise levels for nearby homes.',
    COMMERCIAL_DEVELOPMENT:
      'New commercial activity may expand local amenities and services.',
    RESIDENTIAL_DEVELOPMENT:
      'Residential growth can shift local supply and demand dynamics over time.',
    INDUSTRIAL_PROJECT:
      'Industrial projects may affect livability in surrounding neighborhoods.',
    WAREHOUSE_PROJECT:
      'Warehouse facilities may increase truck traffic and noise in the area.',
    ZONING_CHANGE:
      'Zoning changes can signal shifts in how land nearby may be developed.',
    SCHOOL_RATING_CHANGE:
      'School quality is a key factor in family buyer demand and long-term value.',
    SCHOOL_BOUNDARY_CHANGE:
      'School boundary changes can affect which households are drawn to an area.',
    FLOOD_MAP_UPDATE:
      'Flood map changes may affect insurance requirements and financing options.',
    UTILITY_INFRASTRUCTURE:
      'Utility projects may affect service reliability or local assessments.',
    PARK_DEVELOPMENT:
      'Parks and green space improvements are closely linked to neighborhood livability.',
    LARGE_CONSTRUCTION:
      'Large construction projects may cause temporary disruption to traffic and noise.',
  };

  const context = EVENT_CONTEXT[eventType];
  if (context) reasons.push(context);

  // Impact strength context
  if (impactScore >= 75) {
    reasons.push('The estimated relevance for your property is high based on event type and proximity.');
  } else if (impactScore >= 50) {
    reasons.push('The estimated relevance for your property is moderate based on event type and proximity.');
  }

  // Confidence caveat (only for preliminary signals — keep it brief)
  if (confidenceBand === 'PRELIMINARY') {
    reasons.push('Data for this signal is limited — consider it an early indicator only.');
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthsAgo(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.5);
}

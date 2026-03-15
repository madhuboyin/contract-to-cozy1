// apps/backend/src/neighborhoodIntelligence/neighborhoodImpactEngine.ts
//
// Deterministic rule-based engine that converts a NeighborhoodEvent + property
// context into structured NeighborhoodImpact and DemographicImpact records.
// No AI required in this step.

import {
  NeighborhoodEventType,
  ImpactCategory,
  ImpactDirection,
  DemographicSegment,
} from '@prisma/client';
import { NEIGHBORHOOD_IMPACT_RULES } from './impactRules';
import {
  PropertyContext,
  ImpactRuleOutput,
  DemographicRuleOutput,
  OverallEffect,
} from './types';

// Demographic event families — only these produce demographic insights
const DEMOGRAPHIC_EVENT_TYPES = new Set<NeighborhoodEventType>([
  'TRANSIT_PROJECT',
  'COMMERCIAL_DEVELOPMENT',
  'RESIDENTIAL_DEVELOPMENT',
  'ZONING_CHANGE',
  'SCHOOL_RATING_CHANGE',
  'SCHOOL_BOUNDARY_CHANGE',
  'PARK_DEVELOPMENT',
]);

// Events whose negative direction should be inverted if metadata indicates
// a school *worsened* (not relevant for MVP; kept as extension point)
// const SCHOOL_INVERSION_TYPES = new Set<NeighborhoodEventType>(['SCHOOL_RATING_CHANGE']);

export interface GeneratedImpacts {
  impacts: Array<{
    category: ImpactCategory;
    direction: ImpactDirection;
    description: string;
    confidence: number;
  }>;
  demographics: Array<{
    segment: DemographicSegment;
    description: string;
    confidence: number;
  }>;
  impactScore: number;
}

export class NeighborhoodImpactEngine {
  /**
   * Generate structured impacts for a (event, property) pair.
   *
   * @param eventType  The type of the neighborhood event.
   * @param distanceMiles  Distance between property and event in miles.
   * @param property  Property context for tuning relevance.
   */
  generate(
    eventType: NeighborhoodEventType,
    distanceMiles: number,
    _property: PropertyContext,
  ): GeneratedImpacts {
    const rule = NEIGHBORHOOD_IMPACT_RULES[eventType];

    // Apply distance decay: score reduces as distance increases
    const impactScore = this.computeImpactScore(
      rule.baseScore,
      distanceMiles,
      rule.defaultRadiusMiles,
    );

    const impacts = rule.impacts.map((r) => ({
      category: r.category,
      direction: r.direction,
      description: r.description,
      confidence: this.decayConfidence(r.confidence, distanceMiles, rule.defaultRadiusMiles),
    }));

    const demographics = DEMOGRAPHIC_EVENT_TYPES.has(eventType)
      ? rule.demographics.map((r) => ({
          segment: r.segment,
          description: r.description,
          confidence: this.decayConfidence(r.confidence, distanceMiles, rule.defaultRadiusMiles),
        }))
      : [];

    return { impacts, demographics, impactScore };
  }

  // ---------------------------------------------------------------------------
  // Score computation
  // ---------------------------------------------------------------------------

  /**
   * Returns a 0–100 impact score applying a linear distance decay.
   * At distance=0 the full baseScore is returned.
   * At distance=radiusMiles the score reaches ~20% of base.
   */
  computeImpactScore(
    baseScore: number,
    distanceMiles: number,
    radiusMiles: number,
  ): number {
    if (distanceMiles <= 0) return Math.min(100, baseScore);
    const decay = Math.max(0, 1 - (distanceMiles / radiusMiles) * 0.8);
    return Math.round(baseScore * decay);
  }

  /**
   * Reduce confidence linearly with distance.
   */
  decayConfidence(base: number, distanceMiles: number, radiusMiles: number): number {
    const decay = Math.max(0.3, 1 - (distanceMiles / radiusMiles) * 0.5);
    return Math.round(base * decay * 100) / 100;
  }

  // ---------------------------------------------------------------------------
  // Overall effect label
  // ---------------------------------------------------------------------------

  /**
   * Derive a summary label from a set of impacts.
   */
  computeOverallEffect(
    impacts: Array<{ direction: ImpactDirection; confidence: number }>,
  ): OverallEffect {
    let positiveWeight = 0;
    let negativeWeight = 0;

    for (const impact of impacts) {
      if (impact.direction === 'POSITIVE') positiveWeight += impact.confidence;
      else if (impact.direction === 'NEGATIVE') negativeWeight += impact.confidence;
    }

    const delta = positiveWeight - negativeWeight;
    const total = positiveWeight + negativeWeight;

    if (total === 0) return 'NEUTRAL';

    if (delta > 1.5) return 'HIGHLY_POSITIVE';
    if (delta > 0.5) return 'MODERATELY_POSITIVE';
    if (delta < -1.5) return 'HIGHLY_NEGATIVE';
    if (delta < -0.5) return 'MODERATELY_NEGATIVE';
    return 'MIXED';
  }
}

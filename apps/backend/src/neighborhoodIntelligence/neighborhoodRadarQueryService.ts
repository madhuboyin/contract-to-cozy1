// apps/backend/src/neighborhoodIntelligence/neighborhoodRadarQueryService.ts
//
// Read-only query service for Neighborhood Change Radar UI APIs.
// All methods return already-interpreted, UI-friendly shapes.

import {
  NeighborhoodEventType,
  ImpactDirection,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NeighborhoodImpactEngine } from './neighborhoodImpactEngine';
import {
  NeighborhoodEventCard,
  NeighborhoodEventDetail,
  NeighborhoodRadarSummary,
  NeighborhoodTrendSummary,
  ImpactSnippet,
  DemographicSnippet,
  OverallEffect,
} from './types';
import {
  computeEventConfidence,
  computeFreshnessScore,
  computeCompositeRank,
  isStaleEvent,
  buildWhyThisMatters,
} from './eventConfidence';

const impactEngine = new NeighborhoodImpactEngine();

// Minimum impact score to be surfaced in summary/trend APIs
const MEANINGFUL_IMPACT_THRESHOLD = 40;

// Minimum composite rank to count in the "meaningful changes" headline number.
// This filters out very stale or very low-confidence events from the headline count
// while still showing them in the full event list.
const SUMMARY_COMPOSITE_THRESHOLD = 20;

const EVENT_TYPE_LABELS: Record<NeighborhoodEventType, string> = {
  TRANSIT_PROJECT: 'Transit Project',
  HIGHWAY_PROJECT: 'Highway Project',
  COMMERCIAL_DEVELOPMENT: 'Commercial Development',
  RESIDENTIAL_DEVELOPMENT: 'Residential Development',
  INDUSTRIAL_PROJECT: 'Industrial Project',
  WAREHOUSE_PROJECT: 'Warehouse Project',
  ZONING_CHANGE: 'Zoning Change',
  SCHOOL_RATING_CHANGE: 'School Rating Change',
  SCHOOL_BOUNDARY_CHANGE: 'School Boundary Change',
  FLOOD_MAP_UPDATE: 'Flood Map Update',
  UTILITY_INFRASTRUCTURE: 'Utility Infrastructure',
  PARK_DEVELOPMENT: 'Park Development',
  LARGE_CONSTRUCTION: 'Large Construction',
};

// Include spec for property-level event queries
const PROPERTY_EVENT_INCLUDE = {
  event: {
    include: {
      impacts: true,
      demographics: true,
    },
  },
} as const;

export class NeighborhoodRadarQueryService {
  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  async getSummary(propertyId: string): Promise<NeighborhoodRadarSummary> {
    const links = await prisma.propertyNeighborhoodEvent.findMany({
      where: { propertyId },
      include: PROPERTY_EVENT_INCLUDE,
    });

    // Build cards with full scoring
    const allCards = links
      .filter((l) => (l.impactScore ?? 0) >= MEANINGFUL_IMPACT_THRESHOLD)
      .map((l) => this.toEventCard(l));

    // Sort by composite rank descending (best signal first)
    allCards.sort((a, b) => b.compositeRank - a.compositeRank);

    // Meaningful = passes composite threshold (filters truly stale/low-confidence items
    // from the headline count, but keeps them in the full list view)
    const meaningful = allCards.filter((c) => c.compositeRank >= SUMMARY_COMPOSITE_THRESHOLD);

    const topCard = meaningful[0] ?? null;

    const topPositiveThemes = this.extractThemes(meaningful, 'POSITIVE');
    const topNegativeThemes = this.extractThemes(meaningful, 'NEGATIVE');

    const overallSentiment = meaningful.length > 0
      ? this.computeAggregateEffect(meaningful)
      : null;

    const lastScanAt = links.length > 0
      ? links.reduce<Date | null>((latest, l) => {
          const created = l.createdAt;
          if (!latest || created > latest) return created;
          return latest;
        }, null)
      : null;

    return {
      propertyId,
      meaningfulChangeCount: meaningful.length,
      topHeadline: topCard
        ? `${EVENT_TYPE_LABELS[topCard.eventType]}: ${topCard.title}`
        : null,
      overallSentiment,
      topPositiveThemes,
      topNegativeThemes,
      mostImportantEvent: topCard,
      lastScanAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Event list
  // ---------------------------------------------------------------------------

  async getEventList(
    propertyId: string,
    opts: {
      sortBy?: 'impact' | 'date';
      filterType?: NeighborhoodEventType;
      filterEffect?: 'POSITIVE' | 'NEGATIVE' | 'MIXED';
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ events: NeighborhoodEventCard[]; total: number }> {
    const { sortBy = 'impact', filterType, limit = 20, offset = 0 } = opts;

    const links = await prisma.propertyNeighborhoodEvent.findMany({
      where: {
        propertyId,
        ...(filterType ? { event: { eventType: filterType } } : {}),
      },
      include: PROPERTY_EVENT_INCLUDE,
      // DB-level pre-sort by announced date if requested; compositeRank is applied below
      orderBy:
        sortBy === 'date'
          ? { event: { announcedDate: 'desc' } }
          : { impactScore: 'desc' },
    });

    let cards = links.map((l) => this.toEventCard(l));

    // Sort by composite rank (best signal first) unless user explicitly chose date sort
    if (sortBy !== 'date') {
      cards.sort((a, b) => b.compositeRank - a.compositeRank);
    }

    // Client-side effect filter
    if (opts.filterEffect) {
      const target = opts.filterEffect;
      cards = cards.filter((c) => {
        if (target === 'POSITIVE') return c.overallEffect.includes('POSITIVE');
        if (target === 'NEGATIVE') return c.overallEffect.includes('NEGATIVE');
        return c.overallEffect === 'MIXED' || c.overallEffect === 'NEUTRAL';
      });
    }

    const total = cards.length;
    const paged = cards.slice(offset, offset + limit);

    return { events: paged, total };
  }

  // ---------------------------------------------------------------------------
  // Event detail
  // ---------------------------------------------------------------------------

  async getEventDetail(
    propertyId: string,
    eventId: string,
  ): Promise<NeighborhoodEventDetail> {
    const link = await prisma.propertyNeighborhoodEvent.findFirst({
      where: { propertyId, eventId },
      include: PROPERTY_EVENT_INCLUDE,
    });

    if (!link) {
      throw Object.assign(new Error('Event not found for this property.'), {
        statusCode: 404,
        code: 'EVENT_NOT_FOUND',
      });
    }

    const card = this.toEventCard(link);

    const allImpacts: ImpactSnippet[] = link.event.impacts.map((i) => ({
      category: i.category,
      direction: i.direction,
      description: i.description ?? '',
      confidence: Number(i.confidence ?? 0),
    }));

    const allDemographics: DemographicSnippet[] = link.event.demographics.map((d) => ({
      segment: d.segment,
      description: d.description ?? '',
      confidence: Number(d.confidence ?? 0),
    }));

    const whyThisMatters = buildWhyThisMatters({
      eventType: link.event.eventType,
      distanceMiles: link.distanceMiles,
      impactScore: link.impactScore ?? 0,
      confidenceBand: card.confidenceBand,
    });

    console.log(
      `[NeighborhoodRadar] getEventDetail — property=${propertyId} event=${eventId}` +
      ` confidence=${card.confidence} band=${card.confidenceBand}` +
      ` freshness=${card.freshnessScore} stale=${card.isStale}` +
      ` compositeRank=${card.compositeRank}`,
    );

    return {
      ...card,
      description: link.event.description,
      sourceUrl: link.event.sourceUrl,
      sourceName: link.event.sourceName,
      country: link.event.country,
      latitude: link.event.latitude,
      longitude: link.event.longitude,
      allImpacts,
      allDemographics,
      whyThisMatters,
      confidenceNote: card.confidenceBand === 'HIGH'
        ? 'Based on verified source data with recent activity.'
        : card.confidenceBand === 'MEDIUM'
        ? 'Based on available public signals. More detail may become available.'
        : 'Limited data available. Treat as an early-stage signal only.',
    };
  }

  // ---------------------------------------------------------------------------
  // Trends
  // ---------------------------------------------------------------------------

  async getTrends(propertyId: string): Promise<NeighborhoodTrendSummary> {
    const links = await prisma.propertyNeighborhoodEvent.findMany({
      where: { propertyId },
      include: PROPERTY_EVENT_INCLUDE,
    });

    const cards = links.map((l) => this.toEventCard(l));
    // Trends: sort by compositeRank so the top 3 are genuinely best signals
    cards.sort((a, b) => b.compositeRank - a.compositeRank);

    const countByEventType: Record<string, number> = {};
    for (const card of cards) {
      countByEventType[card.eventType] = (countByEventType[card.eventType] ?? 0) + 1;
    }

    const countByDirection: Record<ImpactDirection, number> = {
      POSITIVE: 0,
      NEGATIVE: 0,
      NEUTRAL: 0,
    };
    for (const link of links) {
      for (const impact of link.event.impacts) {
        countByDirection[impact.direction]++;
      }
    }

    const pressureSignals = this.derivePressureSignals(cards);
    const narrative = this.buildNarrative(cards, pressureSignals);

    return {
      propertyId,
      totalEvents: cards.length,
      narrative,
      pressureSignals,
      countByEventType,
      countByDirection,
      topDevelopments: cards.slice(0, 3),
    };
  }

  // ---------------------------------------------------------------------------
  // Mapping helpers
  // ---------------------------------------------------------------------------

  private toEventCard(link: {
    id: string;
    eventId: string;
    distanceMiles: number;
    impactScore: number | null;
    createdAt: Date;
    event: {
      eventType: string;
      title: string;
      description: string | null;
      sourceName: string | null;
      sourceUrl: string | null;
      city: string | null;
      state: string | null;
      announcedDate: Date | null;
      expectedStartDate: Date | null;
      expectedEndDate: Date | null;
      createdAt: Date;
      impacts: Array<{
        category: string;
        direction: string;
        description: string | null;
        confidence: unknown;
      }>;
      demographics: Array<{
        segment: string;
        description: string | null;
        confidence: unknown;
      }>;
    };
  }): NeighborhoodEventCard {
    const impacts = link.event.impacts as ImpactSnippet[];
    const positives = impacts.filter((i) => i.direction === 'POSITIVE').slice(0, 3);
    const negatives = impacts.filter((i) => i.direction === 'NEGATIVE').slice(0, 3);
    const demographics = (link.event.demographics as DemographicSnippet[]).slice(0, 3);

    const overallEffect = impactEngine.computeOverallEffect(impacts);

    const impactScore = link.impactScore ?? 0;

    // Confidence + freshness (computed at query time, not stored)
    const confidenceResult = computeEventConfidence({
      description: link.event.description,
      sourceName: link.event.sourceName,
      sourceUrl: link.event.sourceUrl,
      announcedDate: link.event.announcedDate,
      expectedStartDate: link.event.expectedStartDate,
      expectedEndDate: link.event.expectedEndDate,
      createdAt: link.event.createdAt,
    });

    const freshnessScore = computeFreshnessScore({
      createdAt: link.event.createdAt,
      announcedDate: link.event.announcedDate,
      expectedEndDate: link.event.expectedEndDate,
    });

    const stale = isStaleEvent({
      createdAt: link.event.createdAt,
      announcedDate: link.event.announcedDate,
      expectedEndDate: link.event.expectedEndDate,
    });

    const compositeRank = computeCompositeRank(
      impactScore,
      confidenceResult.overall,
      freshnessScore,
    );

    return {
      id: link.id,
      eventId: link.eventId,
      eventType: link.event.eventType as NeighborhoodEventType,
      title: link.event.title,
      shortExplanation: this.buildShortExplanation(
        link.event.eventType as NeighborhoodEventType,
        overallEffect,
        link.distanceMiles,
        stale,
      ),
      distanceMiles: link.distanceMiles,
      impactScore,
      compositeRank: Math.round(compositeRank * 10) / 10,
      overallEffect,
      topPositives: positives,
      topNegatives: negatives,
      demographicSignals: demographics,
      announcedDate: link.event.announcedDate,
      expectedStartDate: link.event.expectedStartDate,
      expectedEndDate: link.event.expectedEndDate,
      sourceName: link.event.sourceName,
      sourceUrl: link.event.sourceUrl,
      city: link.event.city,
      state: link.event.state,
      confidence: confidenceResult.overall,
      confidenceBand: confidenceResult.band,
      freshnessScore: Math.round(freshnessScore * 100) / 100,
      isStale: stale,
    };
  }

  private buildShortExplanation(
    eventType: NeighborhoodEventType,
    effect: OverallEffect,
    distanceMiles: number,
    isStale: boolean,
  ): string {
    const label = EVENT_TYPE_LABELS[eventType] ?? 'Nearby development';
    const distStr =
      distanceMiles < 0.5
        ? 'very close to your property'
        : `approximately ${distanceMiles.toFixed(1)} miles away`;

    const effectStr: Record<OverallEffect, string> = {
      HIGHLY_POSITIVE: 'may be a positive signal',
      MODERATELY_POSITIVE: 'may have a positive effect',
      MIXED: 'has mixed implications',
      MODERATELY_NEGATIVE: 'may have a negative effect',
      HIGHLY_NEGATIVE: 'may be worth monitoring closely',
      NEUTRAL: 'has limited expected impact',
    };

    const base = `${label} ${distStr} that ${effectStr[effect]} for your property.`;
    if (isStale) {
      return `${base} This is an older signal — confirm current status from official sources.`;
    }
    return base;
  }

  private extractThemes(cards: NeighborhoodEventCard[], direction: 'POSITIVE' | 'NEGATIVE'): string[] {
    const themes = new Set<string>();
    for (const card of cards) {
      if (card.isStale) continue; // stale events don't contribute to theme chips
      const impacts = direction === 'POSITIVE' ? card.topPositives : card.topNegatives;
      for (const imp of impacts) {
        themes.add(this.categoryLabel(imp.category as string));
      }
      if (themes.size >= 4) break;
    }
    return Array.from(themes).slice(0, 4);
  }

  private categoryLabel(category: string): string {
    const labels: Record<string, string> = {
      PROPERTY_VALUE: 'Property Value',
      RENTAL_DEMAND: 'Rental Demand',
      TRAFFIC: 'Traffic',
      NOISE: 'Noise',
      AMENITIES: 'Amenities',
      INSURANCE_RISK: 'Insurance Risk',
      DEVELOPMENT_PRESSURE: 'Development Pressure',
      LIVING_EXPERIENCE: 'Living Experience',
    };
    return labels[category] ?? category;
  }

  private computeAggregateEffect(cards: NeighborhoodEventCard[]): OverallEffect {
    // Weight active (non-stale) events more heavily in aggregate sentiment
    const all = cards
      .filter((c) => !c.isStale)
      .flatMap((c) => [...c.topPositives, ...c.topNegatives]);

    if (all.length === 0) {
      // Fall back to all cards if all are stale
      const fallback = cards.flatMap((c) => [...c.topPositives, ...c.topNegatives]);
      return impactEngine.computeOverallEffect(fallback);
    }

    return impactEngine.computeOverallEffect(all);
  }

  private derivePressureSignals(cards: NeighborhoodEventCard[]): string[] {
    // Only use non-stale cards for pressure signals
    const active = cards.filter((c) => !c.isStale);
    const signals: string[] = [];

    const hasWarehouse = active.some(
      (c) => c.eventType === 'WAREHOUSE_PROJECT' || c.eventType === 'INDUSTRIAL_PROJECT',
    );
    const hasTransit = active.some((c) => c.eventType === 'TRANSIT_PROJECT');
    const hasFlood = active.some((c) => c.eventType === 'FLOOD_MAP_UPDATE');
    const hasSchoolChange = active.some((c) => c.eventType === 'SCHOOL_RATING_CHANGE');
    const hasZoning = active.some((c) => c.eventType === 'ZONING_CHANGE');
    const hasResidential = active.some((c) => c.eventType === 'RESIDENTIAL_DEVELOPMENT');
    const hasCommercial = active.some((c) => c.eventType === 'COMMERCIAL_DEVELOPMENT');

    if (hasFlood) signals.push('Flood map changes may affect insurance costs');
    if (hasTransit) signals.push('Transit development may improve long-term demand');
    if (hasWarehouse) signals.push('Industrial or warehouse activity may affect livability');
    if (hasSchoolChange) signals.push('School quality changes may influence family demand');
    if (hasZoning) signals.push('Zoning activity may signal development pressure');
    if (hasResidential && hasCommercial) signals.push('Active mixed-use development nearby');
    else if (hasResidential) signals.push('Residential growth detected in the area');
    else if (hasCommercial) signals.push('Commercial growth detected nearby');

    return signals;
  }

  private buildNarrative(cards: NeighborhoodEventCard[], signals: string[]): string {
    if (cards.length === 0) {
      return 'No significant neighborhood changes have been detected near this property.';
    }

    const active = cards.filter((c) => !c.isStale);
    const staleCount = cards.length - active.length;

    const count = active.length;

    if (count === 0) {
      return `${staleCount} older signal${staleCount !== 1 ? 's' : ''} on record. No recent neighborhood activity has been detected.`;
    }

    const positiveCount = active.filter((c) => c.overallEffect.includes('POSITIVE')).length;
    const negativeCount = active.filter((c) => c.overallEffect.includes('NEGATIVE')).length;

    const staleSuffix = staleCount > 0
      ? ` ${staleCount} older signal${staleCount !== 1 ? 's' : ''} also on record.`
      : '';

    if (positiveCount > negativeCount) {
      return `${count} active change${count !== 1 ? 's' : ''} detected near your property. Activity suggests the area may see positive development momentum.${staleSuffix}`;
    }

    if (negativeCount > positiveCount) {
      return `${count} active change${count !== 1 ? 's' : ''} detected near your property. Some developments may create challenges for livability or demand.${staleSuffix}`;
    }

    return `${count} active change${count !== 1 ? 's' : ''} detected near your property with mixed implications. ${signals[0] ?? ''}${staleSuffix}`;
  }
}

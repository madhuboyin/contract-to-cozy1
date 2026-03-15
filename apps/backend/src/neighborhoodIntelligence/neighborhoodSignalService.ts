// apps/backend/src/neighborhoodIntelligence/neighborhoodSignalService.ts
//
// Cross-tool signal service: distils active high-impact neighborhood events
// into compact, typed signal codes that other CtC tools can consume.

import { NeighborhoodEventType, ImpactDirection } from '@prisma/client';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NeighborhoodSignalCode =
  | 'TRANSIT_UPSIDE_PRESENT'
  | 'FLOOD_RISK_PRESSURE'
  | 'SCHOOL_QUALITY_IMPROVING'
  | 'SCHOOL_QUALITY_DECLINING'
  | 'COMMERCIAL_GROWTH_SIGNAL'
  | 'INDUSTRIAL_NOISE_RISK'
  | 'WAREHOUSE_TRAFFIC_RISK'
  | 'ZONING_RISK'
  | 'HIGHWAY_DISRUPTION_RISK'
  | 'PARK_AMENITY_UPSIDE'
  | 'RESIDENTIAL_DENSITY_INCREASING'
  | 'LARGE_CONSTRUCTION_DISRUPTION'
  | 'UTILITY_INFRASTRUCTURE_CHANGE';

export type NeighborhoodSignal = {
  code: NeighborhoodSignalCode;
  direction: 'POSITIVE' | 'NEGATIVE' | 'MIXED';
  label: string;
  /** Composite impact score for this property (0-100). */
  score: number;
  eventId: string;
};

// ---------------------------------------------------------------------------
// Signal rules
// direction: null = match any dominant direction for this event type
// ---------------------------------------------------------------------------

type SignalRule = {
  eventType: NeighborhoodEventType;
  direction: ImpactDirection | null;
  code: NeighborhoodSignalCode;
  directionOut: 'POSITIVE' | 'NEGATIVE' | 'MIXED';
  label: string;
};

const SIGNAL_RULES: SignalRule[] = [
  {
    eventType: 'TRANSIT_PROJECT',
    direction: 'POSITIVE',
    code: 'TRANSIT_UPSIDE_PRESENT',
    directionOut: 'POSITIVE',
    label: 'Transit upside nearby',
  },
  {
    eventType: 'FLOOD_MAP_UPDATE',
    direction: 'NEGATIVE',
    code: 'FLOOD_RISK_PRESSURE',
    directionOut: 'NEGATIVE',
    label: 'Flood risk pressure',
  },
  {
    eventType: 'SCHOOL_RATING_CHANGE',
    direction: 'POSITIVE',
    code: 'SCHOOL_QUALITY_IMPROVING',
    directionOut: 'POSITIVE',
    label: 'School quality improving',
  },
  {
    eventType: 'SCHOOL_RATING_CHANGE',
    direction: 'NEGATIVE',
    code: 'SCHOOL_QUALITY_DECLINING',
    directionOut: 'NEGATIVE',
    label: 'School quality declining',
  },
  {
    eventType: 'COMMERCIAL_DEVELOPMENT',
    direction: 'POSITIVE',
    code: 'COMMERCIAL_GROWTH_SIGNAL',
    directionOut: 'POSITIVE',
    label: 'Commercial growth nearby',
  },
  {
    eventType: 'INDUSTRIAL_PROJECT',
    direction: 'NEGATIVE',
    code: 'INDUSTRIAL_NOISE_RISK',
    directionOut: 'NEGATIVE',
    label: 'Industrial project risk',
  },
  {
    eventType: 'WAREHOUSE_PROJECT',
    direction: 'NEGATIVE',
    code: 'WAREHOUSE_TRAFFIC_RISK',
    directionOut: 'NEGATIVE',
    label: 'Warehouse traffic risk',
  },
  {
    eventType: 'ZONING_CHANGE',
    direction: 'NEGATIVE',
    code: 'ZONING_RISK',
    directionOut: 'NEGATIVE',
    label: 'Adverse zoning change',
  },
  {
    eventType: 'HIGHWAY_PROJECT',
    direction: 'NEGATIVE',
    code: 'HIGHWAY_DISRUPTION_RISK',
    directionOut: 'NEGATIVE',
    label: 'Highway disruption risk',
  },
  {
    eventType: 'PARK_DEVELOPMENT',
    direction: 'POSITIVE',
    code: 'PARK_AMENITY_UPSIDE',
    directionOut: 'POSITIVE',
    label: 'Park amenity upside',
  },
  {
    eventType: 'RESIDENTIAL_DEVELOPMENT',
    direction: null,
    code: 'RESIDENTIAL_DENSITY_INCREASING',
    directionOut: 'MIXED',
    label: 'Residential density increasing',
  },
  {
    eventType: 'LARGE_CONSTRUCTION',
    direction: 'NEGATIVE',
    code: 'LARGE_CONSTRUCTION_DISRUPTION',
    directionOut: 'NEGATIVE',
    label: 'Large construction nearby',
  },
  {
    eventType: 'UTILITY_INFRASTRUCTURE',
    direction: null,
    code: 'UTILITY_INFRASTRUCTURE_CHANGE',
    directionOut: 'MIXED',
    label: 'Utility infrastructure change',
  },
];

// Minimum composite impact score on the property-event link to surface a signal.
const SIGNAL_THRESHOLD = 40;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveDominantDirection(
  impacts: Array<{ direction: string }>,
): 'POSITIVE' | 'NEGATIVE' | 'MIXED' {
  let pos = 0;
  let neg = 0;
  for (const { direction } of impacts) {
    if (direction === 'POSITIVE') pos++;
    else if (direction === 'NEGATIVE') neg++;
  }
  if (pos > neg) return 'POSITIVE';
  if (neg > pos) return 'NEGATIVE';
  return 'MIXED';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class NeighborhoodSignalService {
  /**
   * Returns compact signal codes for all active high-impact neighborhood
   * events affecting a given property.
   *
   * Results are deduplicated by signal code (highest-scoring event wins)
   * and sorted by score descending.
   */
  async getSignalsForProperty(propertyId: string): Promise<NeighborhoodSignal[]> {
    const links = await prisma.propertyNeighborhoodEvent.findMany({
      where: {
        propertyId,
        impactScore: { gte: SIGNAL_THRESHOLD },
      },
      include: {
        event: {
          include: { impacts: true },
        },
      },
      orderBy: { impactScore: 'desc' },
    });

    const signals: NeighborhoodSignal[] = [];
    const seen = new Set<NeighborhoodSignalCode>();

    for (const link of links) {
      const { event, impactScore } = link;
      const dominantDirection = deriveDominantDirection(event.impacts);

      for (const rule of SIGNAL_RULES) {
        if (rule.eventType !== event.eventType) continue;
        if (rule.direction !== null && rule.direction !== dominantDirection) continue;
        if (seen.has(rule.code)) continue;

        seen.add(rule.code);
        signals.push({
          code: rule.code,
          direction: rule.directionOut,
          label: rule.label,
          score: impactScore ?? 0,
          eventId: event.id,
        });
        break;
      }
    }

    return signals;
  }
}

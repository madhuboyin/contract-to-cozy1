// apps/backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts
//
// Matches a NeighborhoodEvent to nearby properties and persists
// PropertyNeighborhoodEvent rows. Also triggers impact generation.

import { NeighborhoodEventType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NEIGHBORHOOD_IMPACT_RULES } from './impactRules';
import { haversineDistanceMiles, isValidLatLng } from './geoUtils';
import { NeighborhoodImpactEngine } from './neighborhoodImpactEngine';
import { PropertyContext } from './types';
import { logger } from '../lib/logger';
import { evaluateNeighborhoodLocation } from '../services/planningContext/applicabilityPolicy';

const impactEngine = new NeighborhoodImpactEngine();

export class NeighborhoodPropertyMatchService {
  /**
   * Match all eligible properties to an event and generate impacts.
   * Safe to rerun — will update existing matches and replace existing impacts.
   */
  async matchPropertiesForEvent(eventId: string): Promise<{ matched: number }> {
    const event = await prisma.neighborhoodEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      logger.warn(`[NeighborhoodIntelligence] matchProperties called for unknown event ${eventId}`);
      return { matched: 0 };
    }

    if (!isValidLatLng(event.latitude, event.longitude)) {
      logger.warn(`[NeighborhoodIntelligence] Event ${eventId} has invalid coordinates — skipping match`);
      // Invalid event location cannot support any property projection. Remove
      // existing links so an event edit cannot leave stale radar results.
      await prisma.propertyNeighborhoodEvent.deleteMany({ where: { eventId } });
      return { matched: 0 };
    }

    const radiusMiles =
      NEIGHBORHOOD_IMPACT_RULES[event.eventType as NeighborhoodEventType]?.defaultRadiusMiles ?? 2.0;

    // Approximate bounding-box in degrees for an efficient DB pre-filter
    // (1 degree latitude ≈ 69 miles; 1 degree longitude varies but ≈ 69 miles at equator)
    const latDelta = radiusMiles / 69.0;
    const lonDelta = radiusMiles / 69.0;

    const properties = await prisma.property.findMany({
      select: {
        id: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        zipCode: true,
        propertyUse: true,
        dwellingType: true,
        exteriorProfile: { select: { hasDrainageIssues: true } },
      },
    });

    // Distance-based relevance requires coordinates for both sides. A coarse
    // city/state co-location is not a distance and must never be persisted as
    // fabricated mileage.
    const eligibleProperties = properties
      .map((p) => {
        const locationDecision = evaluateNeighborhoodLocation(
          p.zipCode,
          isValidLatLng(p.latitude, p.longitude),
        );
        if (locationDecision.status !== 'APPLICABLE') return null;
        const geoDistance = this.getDistanceMiles(
          p.latitude,
          p.longitude,
          event.latitude as number,
          event.longitude as number,
        );
        if (geoDistance !== null) {
          return geoDistance <= radiusMiles ? { property: p, distanceMiles: geoDistance } : null;
        }
        return null;
      })
      .filter((entry): entry is { property: (typeof properties)[number]; distanceMiles: number } => entry !== null);

    let matched = 0;

    for (const { property, distanceMiles } of eligibleProperties) {
      const context: PropertyContext = {
        propertyId: property.id,
        latitude: property.latitude,
        longitude: property.longitude,
        propertyUse: property.propertyUse !== 'UNKNOWN' ? property.propertyUse : null,
        dwellingType: property.dwellingType !== 'UNKNOWN' ? property.dwellingType : null,
        city: property.city,
        state: property.state,
        hasDrainageIssues: property.exteriorProfile?.hasDrainageIssues ?? null,
      };

      const generated = impactEngine.generate(
        event.eventType as NeighborhoodEventType,
        distanceMiles,
        context,
      );

      // Upsert PropertyNeighborhoodEvent via its unique (propertyId, eventId)
      // key so concurrent reruns cannot create duplicate links.
      const link = await prisma.propertyNeighborhoodEvent.upsert({
        where: { propertyId_eventId: { propertyId: property.id, eventId } },
        update: {
          distanceMiles,
          impactScore: generated.impactScore,
        },
        create: {
          propertyId: property.id,
          eventId,
          distanceMiles,
          impactScore: generated.impactScore,
        },
      });

      // Replace impacts owned by THIS property-event link only. Impacts are
      // property-specific projections; one property's results never overwrite
      // another property's.
      await prisma.neighborhoodImpact.deleteMany({
        where: { propertyNeighborhoodEventId: link.id },
      });
      if (generated.impacts.length > 0) {
        await prisma.neighborhoodImpact.createMany({
          data: generated.impacts.map((imp) => ({
            eventId,
            propertyNeighborhoodEventId: link.id,
            category: imp.category,
            direction: imp.direction,
            description: imp.description,
            confidence: imp.confidence,
          })),
        });
      }

      await prisma.demographicImpact.deleteMany({
        where: { propertyNeighborhoodEventId: link.id },
      });
      if (generated.demographics.length > 0) {
        await prisma.demographicImpact.createMany({
          data: generated.demographics.map((d) => ({
            eventId,
            propertyNeighborhoodEventId: link.id,
            segment: d.segment,
            description: d.description,
            confidence: d.confidence,
          })),
        });
      }

      matched++;
      logger.info(
        `[NeighborhoodIntelligence] Matched property=${property.id} to event=${eventId} score=${generated.impactScore} linkId=${link.id}`,
      );
    }

    // Remove links (and their cascade-owned impacts) for properties that are
    // no longer geographically relevant to this event after a rerun.
    const eligibleIds = eligibleProperties.map(({ property }) => property.id);
    const removed = await prisma.propertyNeighborhoodEvent.deleteMany({
      where: { eventId, propertyId: { notIn: eligibleIds } },
    });

    logger.info(
      `[NeighborhoodIntelligence] matchPropertiesForEvent complete — eventId=${eventId} matched=${matched} removedStaleLinks=${removed.count}`,
    );

    return { matched };
  }

  /**
   * Recompute all event matches for a specific property.
   * Used when a property is newly added or its location is updated.
   */
  async recomputePropertyNeighborhoodRadar(propertyId: string): Promise<{ processed: number }> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { city: true, state: true },
    });

    if (!property) return { processed: 0 };

    // Re-evaluate both current-area candidates and every event already linked
    // to this property. Including existing links is essential when a property
    // moves: old-city events must run through matching again so their links are
    // deleted as no longer eligible.
    const events = await prisma.neighborhoodEvent.findMany({
      where: {
        OR: [
          { city: property.city, state: property.state },
          { propertyMatches: { some: { propertyId } } },
        ],
      },
      select: { id: true },
    });

    let processed = 0;
    for (const event of events) {
      await this.matchPropertiesForEvent(event.id);
      processed++;
    }

    return { processed };
  }

  /**
   * Helper exposed for geo-accurate matching when lat/lng is available.
   * Returns distance in miles or null if coordinates are missing.
   */
  getDistanceMiles(
    propLat: number | null | undefined,
    propLon: number | null | undefined,
    eventLat: number,
    eventLon: number,
  ): number | null {
    if (!isValidLatLng(propLat, propLon)) return null;
    return haversineDistanceMiles(propLat as number, propLon as number, eventLat, eventLon);
  }
}

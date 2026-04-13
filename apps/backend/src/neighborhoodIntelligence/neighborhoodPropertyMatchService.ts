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
      return { matched: 0 };
    }

    const radiusMiles =
      NEIGHBORHOOD_IMPACT_RULES[event.eventType as NeighborhoodEventType]?.defaultRadiusMiles ?? 2.0;

    // Approximate bounding-box in degrees for an efficient DB pre-filter
    // (1 degree latitude ≈ 69 miles; 1 degree longitude varies but ≈ 69 miles at equator)
    const latDelta = radiusMiles / 69.0;
    const lonDelta = radiusMiles / 69.0;

    const properties = await prisma.property.findMany({
      where: {
        // Only properties with valid coordinates
        // Properties store address but lat/lng isn't a standard field in schema —
        // we match via address city/state heuristic or via explicit lat/lng if added later.
        // For now we fetch all properties in a reasonable city/state proximity.
        // Extension point: add lat/lng columns to Property in a future migration.
      },
      select: {
        id: true,
        city: true,
        state: true,
        address: true,
        ownershipType: true,
        propertyType: true,
        hasDrainageIssues: true,
      },
    });

    // Filter properties that have a geocodable city/state match.
    // For MVP, we use city+state co-location as a proxy since Property doesn't have lat/lng.
    // When a property shares city+state with the event, we treat distance as 0.5 miles
    // (intra-city default). Future: upgrade to real geocoded distance.
    const eligibleProperties = properties.filter(
      (p) =>
        p.city?.toLowerCase() === event.city?.toLowerCase() &&
        p.state?.toLowerCase() === event.state?.toLowerCase(),
    );

    let matched = 0;

    for (const property of eligibleProperties) {
      const distanceMiles = 0.5; // MVP default for intra-city match

      const context: PropertyContext = {
        propertyId: property.id,
        latitude: null,
        longitude: null,
        ownershipType: property.ownershipType,
        propertyType: property.propertyType,
        city: property.city,
        state: property.state,
        hasDrainageIssues: property.hasDrainageIssues,
      };

      const generated = impactEngine.generate(
        event.eventType as NeighborhoodEventType,
        distanceMiles,
        context,
      );

      // Upsert PropertyNeighborhoodEvent
      const existingLink = await prisma.propertyNeighborhoodEvent.findFirst({
        where: { propertyId: property.id, eventId },
      });

      let linkId: string;

      if (existingLink) {
        await prisma.propertyNeighborhoodEvent.update({
          where: { id: existingLink.id },
          data: {
            distanceMiles,
            impactScore: generated.impactScore,
          },
        });
        linkId = existingLink.id;
      } else {
        const link = await prisma.propertyNeighborhoodEvent.create({
          data: {
            propertyId: property.id,
            eventId,
            distanceMiles,
            impactScore: generated.impactScore,
          },
        });
        linkId = link.id;
      }

      // Replace existing impacts for this event
      await prisma.neighborhoodImpact.deleteMany({ where: { eventId } });
      if (generated.impacts.length > 0) {
        await prisma.neighborhoodImpact.createMany({
          data: generated.impacts.map((imp) => ({
            eventId,
            category: imp.category,
            direction: imp.direction,
            description: imp.description,
            confidence: imp.confidence,
          })),
        });
      }

      // Replace demographic impacts
      await prisma.demographicImpact.deleteMany({ where: { eventId } });
      if (generated.demographics.length > 0) {
        await prisma.demographicImpact.createMany({
          data: generated.demographics.map((d) => ({
            eventId,
            segment: d.segment,
            description: d.description,
            confidence: d.confidence,
          })),
        });
      }

      matched++;
      logger.info(
        `[NeighborhoodIntelligence] Matched property=${property.id} to event=${eventId} score=${generated.impactScore} linkId=${linkId}`,
      );
    }

    logger.info(
      `[NeighborhoodIntelligence] matchPropertiesForEvent complete — eventId=${eventId} matched=${matched}`,
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

    // Find all events in the same city/state
    const events = await prisma.neighborhoodEvent.findMany({
      where: {
        city: property.city ?? undefined,
        state: property.state ?? undefined,
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

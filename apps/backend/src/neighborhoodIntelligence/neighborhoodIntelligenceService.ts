// apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligenceService.ts
//
// Top-level orchestration service for the Neighborhood Intelligence Engine.
// Coordinates ingestion → matching → impact generation.

import { NeighborhoodEventIngestionService } from './neighborhoodEventIngestionService';
import { NeighborhoodPropertyMatchService } from './neighborhoodPropertyMatchService';
import { NormalizedNeighborhoodEventInput } from './types';

const ingestionService = new NeighborhoodEventIngestionService();
const matchService = new NeighborhoodPropertyMatchService();

export class NeighborhoodIntelligenceService {
  /**
   * Full ingestion pipeline:
   *   1. Upsert the normalized event
   *   2. Match nearby properties
   *   3. Generate and persist impacts
   *
   * Safe to rerun with the same input (idempotent).
   */
  async ingestAndProcessEvent(
    input: NormalizedNeighborhoodEventInput,
  ): Promise<{ eventId: string; created: boolean; matchedProperties: number }> {
    const { eventId, created } = await ingestionService.upsertNormalizedEvent(input);
    const { matched } = await matchService.matchPropertiesForEvent(eventId);

    console.log(
      `[NeighborhoodIntelligence] ingestAndProcess complete — eventId=${eventId} created=${created} matchedProperties=${matched}`,
    );

    return { eventId, created, matchedProperties: matched };
  }

  /**
   * Re-run property matching and impact generation for an existing event.
   * Used when matching rules change or an event is updated.
   */
  async recomputeEventMatches(eventId: string): Promise<{ matchedProperties: number }> {
    const { matched } = await matchService.matchPropertiesForEvent(eventId);

    console.log(
      `[NeighborhoodIntelligence] recomputeEventMatches complete — eventId=${eventId} matched=${matched}`,
    );

    return { matchedProperties: matched };
  }

  /**
   * Recompute all event matches for a specific property.
   * Used when a property is newly created or its location changes.
   */
  async recomputePropertyNeighborhoodRadar(propertyId: string): Promise<{ processed: number }> {
    const result = await matchService.recomputePropertyNeighborhoodRadar(propertyId);

    console.log(
      `[NeighborhoodIntelligence] recomputePropertyRadar complete — propertyId=${propertyId} processed=${result.processed}`,
    );

    return result;
  }
}

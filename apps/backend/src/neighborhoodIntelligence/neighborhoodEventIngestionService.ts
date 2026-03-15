// apps/backend/src/neighborhoodIntelligence/neighborhoodEventIngestionService.ts
//
// Handles ingestion and deduplication of normalized neighborhood events.

import { NeighborhoodEventType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { NormalizedNeighborhoodEventInput } from './types';
import { isValidLatLng } from './geoUtils';
import { NEIGHBORHOOD_IMPACT_RULES } from './impactRules';

// Minimum title length to be considered meaningful
const MIN_TITLE_LENGTH = 5;

// Low-signal title keywords to reject
const LOW_SIGNAL_TITLES = ['permit', 'inspection', 'misc', 'other', 'unknown', 'n/a', 'na'];

const SUPPORTED_EVENT_TYPES = new Set<NeighborhoodEventType>(
  Object.keys(NEIGHBORHOOD_IMPACT_RULES) as NeighborhoodEventType[],
);

export class NeighborhoodEventIngestionService {
  /**
   * Ingest a normalized neighborhood event.
   *
   * Behavior:
   *  - Validates required fields
   *  - Rejects unsupported or low-quality inputs
   *  - Deduplicates by externalSourceId+sourceName (preferred) or
   *    eventType+title+approximate location (fallback)
   *  - Creates or updates the NeighborhoodEvent record
   *
   * Returns the event id and whether it was newly created.
   */
  async upsertNormalizedEvent(
    input: NormalizedNeighborhoodEventInput,
  ): Promise<{ eventId: string; created: boolean }> {
    this.validate(input);

    // --- Deduplication ---
    const existing = await this.findExistingEvent(input);

    if (existing) {
      console.log(
        `[NeighborhoodIntelligence] Event deduped — id=${existing.id} source=${input.sourceName ?? 'unknown'} externalId=${input.externalSourceId ?? 'none'}`,
      );

      // Update fields that may have changed (dates, description, source url)
      await prisma.neighborhoodEvent.update({
        where: { id: existing.id },
        data: {
          description: input.description ?? existing.description,
          sourceUrl: input.sourceUrl ?? existing.sourceUrl,
          announcedDate: input.announcedDate ?? existing.announcedDate,
          expectedStartDate: input.expectedStartDate ?? existing.expectedStartDate,
          expectedEndDate: input.expectedEndDate ?? existing.expectedEndDate,
          city: input.city ?? existing.city,
          state: input.state ?? existing.state,
        },
      });

      return { eventId: existing.id, created: false };
    }

    // --- Create new event ---
    const event = await prisma.neighborhoodEvent.create({
      data: {
        eventType: input.eventType,
        title: input.title.trim(),
        description: input.description,
        latitude: input.latitude,
        longitude: input.longitude,
        city: input.city,
        state: input.state,
        country: input.country ?? 'US',
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl,
        announcedDate: input.announcedDate,
        expectedStartDate: input.expectedStartDate,
        expectedEndDate: input.expectedEndDate,
      },
    });

    console.log(
      `[NeighborhoodIntelligence] Event ingested — id=${event.id} type=${event.eventType} title="${event.title}"`,
    );

    return { eventId: event.id, created: true };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private validate(input: NormalizedNeighborhoodEventInput): void {
    if (!SUPPORTED_EVENT_TYPES.has(input.eventType)) {
      throw new APIError(
        `Unsupported neighborhood event type: ${input.eventType}`,
        400,
        'UNSUPPORTED_EVENT_TYPE',
      );
    }

    if (!isValidLatLng(input.latitude, input.longitude)) {
      throw new APIError(
        'Invalid or missing coordinates. latitude and longitude are required.',
        400,
        'INVALID_COORDINATES',
      );
    }

    if (!input.title || input.title.trim().length < MIN_TITLE_LENGTH) {
      throw new APIError(
        'Event title is too short or missing.',
        400,
        'INVALID_TITLE',
      );
    }

    const titleLower = input.title.trim().toLowerCase();
    if (LOW_SIGNAL_TITLES.some((kw) => titleLower === kw || titleLower.startsWith(kw + ' '))) {
      throw new APIError(
        `Event title "${input.title}" appears to be low-signal and was rejected.`,
        400,
        'LOW_SIGNAL_EVENT',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------------------

  private async findExistingEvent(input: NormalizedNeighborhoodEventInput) {
    // Strategy 1: exact external id + source
    if (input.externalSourceId && input.sourceName) {
      const found = await prisma.neighborhoodEvent.findFirst({
        where: {
          sourceName: input.sourceName,
          sourceUrl: input.sourceUrl ?? undefined,
          title: input.title.trim(),
          eventType: input.eventType,
        },
      });
      if (found) return found;
    }

    // Strategy 2: same event type + normalized title + approximate location (±0.01 deg ~= 0.7 miles)
    const latMin = input.latitude - 0.01;
    const latMax = input.latitude + 0.01;
    const lonMin = input.longitude - 0.01;
    const lonMax = input.longitude + 0.01;

    return prisma.neighborhoodEvent.findFirst({
      where: {
        eventType: input.eventType,
        title: input.title.trim(),
        latitude: { gte: latMin, lte: latMax },
        longitude: { gte: lonMin, lte: lonMax },
      },
    });
  }
}

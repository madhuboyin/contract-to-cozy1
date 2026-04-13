// apps/backend/src/neighborhoodIntelligence/neighborhoodEventIngestionService.ts
//
// Handles ingestion and deduplication of normalized neighborhood events.

import { NeighborhoodEventType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { NormalizedNeighborhoodEventInput } from './types';
import { isValidLatLng } from './geoUtils';
import { NEIGHBORHOOD_IMPACT_RULES } from './impactRules';
import { logger } from '../lib/logger';

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
      logger.info(
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

    logger.info(
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
    const normalizedTitle = this.normalizeTitle(input.title);

    // Strategy 1: externalSourceId + sourceName match (when external ID is provided)
    // We match on sourceName + eventType + normalized title to find the canonical record.
    if (input.externalSourceId && input.sourceName) {
      const found = await prisma.neighborhoodEvent.findFirst({
        where: {
          sourceName: input.sourceName,
          eventType: input.eventType,
          title: { equals: normalizedTitle, mode: 'insensitive' },
        },
      });
      if (found) {
        logger.info(
          `[NeighborhoodIntelligence] Dedup strategy-1 matched: id=${found.id} title="${found.title}"`,
        );
        return found;
      }
    }

    // Strategy 2: same event type + normalized title + approximate location
    // ±0.015 degrees ≈ ~1 mile bounding box (wider than original ±0.01 to catch
    // slightly different geocodes for the same real-world location)
    const delta = 0.015;
    const latMin = input.latitude - delta;
    const latMax = input.latitude + delta;
    const lonMin = input.longitude - delta;
    const lonMax = input.longitude + delta;

    const candidate = await prisma.neighborhoodEvent.findFirst({
      where: {
        eventType: input.eventType,
        title: { equals: normalizedTitle, mode: 'insensitive' },
        latitude: { gte: latMin, lte: latMax },
        longitude: { gte: lonMin, lte: lonMax },
      },
    });

    if (candidate) {
      logger.info(
        `[NeighborhoodIntelligence] Dedup strategy-2 matched: id=${candidate.id} title="${candidate.title}"`,
      );
    }

    return candidate ?? null;
  }

  /**
   * Normalize a title for deduplication comparisons.
   * Lowercases, trims, and collapses internal whitespace so minor
   * formatting differences don't create duplicate event records.
   */
  private normalizeTitle(title: string): string {
    return title.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}

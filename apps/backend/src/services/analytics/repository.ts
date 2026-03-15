// apps/backend/src/services/analytics/repository.ts
//
// Data-access layer for ProductAnalyticsEvent.
// Append-only writes — no update/delete methods by design.

import { Prisma, ProductAnalyticsEventType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateAnalyticsEventData {
  eventType:    ProductAnalyticsEventType;
  eventName?:   string | null;
  userId?:      string | null;
  propertyId?:  string | null;
  moduleKey?:   string | null;
  featureKey?:  string | null;
  screenKey?:   string | null;
  sessionKey?:  string | null;
  source?:      string | null;
  eventDate?:   Date | null;
  occurredAt:   Date;
  // Record<string,unknown> is safe here — cast to InputJsonValue at Prisma boundary
  metadataJson?: Record<string, unknown> | null;
  valueNumeric?: number | null;
  valueText?:   string | null;
}

// ============================================================================
// REPOSITORY
// ============================================================================

export class AnalyticsRepository {
  /**
   * Persist a single product analytics event.
   * Returns the created record.
   */
  static async createEvent(data: CreateAnalyticsEventData) {
    return prisma.productAnalyticsEvent.create({
      data: {
        eventType:    data.eventType,
        eventName:    data.eventName   ?? null,
        userId:       data.userId      ?? null,
        propertyId:   data.propertyId  ?? null,
        moduleKey:    data.moduleKey   ?? null,
        featureKey:   data.featureKey  ?? null,
        screenKey:    data.screenKey   ?? null,
        sessionKey:   data.sessionKey  ?? null,
        source:       data.source      ?? null,
        eventDate:    data.eventDate   ?? null,
        occurredAt:   data.occurredAt,
        metadataJson: (data.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        valueNumeric: data.valueNumeric ?? null,
        valueText:    data.valueText   ?? null,
      },
    });
  }

  /**
   * Persist multiple analytics events in a single transaction.
   * Useful for bulk-emit scenarios (e.g. batch property activations).
   */
  static async createManyEvents(events: CreateAnalyticsEventData[]) {
    if (events.length === 0) return { count: 0 };

    return prisma.productAnalyticsEvent.createMany({
      data: events.map((data) => ({
        eventType:    data.eventType,
        eventName:    data.eventName   ?? null,
        userId:       data.userId      ?? null,
        propertyId:   data.propertyId  ?? null,
        moduleKey:    data.moduleKey   ?? null,
        featureKey:   data.featureKey  ?? null,
        screenKey:    data.screenKey   ?? null,
        sessionKey:   data.sessionKey  ?? null,
        source:       data.source      ?? null,
        eventDate:    data.eventDate   ?? null,
        occurredAt:   data.occurredAt,
        metadataJson: (data.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        valueNumeric: data.valueNumeric ?? null,
        valueText:    data.valueText   ?? null,
      })),
      skipDuplicates: false,
    });
  }
}

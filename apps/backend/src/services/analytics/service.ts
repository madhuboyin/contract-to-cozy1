// apps/backend/src/services/analytics/service.ts
//
// ProductAnalyticsService — validates, normalizes, and persists product analytics events.
// This is the canonical entry point for all event tracking in the CtC backend.
//
// Key rules:
//  - Validation is strict at this layer; callers get clear errors on malformed input.
//  - Normalization ensures consistent event shape in the DB.
//  - Helpers for high-value event types reduce boilerplate in feature modules.

import { ProductAnalyticsEventType } from '@prisma/client';
import { AnalyticsRepository, CreateAnalyticsEventData } from './repository';
import {
  TrackEventSchema,
  TrackEventInput,
  TrackFeatureOpenedInput,
  TrackDecisionGuidedInput,
  TrackPropertyActivatedInput,
  TrackToolUsedInput,
} from './schemas';
import {
import { logger } from '../../lib/logger';
  AnalyticsModule,
  AnalyticsFeature,
} from './taxonomy';

// ============================================================================
// HELPERS
// ============================================================================

/** Trim a string and return null for empty/whitespace results. */
function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Derive a UTC midnight Date for the event date partition column.
 * Prisma stores this in a @db.Date column — the time part is ignored by Postgres.
 */
function toEventDate(occurredAt: Date): Date {
  const d = new Date(occurredAt);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Safely serialize metadataJson.
 * Returns null if the value cannot be serialized or exceeds the size guard.
 */
function sanitizeMetadata(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (raw == null) return null;
  try {
    const s = JSON.stringify(raw);
    if (s.length > 8192) {
      logger.error('[Analytics] metadataJson exceeds 8 KB — dropped for event normalization');
      return null;
    }
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    logger.error('[Analytics] metadataJson is not serializable — dropped');
    return null;
  }
}

// ============================================================================
// NORMALIZE
// ============================================================================

function normalize(input: TrackEventInput): CreateAnalyticsEventData {
  const occurredAt = input.occurredAt ?? new Date();

  return {
    eventType:    input.eventType,
    eventName:    trimOrNull(input.eventName),
    userId:       input.userId    ?? null,
    propertyId:   input.propertyId ?? null,
    moduleKey:    trimOrNull(input.moduleKey),
    featureKey:   trimOrNull(input.featureKey),
    screenKey:    trimOrNull(input.screenKey),
    sessionKey:   trimOrNull(input.sessionKey),
    source:       trimOrNull(input.source),
    eventDate:    toEventDate(occurredAt),
    occurredAt,
    metadataJson: sanitizeMetadata(input.metadataJson),
    valueNumeric: input.valueNumeric ?? null,
    valueText:    trimOrNull(input.valueText),
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export class ProductAnalyticsService {
  // --------------------------------------------------------------------------
  // Core ingestion
  // --------------------------------------------------------------------------

  /**
   * Validate and persist a single analytics event.
   *
   * Throws a ZodError if the input fails validation.
   * Callers that want fire-and-forget semantics should use `analyticsEmitter` instead.
   */
  static async trackEvent(raw: TrackEventInput) {
    const parsed = TrackEventSchema.parse(raw);
    const data   = normalize(parsed);
    return AnalyticsRepository.createEvent(data);
  }

  /**
   * Validate and persist multiple analytics events in one DB round-trip.
   */
  static async trackEvents(raws: TrackEventInput[]) {
    if (raws.length === 0) return { count: 0 };
    const data = raws.map((raw) => normalize(TrackEventSchema.parse(raw)));
    return AnalyticsRepository.createManyEvents(data);
  }

  // --------------------------------------------------------------------------
  // Convenience helpers for high-value event types
  // --------------------------------------------------------------------------

  /**
   * Track that a feature/screen was opened.
   * Emits a FEATURE_OPENED event with module + feature context.
   */
  static async trackFeatureOpened(input: TrackFeatureOpenedInput) {
    return ProductAnalyticsService.trackEvent({
      eventType:    ProductAnalyticsEventType.FEATURE_OPENED,
      userId:       input.userId,
      propertyId:   input.propertyId,
      moduleKey:    input.moduleKey,
      featureKey:   input.featureKey,
      screenKey:    input.screenKey,
      source:       input.source,
      occurredAt:   input.occurredAt,
      metadataJson: input.metadataJson,
    });
  }

  /**
   * Track that the user was guided through a decision.
   * Emits a DECISION_GUIDED event — used for the "Decisions Guided" admin metric.
   */
  static async trackDecisionGuided(input: TrackDecisionGuidedInput) {
    const meta: Record<string, unknown> = { ...(input.metadataJson ?? {}) };
    if (input.decisionType) meta.decisionType = input.decisionType;

    return ProductAnalyticsService.trackEvent({
      eventType:    ProductAnalyticsEventType.DECISION_GUIDED,
      userId:       input.userId,
      propertyId:   input.propertyId,
      moduleKey:    input.moduleKey,
      featureKey:   input.featureKey,
      occurredAt:   input.occurredAt,
      metadataJson: meta,
    });
  }

  /**
   * Track that a property reached "activated" state.
   * Emits a PROPERTY_ACTIVATED event — used for the "Activated Homes" admin metric.
   */
  static async trackPropertyActivated(input: TrackPropertyActivatedInput) {
    const meta: Record<string, unknown> = { ...(input.metadataJson ?? {}) };
    if (input.activationVersion) meta.activationVersion = input.activationVersion;

    return ProductAnalyticsService.trackEvent({
      eventType:    ProductAnalyticsEventType.PROPERTY_ACTIVATED,
      userId:       input.userId,
      propertyId:   input.propertyId,
      moduleKey:    AnalyticsModule.PROPERTY,
      featureKey:   AnalyticsFeature.PROPERTY_ACTIVATION,
      occurredAt:   input.occurredAt,
      metadataJson: meta,
    });
  }

  /**
   * Track that a tool was used by a homeowner.
   * Emits a TOOL_USED event — used for feature adoption metrics.
   */
  static async trackToolUsed(input: TrackToolUsedInput) {
    const meta: Record<string, unknown> = { ...(input.metadataJson ?? {}) };
    if (input.toolName) meta.toolName = input.toolName;

    return ProductAnalyticsService.trackEvent({
      eventType:    ProductAnalyticsEventType.TOOL_USED,
      userId:       input.userId,
      propertyId:   input.propertyId,
      moduleKey:    input.moduleKey,
      featureKey:   input.featureKey,
      occurredAt:   input.occurredAt,
      metadataJson: meta,
    });
  }
}

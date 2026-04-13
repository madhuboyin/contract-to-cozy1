// apps/backend/src/services/analytics/emitter.ts
//
// Safe fire-and-forget analytics emitter for use throughout the CtC backend.
//
// KEY DESIGN RULE:
//   Analytics must NEVER break primary product workflows.
//   Every method in this module swallows errors, logs them, and returns void.
//   Use these helpers anywhere you want best-effort event tracking.
//
// Usage:
//   import { analyticsEmitter } from '../analytics/emitter';
//   analyticsEmitter.featureOpened({ userId, propertyId, moduleKey: AnalyticsModule.CLAIMS, featureKey: AnalyticsFeature.CLAIM });
//   analyticsEmitter.decisionGuided({ userId, propertyId, featureKey: AnalyticsFeature.NEGOTIATION_SHIELD });

import { ProductAnalyticsEventType } from '@prisma/client';
import { ProductAnalyticsService } from './service';
import {
import { logger } from '../../lib/logger';
  TrackEventInput,
  TrackFeatureOpenedInput,
  TrackDecisionGuidedInput,
  TrackPropertyActivatedInput,
  TrackToolUsedInput,
} from './schemas';

// ============================================================================
// VIEW EVENT DEDUPLICATION
//
// Problem: "view" events (DIGITAL_TWIN_VIEWED, HOME_PULSE_VIEWED, etc.) are
// emitted inside service-layer GET handlers that are called on every request.
// A user refreshing the page 20 times would emit 20 identical events, inflating
// session/engagement counts in the admin metrics.
//
// Solution: A per-process in-memory cache suppresses repeated view events for
// the same (propertyId, eventType) within VIEW_DEDUP_WINDOW_MS. This is a
// best-effort guard — it does not eliminate cross-process or cross-restart
// duplicates, but eliminates the most common rapid-refresh inflation source.
//
// Backfill / replay safety: Suppression is purely runtime. A backfill or
// process restart resets the cache, which is intentional — historical backfills
// should bypass this guard by passing explicit occurredAt timestamps.
// ============================================================================

const VIEW_DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour per property+eventType
const VIEW_DEDUP_CACHE_MAX = 10_000; // Bounded to prevent unbounded memory growth

/** Key → timestamp of last emission */
const viewDedupCache = new Map<string, number>();

/**
 * Event types that are likely to fire on every GET request and therefore
 * need dedup protection. Transactional/mutation events (CREATED, COMPLETED,
 * DECISION_GUIDED) are intentionally excluded — every occurrence matters.
 */
const VIEW_EVENT_TYPES = new Set<ProductAnalyticsEventType>([
  ProductAnalyticsEventType.DIGITAL_TWIN_VIEWED,
  ProductAnalyticsEventType.HOME_PULSE_VIEWED,
  ProductAnalyticsEventType.CLAIM_VIEWED,
  ProductAnalyticsEventType.INCIDENT_VIEWED,
  ProductAnalyticsEventType.HIDDEN_ASSET_VIEWED,
]);

/**
 * Returns true if the event should be emitted, false if it should be
 * suppressed because an identical event was recently emitted.
 */
function shouldEmitViewEvent(
  eventType: ProductAnalyticsEventType,
  propertyId: string | null | undefined,
): boolean {
  // Non-view events always emit
  if (!VIEW_EVENT_TYPES.has(eventType)) return true;
  // Without propertyId we cannot deduplicate — let it through
  if (!propertyId) return true;

  const now = Date.now();
  const key = `${propertyId}:${eventType}`;
  const last = viewDedupCache.get(key);

  if (last !== undefined && now - last < VIEW_DEDUP_WINDOW_MS) {
    // Suppressed — same property+eventType within dedup window
    return false;
  }

  // Evict oldest entry if cache is full (Map preserves insertion order)
  if (viewDedupCache.size >= VIEW_DEDUP_CACHE_MAX) {
    const firstKey = viewDedupCache.keys().next().value as string;
    viewDedupCache.delete(firstKey);
  }

  viewDedupCache.set(key, now);
  return true;
}

// ============================================================================
// INTERNAL HELPER
// ============================================================================

function safeTrack(label: string, promise: Promise<unknown>): void {
  promise.catch((err) => {
    logger.error(`[Analytics] Failed to track event (${label}):`, err?.message ?? err);
  });
}

// ============================================================================
// EMITTER OBJECT
// ============================================================================

export const analyticsEmitter = {
  /**
   * Emit any arbitrary analytics event.
   * Best-effort — failures are logged and silently dropped.
   * View-type events are deduplicated within a 1-hour window per property.
   */
  track(input: TrackEventInput): void {
    if (!shouldEmitViewEvent(input.eventType, input.propertyId)) return;
    safeTrack(input.eventType, ProductAnalyticsService.trackEvent(input));
  },

  /**
   * Emit multiple events in a single DB call.
   * Best-effort — failures are logged and silently dropped.
   */
  trackBatch(inputs: TrackEventInput[]): void {
    if (inputs.length === 0) return;
    safeTrack('batch', ProductAnalyticsService.trackEvents(inputs));
  },

  /**
   * Track that a feature/screen was opened.
   */
  featureOpened(input: TrackFeatureOpenedInput): void {
    safeTrack(
      `${ProductAnalyticsEventType.FEATURE_OPENED}:${input.featureKey}`,
      ProductAnalyticsService.trackFeatureOpened(input)
    );
  },

  /**
   * Track a guided decision moment.
   * Directly feeds the "Decisions Guided" admin metric.
   */
  decisionGuided(input: TrackDecisionGuidedInput): void {
    safeTrack(
      `${ProductAnalyticsEventType.DECISION_GUIDED}:${input.featureKey}`,
      ProductAnalyticsService.trackDecisionGuided(input)
    );
  },

  /**
   * Track a property reaching activated state.
   * Directly feeds the "Activated Homes" admin metric.
   */
  propertyActivated(input: TrackPropertyActivatedInput): void {
    safeTrack(
      `${ProductAnalyticsEventType.PROPERTY_ACTIVATED}:${input.propertyId}`,
      ProductAnalyticsService.trackPropertyActivated(input)
    );
  },

  /**
   * Track a homeowner using a specific tool.
   * Feeds feature adoption metrics.
   */
  toolUsed(input: TrackToolUsedInput): void {
    safeTrack(
      `${ProductAnalyticsEventType.TOOL_USED}:${input.featureKey}`,
      ProductAnalyticsService.trackToolUsed(input)
    );
  },
};

// ============================================================================
// STANDALONE HELPER
// For callers that prefer a single import over the emitter object.
// ============================================================================

/**
 * Emit a raw product analytics event with full fire-and-forget safety.
 * Identical semantics to `analyticsEmitter.track(input)`.
 */
export function emitProductEvent(input: TrackEventInput): void {
  analyticsEmitter.track(input);
}

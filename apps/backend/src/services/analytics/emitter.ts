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
  TrackEventInput,
  TrackFeatureOpenedInput,
  TrackDecisionGuidedInput,
  TrackPropertyActivatedInput,
  TrackToolUsedInput,
} from './schemas';

// ============================================================================
// INTERNAL HELPER
// ============================================================================

function safeTrack(label: string, promise: Promise<unknown>): void {
  promise.catch((err) => {
    console.error(`[Analytics] Failed to track event (${label}):`, err?.message ?? err);
  });
}

// ============================================================================
// EMITTER OBJECT
// ============================================================================

export const analyticsEmitter = {
  /**
   * Emit any arbitrary analytics event.
   * Best-effort — failures are logged and silently dropped.
   */
  track(input: TrackEventInput): void {
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

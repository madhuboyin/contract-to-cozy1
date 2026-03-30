// apps/backend/src/services/telemetry.service.ts
//
// Structured telemetry for Section 7 observability requirements.
// Builds on top of the analyticsEmitter fire-and-forget system.
//
// Tracks:
//   - Signal quality metadata: confidence_level, confidence_source, last_verified_at,
//     signal_age_days, heuristic path counters
//   - CTA funnel: EXPOSED → CLICKED → COMPLETED
//
// All methods are fire-and-forget — errors are swallowed, never thrown.

import { analyticsEmitter } from './analytics/emitter';
import { ProductAnalyticsEventType } from '@prisma/client';

// ============================================================================
// INTERFACES
// ============================================================================

export interface TelemetrySignalEvent {
  toolKey: string;
  propertyId?: string | null;
  userId?: string | null;
  confidenceLevel?: string | null;
  confidenceSource?: 'DATA_BACKED' | 'HEURISTIC' | 'USER_OVERRIDE' | null;
  lastVerifiedAt?: Date | string | null;
  signalAgeDays?: number | null;
  isHeuristicPath?: boolean;
}

export interface TelemetryCtaEvent {
  toolKey: string;
  ctaType: 'EXPOSED' | 'CLICKED' | 'COMPLETED';
  ctaLabel?: string | null;
  targetTool?: string | null;
  propertyId?: string | null;
  userId?: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute signal age in days from a lastVerifiedAt timestamp.
 * Returns null if input is null/undefined or cannot be parsed.
 */
function computeSignalAgeDays(lastVerifiedAt: Date | string | null | undefined): number | null {
  if (lastVerifiedAt == null) return null;
  try {
    const verifiedDate = typeof lastVerifiedAt === 'string'
      ? new Date(lastVerifiedAt)
      : lastVerifiedAt;
    if (isNaN(verifiedDate.getTime())) return null;
    const diffMs = Date.now() - verifiedDate.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
}

// ============================================================================
// TELEMETRY OBJECT
// ============================================================================

export const telemetry = {
  /**
   * Emit a signal quality event — records confidence, source, staleness.
   * Computes signalAgeDays from lastVerifiedAt if not explicitly provided.
   */
  signal(event: TelemetrySignalEvent): void {
    try {
      const ageDays =
        event.signalAgeDays != null
          ? event.signalAgeDays
          : computeSignalAgeDays(event.lastVerifiedAt);

      analyticsEmitter.toolUsed({
        userId: event.userId ?? null,
        propertyId: event.propertyId ?? null,
        moduleKey: 'telemetry',
        featureKey: event.toolKey,
        toolName: event.toolKey,
        metadataJson: {
          telemetry_type: 'SIGNAL',
          confidence_level: event.confidenceLevel ?? null,
          confidence_source: event.confidenceSource ?? null,
          last_verified_at: event.lastVerifiedAt
            ? (event.lastVerifiedAt instanceof Date
                ? event.lastVerifiedAt.toISOString()
                : event.lastVerifiedAt)
            : null,
          signal_age_days: ageDays,
          is_heuristic_path: event.isHeuristicPath ?? false,
        },
      });
    } catch {
      // Fire-and-forget — swallow all errors
    }
  },

  /**
   * Emit a CTA exposed event — user was shown a call-to-action.
   */
  ctaExposed(event: Omit<TelemetryCtaEvent, 'ctaType'>): void {
    try {
      analyticsEmitter.toolUsed({
        userId: event.userId ?? null,
        propertyId: event.propertyId ?? null,
        moduleKey: 'telemetry',
        featureKey: event.toolKey,
        toolName: event.toolKey,
        metadataJson: {
          telemetry_type: 'CTA',
          cta_type: 'EXPOSED',
          cta_label: event.ctaLabel ?? null,
          target_tool: event.targetTool ?? null,
        },
      });
    } catch {
      // Fire-and-forget
    }
  },

  /**
   * Emit a CTA clicked event — user clicked the call-to-action.
   */
  ctaClicked(event: Omit<TelemetryCtaEvent, 'ctaType'>): void {
    try {
      analyticsEmitter.toolUsed({
        userId: event.userId ?? null,
        propertyId: event.propertyId ?? null,
        moduleKey: 'telemetry',
        featureKey: event.toolKey,
        toolName: event.toolKey,
        metadataJson: {
          telemetry_type: 'CTA',
          cta_type: 'CLICKED',
          cta_label: event.ctaLabel ?? null,
          target_tool: event.targetTool ?? null,
        },
      });
    } catch {
      // Fire-and-forget
    }
  },

  /**
   * Emit a CTA completed event — user completed the action initiated by the CTA.
   */
  ctaCompleted(event: Omit<TelemetryCtaEvent, 'ctaType'>): void {
    try {
      analyticsEmitter.toolUsed({
        userId: event.userId ?? null,
        propertyId: event.propertyId ?? null,
        moduleKey: 'telemetry',
        featureKey: event.toolKey,
        toolName: event.toolKey,
        metadataJson: {
          telemetry_type: 'CTA',
          cta_type: 'COMPLETED',
          cta_label: event.ctaLabel ?? null,
          target_tool: event.targetTool ?? null,
        },
      });
    } catch {
      // Fire-and-forget
    }
  },
};

export default telemetry;

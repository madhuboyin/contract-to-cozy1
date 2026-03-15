// neighborhoodChangeRadarUi.ts
//
// Pure UI helper functions for Neighborhood Change Radar.
// No React imports — all functions accept plain data and return plain values,
// making them directly unit-testable without a DOM.
//
// Mirrors the pattern of homeRiskReplayUi.ts.

import type {
  NeighborhoodConfidenceBand,
  NeighborhoodOverallEffect,
  NeighborhoodRadarSummaryDTO,
} from '@/types';

// ============================================================================
// Error handling
// ============================================================================

type ApiErrorLike = {
  message?: string;
  status?: number | string;
  payload?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
};

export type NeighborhoodRadarErrorStage = 'summary' | 'events' | 'detail' | 'trends';

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as ApiErrorLike).payload?.error?.code;
}

function extractStatus(error: unknown): number | string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as ApiErrorLike).status;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

/**
 * Return a user-facing message for Neighborhood Change Radar errors.
 * Non-technical, calm, and actionable.
 */
export function getNeighborhoodEventUserMessage(
  error: unknown,
  stage: NeighborhoodRadarErrorStage,
): string {
  const status = extractStatus(error);
  const code = extractErrorCode(error);
  const rawMessage = extractMessage(error).toLowerCase();
  const isNetwork =
    status === 'NETWORK' ||
    rawMessage.includes('network') ||
    rawMessage.includes('fetch') ||
    rawMessage.includes('timeout');

  if (
    status === 404 ||
    code === 'PROPERTY_NOT_FOUND' ||
    code === 'PROPERTY_ACCESS_DENIED'
  ) {
    return 'We could not load this property context. Open Neighborhood Change Radar from one of your properties and try again.';
  }

  if (status === 401 || code === 'AUTH_REQUIRED' || code === 'TOKEN_EXPIRED') {
    return 'Your session expired. Refresh the page and try again.';
  }

  if (isNetwork) {
    if (stage === 'detail') {
      return 'We could not load this event detail right now. Try again.';
    }
    if (stage === 'trends') {
      return 'We could not load neighborhood trends right now. Try again.';
    }
    return 'We could not load Neighborhood Change Radar right now. Check your connection and try again.';
  }

  if (stage === 'detail') {
    return 'We could not load this event detail right now.';
  }
  if (stage === 'trends') {
    return 'We could not load neighborhood trends right now.';
  }
  if (stage === 'events') {
    return 'We could not load neighborhood events right now.';
  }
  return 'We could not load Neighborhood Change Radar right now.';
}

// ============================================================================
// Guardrails
// ============================================================================

export type NeighborhoodRadarGuardrail = {
  title: string;
  description: string;
  tone: 'good' | 'info' | 'elevated';
};

/**
 * Return a guardrail card when the radar summary warrants one, or null
 * if the summary has meaningful active events that speak for themselves.
 *
 * Guardrail cases:
 *  - No events at all → positive/reassuring
 *  - All events below meaningful threshold → info (data may exist but is low-signal)
 *  - Majority PRELIMINARY confidence → info (data quality caveat)
 */
export function buildNeighborhoodRadarGuardrail(
  summary: Pick<
    NeighborhoodRadarSummaryDTO,
    'meaningfulChangeCount' | 'topPositiveThemes' | 'topNegativeThemes'
  > & { totalCount?: number; preliminaryCount?: number },
): NeighborhoodRadarGuardrail | null {
  const meaningful = summary.meaningfulChangeCount ?? 0;
  const total = summary.totalCount ?? meaningful;
  const preliminary = summary.preliminaryCount ?? 0;

  if (total === 0) {
    return {
      title: 'No neighborhood changes detected',
      description:
        'We found no significant neighborhood events for this property yet. That is still useful context — we will notify you as new developments are linked to your home.',
      tone: 'good',
    };
  }

  if (meaningful === 0 && total > 0) {
    return {
      title: 'Events found — awaiting more data',
      description:
        'Some neighborhood events are linked to this property, but they are older signals or lack enough data for a confident assessment. Check back as data is refreshed.',
      tone: 'info',
    };
  }

  if (preliminary > 0 && preliminary >= meaningful) {
    return {
      title: 'Signals are preliminary',
      description:
        'Most linked events have limited data — no confirmed source, dates, or descriptions yet. Treat these as early signals rather than verified developments.',
      tone: 'info',
    };
  }

  // Enough meaningful events — no guardrail needed.
  return null;
}

// ============================================================================
// Confidence + staleness labels
// ============================================================================

/**
 * Return the user-visible text for a confidence band.
 * Stale events always show "Older signal" regardless of band.
 * HIGH confidence events return null (no label needed — it is the expected default).
 */
export function getConfidenceBandLabel(
  band: NeighborhoodConfidenceBand,
  isStale: boolean,
): string | null {
  if (isStale) return 'Older signal';
  if (band === 'HIGH') return null;
  if (band === 'MEDIUM') return 'Medium confidence';
  return 'Preliminary signal';
}

/**
 * Return a short inline note to display on a stale event card or detail view.
 * Returns null for fresh events.
 */
export function buildStaleEventNote(event: {
  isStale: boolean;
  confidenceBand: NeighborhoodConfidenceBand;
}): string | null {
  if (!event.isStale) return null;
  return 'This is an older signal — confirm current status before acting on it.';
}

// ============================================================================
// Distance formatting
// ============================================================================

/**
 * Format a distance in miles to a human-readable string.
 * Mirrors the formatDistance helper in NeighborhoodChangeRadarClient.tsx
 * but is exported here so it can be unit-tested without React.
 */
export function formatNeighborhoodDistance(miles: number): string {
  if (miles < 0.1) return 'Very close';
  return `${miles.toFixed(1)} mi away`;
}

// ============================================================================
// Effect sentiment
// ============================================================================

/**
 * Return a short sentiment label for a given overall effect.
 * Used for aria labels, tooltips, and summary lines.
 */
export function getEffectSentimentLabel(effect: NeighborhoodOverallEffect): string {
  switch (effect) {
    case 'HIGHLY_POSITIVE':
    case 'MODERATELY_POSITIVE':
      return 'Positive impact expected';
    case 'HIGHLY_NEGATIVE':
    case 'MODERATELY_NEGATIVE':
      return 'Negative impact expected';
    case 'MIXED':
      return 'Mixed impact expected';
    case 'NEUTRAL':
    default:
      return 'Neutral or unclear impact';
  }
}

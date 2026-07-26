type SearchParamReader = Pick<URLSearchParams, 'get'>;

/**
 * Bounded context that may cross internal Radar handoffs. Keeping the
 * allowlist here prevents arbitrary query parameters from being propagated
 * through provider profile and booking URLs.
 */
export const RADAR_HANDOFF_CONTEXT_KEYS = [
  'launchSurface',
  'sourceEntityType',
  'sourceEntityId',
  'recommendationReason',
  'recommendationVersion',
  'radarMatchId',
  'radarEventId',
  'incidentId',
  'journeyId',
  'guidanceJourneyId',
  'guidanceStepKey',
  'returnTo',
  'from',
] as const;

export function sanitizeDashboardReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith('/dashboard') || value.startsWith('//')) return null;
  try {
    const url = new URL(value, 'https://contracttocozy.internal');
    if (url.origin !== 'https://contracttocozy.internal') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function forwardRadarHandoffContinuity(
  source: SearchParamReader,
  target: URLSearchParams,
): URLSearchParams {
  for (const key of RADAR_HANDOFF_CONTEXT_KEYS) {
    const rawValue = source.get(key);
    const value = key === 'returnTo'
      ? sanitizeDashboardReturnTo(rawValue)
      : rawValue;
    if (value && !target.has(key)) target.set(key, value);
  }
  return target;
}

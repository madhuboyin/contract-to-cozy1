const DASHBOARD_PREFIX = '/dashboard';

/**
 * Allows only in-app dashboard paths for back links to avoid open redirects.
 */
export function resolveDashboardBackHref(
  rawBackTo: string | null | undefined,
  fallbackHref: string
): string {
  if (!rawBackTo) return fallbackHref;

  const normalized = rawBackTo.trim();
  if (!normalized) return fallbackHref;
  if (!normalized.startsWith(DASHBOARD_PREFIX)) return fallbackHref;
  if (normalized.startsWith('//')) return fallbackHref;

  return normalized;
}

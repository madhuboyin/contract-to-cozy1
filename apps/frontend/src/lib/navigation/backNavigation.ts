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

type RouterLike = {
  back: () => void;
  push: (href: string) => void;
  replace?: (href: string) => void;
};

function deriveDashboardFallbackFromPath(pathname: string): string {
  if (!pathname.startsWith(DASHBOARD_PREFIX)) return DASHBOARD_PREFIX;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 1) return DASHBOARD_PREFIX;
  if (segments.length === 2) return DASHBOARD_PREFIX;

  return `/${segments.slice(0, -1).join('/')}`;
}

function hasSafeInAppHistory(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.history.length <= 1) return false;
  if (!document.referrer) return false;

  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function navigateBackWithDashboardFallback(
  router: RouterLike,
  options?: {
    fallbackHref?: string;
    preferReplace?: boolean;
  }
): void {
  if (typeof window === 'undefined') {
    router.push(options?.fallbackHref ?? DASHBOARD_PREFIX);
    return;
  }

  const rawBackTo = new URLSearchParams(window.location.search).get('backTo');
  const derivedFallback =
    options?.fallbackHref ?? deriveDashboardFallbackFromPath(window.location.pathname);
  const safeFallback = resolveDashboardBackHref(rawBackTo, derivedFallback);

  if (hasSafeInAppHistory()) {
    router.back();
    return;
  }

  if (options?.preferReplace && router.replace) {
    router.replace(safeFallback);
    return;
  }

  router.push(safeFallback);
}

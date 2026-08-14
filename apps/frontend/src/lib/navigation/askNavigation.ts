import { resolveDashboardBackHref } from './backNavigation';

type AskWorkspaceHrefInput = {
  propertyId?: string | null;
  sessionId?: string | null;
  executionId?: string | null;
  question?: string | null;
  backTo?: string | null;
  from?: string | null;
  launchSurface?: string | null;
  launchCapabilityId?: string | null;
};

function setWhenPresent(params: URLSearchParams, key: string, value?: string | null) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

/** Builds a durable Ask URL so a panel, notification, or linked workflow can resume the same conversation. */
export function buildAskWorkspaceHref(input: AskWorkspaceHrefInput = {}): string {
  const params = new URLSearchParams();
  setWhenPresent(params, 'propertyId', input.propertyId);
  setWhenPresent(params, 'sessionId', input.sessionId);
  setWhenPresent(params, 'executionId', input.executionId);
  setWhenPresent(params, 'question', input.question);
  setWhenPresent(params, 'from', input.from);
  setWhenPresent(params, 'launchSurface', input.launchSurface);
  setWhenPresent(params, 'launchCapabilityId', input.launchCapabilityId);

  const safeBackTo = resolveDashboardBackHref(input.backTo, '');
  if (safeBackTo) params.set('backTo', safeBackTo);

  const query = params.toString();
  return `/dashboard/ask${query ? `?${query}` : ''}`;
}

/** Human-readable origin for the compact contextual back affordance. */
export function askOriginBackLabel(backTo?: string | null, source?: string | null): string {
  if (source === 'notification') return 'Back to notifications';
  const safeBackTo = resolveDashboardBackHref(backTo, '');
  if (!safeBackTo) return 'Back to previous page';
  const pathname = new URL(safeBackTo, 'https://contracttocozy.local').pathname;
  if (pathname === '/dashboard') return 'Back to Home';
  if (pathname === '/dashboard/notifications') return 'Back to notifications';
  if (pathname === '/dashboard/maintenance') return 'Back to maintenance';
  if (pathname === '/dashboard/warranties') return 'Back to warranties';
  if (pathname === '/dashboard/insurance') return 'Back to insurance';
  if (pathname === '/dashboard/properties' || pathname.startsWith('/dashboard/properties/')) return 'Back to Home Record';
  return 'Back to previous page';
}

/**
 * Adds Ask continuation to an in-dashboard action without overwriting a
 * destination-authored return contract. External URLs are left untouched.
 */
export function addAskReturnContext(href: string, askHref: string): string {
  const safeAskHref = resolveDashboardBackHref(askHref, '');
  if (!safeAskHref || !href.startsWith('/dashboard')) return href;

  const url = new URL(href, 'https://contracttocozy.local');
  if (url.pathname === '/dashboard/ask' || url.pathname.startsWith('/dashboard/ask/')) return href;
  if (!url.searchParams.has('backTo') && !url.searchParams.has('returnTo')) {
    url.searchParams.set('backTo', safeAskHref);
    // A few established destinations still read the legacy alias directly.
    // Carry both until those surfaces converge on resolveToolReturnHref().
    url.searchParams.set('returnTo', safeAskHref);
  }
  if (!url.searchParams.has('from')) url.searchParams.set('from', 'ask');
  return `${url.pathname}${url.search}${url.hash}`;
}

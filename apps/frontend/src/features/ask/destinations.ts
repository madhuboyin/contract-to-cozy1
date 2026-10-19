export type AskDestinationId = 'home' | 'work' | 'record' | 'saved' | 'history';

export interface AskDestinationDefinition {
  id: AskDestinationId;
  label: string;
  href: string;
}

export const ASK_DESTINATIONS: readonly AskDestinationDefinition[] = Object.freeze([
  { id: 'home', label: 'Home', href: '/dashboard/ask' },
  { id: 'work', label: 'Work', href: '/dashboard/ask/work' },
  { id: 'record', label: 'Record', href: '/dashboard/ask/record' },
  { id: 'saved', label: 'Saved', href: '/dashboard/ask/saved' },
  { id: 'history', label: 'History', href: '/dashboard/ask/history' },
]);

const CONTINUITY_QUERY_KEYS = [
  'propertyId',
  'sessionId',
  'executionId',
  'backTo',
  'from',
] as const;

export function askDestinationForPath(pathname: string): AskDestinationId {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const match = ASK_DESTINATIONS.find((destination) => destination.id !== 'home' && normalized === destination.href);
  return match?.id ?? 'home';
}

export function buildAskDestinationHref(
  destination: AskDestinationDefinition,
  current: Pick<URLSearchParams, 'get'>,
): string {
  const query = new URLSearchParams();
  for (const key of CONTINUITY_QUERY_KEYS) {
    const value = current.get(key)?.trim();
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return `${destination.href}${suffix ? `?${suffix}` : ''}`;
}

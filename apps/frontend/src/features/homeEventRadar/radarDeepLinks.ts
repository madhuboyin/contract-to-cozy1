import type { RadarSourceFamily } from '@/types';

export type RadarView = 'all' | 'now' | 'upcoming' | 'recently_ended';
export type RadarFamily = 'all' | RadarSourceFamily;

const RADAR_VIEWS = new Set<RadarView>(['all', 'now', 'upcoming', 'recently_ended']);
const RADAR_FAMILIES = new Set<RadarFamily>([
  'all',
  'weather',
  'air_quality',
  'disaster',
  'utility',
  'tax',
  'insurance',
  'other',
]);
const MATCH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type RadarDeepLinkState = {
  view: RadarView;
  family: RadarFamily;
  matchId: string | null;
};

type QueryReader = {
  get(name: string): string | null;
  toString(): string;
};

export function parseRadarDeepLinkState(query: QueryReader): RadarDeepLinkState {
  const rawView = query.get('view');
  const rawFamily = query.get('family');
  const rawMatchId = query.get('matchId');
  return {
    view: rawView && RADAR_VIEWS.has(rawView as RadarView) ? rawView as RadarView : 'all',
    family: rawFamily && RADAR_FAMILIES.has(rawFamily as RadarFamily)
      ? rawFamily as RadarFamily
      : 'all',
    matchId: rawMatchId && MATCH_ID_PATTERN.test(rawMatchId) ? rawMatchId : null,
  };
}

export function canonicalizeRadarDeepLinkQuery(query: QueryReader): URLSearchParams {
  const next = new URLSearchParams(query.toString());
  const state = parseRadarDeepLinkState(query);
  if (state.view === 'all') next.delete('view');
  else next.set('view', state.view);
  if (state.family === 'all') next.delete('family');
  else next.set('family', state.family);
  if (state.matchId) next.set('matchId', state.matchId);
  else next.delete('matchId');
  return next;
}

export function patchRadarDeepLinkQuery(
  query: QueryReader,
  patch: Partial<RadarDeepLinkState>,
): URLSearchParams {
  const current = parseRadarDeepLinkState(query);
  const nextState = { ...current, ...patch };
  const next = new URLSearchParams(query.toString());
  if (nextState.view === 'all') next.delete('view');
  else next.set('view', nextState.view);
  if (nextState.family === 'all') next.delete('family');
  else next.set('family', nextState.family);
  if (nextState.matchId) next.set('matchId', nextState.matchId);
  else next.delete('matchId');
  return next;
}

export function buildHomeEventRadarHref({
  propertyId,
  view = 'all',
  family = 'all',
  matchId,
  context,
}: {
  propertyId: string;
  view?: RadarView;
  family?: RadarFamily;
  matchId?: string | null;
  context?: Record<string, string | null | undefined>;
}): string {
  const query = new URLSearchParams();
  if (view !== 'all') query.set('view', view);
  if (family !== 'all') query.set('family', family);
  if (matchId && MATCH_ID_PATTERN.test(matchId)) query.set('matchId', matchId);
  for (const [key, value] of Object.entries(context ?? {})) {
    if (value) query.set(key, value);
  }
  const path = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-event-radar`;
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

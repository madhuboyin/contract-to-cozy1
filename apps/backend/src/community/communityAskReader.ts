// What the Community answer in Ask reads (FRD v1.479): the same providers Desktop's Community page reads, but each source reports WHY it has nothing.
// Desktop's endpoints turn an unsupported city, a failed feed and a genuinely empty result into the same empty list, so "no alerts" could mean any of them;
// Ask must not say "nothing is happening" when the source did not answer. Nothing here is written, cached beyond a minute, or sent to a model.
import { fetchRssItemsStrict } from './providers/rss.provider';
import { fetchNycEmergencyNotificationsStrict } from './providers/nycOpenData.provider';
import { getAlertsSourcesForCity, getTrashSourcesForCity, resolveCityKey } from './providers/citySources.onTheFly';
import { getCityOpenDataSources } from './providers/citySources.provider';
import type { CommunityEvent } from './types/community.types';

export type CommunitySectionStatus = 'READY' | 'NONE' | 'UNSUPPORTED' | 'NO_FEED' | 'UNAVAILABLE';
export interface CommunityNotice { title: string; description: string | null; publishedAt: string | null; sourceName: string }
export interface CommunitySection<T> { status: CommunitySectionStatus; items: T[]; sourceNames: string[]; fetchedAt: string; partial?: boolean }
export interface CommunityEventsSource { getCommunityEventsByCity(params: { city: string; state: string; limit?: number }): Promise<CommunityEvent[]> }

const cache = new Map<string, { expiresAt: number; value: unknown }>();
const remember = async <T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> => {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
};
/** Test hook: the reader's own minute-long memory. */
export const clearCommunityReaderCache = () => cache.clear();

const supportedCity = (city: string, state: string) => { try { return resolveCityKey(city, state); } catch { return null; } };

/**
 * `window` narrows the events to a span of days ("this weekend"): the nearest events are read in date order (up to 100) and those that start in the span are kept,
 * so an event further out than the first 100 upcoming ones is not searched.
 */
export async function readCommunityEvents(service: CommunityEventsSource, city: string, state: string, limit: number, window?: { start: Date; end: Date } | null): Promise<CommunitySection<CommunityEvent>> {
  try {
    const fetchLimit = window ? 100 : limit;
    const all = await remember(`events|${city}|${state}|${fetchLimit}`, 60_000, () => service.getCommunityEventsByCity({ city, state, limit: fetchLimit }));
    const items = (window ? all.filter((event) => { const at = new Date(event.startTime).getTime(); return at >= window.start.getTime() && at < window.end.getTime(); }) : all).slice(0, limit);
    return { status: items.length ? 'READY' : 'NONE', items, sourceNames: ['Ticketmaster'], fetchedAt: new Date().toISOString() };
  } catch {
    // A missing key, a rate limit and an outage all land here: the answer says the source did not answer, never that there are no events.
    return { status: 'UNAVAILABLE', items: [], sourceNames: ['Ticketmaster'], fetchedAt: new Date().toISOString() };
  }
}

type FeedSource = { sourceName: string; url: string; kind: 'rss' | 'nyc_open_data_emergency' };
async function readFeeds(sources: FeedSource[], limit: number): Promise<{ items: CommunityNotice[]; failed: number }> {
  let failed = 0;
  const lists = await Promise.all(sources.map(async (source): Promise<CommunityNotice[]> => {
    try {
      if (source.kind === 'rss') return (await fetchRssItemsStrict(source.url, limit)).map((item) => ({ title: item.title, description: item.description ?? null, publishedAt: item.publishedAt ?? null, sourceName: source.sourceName }));
      const alerts = await fetchNycEmergencyNotificationsStrict({ limit, appToken: process.env.NYC_OPEN_DATA_APP_TOKEN });
      return alerts.map((alert) => ({ title: alert.title, description: alert.description ?? null, publishedAt: alert.publishedAt ?? null, sourceName: source.sourceName }));
    } catch {
      failed += 1;
      return [];
    }
  }));
  return { items: lists.flat().slice(0, limit), failed };
}

export async function readCityAlerts(city: string, state: string, limit: number): Promise<CommunitySection<CommunityNotice>> {
  const cityKey = supportedCity(city, state);
  if (!cityKey) return { status: 'UNSUPPORTED', items: [], sourceNames: [], fetchedAt: new Date().toISOString() };
  const sources = getAlertsSourcesForCity(cityKey);
  const { items, failed } = await remember(`alerts|${cityKey}|${limit}`, 60_000, () => readFeeds(sources, limit));
  const sourceNames = sources.map((source) => source.sourceName);
  const fetchedAt = new Date().toISOString();
  if (!items.length && failed >= sources.length) return { status: 'UNAVAILABLE', items: [], sourceNames, fetchedAt };
  return { status: items.length ? 'READY' : 'NONE', items, sourceNames, fetchedAt, ...(failed ? { partial: true } : {}) };
}

/** Trash: the city's public feed where one exists (Princeton); otherwise the official page's name, so the homeowner knows where the city publishes it. No schedule is extracted or guessed. */
export async function readCityTrash(city: string, state: string, limit: number): Promise<CommunitySection<CommunityNotice>> {
  const cityKey = supportedCity(city, state);
  if (!cityKey) return { status: 'UNSUPPORTED', items: [], sourceNames: [], fetchedAt: new Date().toISOString() };
  const official = getCityOpenDataSources(city, state).items.filter((item) => item.category === 'TRASH_RECYCLING').map((item) => item.sourceName);
  const sources = getTrashSourcesForCity(cityKey);
  const fetchedAt = new Date().toISOString();
  if (!sources.length) return { status: 'NO_FEED', items: [], sourceNames: official, fetchedAt };
  const { items, failed } = await remember(`trash|${cityKey}|${limit}`, 5 * 60_000, () => readFeeds(sources, limit));
  const sourceNames = [...sources.map((source) => source.sourceName)];
  if (!items.length && failed >= sources.length) return { status: 'UNAVAILABLE', items: [], sourceNames, fetchedAt };
  return { status: items.length ? 'READY' : 'NONE', items, sourceNames, fetchedAt, ...(failed ? { partial: true } : {}) };
}

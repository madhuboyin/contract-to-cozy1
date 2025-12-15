// apps/backend/src/community/community.service.ts

import { PrismaClient } from '@prisma/client';
import {
  CityOpenDataResponse,
  GetCityOpenDataParams,
  GetCommunityEventsParams,
  CommunityEvent,
  OnTheFlyParams,
  OnTheFlyResponse,
  OnTheFlyCategory,
} from './types/community.types';

import { fetchTicketmasterEvents } from './providers/ticketmaster.provider';
import { getCityOpenDataSources } from './providers/citySources.provider';

// ✅ NEW providers
import { fetchRssItems } from './providers/rss.provider';
import { fetchNycEmergencyNotifications } from './providers/nycOpenData.provider';
import {
  resolveCityKey,
  getAlertsSourcesForCity,
  getTrashSourcesForCity,
} from './providers/citySources.onTheFly';

// Simple in-memory TTL cache
type CacheEntry<T> = { expiresAt: number; value: T };

export class CommunityService {
  private cache = new Map<string, CacheEntry<any>>();

  constructor(private prisma: PrismaClient) {}

  private getCache<T>(key: string): T | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return hit.value as T;
  }

  private setCache<T>(key: string, value: T, ttlMs: number) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async getCommunityEventsByCity(params: GetCommunityEventsParams): Promise<CommunityEvent[]> {
    const radiusMiles = params.radiusMiles ?? Number(process.env.EVENTS_RADIUS_MILES ?? 20);
    const limit = params.limit ?? 50;

    const cacheKey = `events|${params.city}|${params.state}|${radiusMiles}|${limit}`;
    const cached = this.getCache<CommunityEvent[]>(cacheKey);
    if (cached) return cached;

    const events = await fetchTicketmasterEvents({
      city: params.city,
      state: params.state,
      radiusMiles,
      limit,
    });

    this.setCache(cacheKey, events, 5 * 60 * 1000); // 5 min
    return events;
  }

  async getCommunityEventsByProperty(propertyId: string, limit = 50): Promise<CommunityEvent[]> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { city: true, state: true },
    });

    if (!property) {
      const err: any = new Error('Property not found');
      err.statusCode = 404;
      throw err;
    }

    return this.getCommunityEventsByCity({ city: property.city, state: property.state, limit });
  }

  async getCityOpenData(params: GetCityOpenDataParams): Promise<CityOpenDataResponse> {
    const cacheKey = `citydata|${params.city}|${params.state}`;
    const cached = this.getCache<CityOpenDataResponse>(cacheKey);
    if (cached) return cached;

    const data = getCityOpenDataSources(params.city, params.state);
    this.setCache(cacheKey, data, 60 * 60 * 1000); // 1 hour
    return data;
  }

  // ✅ NEW: on-the-fly TRASH
  async getTrashOnTheFly(params: OnTheFlyParams): Promise<OnTheFlyResponse> {
    const { city, state } = await this.resolveCityState(params);

    const limit = params.limit ?? 20;
    const cacheKey = `trash|${city}|${state}|${limit}`;
    const cached = this.getCache<OnTheFlyResponse>(cacheKey);
    if (cached) return cached;

    const cityKey = resolveCityKey(city, state);
    const sources = getTrashSourcesForCity(cityKey);

    // For MVP, trash sources are RSS-based (where available)
    const items = (
      await Promise.all(
        sources.map(async (s) => {
          if (s.kind === 'rss') {
            const rssItems = await fetchRssItems(s.url, limit);
            return rssItems.map((it) => ({
              title: it.title,
              description: it.description ?? null,
              url: it.link,
              publishedAt: it.publishedAt ?? null,
              category: 'TRASH' as OnTheFlyCategory,
              sourceName: s.sourceName,
            }));
          }
          return [];
        })
      )
    ).flat();

    const resp: OnTheFlyResponse = {
      city,
      state,
      items: items.slice(0, limit),
      sources: sources.map((s) => ({ sourceName: s.sourceName, url: s.url, kind: s.kind })),
    };

    this.setCache(cacheKey, resp, 5 * 60 * 1000);
    return resp;
  }

  // ✅ NEW: on-the-fly ALERTS
  async getAlertsOnTheFly(params: OnTheFlyParams): Promise<OnTheFlyResponse> {
    const { city, state } = await this.resolveCityState(params);

    const limit = params.limit ?? 20;
    const cacheKey = `alerts|${city}|${state}|${limit}`;
    const cached = this.getCache<OnTheFlyResponse>(cacheKey);
    if (cached) return cached;

    const cityKey = resolveCityKey(city, state);
    const sources = getAlertsSourcesForCity(cityKey);

    const items = (
      await Promise.all(
        sources.map(async (s) => {
          if (s.kind === 'rss') {
            const rssItems = await fetchRssItems(s.url, limit);
            return rssItems.map((it) => ({
              title: it.title,
              description: it.description ?? null,
              url: it.link,
              publishedAt: it.publishedAt ?? null,
              category: 'ALERT' as OnTheFlyCategory,
              sourceName: s.sourceName,
            }));
          }

          if (s.kind === 'nyc_open_data_emergency') {
            const alerts = await fetchNycEmergencyNotifications({
              limit,
              appToken: process.env.NYC_OPEN_DATA_APP_TOKEN,
            });

            return alerts.map((a) => ({
              title: a.title,
              description: a.description ?? null,
              url: a.url ?? null,
              publishedAt: a.publishedAt ?? null,
              category: 'ALERT' as OnTheFlyCategory,
              sourceName: s.sourceName,
            }));
          }

          return [];
        })
      )
    ).flat();

    const resp: OnTheFlyResponse = {
      city,
      state,
      items: items.slice(0, limit),
      sources: sources.map((s) => ({ sourceName: s.sourceName, url: s.url, kind: s.kind })),
    };

    this.setCache(cacheKey, resp, 60 * 1000); // alerts can update frequently → 1 min cache
    return resp;
  }

  private async resolveCityState(params: OnTheFlyParams): Promise<{ city: string; state: string }> {
    if (params.propertyId) {
      const property = await this.prisma.property.findUnique({
        where: { id: params.propertyId },
        select: { city: true, state: true },
      });

      if (!property) {
        const err: any = new Error('Property not found');
        err.statusCode = 404;
        throw err;
      }
      return { city: property.city, state: property.state };
    }

    const city = (params.city ?? '').trim();
    const state = (params.state ?? '').trim();
    if (!city || !state) {
      const err: any = new Error('city/state or propertyId is required');
      err.statusCode = 400;
      throw err;
    }
    return { city, state };
  }

  async getCityTrash(params: { city: string; state: string }) {
    const openData = getCityOpenDataSources(params.city, params.state);
  
    return {
      city: params.city,
      state: params.state,
      items: openData.items.filter(
        i => i.category === 'TRASH_RECYCLING'
      ),
    };
  }
  
  async getCityAlerts(params: { city: string; state: string }) {
    const openData = getCityOpenDataSources(params.city, params.state);
  
    return {
      city: params.city,
      state: params.state,
      items: openData.items.filter(
        i =>
          i.category === 'ANNOUNCEMENTS' ||
          i.category === 'SNOW_EMERGENCY'
      ),
    };
  }  

}

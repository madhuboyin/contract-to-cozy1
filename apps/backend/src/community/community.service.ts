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
  TrashScheduleResponse,
} from './types/community.types';

import { fetchTicketmasterEvents, buildEventKey } from './providers/ticketmaster.provider';
import { getCityOpenDataSources } from './providers/citySources.provider';
import { fetchRssItems } from './providers/rss.provider';
import { fetchNycEmergencyNotifications } from './providers/nycOpenData.provider';
import {
  resolveCityKey,
  getAlertsSourcesForCity,
  getTrashSourcesForCity,
} from './providers/citySources.onTheFly';
import { parseTrashScheduleWithAI } from './providers/trashSchedule.provider';

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

  async getCommunityEventsByProperty(propertyId: string, limit = 50, category?: string): Promise<CommunityEvent[]> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { city: true, state: true },
    });

    if (!property) {
      const err: any = new Error('Property not found');
      err.statusCode = 404;
      throw err;
    }

    return this.getCommunityEventsByCity({ 
      city: property.city, 
      state: property.state, 
      limit,
      category: category as any,
    });
  }

  async getCityOpenData(params: GetCityOpenDataParams): Promise<CityOpenDataResponse> {
    const cacheKey = `citydata|${params.city}|${params.state}`;
    const cached = this.getCache<CityOpenDataResponse>(cacheKey);
    if (cached) return cached;

    const data = getCityOpenDataSources(params.city, params.state);
    this.setCache(cacheKey, data, 60 * 60 * 1000);
    return data;
  }

  async getTrashOnTheFly(params: OnTheFlyParams): Promise<OnTheFlyResponse> {
    const { city, state } = await this.resolveCityState(params);

    const limit = params.limit ?? 20;
    const cacheKey = `trash|${city}|${state}|${limit}`;
    const cached = this.getCache<OnTheFlyResponse>(cacheKey);
    if (cached) return cached;

    const cityKey = resolveCityKey(city, state);
    const sources = getTrashSourcesForCity(cityKey);

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

    this.setCache(cacheKey, resp, 60 * 1000);
    return resp;
  }

  // ✅ NEW: Get parsed trash schedules using AI
  async getTrashSchedule(params: OnTheFlyParams): Promise<TrashScheduleResponse> {
    const { city, state } = await this.resolveCityState(params);

    const cacheKey = `trash_schedule|${city}|${state}`;
    const cached = this.getCache<TrashScheduleResponse>(cacheKey);
    if (cached) return cached;

    const schedule = await parseTrashScheduleWithAI(city, state);
    this.setCache(cacheKey, schedule, 24 * 60 * 60 * 1000); // 24 hour cache
    
    return schedule;
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

  async getCommunityEventsByCity(
    params: GetCommunityEventsParams
  ): Promise<CommunityEvent[]> {
    const radiusMiles = params.radiusMiles ?? 20;
    const limit = params.limit ?? 50;
    const category = params.category;
  
    const cacheKey = `events|${params.city}|${params.state}|${radiusMiles}|${limit}|${category ?? 'all'}`;
    const cached = this.getCache<CommunityEvent[]>(cacheKey);
    if (cached) return cached;
  
    const rawEvents = await fetchTicketmasterEvents({
      city: params.city,
      state: params.state,
      radiusMiles,
      limit: limit * 2,
    });
  
    const seen = new Set<string>();
    const deduped: CommunityEvent[] = [];
  
    for (const ev of rawEvents) {
      // Apply category filter if specified
      if (category && ev.category !== category) {
        continue;
      }

      const key = buildEventKey(ev);
      if (seen.has(key)) continue;
  
      seen.add(key);
      deduped.push(ev);
  
      if (deduped.length >= limit) break;
    }
  
    this.setCache(cacheKey, deduped, 5 * 60 * 1000);
    return deduped;
  }
}
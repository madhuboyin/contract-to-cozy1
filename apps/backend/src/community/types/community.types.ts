// apps/backend/src/community/types/community.types.ts

export type CommunityEventSource = 'ticketmaster';

export interface CommunityEvent {
  source: CommunityEventSource;
  externalId: string;
  title: string;
  startTime: string; // ISO
  endTime?: string | null;
  externalUrl: string;
  venueName?: string | null;
  city?: string;
  state?: string;
}

export type CityKey = 'JERSEY_CITY_NJ' | 'PRINCETON_NJ' | 'NYC_NY';

// ✅ on-the-fly
export type OnTheFlyCategory = 'TRASH' | 'ALERT';

export interface OnTheFlyItem {
  title: string;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null; // ISO
  category: OnTheFlyCategory;
  sourceName: string;
}

export interface OnTheFlySource {
  sourceName: string;
  url: string;
  kind: 'rss' | 'nyc_open_data_emergency';
}

export interface OnTheFlyResponse {
  city: string;
  state: string;
  items: OnTheFlyItem[];
  sources: OnTheFlySource[];
}

export interface OnTheFlyParams {
  city?: string;
  state?: string;
  propertyId?: string;
  limit?: number;
}

export interface CityOpenDataResponse {
  city: string;
  state: string;
  items: CityLinkItem[];
}

export interface GetCommunityEventsParams {
  city: string;
  state: string;
  radiusMiles?: number;
  limit?: number;
}

export interface GetCityOpenDataParams {
  city: string;
  state: string;
}

export interface CityLinkItem {
  category: 'TRASH_RECYCLING' | 'SNOW_EMERGENCY' | 'ANNOUNCEMENTS';
  title: string;
  description?: string;
  url: string;
  sourceName: string;
}

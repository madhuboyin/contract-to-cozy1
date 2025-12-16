// apps/frontend/src/components/community/types.ts

export type EventCategory = 
  | 'FARMERS_MARKET' 
  | 'FOOD_FESTIVAL' 
  | 'COMMUNITY' 
  | 'LIBRARY' 
  | 'HOLIDAY'
  | 'OTHER';

export interface CommunityEvent {
  id: string;
  source: string;
  externalId: string;
  title: string;
  category?: EventCategory;
  description?: string | null;
  startTime: string;
  endTime?: string | null;
  externalUrl: string;
  venueName?: string | null;
  city?: string;
  state?: string;
}

export type OnTheFlyCategory = 'TRASH' | 'ALERT';

export interface OnTheFlyItem {
  title: string;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  category: OnTheFlyCategory;
  sourceName: string;
}

export interface TrashSchedule {
  type: 'trash' | 'recycling' | 'yard_waste' | 'bulk';
  frequency: string;
  nextPickup?: string;
  notes?: string;
}

export interface TrashScheduleResponse {
  city: string;
  state: string;
  schedules: TrashSchedule[];
  lastUpdated: string;
  source: string;
}
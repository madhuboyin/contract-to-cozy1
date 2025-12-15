export interface CommunityEvent {
    title: string;
    startTime: string;
    endTime?: string | null;
    externalUrl: string;
    source: string;
  }
  
  export interface CityLinkItem {
    category: 'TRASH_RECYCLING' | 'SNOW_EMERGENCY' | 'ANNOUNCEMENTS';
    title: string;
    description?: string;
    url: string;
    sourceName: string;
  }
  
  export interface CityOpenDataResponse {
    city: string;
    state: string;
    items: CityLinkItem[];
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
  
// apps/backend/src/community/providers/citySources.onTheFly.ts

import { CityKey } from '../types/community.types';

function norm(s: string) {
  return s.trim().toLowerCase();
}

export function resolveCityKey(city: string, state: string): CityKey {
  const c = norm(city);
  const st = norm(state);

  if (st === 'nj' && (c === 'jersey city' || c === 'jerseycity')) return 'JERSEY_CITY_NJ';
  if (st === 'nj' && c === 'princeton') return 'PRINCETON_NJ';
  if (st === 'ny' && (c === 'nyc' || c === 'new york' || c === 'manhattan' || c === 'new york city')) return 'NYC_NY';

  // For now, we only support the 3 requested city groups
  const err: any = new Error(`Unsupported city/state: ${city}, ${state}`);
  err.statusCode = 400;
  throw err;
}

type Source = { sourceName: string; url: string; kind: 'rss' | 'nyc_open_data_emergency' };

export function getAlertsSourcesForCity(cityKey: CityKey): Source[] {
  switch (cityKey) {
    case 'PRINCETON_NJ':
      return [
        {
          sourceName: 'Princeton NJ - General Municipal Alerts (RSS)',
          url: 'https://www.princetonnj.gov/RSSFeed.aspx?CID=General-Municipal-Alerts-8&ModID=63',
          kind: 'rss',
        },
      ];

    case 'JERSEY_CITY_NJ':
      return [
        {
          sourceName: 'Jersey City NJ - News (RSS)',
          url: 'https://www.jerseycitynj.gov/syndication/rss.aspx?feed=datasummary&item_description=portlet_xml_summary&item_name=portlet_xml_title&item_pubdate=portlet_publish_date&key=C%2BaYBXa40c2GFpuU89IuhN84anFDliYvL6dF2SH%2FguiPTbquPu7%2BQvew%2FlxtJoTNQXZQ0U81vyagD3ZTwy05o6HU2Cc%3D&max_items=16&portal_id=6189744&serverid=6189660&target_object_id=6189754&userid=5&v=2.0',
          kind: 'rss',
        },
      ];

    case 'NYC_NY':
      return [
        {
          sourceName: 'NYC Open Data - NYCEM Emergency Notifications',
          url: 'https://data.cityofnewyork.us/resource/8vv7-7wx3.json',
          kind: 'nyc_open_data_emergency',
        },
      ];
  }
}

export function getTrashSourcesForCity(cityKey: CityKey): Source[] {
  switch (cityKey) {
    case 'PRINCETON_NJ':
      return [
        {
          sourceName: 'Princeton NJ - Recycling Collection (RSS)',
          url: 'https://www.princetonnj.gov/RSSFeed.aspx?CID=Recycling-Collection-57&ModID=58',
          kind: 'rss',
        },
      ];

    case 'JERSEY_CITY_NJ':
      // Jersey City: for MVP we don’t have a reliable “schedule API” (address-based pages are often non-public APIs),
      // so we return an empty list and let UI show "no sources yet" OR you can later add an official feed if found.
      return [];

    case 'NYC_NY':
      // NYC: same story for schedule-by-address (often interactive). Add official endpoint when verified.
      return [];
  }
}

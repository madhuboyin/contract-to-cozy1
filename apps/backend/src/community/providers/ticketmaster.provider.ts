// apps/backend/src/community/providers/ticketmaster.provider.ts

import { CommunityEvent } from '../types/community.types';

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') throw new Error(`Missing env var: ${name}`);
  return v;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTicketmasterEvents(params: {
  city: string;
  state: string;
  radiusMiles: number;
  limit: number;
  keyword?: string;
}): Promise<CommunityEvent[]> {
  const apiKey = requireEnv('TICKETMASTER_API_KEY'); // use your “consumer key” here

  const out: CommunityEvent[] = [];
  let page = 0;

  // Ticketmaster uses page/size; keep it simple and cap pages
  const size = Math.min(Math.max(params.limit, 1), 200);
  const maxPages = 3;

  while (page < maxPages && out.length < params.limit) {
    const url = new URL(TM_BASE);

    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('size', String(size));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'date,asc');

    // Location filters:
    // Using city + state is simplest and very stable.
    url.searchParams.set('city', params.city);
    url.searchParams.set('stateCode', params.state);

    // Optional: radius requires geoPoint/latlong; keep it simple for now.
    // If you later add lat/long per city, we can switch to latlong + radius.
    // url.searchParams.set('radius', String(params.radiusMiles));
    // url.searchParams.set('unit', 'miles');

    if (params.keyword) url.searchParams.set('keyword', params.keyword);

    const resp = await fetch(url.toString());

    if (resp.status === 429) {
      await sleep(1200);
      continue;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Ticketmaster error ${resp.status}: ${text}`);
    }

    const data: any = await resp.json();
    const events: any[] = data?._embedded?.events ?? [];

    for (const e of events) {
      const externalId = e?.id;
      const title = e?.name;
      const externalUrl = e?.url;

      const start = e?.dates?.start?.dateTime; // ISO
      const end = e?.dates?.end?.dateTime ?? null;

      const venueName =
        e?._embedded?.venues?.[0]?.name ??
        e?._embedded?.venues?.[0]?.city?.name ??
        null;

      if (!externalId || !title || !externalUrl || !start) continue;

      out.push({
        source: 'ticketmaster',
        externalId: String(externalId),
        title: String(title),
        externalUrl: String(externalUrl),
        startTime: new Date(start).toISOString(),
        endTime: end ? new Date(end).toISOString() : null,
        venueName,
        city: params.city,
        state: params.state
      });

      if (out.length >= params.limit) break;
    }

    const totalPages = Number(data?.page?.totalPages ?? 0);
    page += 1;
    if (totalPages && page >= totalPages) break;

    await sleep(250);
  }

  return out.slice(0, params.limit);
}

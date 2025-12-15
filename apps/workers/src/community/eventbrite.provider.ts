import { ExternalCommunityEvent } from './communityEvents.types';

const EVENTBRITE_BASE = 'https://www.eventbriteapi.com/v3/events/search/';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') throw new Error(`Missing env var: ${name}`);
  return v;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchEventbriteEvents(
  city: string,
  state: string,
  radiusMiles = 15,
  maxPages = Number(process.env.EVENTBRITE_MAX_PAGES ?? 3)
): Promise<ExternalCommunityEvent[]> {
  const token = requireEnv('EVENTBRITE_TOKEN');

  const out: ExternalCommunityEvent[] = [];
  let page = 1;

  while (page <= maxPages) {
    const url = new URL(EVENTBRITE_BASE);
    url.searchParams.set('location.address', `${city}, ${state}`);
    url.searchParams.set('location.within', `${radiusMiles}mi`);
    url.searchParams.set('sort_by', 'date');
    url.searchParams.set('page', String(page));

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (resp.status === 429) {
      // Basic backoff (avoid hammering)
      await sleep(1500);
      continue;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Eventbrite error ${resp.status}: ${text}`);
    }

    const data: any = await resp.json();
    const events: any[] = data?.events ?? [];

    for (const e of events) {
      const id = e?.id;
      const title = e?.name?.text;
      const url = e?.url;
      const startUtc = e?.start?.utc;
      const endUtc = e?.end?.utc;

      if (!id || !title || !url || !startUtc) continue;

      out.push({
        externalId: String(id),
        title: String(title),
        description: e?.description?.text ?? null,
        startTime: new Date(startUtc),
        endTime: endUtc ? new Date(endUtc) : null,
        venueName: null,
        externalUrl: String(url)
      });
    }

    const pageCount = Number(data?.pagination?.page_count ?? 1);
    if (page >= pageCount) break;

    page += 1;
    await sleep(350);
  }

  return out;
}

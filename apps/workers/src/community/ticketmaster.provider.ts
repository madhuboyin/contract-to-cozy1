import { ExternalCommunityEvent } from './communityEvents.types';

const TICKETMASTER_BASE =
  'https://app.ticketmaster.com/discovery/v2/events.json';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch public community events from Ticketmaster Discovery API
 *
 * Notes:
 * - Free API key
 * - Uses city + state + radius
 * - Returns normalized ExternalCommunityEvent[]
 */
export async function fetchTicketmasterEvents(
  city: string,
  state: string,
  radiusMiles = 15,
  maxPages = Number(process.env.TICKETMASTER_MAX_PAGES ?? 3)
): Promise<ExternalCommunityEvent[]> {
  const apiKey = requireEnv('TICKETMASTER_API_KEY');

  const results: ExternalCommunityEvent[] = [];
  const MAX_RETRIES = 3;
  let page = 0;
  let retries = 0;

  while (page < maxPages) {
    const url = new URL(TICKETMASTER_BASE);
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('city', city);
    url.searchParams.set('stateCode', state);
    url.searchParams.set('radius', String(radiusMiles));
    url.searchParams.set('unit', 'miles');
    url.searchParams.set('size', '50');
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'date,asc');

    const resp = await fetch(url.toString());

    if (resp.status === 429) {
      retries += 1;
      if (retries > MAX_RETRIES) {
        // Stop fetching rather than hammering the API; return whatever we have.
        break;
      }
      // Honour Retry-After if provided, otherwise use exponential backoff.
      const retryAfterSec = parseInt(resp.headers.get('Retry-After') ?? '', 10);
      const delayMs = isNaN(retryAfterSec)
        ? Math.min(1000 * 2 ** retries, 30_000)
        : retryAfterSec * 1000;
      await sleep(delayMs);
      continue;
    }

    retries = 0; // reset on a successful response

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Ticketmaster error ${resp.status}: ${text}`);
    }

    const data: any = await resp.json();
    const events: any[] = data?._embedded?.events ?? [];

    for (const e of events) {
      const id = e?.id;
      const title = e?.name;
      const url = e?.url;
      const startUtc = e?.dates?.start?.dateTime;
      const endUtc = e?.dates?.end?.dateTime ?? null;

      if (!id || !title || !url || !startUtc) continue;

      const venue =
        e?._embedded?.venues?.[0]?.name ??
        e?._embedded?.venues?.[0]?.city?.name ??
        null;

      results.push({
        externalId: String(id),
        title: String(title),
        description: e?.info ?? e?.pleaseNote ?? null,
        startTime: new Date(startUtc),
        endTime: endUtc ? new Date(endUtc) : null,
        venueName: venue,
        externalUrl: String(url)
      });
    }

    const totalPages = Number(data?.page?.totalPages ?? 1);
    if (page >= totalPages - 1) break;

    page += 1;
    await sleep(300);
  }

  return results;
}

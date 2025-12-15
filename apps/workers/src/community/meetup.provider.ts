import { ExternalCommunityEvent } from './communityEvents.types';

const MEETUP_BASE = 'https://api.meetup.com/find/upcoming_events';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function fetchMeetupEvents(
  city: string,
  state: string,
  radiusMiles = 15
): Promise<ExternalCommunityEvent[]> {
  const apiKey = requireEnv('MEETUP_API_KEY');

  const url = new URL(MEETUP_BASE);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('sign', 'true');
  url.searchParams.set('photo-host', 'public');
  url.searchParams.set('radius', `${radiusMiles}`);
  url.searchParams.set('text', 'community');
  url.searchParams.set('lat', ''); // optional
  url.searchParams.set('lon', '');
  url.searchParams.set('city', city);
  url.searchParams.set('state', state);

  const resp = await fetch(url.toString());

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Meetup error ${resp.status}: ${text}`);
  }

  const data: any = await resp.json();
  const events = data?.events ?? [];

  return events
    .map((e: any): ExternalCommunityEvent | null => {
      if (!e.id || !e.name || !e.time) return null;

      return {
        externalId: String(e.id),
        title: e.name,
        description: e.description ?? null,
        startTime: new Date(e.time),
        endTime: e.duration ? new Date(e.time + e.duration) : null,
        venueName: e.venue?.name ?? null,
        externalUrl: e.link
      };
    })
    .filter(Boolean) as ExternalCommunityEvent[];
}

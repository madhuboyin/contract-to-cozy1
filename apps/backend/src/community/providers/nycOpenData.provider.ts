// apps/backend/src/community/providers/nycOpenData.provider.ts

export interface NycAlertItem {
  title: string;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
}

const NYCEM_DATASET = '8vv7-7wx3';
const BASE = `https://data.cityofnewyork.us/resource/${NYCEM_DATASET}.json`;

export async function fetchNycEmergencyNotifications(opts: {
  limit: number;
  appToken?: string;
}): Promise<NycAlertItem[]> {
  try {
    const url = new URL(BASE);
    url.searchParams.set('$limit', String(Math.min(opts.limit, 50)));
    url.searchParams.set('$order', 'created_date DESC');

    const headers: Record<string, string> = {};
    if (opts.appToken) headers['X-App-Token'] = opts.appToken;

    // ✅ ADD TIMEOUT: 10 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(url.toString(), { 
      headers,
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);

    if (!resp.ok) {
      throw new Error(`NYC API returned ${resp.status}`);
    }

    const data = (await resp.json()) as any[];

    return data.map((row) => ({
      title: row?.title ?? row?.notification_title ?? row?.message ?? 'NYC Emergency Notification',
      description: row?.body ?? row?.description ?? row?.message ?? null,
      url: row?.url ?? row?.link ?? null,
      publishedAt: row?.created_date ? new Date(row.created_date).toISOString() : null,
    }));
  } catch (error) {
    console.error('NYC Open Data API failed:', error);
    // ✅ Return empty array instead of crashing
    return [];
  }
}
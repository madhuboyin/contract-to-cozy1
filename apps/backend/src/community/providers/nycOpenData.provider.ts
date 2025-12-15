// apps/backend/src/community/providers/nycOpenData.provider.ts

export interface NycAlertItem {
    title: string;
    description?: string | null;
    url?: string | null;
    publishedAt?: string | null; // ISO
  }
  
  /**
   * NYC Open Data (Socrata) dataset: NYCEM Emergency Notifications
   * Uses SODA API: https://data.cityofnewyork.us/resource/<dataset>.json
   */
  const NYCEM_DATASET = '8vv7-7wx3';
  const BASE = `https://data.cityofnewyork.us/resource/${NYCEM_DATASET}.json`;
  
  export async function fetchNycEmergencyNotifications(opts: {
    limit: number;
    appToken?: string;
  }): Promise<NycAlertItem[]> {
    const url = new URL(BASE);
    url.searchParams.set('$limit', String(Math.min(opts.limit, 50)));
    // Sort newest first (field names vary; these work on many Socrata datasets)
    url.searchParams.set('$order', 'created_date DESC');
  
    const headers: Record<string, string> = {};
    if (opts.appToken) headers['X-App-Token'] = opts.appToken;
  
    const resp = await fetch(url.toString(), { headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`NYC Open Data error ${resp.status}: ${text}`);
    }
  
    const data = (await resp.json()) as any[];
  
    return data.map((row) => ({
      title: row?.title ?? row?.notification_title ?? row?.message ?? 'NYC Emergency Notification',
      description: row?.body ?? row?.description ?? row?.message ?? null,
      url: row?.url ?? row?.link ?? null,
      publishedAt: row?.created_date ? new Date(row.created_date).toISOString() : null,
    }));
  }
  
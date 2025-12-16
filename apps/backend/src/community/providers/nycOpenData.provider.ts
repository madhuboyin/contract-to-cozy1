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
    console.log('🔍 Fetching NYC alerts, limit:', opts.limit);
    
    const url = new URL(BASE);
    url.searchParams.set('$limit', String(Math.min(opts.limit, 50)));
    // ✅ FIX: Use date_and_time instead of created_date
    url.searchParams.set('$order', 'date_and_time DESC');

    const headers: Record<string, string> = {};
    if (opts.appToken) headers['X-App-Token'] = opts.appToken;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    console.log('📡 Fetching from:', url.toString());
    
    const resp = await fetch(url.toString(), { 
      headers,
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);

    console.log('✅ NYC API response status:', resp.status);

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('❌ NYC API error response:', errorText);
      throw new Error(`NYC API returned ${resp.status}`);
    }

    const data = (await resp.json()) as any[];
    console.log(`📊 Received ${data.length} alerts from NYC API`);

    const mapped = data.map((row) => ({
      // ✅ FIX: Use date_and_time field
      title: row?.notification_title ?? row?.title ?? row?.message ?? 'NYC Emergency Notification',
      description: row?.email_body ?? row?.body ?? row?.description ?? row?.message ?? null,
      url: row?.url ?? row?.link ?? null,
      publishedAt: row?.date_and_time ? new Date(row.date_and_time).toISOString() : null,
    }));

    console.log(`✅ Returning ${mapped.length} mapped alerts`);
    return mapped;
    
  } catch (error) {
    console.error('❌ NYC Open Data API failed:', error);
    console.error('Error details:', error instanceof Error ? error.message : error);
    return [];
  }
}
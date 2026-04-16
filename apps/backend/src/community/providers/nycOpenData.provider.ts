// apps/backend/src/community/providers/nycOpenData.provider.ts
import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';

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
    logger.info({ limit: opts.limit }, 'Fetching NYC alerts');
    
    const url = new URL(BASE);
    url.searchParams.set('$limit', String(Math.min(opts.limit, 50)));
    // ✅ FIX: Use date_and_time instead of created_date
    url.searchParams.set('$order', 'date_and_time DESC');

    const headers: Record<string, string> = {};
    if (opts.appToken) headers['X-App-Token'] = opts.appToken;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    logger.info({ url: url.toString() }, 'Fetching from NYC Open Data');
    
    const requestUrl = url.toString();
    await assertSafeUrl(requestUrl);

    const resp = await fetch(requestUrl, { 
      headers,
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);

    logger.info({ status: resp.status }, 'NYC API response status');

    if (!resp.ok) {
      const errorText = await resp.text();
      logger.error({ errorText }, '❌ NYC API error response');
      throw new Error(`NYC API returned ${resp.status}`);
    }

    const data = (await resp.json()) as any[];
    logger.info(`📊 Received ${data.length} alerts from NYC API`);

    const mapped = data.map((row) => ({
      // ✅ FIX: Use date_and_time field
      title: row?.notification_title ?? row?.title ?? row?.message ?? 'NYC Emergency Notification',
      description: row?.email_body ?? row?.body ?? row?.description ?? row?.message ?? null,
      url: row?.url ?? row?.link ?? null,
      publishedAt: row?.date_and_time ? new Date(row.date_and_time).toISOString() : null,
    }));

    logger.info(`✅ Returning ${mapped.length} mapped alerts`);
    return mapped;
    
  } catch (error) {
    logger.error({ err: error }, '❌ NYC Open Data API failed');
    logger.error({ err: error }, 'Error details');
    return [];
  }
}

// apps/backend/src/services/severeWeatherAlert.service.ts
//
// Live severe weather alerts from the National Weather Service (NWS) —
// api.weather.gov, free and keyless. This is the authoritative source for
// flood, severe-storm, heatwave, and snow/winter-storm incidents (distinct
// from the OpenWeatherMap-based freeze/heavy-rain heuristics in
// weather.service.ts, which stay as-is).

import { assertSafeUrl } from '../utils/ssrfGuard';
import { logger } from '../lib/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type HazardFamily = 'FLOOD' | 'STORM' | 'HURRICANE' | 'HEATWAVE' | 'SNOW' | 'WILDFIRE';

export type NwsSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';

export interface SevereWeatherAlert {
  nwsAlertId: string;
  hazardFamily: HazardFamily;
  event: string;
  severity: NwsSeverity;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  effective: string | null;
  expires: string | null;
  senderName: string | null;
  sent: string | null;
  onset: string | null;
  ends: string | null;
  status: string | null;
  messageType: string | null;
  urgency: string | null;
  certainty: string | null;
  canonicalUrl: string;
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  } | {
    type: 'MultiPolygon';
    coordinates: [number, number][][][];
  } | null;
  /**
   * nwsAlertId values of prior alerts this one supersedes (e.g. a Watch
   * upgraded to a Warning, or a warning re-issued/extended under a new id).
   * Lets callers resolve the superseded incident immediately instead of
   * waiting for it to age out of the active feed.
   */
  referencedAlertIds: string[];
}

interface NwsAlertReference {
  identifier?: string;
}

interface NwsAlertFeature {
  id?: string;
  geometry?: SevereWeatherAlert['geometry'];
  properties?: {
    id?: string;
    event?: string;
    severity?: string;
    headline?: string | null;
    description?: string | null;
    instruction?: string | null;
    effective?: string | null;
    expires?: string | null;
    senderName?: string | null;
    sent?: string | null;
    onset?: string | null;
    ends?: string | null;
    status?: string | null;
    messageType?: string | null;
    urgency?: string | null;
    certainty?: string | null;
    references?: NwsAlertReference[];
  };
}

interface NwsAlertsResponse {
  features?: NwsAlertFeature[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const NWS_BASE_URL = 'https://api.weather.gov/alerts/active';
const DEFAULT_USER_AGENT = '(contracttocozy.com, ops@contracttocozy.com)';

// NWS `event` string -> our hazard family. Anything not listed here is ignored
// (e.g. Air Quality Alert, Small Craft Advisory — out of scope for this feature).
// Watch-tier events are included alongside their Warning-tier counterparts —
// NWS assigns `severity` per alert independent of Watch/Warning wording, so
// scoringInputsFor() already scores a typical Watch lower than a Warning
// without any special-casing here.
const EVENT_TO_HAZARD_FAMILY: Record<string, HazardFamily> = {
  'Flash Flood Warning': 'FLOOD',
  'Flood Warning': 'FLOOD',
  'Flash Flood Watch': 'FLOOD',
  'Flood Watch': 'FLOOD',

  'Severe Thunderstorm Warning': 'STORM',
  'Tornado Warning': 'STORM',
  'High Wind Warning': 'STORM',
  'Severe Thunderstorm Watch': 'STORM',
  'Tornado Watch': 'STORM',
  'High Wind Watch': 'STORM',

  // Distinct from STORM: the guidance journey (guidanceTemplateRegistry.ts)
  // already declares a separate `hurricane_risk` signal intent family.
  'Hurricane Warning': 'HURRICANE',
  'Tropical Storm Warning': 'HURRICANE',
  'Storm Surge Warning': 'HURRICANE',
  'Hurricane Watch': 'HURRICANE',
  'Tropical Storm Watch': 'HURRICANE',
  'Storm Surge Watch': 'HURRICANE',

  'Excessive Heat Warning': 'HEATWAVE',
  'Heat Advisory': 'HEATWAVE',

  'Winter Storm Warning': 'SNOW',
  'Blizzard Warning': 'SNOW',
  'Winter Weather Advisory': 'SNOW',
  'Winter Storm Watch': 'SNOW',

  // Distinct from STORM: the guidance journey already declares a separate
  // `wildfire_risk` signal intent family. NWS's fire-weather products (not
  // wildfire detection itself) are Red Flag Warning / Fire Weather Watch.
  'Red Flag Warning': 'WILDFIRE',
  'Fire Weather Watch': 'WILDFIRE',
};

// ─────────────────────────────────────────────────────────────────────────────
// SevereWeatherAlertService
// ─────────────────────────────────────────────────────────────────────────────

export type NwsFetchOutcome = 'ok' | 'http_error' | 'timeout' | 'error';

export class SevereWeatherAlertService {
  /**
   * Returns currently active, in-scope NWS alerts for a lat/lon point.
   * Returns [] on any error, timeout, or unrecognized event type — never throws.
   *
   * `onOutcome`, if provided, is called once with how the fetch went. This is
   * dependency-injection rather than a direct metrics import so this
   * backend-tree service stays decoupled from the workers app's prom-client
   * registry — the caller (severeWeatherAlerts.job.ts) supplies the hook and
   * records it on its own metrics.
   */
  async getActiveAlerts(
    lat: number,
    lon: number,
    onOutcome?: (outcome: NwsFetchOutcome) => void
  ): Promise<SevereWeatherAlert[]> {
    if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
      logger.warn('[NWS] getActiveAlerts called with invalid lat/lon');
      return [];
    }

    try {
      const url = new URL(NWS_BASE_URL);
      url.searchParams.set('point', `${lat},${lon}`);

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8_000);

      let data: NwsAlertsResponse;
      try {
        const requestUrl = url.toString();
        await assertSafeUrl(requestUrl);
        const res = await fetch(requestUrl, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': process.env.NWS_USER_AGENT || DEFAULT_USER_AGENT,
            Accept: 'application/geo+json',
          },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          logger.error(`[NWS] alerts/active returned ${res.status} for point=${lat},${lon}: ${body}`);
          onOutcome?.('http_error');
          return [];
        }
        data = (await res.json()) as NwsAlertsResponse;
      } finally {
        clearTimeout(timeout);
      }

      const alerts = this.mapResponseToAlerts(data);
      logger.info(
        `[NWS] Fetched ${alerts.length} in-scope alert(s) for point=${lat},${lon}: [${alerts
          .map(a => a.event)
          .join(', ')}]`
      );
      onOutcome?.('ok');
      return alerts;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        logger.error(`[NWS] Fetch timed out for point=${lat},${lon}`);
        onOutcome?.('timeout');
      } else {
        logger.error({ err: error }, `[NWS] Fetch failed for point=${lat},${lon}`);
        onOutcome?.('error');
      }
      return [];
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private mapResponseToAlerts(data: NwsAlertsResponse): SevereWeatherAlert[] {
    const features = data?.features ?? [];
    const alerts: SevereWeatherAlert[] = [];

    for (const feature of features) {
      const props = feature?.properties;
      const event = props?.event;
      if (!event) continue;

      const hazardFamily = EVENT_TO_HAZARD_FAMILY[event];
      if (!hazardFamily) continue; // not a hazard family we act on

      const nwsAlertId = props?.id ?? feature?.id;
      if (!nwsAlertId) continue;

      const referencedAlertIds = (props?.references ?? [])
        .map(r => r.identifier)
        .filter((id): id is string => Boolean(id));

      alerts.push({
        nwsAlertId,
        hazardFamily,
        event,
        severity: this.normalizeSeverity(props?.severity),
        headline: props?.headline ?? null,
        description: props?.description ?? null,
        instruction: props?.instruction ?? null,
        effective: props?.effective ?? null,
        expires: props?.expires ?? null,
        senderName: props?.senderName ?? null,
        sent: props?.sent ?? null,
        onset: props?.onset ?? null,
        ends: props?.ends ?? null,
        status: props?.status ?? null,
        messageType: props?.messageType ?? null,
        urgency: props?.urgency ?? null,
        certainty: props?.certainty ?? null,
        canonicalUrl: feature.id ?? props?.id ?? `https://api.weather.gov/alerts/${encodeURIComponent(nwsAlertId)}`,
        geometry: feature.geometry ?? null,
        referencedAlertIds,
      });
    }

    return alerts;
  }

  private normalizeSeverity(raw: string | undefined): NwsSeverity {
    switch (raw) {
      case 'Extreme':
      case 'Severe':
      case 'Moderate':
      case 'Minor':
        return raw;
      default:
        return 'Unknown';
    }
  }
}

export const severeWeatherAlertService = new SevereWeatherAlertService();

// apps/backend/src/services/environment/environmentalHazards.service.ts
//
// EPA-regulated facilities near a property, via EPA ECHO's free, keyless
// REST API (echodata.epa.gov) — a unified search across RCRA (hazardous
// waste), CAA (air), CWA (water), SDWA (drinking water), and TRI (Toxic
// Release Inventory) programs. Verified live against the real API during
// implementation (two-step get_facilities -> get_qid pattern; params
// p_lat/p_long/p_radius/p_act; response field names below are real, not
// guessed).
//
// SCOPE NOTE: standalone Superfund/CERCLIS and RCRAInfo APIs were not
// separately integrated — ECHO's unified facility search already surfaces
// RCRA and TRI program membership per facility, which covers the two most
// actionable programs for a homeowner. A dedicated Superfund-site-proximity
// lookup (distinct from regulated-facility search) would be a reasonable
// follow-up if the current RCRA/TRI/CAA/CWA coverage proves insufficient.

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';
import { TtlCache } from './ttlCache';
import { SectionResult } from './types';

const ECHO_BASE_URL = 'https://echodata.epa.gov/echo';
const SEARCH_RADIUS_MILES = 1;
const MAX_FACILITIES_RETURNED = 25;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface HazardFacility {
  registryId: string;
  name: string;
  address: string;
  programs: string[]; // e.g. ['RCRA', 'TRI', 'CAA']
  complianceStatus: string | null;
  significantNoncompliance: boolean;
  inspectionCount: number;
  lastInspectionDate: string | null;
  penaltyCount: number;
}

export interface EnvironmentalHazardsData {
  facilities: HazardFacility[];
  totalFacilitiesInRadius: number;
  totalPenaltiesInRadius: string | null;
  searchRadiusMiles: number;
}

interface EchoFacilitiesResponse {
  Results?: {
    QueryID?: string;
    QueryRows?: string;
    TotalPenalties?: string;
    Error?: { ErrorMessage?: string };
  };
}

interface EchoFacilityRecord {
  RegistryID?: string;
  FacName?: string;
  FacStreet?: string;
  FacCity?: string;
  FacState?: string;
  FacZip?: string;
  FacComplianceStatus?: string;
  RCRAComplianceStatus?: string | null;
  CAAComplianceStatus?: string | null;
  CWAComplianceStatus?: string | null;
  SDWAComplianceStatus?: string | null;
  FacSNCFlg?: string;
  TRIFlag?: string;
  AIRFlag?: string;
  FacInspectionCount?: string;
  FacDateLastInspection?: string | null;
  FacPenaltyCount?: string;
}

interface EchoQidResponse {
  Results?: { Facilities?: EchoFacilityRecord[] };
}

const cache = new TtlCache<EnvironmentalHazardsData>(CACHE_TTL_MS);

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

async function echoFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const url = new URL(`${ECHO_BASE_URL}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set('output', 'JSON');

    const requestUrl = url.toString();
    await assertSafeUrl(requestUrl);
    const res = await fetch(requestUrl, { signal: ctrl.signal });
    if (!res.ok) {
      logger.error(`[ENV_HAZARDS] ECHO ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.error(`[ENV_HAZARDS] ECHO ${path} fetch timed out`);
    } else {
      logger.error({ err: error }, `[ENV_HAZARDS] ECHO ${path} fetch failed`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function facilityPrograms(rec: EchoFacilityRecord): string[] {
  const programs: string[] = [];
  if (rec.RCRAComplianceStatus) programs.push('RCRA');
  if (rec.TRIFlag === 'Y') programs.push('TRI');
  if (rec.CAAComplianceStatus || rec.AIRFlag === 'Y') programs.push('CAA');
  if (rec.CWAComplianceStatus) programs.push('CWA');
  if (rec.SDWAComplianceStatus) programs.push('SDWA');
  return programs;
}

function isNotable(rec: EchoFacilityRecord): boolean {
  if (rec.FacSNCFlg === 'Y') return true;
  if (rec.TRIFlag === 'Y') return true;
  if (Number(rec.FacPenaltyCount ?? '0') > 0) return true;
  const statuses = [rec.RCRAComplianceStatus, rec.CAAComplianceStatus, rec.CWAComplianceStatus, rec.SDWAComplianceStatus];
  return statuses.some(s => typeof s === 'string' && /violation/i.test(s) && !/no violation/i.test(s));
}

/**
 * Returns EPA-regulated facilities (RCRA/CAA/CWA/SDWA/TRI) with a
 * compliance flag of interest within 1 mile of a lat/lon point, plus the
 * raw area-wide summary counts EPA ECHO returns for the search. Never
 * throws — returns { status: 'unavailable' } on any failure.
 */
export async function getEnvironmentalHazards(lat: number, lon: number): Promise<SectionResult<EnvironmentalHazardsData>> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return { status: 'unavailable', reason: 'invalid_coordinates' };
  }

  const key = cacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached) return { status: 'ok', data: cached, fetchedAt: new Date().toISOString() };

  const search = await echoFetch<EchoFacilitiesResponse>('/echo_rest_services.get_facilities', {
    p_lat: String(lat),
    p_long: String(lon),
    p_radius: String(SEARCH_RADIUS_MILES),
    p_act: 'Y',
  });

  const queryId = search?.Results?.QueryID;
  if (search?.Results?.Error || !queryId) {
    return { status: 'unavailable', reason: 'echo_search_failed' };
  }

  const qidResult = await echoFetch<EchoQidResponse>('/echo_rest_services.get_qid', { qid: queryId });
  const allFacilities = qidResult?.Results?.Facilities ?? [];

  const notable = allFacilities
    .filter(isNotable)
    .sort((a, b) => (b.FacSNCFlg === 'Y' ? 1 : 0) - (a.FacSNCFlg === 'Y' ? 1 : 0))
    .slice(0, MAX_FACILITIES_RETURNED)
    .map((rec): HazardFacility => ({
      registryId: rec.RegistryID ?? '',
      name: rec.FacName ?? 'Unknown facility',
      address: [rec.FacStreet, rec.FacCity, rec.FacState, rec.FacZip].filter(Boolean).join(', '),
      programs: facilityPrograms(rec),
      complianceStatus: rec.FacComplianceStatus ?? null,
      significantNoncompliance: rec.FacSNCFlg === 'Y',
      inspectionCount: Number(rec.FacInspectionCount ?? '0'),
      lastInspectionDate: rec.FacDateLastInspection ?? null,
      penaltyCount: Number(rec.FacPenaltyCount ?? '0'),
    }));

  const data: EnvironmentalHazardsData = {
    facilities: notable,
    totalFacilitiesInRadius: Number(search?.Results?.QueryRows ?? '0'),
    totalPenaltiesInRadius: search?.Results?.TotalPenalties ?? null,
    searchRadiusMiles: SEARCH_RADIUS_MILES,
  };

  cache.set(key, data);
  return { status: 'ok', data, fetchedAt: new Date().toISOString() };
}

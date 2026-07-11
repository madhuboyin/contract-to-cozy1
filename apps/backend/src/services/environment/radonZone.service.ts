// apps/backend/src/services/environment/radonZone.service.ts
//
// EPA's 1993 county radon zone map — a STATIC lookup, not a live API, keyed
// by 5-digit county FIPS code. See ../../data/radonZonesByFips.json: that
// file currently ships with an empty mapping (see its metadata.sourcingStatus)
// pending transcription of EPA's official table, so this section will report
// 'unavailable' for every county until that data is populated.

import radonData from '../../data/radonZonesByFips.json';
import { SectionResult } from './types';

interface RadonZoneMapping {
  metadata: { zones: Record<string, string> };
  fipsZoneMapping: Record<string, 1 | 2 | 3>;
}

const RADON_DATA = radonData as RadonZoneMapping;

export interface RadonData {
  zone: 1 | 2 | 3;
  zoneDescription: string;
}

/**
 * Looks up the EPA radon zone for a county FIPS code. Never throws — returns
 * { status: 'unavailable' } if fips is null or not present in the (currently
 * unpopulated) static dataset.
 */
export async function getRadonZone(countyFips: string | null): Promise<SectionResult<RadonData>> {
  if (!countyFips) {
    return { status: 'unavailable', reason: 'fips_unresolved' };
  }

  const zone = RADON_DATA.fipsZoneMapping[countyFips];
  if (!zone) {
    return { status: 'unavailable', reason: 'not_in_dataset' };
  }

  return {
    status: 'ok',
    data: { zone, zoneDescription: RADON_DATA.metadata.zones[String(zone)] ?? '' },
    fetchedAt: new Date().toISOString(),
  };
}

// apps/backend/src/services/environmentReport.service.ts
//
// Aggregates the 7 Environment-report sections (weather, air quality,
// drought, flood & elevation, radon, hazards, climate) for a property.
// Runs every sub-service in parallel via Promise.allSettled — each
// sub-service already never throws, but allSettled is defense in depth in
// case a future sub-service regresses that contract, and it guarantees one
// slow/dead external API degrades only its own section, not the whole
// report.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { resolveCountyFips } from './environment/fipsResolver.service';
import { getWeatherReport, WeatherReportData } from './environment/weatherReport.service';
import { getAirQuality, AirQualityData } from './environment/airQuality.service';
import { getFloodElevation, FloodElevationData } from './environment/floodElevation.service';
import { getDrought, DroughtData } from './environment/drought.service';
import { getRadonZone, RadonData } from './environment/radonZone.service';
import { getHardinessZone, HardinessZoneData } from './environment/hardinessZone.service';
import { getClimateNormals, ClimateNormalsData } from './environment/climateNormals.service';
import { getEnvironmentalHazards, EnvironmentalHazardsData } from './environment/environmentalHazards.service';
import { SectionResult } from './environment/types';
import { deriveEnvironmentInsights, EnvironmentInsight } from './environment/environmentInsights.service';

export interface ClimateSectionData {
  normals: SectionResult<ClimateNormalsData>;
  hardinessZone: SectionResult<HardinessZoneData>;
}

export interface EnvironmentReportDTO {
  propertyId: string;
  property: {
    name: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    countyFips: string | null;
    zipCode: string | null;
  };
  generatedAt: string;
  insights: EnvironmentInsight[];
  sections: {
    weather: SectionResult<WeatherReportData>;
    airQuality: SectionResult<AirQualityData>;
    drought: SectionResult<DroughtData>;
    floodElevation: SectionResult<FloodElevationData>;
    radon: SectionResult<RadonData>;
    hazards: SectionResult<EnvironmentalHazardsData>;
    climate: SectionResult<ClimateSectionData>;
  };
}

interface GeocodableProperty {
  id: string;
  name: string | null;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number | null;
  longitude: number | null;
  geocodedZipCode: string | null;
  hasDrainageIssues: boolean | null;
  hasSumpPumpBackup: boolean | null;
  coolingType: string | null;
}

const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/**
 * Resolves lat/lon for a property, preferring the value already cached on
 * the Property row (populated by the workers' periodic geocoding job — see
 * apps/workers/src/lib/propertyGeo.ts) over calling the geocoding API again.
 * Falls back to an on-demand geocode + persist for properties the worker
 * job hasn't reached yet. Deliberately duplicated (not imported) from
 * apps/workers/src/lib/geocodeZip.ts — backend and workers don't share a
 * lib today, and adding that coupling is out of scope for this feature.
 */
async function resolvePropertyGeo(property: GeocodableProperty): Promise<{ lat: number; lon: number } | null> {
  const zip = (property.zipCode ?? '').trim();

  if (
    property.geocodedZipCode === zip &&
    zip &&
    typeof property.latitude === 'number' &&
    typeof property.longitude === 'number'
  ) {
    return { lat: property.latitude, lon: property.longitude };
  }

  if (!zip) return null;

  try {
    const url = `${OPEN_METEO_GEOCODING_URL}?name=${encodeURIComponent(zip)}&count=1&language=en&format=json&country_code=US`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    const r = json?.results?.[0];
    if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return null;

    prisma.property
      .update({ where: { id: property.id }, data: { latitude: r.latitude, longitude: r.longitude, geocodedZipCode: zip } })
      .catch(err => logger.error({ err }, '[ENV_REPORT] Failed to persist on-demand geocode'));

    return { lat: r.latitude, lon: r.longitude };
  } catch (error) {
    logger.error({ err: error }, `[ENV_REPORT] On-demand geocode failed for zip=${zip}`);
    return null;
  }
}

function unavailable<T>(reason: string): SectionResult<T> {
  return { status: 'unavailable', reason };
}

export async function getEnvironmentReport(property: GeocodableProperty): Promise<EnvironmentReportDTO> {
  const geo = await resolvePropertyGeo(property);
  const zipCode = property.zipCode ?? null;

  if (!geo) {
    const reason = 'property_not_geocoded';
    return {
      propertyId: property.id,
      property: { name: property.name, address: property.address, city: property.city, state: property.state, zipCode: property.zipCode },
      location: { latitude: null, longitude: null, countyFips: null, zipCode },
      generatedAt: new Date().toISOString(),
      insights: [],
      sections: {
        weather: unavailable<WeatherReportData>(reason),
        airQuality: unavailable<AirQualityData>(reason),
        drought: unavailable<DroughtData>(reason),
        floodElevation: unavailable<FloodElevationData>(reason),
        radon: unavailable<RadonData>(reason),
        hazards: unavailable<EnvironmentalHazardsData>(reason),
        climate: {
          status: 'ok',
          data: { normals: unavailable<ClimateNormalsData>(reason), hardinessZone: await getHardinessZone(zipCode) },
          fetchedAt: new Date().toISOString(),
        },
      },
    };
  }

  const { lat, lon } = geo;
  // Only Drought needs a resolved county FIPS (US Drought Monitor's API is
  // FIPS-keyed, not lat/lon) — Radon queries EPA's own service directly by
  // point, same as Flood & Elevation.
  const fipsPromise = resolveCountyFips(lat, lon);

  const [weatherR, airQualityR, droughtR, floodElevationR, radonR, hazardsR, normalsR, hardinessZoneR, countyFipsR] =
    await Promise.allSettled([
      getWeatherReport(lat, lon),
      getAirQuality(lat, lon),
      fipsPromise.then(fips => getDrought(fips)),
      getFloodElevation(lat, lon),
      getRadonZone(lat, lon),
      getEnvironmentalHazards(lat, lon),
      getClimateNormals(lat, lon),
      getHardinessZone(zipCode),
      fipsPromise,
    ]);

  const weather = weatherR.status === 'fulfilled' ? weatherR.value : unavailable<WeatherReportData>('section_rejected');
  const airQuality = airQualityR.status === 'fulfilled' ? airQualityR.value : unavailable<AirQualityData>('section_rejected');
  const drought = droughtR.status === 'fulfilled' ? droughtR.value : unavailable<DroughtData>('section_rejected');
  const floodElevation =
    floodElevationR.status === 'fulfilled' ? floodElevationR.value : unavailable<FloodElevationData>('section_rejected');
  const radon = radonR.status === 'fulfilled' ? radonR.value : unavailable<RadonData>('section_rejected');
  const hazards =
    hazardsR.status === 'fulfilled' ? hazardsR.value : unavailable<EnvironmentalHazardsData>('section_rejected');
  const normals = normalsR.status === 'fulfilled' ? normalsR.value : unavailable<ClimateNormalsData>('section_rejected');
  const hardinessZone =
    hardinessZoneR.status === 'fulfilled' ? hardinessZoneR.value : unavailable<HardinessZoneData>('section_rejected');
  const countyFips = countyFipsR.status === 'fulfilled' ? countyFipsR.value : null;

  const sections = {
    weather,
    airQuality,
    drought,
    floodElevation,
    radon,
    hazards,
    climate: {
      status: 'ok' as const,
      data: { normals, hardinessZone },
      fetchedAt: new Date().toISOString(),
    },
  };
  const insights = deriveEnvironmentInsights(property, sections);

  return {
    propertyId: property.id,
    property: { name: property.name, address: property.address, city: property.city, state: property.state, zipCode: property.zipCode },
    location: { latitude: lat, longitude: lon, countyFips: countyFips ?? null, zipCode },
    generatedAt: new Date().toISOString(),
    insights,
    sections,
  };
}

import type { NormalizedIntelligenceObservation } from './propertyIntelligence.contracts';

type MatchableProperty = {
  latitude: number | null;
  longitude: number | null;
  zipCode: string;
  county: string | null;
  state: string;
};

export type GeographicMatch = {
  matchMethod: 'EXACT_POINT_DISTANCE' | 'ZIP' | 'COUNTY' | 'STATE';
  distanceMiles: number | null;
  geographicPrecision: 'POINT' | 'ZIP' | 'COUNTY' | 'STATE';
  matchConfidence: number;
  matchedGeography: string;
};

function radians(value: number): number {
  return value * Math.PI / 180;
}

export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const radiusMiles = 3958.8;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2))
    * Math.sin(deltaLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function matchObservationToProperty(
  observation: NormalizedIntelligenceObservation,
  property: MatchableProperty,
): GeographicMatch | null {
  if (observation.geographyType === 'POINT_RADIUS') {
    if (
      observation.latitude == null
      || observation.longitude == null
      || observation.matchRadiusMiles == null
      || property.latitude == null
      || property.longitude == null
    ) {
      return null;
    }
    const distanceMiles = haversineMiles(
      property.latitude,
      property.longitude,
      observation.latitude,
      observation.longitude,
    );
    if (distanceMiles > observation.matchRadiusMiles) return null;
    return {
      matchMethod: 'EXACT_POINT_DISTANCE',
      distanceMiles,
      geographicPrecision: 'POINT',
      matchConfidence: 1,
      matchedGeography: `${distanceMiles.toFixed(2)} miles from sourced point`,
    };
  }

  const normalizedKey = observation.geographyKey.trim().toUpperCase();
  if (
    observation.geographyType === 'ZIP'
    && property.zipCode.trim().toUpperCase() === normalizedKey
  ) {
    return {
      matchMethod: 'ZIP',
      distanceMiles: null,
      geographicPrecision: 'ZIP',
      matchConfidence: 0.8,
      matchedGeography: `ZIP ${observation.geographyKey}`,
    };
  }
  if (
    observation.geographyType === 'COUNTY'
    && property.county?.trim().toUpperCase() === normalizedKey
  ) {
    return {
      matchMethod: 'COUNTY',
      distanceMiles: null,
      geographicPrecision: 'COUNTY',
      matchConfidence: 0.65,
      matchedGeography: `County ${observation.geographyKey}`,
    };
  }
  if (
    observation.geographyType === 'STATE'
    && property.state.trim().toUpperCase() === normalizedKey
  ) {
    return {
      matchMethod: 'STATE',
      distanceMiles: null,
      geographicPrecision: 'STATE',
      matchConfidence: 0.45,
      matchedGeography: `State ${observation.geographyKey}`,
    };
  }
  return null;
}

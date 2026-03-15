// apps/backend/src/neighborhoodIntelligence/geoUtils.ts
//
// Lightweight geographic utilities for neighborhood proximity calculations.

const EARTH_RADIUS_MILES = 3958.8;

/**
 * Calculates the great-circle distance between two lat/lng points using the
 * Haversine formula. Returns distance in miles.
 */
export function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

/**
 * Returns true if the given coordinates are plausible (not zero/null, within valid range).
 */
export function isValidLatLng(lat: unknown, lon: unknown): lat is number {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (isNaN(lat) || isNaN(lon)) return false;
  if (lat === 0 && lon === 0) return false; // null island guard
  if (lat < -90 || lat > 90) return false;
  if (lon < -180 || lon > 180) return false;
  return true;
}

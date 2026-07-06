// apps/workers/src/lib/geocodeZip.ts
// Shared zip -> lat/lon geocoding via Open-Meteo's free geocoding API.
// Used by freezeRiskIncidents.job.ts and severeWeatherAlerts.job.ts.

export type Geo = { lat: number; lon: number; name?: string; admin1?: string; country?: string };

export async function geocodeZip(zip: string, countryCode = 'US'): Promise<Geo | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    zip
  )}&count=1&language=en&format=json&country_code=${countryCode}`;

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return null;

  const json: any = await res.json();
  const r = json?.results?.[0];
  if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return null;

  return {
    lat: r.latitude,
    lon: r.longitude,
    name: r.name,
    admin1: r.admin1,
    country: r.country,
  };
}

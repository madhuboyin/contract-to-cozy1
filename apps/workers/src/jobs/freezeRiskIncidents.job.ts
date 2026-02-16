// apps/workers/src/jobs/freezeRiskIncidents.job.ts
import { prisma } from '../lib/prisma';
import { IncidentService } from '../../../backend/src/services/incidents/incident.service';

type Geo = { lat: number; lon: number; name?: string; admin1?: string; country?: string };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function scoreFromMinF(minF: number) {
  if (minF <= 15) return 85;
  if (minF <= 20) return 75;
  if (minF <= 27) return 60;
  return 0;
}

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

async function geocodeZip(zip: string, countryCode = 'US'): Promise<Geo | null> {
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

/**
 * Returns minimum forecast temp in °F in the next 36 hours for given lat/lon.
 * Uses Open-Meteo hourly temperature_2m.
 */
async function getForecastMinF(lat: number, lon: number): Promise<number | null> {
  const now = new Date();
  const end = new Date(now.getTime() + 36 * 3600 * 1000);

  // Open-Meteo expects dates. We'll request today..tomorrow and then slice to next 36h.
  const startDate = now.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
      String(lat)
    )}&longitude=${encodeURIComponent(String(lon))}` +
    `&hourly=temperature_2m&temperature_unit=celsius&timezone=UTC&start_date=${startDate}&end_date=${endDate}`;

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return null;

  const json: any = await res.json();
  const times: string[] = json?.hourly?.time ?? [];
  const tempsC: number[] = json?.hourly?.temperature_2m ?? [];

  if (!Array.isArray(times) || !Array.isArray(tempsC) || times.length !== tempsC.length) return null;

  const nowMs = now.getTime();
  const endMs = end.getTime();

  let minF: number | null = null;

  for (let i = 0; i < times.length; i++) {
    const tMs = Date.parse(times[i] + 'Z'); // times are UTC like "2026-01-08T12:00"
    if (Number.isNaN(tMs)) continue;
    if (tMs < nowMs || tMs > endMs) continue;

    const f = cToF(tempsC[i]);
    if (minF == null || f < minF) minF = f;
  }

  // Round to 1 decimal for display
  return minF == null ? null : Math.round(minF * 10) / 10;
}

export async function freezeRiskIncidentsJob() {
  const props = await prisma.property.findMany({
    where: { zipCode: { not: undefined } },
    select: { id: true, zipCode: true, city: true, state: true },
    take: 500,
  });

  let createdOrUpdated = 0;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Simple in-memory cache so we don’t geocode the same zip repeatedly in a run
  const geoCache = new Map<string, Geo | null>();

  for (const p of props) {
    const zip = (p.zipCode ?? '').trim();
    if (!zip) continue;

    let geo = geoCache.get(zip);
    if (geo === undefined) {
      geo = await geocodeZip(zip, 'US');
      geoCache.set(zip, geo);
    }
    if (!geo) continue;

    const minF = await getForecastMinF(geo.lat, geo.lon);
    if (minF == null) continue;

    // trigger: < 28F
    if (minF >= 28) continue;

    const score = scoreFromMinF(minF);

    await IncidentService.upsertIncident(
      {
        propertyId: p.id,
        userId: null,
        sourceType: 'WEATHER',
        typeKey: 'FREEZE_RISK',
        category: 'PLUMBING',
        title: 'Freeze Risk Detected',
        summary: `Forecast minimum temperature is ${minF}°F in the next 36 hours.`,
        details: {
          minF,
          timeWindowHours: 36,
          probabilityPct: 80,
          exposureUsd: 5000,
          geoHint: {
            zip,
            city: p.city ?? null,
            state: p.state ?? null,
            lat: geo.lat,
            lon: geo.lon,
            geoName: geo.name ?? null,
            admin1: geo.admin1 ?? null,
            country: geo.country ?? null,
          },
          mitigationLevel: 'NONE',
          provider: 'open-meteo',
        },
        status: 'DETECTED',
        fingerprint: `property:${p.id}|FREEZE_RISK|${today}`,
        dedupeWindowMins: 24 * 60,
        severityScore: score,
        confidence: 70,
      },
      [
        {
          signalType: 'WEATHER_FORECAST_MIN_TEMP',
          externalRef: `open-meteo:${zip}`,
          observedAt: now.toISOString(),
          payload: { zip, minF, windowHours: 36, lat: geo.lat, lon: geo.lon },
          scoreHint: score,
          confidence: 70,
        },
      ]
    );

    createdOrUpdated++;

    // Rate limit Open-Meteo API calls (free tier)
    await sleep(200);
  }

  return { createdOrUpdated };
}

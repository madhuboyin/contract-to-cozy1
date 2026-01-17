// apps/backend/src/services/tax/schoolInsights.provider.ts

export type SchoolInsightsConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type SchoolInsights = {
  districtName: string | null;
  perPupilSpendUsd: number | null;
  confidence: SchoolInsightsConfidence;
  notes: string[];
};

function clean(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function overlapScore(a: string, b: string) {
  const A = new Set(clean(a).split(' ').filter(Boolean));
  const B = new Set(clean(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / A.size;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 6000): Promise<{ ok: boolean; status: number; json: any }> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
  
    try {
      const r = await fetch(url, { signal: ac.signal });
      let json: any = null;
      try {
        json = await r.json();
      } catch {
        json = null;
      }
      return { ok: r.ok, status: r.status, json };
    } finally {
      clearTimeout(t);
    }
  }
  

function moneyRound(n: number) {
  return Math.round(n);
}

/**
 * Real-data school insight:
 * 1) Census Geocoder → resolves School District geography name for the address.
 * 2) Urban Institute Education Data API → attempts to match district + fetch finance (per-pupil spend).
 *
 * Notes:
 * - District resolution is typically reliable from Census geocoder.
 * - Finance matching can be fuzzy; we attach confidence accordingly.
 */
export async function getSchoolInsights(args: {
  address: { street: string; city: string; state: string; zipCode: string };
  // optional tuning
  year?: string; // CCD year (e.g., "2022")
}): Promise<SchoolInsights> {
  const { street, city, state, zipCode } = args.address;
  const YEAR = args.year || process.env.EDU_CCD_YEAR || '2022';

  const notes: string[] = [];

  // -----------------------------
  // 1) Census Geocoder (district)
  // -----------------------------
  // Uses "geographies/address" to retrieve school district names.
  // We request school district layers; response includes Unified/Secondary/Elementary where available.
  const censusUrl =
    `https://geocoding.geo.census.gov/geocoder/geographies/address` +
    `?street=${encodeURIComponent(street)}` +
    `&city=${encodeURIComponent(city)}` +
    `&state=${encodeURIComponent(state)}` +
    `&zip=${encodeURIComponent(zipCode)}` +
    `&benchmark=Public_AR_Current` +
    `&vintage=Current_Current` +
    `&layers=14,16,18` +
    `&format=json`;

  let districtName: string | null = null;

  try {
    const r = await fetchJsonWithTimeout(censusUrl, 7000);
    if (!r.ok) throw new Error(`Census geocoder HTTP ${r.status}`);

    const j: any = r.json;
    const geos = j?.result?.addressMatches?.[0]?.geographies ?? {};

    const unified = geos['Unified School Districts']?.[0];
    const secondary = geos['Secondary School Districts']?.[0];
    const elementary = geos['Elementary School Districts']?.[0];

    districtName = unified?.NAME ?? secondary?.NAME ?? elementary?.NAME ?? null;

    if (districtName) notes.push(`Census district resolved: ${districtName}`);
    else notes.push(`Census returned no school district for this address`);
  } catch (e: any) {
    notes.push(`Census lookup failed: ${e?.message || String(e)}`);
  }

  if (!districtName) {
    return {
      districtName: null,
      perPupilSpendUsd: null,
      confidence: 'LOW',
      notes,
    };
  }

  // ---------------------------------------
  // 2) Education Data API (finance signal)
  // ---------------------------------------
  const EDU_BASE = process.env.EDUCATION_DATA_API_BASE || 'https://educationdata.urban.org/api/v1';

  // We need a district identifier to query finance.
  // The Education Data API has multiple datasets; coverage + fields vary by year.
  // Strategy:
  // - Pull a page of district directory rows for the state/year
  // - best-match by district name
  // - attempt to query finance by leaid
  try {
    // Directory search (state-wide). We best-match client-side.
    const dirUrl = `${EDU_BASE}/schools/ccd/directory/${YEAR}/?state=${encodeURIComponent(state)}&per_page=200`;
    const dir = await fetchJsonWithTimeout(dirUrl, 7000);
    if (!dir.ok) throw new Error(`EducationData directory HTTP ${dir.status}`);

    const dirPayload: any = dir.json;
    const rows: any[] = Array.isArray(dirPayload?.results)
      ? dirPayload.results
      : Array.isArray(dirPayload)
        ? dirPayload
        : [];
    
    const candidates = rows
      .filter((x) => typeof x?.name === 'string')
      .map((x) => ({ name: x.name as string, row: x }));

    // best match
    let best: { name: string; row: any; score: number } | null = null;
    for (const c of candidates) {
      const s = overlapScore(districtName, c.name);
      if (!best || s > best.score) best = { ...c, score: s };
    }

    if (!best || best.score < 0.35) {
      notes.push(`Finance match weak for "${districtName}" (directory match score low)`);
      return {
        districtName,
        perPupilSpendUsd: null,
        confidence: 'MEDIUM',
        notes,
      };
    }

    const leaid =
      best.row?.leaid ??
      best.row?.nces_id ??
      best.row?.id ??
      null;

    notes.push(`EducationData district match: "${best.name}" (${Math.round(best.score * 100)}% match)`);

    if (!leaid) {
      notes.push(`EducationData directory row missing LEAID for matched district`);
      return {
        districtName,
        perPupilSpendUsd: null,
        confidence: 'MEDIUM',
        notes,
      };
    }

    // Finance lookup
    const finUrl = `${EDU_BASE}/schools/ccd/finance/${YEAR}/?leaid=${encodeURIComponent(String(leaid))}&per_page=5`;
    const fin = await fetchJsonWithTimeout(finUrl, 7000);
    if (!fin.ok) throw new Error(`EducationData finance HTTP ${fin.status}`);

    const finRow: any = (fin.json?.results ?? fin.json ?? [])[0] ?? null;
    if (!finRow) {
      notes.push(`No finance row found for LEAID=${leaid}`);
      return {
        districtName,
        perPupilSpendUsd: null,
        confidence: 'MEDIUM',
        notes,
      };
    }

    // Robust per-pupil extraction (field names can vary)
    const ppeRaw =
      finRow?.per_pupil_expenditure ??
      finRow?.pp_expenditure ??
      finRow?.ppe ??
      finRow?.totelep;

    let perPupilSpendUsd: number | null = null;

    if (Number.isFinite(Number(ppeRaw))) {
      perPupilSpendUsd = Number(ppeRaw);
    } else {
      const totalExp =
        finRow?.total_expenditure ??
        finRow?.totelexp ??
        finRow?.expenditure_total;

      const membership =
        finRow?.membership ??
        finRow?.student_membership ??
        finRow?.enrollment;

      if (
        Number.isFinite(Number(totalExp)) &&
        Number.isFinite(Number(membership)) &&
        Number(membership) > 0
      ) {
        perPupilSpendUsd = Number(totalExp) / Number(membership);
      }
    }

    if (!perPupilSpendUsd || !Number.isFinite(perPupilSpendUsd)) {
      notes.push(`Finance row present but per-pupil spend not derivable for LEAID=${leaid}`);
      return {
        districtName,
        perPupilSpendUsd: null,
        confidence: 'MEDIUM',
        notes,
      };
    }

    notes.push(`Per-pupil spend resolved: ~$${moneyRound(perPupilSpendUsd).toLocaleString()}`);

    return {
      districtName,
      perPupilSpendUsd,
      confidence: 'HIGH',
      notes,
    };
  } catch (e: any) {
    notes.push(`EducationData lookup failed: ${e?.message || String(e)}`);
    return {
      districtName,
      perPupilSpendUsd: null,
      confidence: 'MEDIUM',
      notes,
    };
  }
}

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

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs = 6000
): Promise<{ ok: boolean; status: number; json: any }> {
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

function firstArrayRows(payload: any): any[] {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload)) return payload;
  return [];
}

function bestNameMatch(targetName: string, rows: any[]) {
  const candidates = rows
    .filter((x) => typeof x?.name === 'string')
    .map((x) => ({ name: x.name as string, row: x }));

  let best: { name: string; row: any; score: number } | null = null;
  for (const c of candidates) {
    const s = overlapScore(targetName, c.name);
    if (!best || s > best.score) best = { ...c, score: s };
  }
  return best;
}

function extractLeaid(row: any): string | null {
  const v =
    row?.leaid ??
    row?.lea_id ??
    row?.ncesid ??
    row?.nces_id ??
    row?.id ??
    null;
  return v !== null && v !== undefined ? String(v) : null;
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
  year?: string; // CCD year (e.g., "2022")
}): Promise<SchoolInsights> {
  const { street, city, state, zipCode } = args.address;
  const YEAR = args.year || process.env.EDU_CCD_YEAR || '2022';

  const notes: string[] = [];

  // -----------------------------
  // 1) Census Geocoder (district)
  // -----------------------------
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
    const r = await fetchJsonWithTimeout(censusUrl, 10000);
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

  // Fallback: Census "onelineaddress" can match better than split fields
  if (!districtName) {
    const oneLine = `${street}, ${city}, ${state} ${zipCode}`.replace(/\s+/g, ' ').trim();
    const censusUrl2 =
      `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress` +
      `?address=${encodeURIComponent(oneLine)}` +
      `&benchmark=Public_AR_Current` +
      `&vintage=Current_Current` +
      `&layers=14,16,18` +
      `&format=json`;

    try {
      const r2 = await fetchJsonWithTimeout(censusUrl2, 10000);
      if (!r2.ok) throw new Error(`Census oneline HTTP ${r2.status}`);

      const j2: any = r2.json;
      const geos2 = j2?.result?.addressMatches?.[0]?.geographies ?? {};

      const unified2 = geos2['Unified School Districts']?.[0];
      const secondary2 = geos2['Secondary School Districts']?.[0];
      const elementary2 = geos2['Elementary School Districts']?.[0];

      districtName = unified2?.NAME ?? secondary2?.NAME ?? elementary2?.NAME ?? null;

      if (districtName) notes.push(`Census oneline resolved: ${districtName}`);
      else notes.push(`Census oneline returned no district match`);
    } catch (e: any) {
      notes.push(`Census oneline lookup failed: ${e?.message || String(e)}`);
    }
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

  try {
    // Try multiple directory endpoints (API structure can vary)
    const dirUrls = [
      `${EDU_BASE}/schools/ccd/districts/${YEAR}/?state=${encodeURIComponent(state)}&per_page=200`,
      `${EDU_BASE}/schools/ccd/directory/${YEAR}/?state=${encodeURIComponent(state)}&per_page=200`,
    ];

    let rows: any[] = [];
    let dirUsed: string | null = null;

    for (const u of dirUrls) {
      const dir = await fetchJsonWithTimeout(u, 10000);
      if (!dir.ok) continue;
      const r = firstArrayRows(dir.json);
      if (r.length) {
        rows = r;
        dirUsed = u;
        break;
      }
    }

    if (!rows.length) {
      notes.push(`EducationData: no directory rows for state=${state} year=${YEAR}`);
      return { districtName, perPupilSpendUsd: null, confidence: 'MEDIUM', notes };
    }
    notes.push(`EducationData directory endpoint used`);

    const best = bestNameMatch(districtName, rows);

    if (!best || best.score < 0.35) {
      notes.push(`EducationData: weak district match for "${districtName}"`);
      return { districtName, perPupilSpendUsd: null, confidence: 'MEDIUM', notes };
    }

    notes.push(`EducationData district match: "${best.name}" (${Math.round(best.score * 100)}% match)`);

    const leaid = extractLeaid(best.row);
    if (!leaid) {
      notes.push(`EducationData: matched district missing LEAID-like id`);
      notes.push(`EducationData: matched keys=${Object.keys(best.row || {}).slice(0, 25).join(',')}`);
      return { districtName, perPupilSpendUsd: null, confidence: 'MEDIUM', notes };
    }

    // Try multiple finance endpoints (API structure can vary)
    const finUrls = [
      `${EDU_BASE}/schools/ccd/finance/${YEAR}/?leaid=${encodeURIComponent(leaid)}&per_page=5`,
      `${EDU_BASE}/schools/ccd/district_finance/${YEAR}/?leaid=${encodeURIComponent(leaid)}&per_page=5`,
    ];

    let finRows: any[] = [];
    let finUsed: string | null = null;

    for (const u of finUrls) {
      const fin = await fetchJsonWithTimeout(u, 10000);
      if (!fin.ok) continue;
      const r = firstArrayRows(fin.json);
      if (r.length) {
        finRows = r;
        finUsed = u;
        break;
      }
    }

    if (!finRows.length) {
      notes.push(`EducationData: no finance rows for LEAID=${leaid} year=${YEAR}`);
      return { districtName, perPupilSpendUsd: null, confidence: 'MEDIUM', notes };
    }

    const finRow: any = finRows[0] ?? null;
    if (!finRow) {
      notes.push(`EducationData: finance payload empty for LEAID=${leaid}`);
      return { districtName, perPupilSpendUsd: null, confidence: 'MEDIUM', notes };
    }

    // Capture keys (very helpful during rollout)
    notes.push(`EducationData finance keys sample=${Object.keys(finRow || {}).slice(0, 25).join(',')}`);

    // Broaden per-pupil extraction
    const ppeCandidates = [
      finRow?.per_pupil_expenditure,
      finRow?.per_pupil_exp,
      finRow?.pp_expenditure,
      finRow?.ppe,
      finRow?.totelep,
      finRow?.exppp,
      finRow?.total_exp_per_pupil,
    ];

    let perPupilSpendUsd: number | null = null;

    for (const v of ppeCandidates) {
      if (Number.isFinite(Number(v))) {
        perPupilSpendUsd = Number(v);
        break;
      }
    }

    // If not available, compute from totals
    if (!perPupilSpendUsd) {
      const totalExpCandidates = [
        finRow?.total_expenditure,
        finRow?.totelexp,
        finRow?.expenditure_total,
        finRow?.total_exp,
      ];
      const membershipCandidates = [
        finRow?.membership,
        finRow?.student_membership,
        finRow?.enrollment,
        finRow?.students,
      ];

      const totalExp = totalExpCandidates.find((v) => Number.isFinite(Number(v)));
      const membership = membershipCandidates.find(
        (v) => Number.isFinite(Number(v)) && Number(v) > 0
      );

      if (totalExp !== undefined && membership !== undefined) {
        perPupilSpendUsd = Number(totalExp) / Number(membership);
      }
    }

    if (!perPupilSpendUsd || !Number.isFinite(perPupilSpendUsd)) {
      notes.push(`EducationData: finance row found but per-pupil not derivable (LEAID=${leaid})`);
      if (dirUsed) notes.push(`EducationData dirEndpoint=${dirUsed}`);
      if (finUsed) notes.push(`EducationData finEndpoint=${finUsed}`);
      return { districtName, perPupilSpendUsd: null, confidence: 'MEDIUM', notes };
    }

    notes.push(`Per-pupil spend resolved: ~$${moneyRound(perPupilSpendUsd).toLocaleString()}`);
    if (dirUsed) notes.push(`EducationData dirEndpoint=${dirUsed}`);
    if (finUsed) notes.push(`EducationData finEndpoint=${finUsed}`);

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

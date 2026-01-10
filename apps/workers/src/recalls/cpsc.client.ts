// apps/workers/src/recalls/cpsc.client.ts
import fetch from 'node-fetch';

export type CpscRecallItem = {
  externalId: string;
  title: string;
  summary?: string;
  hazard?: string;
  remedy?: string;
  recallUrl?: string;
  remedyUrl?: string;
  recalledAt?: string;
  affectedUnits?: string;
  // best-effort extracted
  manufacturers?: string[];
  models?: string[];
  raw: any;
};

const DEFAULT_URL =
  process.env.CPSC_RECALL_FEED_URL ||
  'https://www.saferproducts.gov/RestWebServices/Recall?format=json';

export async function fetchCpscRecalls(): Promise<CpscRecallItem[]> {
  const res = await fetch(DEFAULT_URL, {
    headers: {
      // IMPORTANT: Add a real User-Agent to bypass bot detection/404s
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    console.error(`Attempting fetch from: ${DEFAULT_URL}`);
    throw new Error(`CPSC fetch failed ${res.status} ${res.statusText}`);
  }

  const text = await res.text();

  // Try JSON first
  try {
    const json = JSON.parse(text);
    const mapped = mapJson(json);
    console.log(
      '[CPSC-FETCH] items:',
      Array.isArray(json) ? json.length : json?.items?.length,
      'mapped:',
      mapped.length
    );
    return mapped;
  } catch {
    return mapRssXml(text);
  }
}

// ----------------------------
// Normalization helpers
// ----------------------------
function clean(s: unknown): string | null {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

function splitTokens(raw: string): string[] {
  return raw
    .replace(/^model(?: number)?s?\s*[:\-]\s*/i, '')
    .replace(/^manufacturer\s*[:\-]\s*/i, '')
    .replace(/\s+(and|or)\s+/gi, ',')
    .replace(/\s*&\s*/g, ',')
    .replace(/\s*\/\s*/g, ',')
    .split(/[,;|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeManufacturer(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeModel(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs));
}

function toStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string') {
    return splitTokens(v);
  }
  return [];
}

// Some feeds embed lists under various keys. This tries multiple candidates and
// returns the first non-empty string[] found.
function pickStringList(it: any, keys: string[]): string[] {
  for (const k of keys) {
    const v = it?.[k];
    const arr = toStringArray(v);
    if (arr.length) return arr;
  }
  return [];
}

// ----------------------------
// JSON mapping
// ----------------------------
function mapJson(json: any): CpscRecallItem[] {
  // CPSC saferproducts returns a top-level array
  // Some endpoints may return { items: [...] }, so support both.
  let items: any[] = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];

  // Keep the safety cap for v1 to avoid event-loop lock.
  items = items.slice(0, 200);

  return items
    .map((it: any) => {
      const externalId =
        clean(it?.RecallID) ||
        clean(it?.RecallNumber) ||
        clean(it?.RecallNo) ||
        clean(it?.ReleaseNumber) ||
        clean(it?.ID);

      if (!externalId) return null;

      const title =
        it?.Title ||
        it?.ProductName ||
        (typeof it?.Description === 'string' ? it.Description.slice(0, 120) : '') ||
        `CPSC Recall ${it?.RecallNumber ?? externalId}`;

      const summary = it?.Description || it?.Summary || it?.ConsumerContact || undefined;

      const hazard = it?.Hazard || it?.HazardDescription || undefined;
      const remedy = it?.Remedy || it?.RemedyDescription || undefined;

      const recallUrl = it?.URL || it?.RecallURL || it?.RecallUrl || it?.Link || it?.link || undefined;

      const remedyUrl = it?.RemedyURL || it?.RemedyUrl || it?.RemedyURLText || undefined;

      const recalledAt = it?.RecallDate || it?.LastPublishDate || it?.RecallDateText || undefined;

      const affectedUnits = it?.Units || it?.NumberOfUnits || it?.UnitsAffected || undefined;

      // ✅ Prefer structured fields first (varies by feed/version)
      const structuredManufacturers = pickStringList(it, [
        'Manufacturer',
        'Manufacturers',
        'manufacturer',
        'manufacturers',
        'RecallingFirm',
        'RecallingFirms',
        'RecallingFirmName',
        'CompanyName',
        'Company',
        'Firm',
      ])
        .flatMap(splitTokens)
        .map(normalizeManufacturer)
        .filter((s) => s.length >= 2);

      const structuredModels = pickStringList(it, [
        'Model',
        'Models',
        'ModelNumber',
        'ModelNumbers',
        'model',
        'models',
        'modelNumbers',
        'ModelNo',
        'ModelNos',
      ])
        .flatMap(splitTokens)
        .map(normalizeModel)
        .filter((s) => s.length >= 3);

      // ✅ Fallback extraction from text if structured missing
      const combinedText = `${title || ''} ${summary || ''} ${hazard || ''} ${remedy || ''}`.trim();
      const fallback = extractMakeModel(combinedText);

      const manufacturers = uniq(
        [
          ...structuredManufacturers,
          ...(fallback.manufacturers ?? []).flatMap(splitTokens).map(normalizeManufacturer),
        ]
          .map((s) => s.trim())
          .filter(Boolean)
      );

      const models = uniq(
        [
          ...structuredModels,
          ...(fallback.models ?? []).flatMap(splitTokens).map(normalizeModel),
        ]
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s) => s.length >= 3)
      );

      return {
        externalId: String(externalId),
        title,
        summary,
        hazard,
        remedy,
        recallUrl,
        remedyUrl,
        recalledAt,
        affectedUnits,
        manufacturers: manufacturers.length ? manufacturers.slice(0, 30) : undefined,
        models: models.length ? models.slice(0, 50) : undefined,
        raw: it,
      } as CpscRecallItem;
    })
    .filter(Boolean) as CpscRecallItem[];
}

// ----------------------------
// RSS/XML mapping (unchanged, but uses improved extractor)
// ----------------------------
function mapRssXml(xml: string): CpscRecallItem[] {
  const chunks = xml.split('<item>').slice(1);
  return chunks.map((chunk) => {
    const title = pickTag(chunk, 'title') || 'Recall';
    const link = pickTag(chunk, 'link') || '';
    const guid = pickTag(chunk, 'guid') || link || title;
    const description = pickTag(chunk, 'description') || '';
    const pubDate = pickTag(chunk, 'pubDate') || undefined;

    const summary = stripCdata(description).trim();
    const { manufacturers, models } = extractMakeModel(`${title} ${summary}`);

    return {
      externalId: guid,
      title,
      summary,
      recallUrl: link,
      recalledAt: pubDate,
      manufacturers,
      models,
      raw: { title, link, guid, description, pubDate },
    };
  });
}

function pickTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? stripCdata(m[1]).trim() : null;
}

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

/**
 * Best-effort extractor:
 * Now supports "A and B" / "&" / "/" plus common prefixes.
 */
function extractMakeModel(text: string): { manufacturers?: string[]; models?: string[] } {
  const models: string[] = [];
  const manufacturers: string[] = [];

  // Models: capture after "Model:" / "Models:" / "Model numbers:"
  const modelMatches = text.match(
    /\bmodel(?: number)?s?\b\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/&,;\s]+)/i
  );
  if (modelMatches?.[1]) {
    splitTokens(modelMatches[1])
      .map(normalizeModel)
      .filter((s) => s.length >= 3)
      .slice(0, 50)
      .forEach((m) => models.push(m));
  }

  // Manufacturers
  const mfgMatches = text.match(
    /\bmanufacturer\b\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9&\-,.;\s]+)/i
  );
  if (mfgMatches?.[1]) {
    splitTokens(mfgMatches[1])
      .map(normalizeManufacturer)
      .filter((s) => s.length >= 2)
      .slice(0, 30)
      .forEach((m) => manufacturers.push(m));
  }

  const out = {
    manufacturers: manufacturers.length ? uniq(manufacturers) : undefined,
    models: models.length ? uniq(models) : undefined,
  };

  return out;
}

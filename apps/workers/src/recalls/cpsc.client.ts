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

function uniq(xs: string[]) {
  return Array.from(new Set(xs));
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeManufacturer(s: string): string {
  return normalizeSpaces(s);
}

function normalizeModel(s: string): string {
  return normalizeSpaces(s);
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

function toStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string') return splitTokens(v);
  return [];
}

// Handles CPSC-style lists: [{ Name: "..." }, ...]
function toNameArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === 'string') return x;
        return x?.Name ?? x?.name ?? x?.CompanyName ?? x?.companyName ?? null;
      })
      .map((x) => (x === null || x === undefined ? '' : String(x).trim()))
      .filter(Boolean);
  }
  if (typeof v === 'string') return splitTokens(v);
  return [];
}

function joinFirstNameField(v: any): string | null {
  const arr = toNameArray(v);
  if (!arr.length) return null;
  return arr[0] || null;
}

function pickFirstString(it: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = it?.[k];
    const s = clean(v);
    if (s) return s;
  }
  return null;
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
// ✅ Manufacturer cleanup (Option A)
// ----------------------------

// “suffix-only” or meaningless manufacturer values you saw in DB
const MANUFACTURER_BAD_EXACT = new Set(
  [
    'inc',
    'inc.',
    'ltd',
    'ltd.',
    'llc',
    'corp',
    'corp.',
    'co',
    'co.',
    'company',
    'manufacturer',
    'importer',
    'distributor',
    'office products',
    'home',
    'online',
    'amazon',
    'walmart',
    'retailer',
    'retailers',
    'store',
    'stores',
    'unknown',
    'n/a',
    'na',
  ].map((s) => s.toLowerCase())
);

// Location-ish single tokens we should usually reject if they appear alone
// (You can expand later if needed.)
const LIKELY_LOCATION_SINGLE = new Set(
  [
    'utah',
    'ohio',
    'texas',
    'china',
    'canada',
    'california',
    'florida',
    'new york',
    'virginia',
    'washington',
  ].map((s) => s.toLowerCase())
);

function normalizeManufacturerCandidate(raw: string): string | null {
  const s0 = normalizeManufacturer(raw);
  if (!s0) return null;

  // strip some common trailing narrative patterns: “, of China” / “ of Waukesha, Wisconsin”
  // but keep the company part
  let s = s0.replace(/\s*,?\s+of\s+[^,]{2,80}$/i, '').trim();

  // collapse “dba …”:
  // - if it begins with “dba”, it’s incomplete => junk
  // - if it contains “ dba ” keep the portion before dba as “manufacturer”
  if (/^\s*dba\b/i.test(s)) return null;
  if (/\bdba\b/i.test(s)) {
    s = s.split(/\bdba\b/i)[0].trim();
  }

  // reject “Ltd.” / “Inc.” etc when they’re alone after cleaning
  const lower = s.toLowerCase();
  if (MANUFACTURER_BAD_EXACT.has(lower)) return null;

  // reject weirdly short fragments
  if (s.length < 2) return null;

  // reject “single word that looks like a location” (Utah, etc)
  // allow “USA” etc when part of a longer string
  if (!s.includes(' ') && LIKELY_LOCATION_SINGLE.has(lower)) return null;

  // reject strings that look like pure generic category words
  if (!s.includes(' ') && MANUFACTURER_BAD_EXACT.has(lower)) return null;

  // reject strings that are basically punctuation
  if (!/[A-Za-z0-9]/.test(s)) return null;

  return s;
}

function filterAndFixManufacturers(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const fixed = normalizeManufacturerCandidate(raw);
    if (!fixed) continue;

    // avoid values like “of Columbus” that survive trimming but are still bad
    if (/^of\s+/i.test(fixed)) continue;

    out.push(fixed);
  }
  return uniq(out);
}

// ----------------------------
// ✅ Model extraction (stricter tokens)
// ----------------------------
const MODEL_REJECT_WORDS = new Set(
  [
    'inch',
    'inches',
    'wide',
    'height',
    'tall',
    'deep',
    'about',
    'approx',
    'approximately',
    'support',
    'legs',
    'leg',
    'printed',
    'located',
    'front',
    'back',
    'side',
    'wheel',
    'motor',
    'housing',
    'engine',
    'production',
    'date',
    'year',
    'sold',
    'from',
    'through',
    'between',
    'for',
    'with',
    'unit',
    'type',
    'walk',
    'behind',
    'tow',
    'note',
    'additional',
    'sizes',
    'size',
    'zip',
  ].map((s) => s.toLowerCase())
);

function cleanModelToken(raw: string): string | null {
  if (!raw) return null;

  // Remove common prefixes that leak into tokens
  let s = raw
    .replace(/^\s*(model(?: number)?s?|number|no\.?)\s*[:\-]?\s*/i, '')
    .replace(/^\s*(the\s+)?production\s+date\s*\(?/i, '')
    .trim();

  // strip surrounding punctuation
  s = s.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').trim();

  if (!s) return null;

  // reject if contains spaces after cleaning (these tend to be narrative fragments)
  if (/\s/.test(s)) return null;

  // must include at least one digit (critical to avoid “number”, “drawer”, etc)
  if (!/[0-9]/.test(s)) return null;

  if (s.length < 3 || s.length > 40) return null;

  // reject pure years like 2026
  if (/^(19|20)\d{2}$/.test(s)) return null;

  // reject tokens containing reject words (after lower)
  const lower = s.toLowerCase();
  for (const w of MODEL_REJECT_WORDS) {
    if (lower.includes(w)) return null;
  }

  // allow only reasonable characters
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_\/.]*$/.test(s)) return null;

  return s;
}

/**
 * Extract model-like tokens from narrative.
 * We try to find “model numbers …” blocks, otherwise scan the full text.
 */
function extractModels(text: string): string[] | undefined {
  if (!text) return undefined;

  const blocks: string[] = [];

  const b1 = text.match(/\bmodel\s+numbers?\b\s*[:\-]?\s*([\s\S]{0,1800})/i);
  if (b1?.[1]) blocks.push(b1[1]);

  const b2 = text.match(/\bmodels?\b\s*(?:include|are|:)?\s*([\s\S]{0,1500})/i);
  if (b2?.[1]) blocks.push(b2[1]);

  if (!blocks.length) blocks.push(text);

  const tokens: string[] = [];

  for (const b of blocks) {
    // Split fairly aggressively
    const parts = b.split(/[\s,;]+/g);
    for (let p of parts) {
      const fixed = cleanModelToken(p);
      if (!fixed) continue;
      tokens.push(fixed);
      if (tokens.length >= 200) break;
    }
    if (tokens.length >= 200) break;
  }

  const out = uniq(tokens).map(normalizeModel).filter(Boolean);
  return out.length ? out : undefined;
}

// Lightweight manufacturer extraction from narrative as a fallback only
function extractManufacturersFromText(text: string): string[] | undefined {
  if (!text) return undefined;
  const manufacturers: string[] = [];

  const mfgMatches = text.match(
    /\bmanufacturer\b\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9&\-,.;\s]{0,250})/i
  );
  if (mfgMatches?.[1]) {
    splitTokens(mfgMatches[1])
      .map(normalizeManufacturer)
      .filter((s) => s.length >= 2)
      .slice(0, 30)
      .forEach((m) => manufacturers.push(m));
  }

  const out = uniq(manufacturers).filter(Boolean);
  return out.length ? out : undefined;
}

// ----------------------------
// JSON mapping (updated for saferproducts schema)
// ----------------------------
function mapJson(json: any): CpscRecallItem[] {
  let items: any[] = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];

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

      const description = typeof it?.Description === 'string' ? it.Description : '';
      const consumerContact = typeof it?.ConsumerContact === 'string' ? it.ConsumerContact : '';

      const title =
        clean(it?.Title) ||
        clean(it?.ProductName) ||
        (description ? description.slice(0, 120) : null) ||
        `CPSC Recall ${it?.RecallNumber ?? externalId}`;

      const summary = description || clean(it?.Summary) || consumerContact || undefined;

      const hazard =
        clean(joinFirstNameField(it?.Hazards)) ||
        clean(it?.Hazard) ||
        clean(it?.HazardDescription) ||
        undefined;

      const remedy =
        clean(joinFirstNameField(it?.Remedies)) ||
        clean(it?.Remedy) ||
        clean(it?.RemedyDescription) ||
        undefined;

      const recallUrl =
        clean(it?.URL) ||
        clean(it?.RecallURL) ||
        clean(it?.RecallUrl) ||
        clean(it?.Link) ||
        clean(it?.link) ||
        undefined;

      const recalledAt =
        clean(it?.RecallDate) || clean(it?.LastPublishDate) || clean(it?.RecallDateText) || undefined;

      const affectedUnits =
        clean(it?.Products?.[0]?.NumberOfUnits) ||
        clean(it?.Units) ||
        clean(it?.NumberOfUnits) ||
        clean(it?.UnitsAffected) ||
        undefined;

      // Manufacturers: prefer structured arrays first (these are the best signal)
      const structuredManufacturersRaw = uniq(
        [
          ...toNameArray(it?.Manufacturers),
          ...toNameArray(it?.Importers),
          ...toNameArray(it?.Distributors),
          ...pickStringList(it, [
            'Manufacturer',
            'manufacturer',
            'RecallingFirm',
            'RecallingFirms',
            'RecallingFirmName',
            'CompanyName',
            'Company',
            'Firm',
          ]),
        ]
          .flatMap((x) => splitTokens(String(x)))
          .map(normalizeManufacturer)
          .filter((s) => s.length >= 2)
      );

      // Narrative fallback (kept, but will be filtered)
      const extractedManufacturersRaw =
        extractManufacturersFromText(`${title || ''}\n${description || ''}`) ?? [];

      const manufacturers = filterAndFixManufacturers([
        ...structuredManufacturersRaw,
        ...extractedManufacturersRaw,
      ]);

      // Models: prefer structured keys if present; otherwise extract from Title+Description only
      const structuredModelsRaw = uniq(
        pickStringList(it, [
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
          .flatMap((x) => splitTokens(String(x)))
          .map(normalizeModel)
          .filter((s) => s.length >= 3)
      );

      // Improved extraction: ONLY from title+description (avoid ConsumerContact noise)
      const combinedForModels = `${title || ''}\n${description || ''}`.trim();
      const extractedModelsRaw = extractModels(combinedForModels) ?? [];

      // Final model cleanup pass
      const models = uniq(
        [...structuredModelsRaw, ...extractedModelsRaw]
          .map((m) => cleanModelToken(String(m)) ?? '')
          .filter(Boolean)
          .slice(0, 200)
      );

      return {
        externalId: String(externalId),
        title: String(title),
        summary,
        hazard,
        remedy,
        recallUrl,
        remedyUrl: pickFirstString(it, ['RemedyURL', 'RemedyUrl', 'RemedyURLText']) || undefined,
        recalledAt,
        affectedUnits,
        manufacturers: manufacturers.length ? manufacturers.slice(0, 30) : undefined,
        models: models.length ? models.slice(0, 200) : undefined,
        raw: it,
      } as CpscRecallItem;
    })
    .filter(Boolean) as CpscRecallItem[];
}

// ----------------------------
// RSS/XML mapping
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

    const combined = `${title}\n${summary}`;
    const manufacturers = filterAndFixManufacturers(extractManufacturersFromText(combined) ?? []);
    const models = extractModels(combined);

    return {
      externalId: guid,
      title,
      summary,
      recallUrl: link,
      recalledAt: pubDate,
      manufacturers: manufacturers.length ? manufacturers : undefined,
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

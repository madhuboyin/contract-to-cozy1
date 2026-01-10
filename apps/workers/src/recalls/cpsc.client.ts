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
  return normalizeSpaces(s).replace(/\s+/g, ' ').trim();
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
// Model extraction (improved)
// ----------------------------
function extractModels(text: string): string[] | undefined {
  if (!text) return undefined;

  // Try to capture “model numbers …” sections first (they tend to be the cleanest)
  const blocks: string[] = [];

  const b1 = text.match(/\bmodel\s+numbers?\b\s*[:\-]?\s*([\s\S]{0,1500})/i);
  if (b1?.[1]) blocks.push(b1[1]);

  const b2 = text.match(/\bmodels?\b\s*(?:include|are|:)?\s*([\s\S]{0,1200})/i);
  if (b2?.[1]) blocks.push(b2[1]);

  if (!blocks.length) blocks.push(text);

  const STOP = new Set([
    'model',
    'models',
    'number',
    'numbers',
    'printed',
    'located',
    'size',
    'about',
    'inches',
    'wide',
    'height',
    'unit',
    'type',
    'walk',
    'behind',
    'tow',
    'note',
    'additional',
    'may',
    'or',
    'and',
    'the',
    'are',
    'is',
    'on',
    'of',
    'to',
    'from',
    'through',
    'for',
    'with',
    'sold',
  ]);

  const tokens: string[] = [];

  for (const b of blocks) {
    // Split on whitespace, commas, semicolons
    const parts = b.split(/[\s,;]+/g);
    for (let p of parts) {
      p = p
        .trim()
        .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
        .replace(/\s+/g, '');

      if (!p) continue;

      const lower = p.toLowerCase();
      if (STOP.has(lower)) continue;

      // Critical: require at least one digit to avoid junk like “number”
      if (!/[0-9]/.test(p)) continue;

      if (p.length < 3 || p.length > 40) continue;

      // Avoid capturing pure years like 2026
      if (/^(19|20)\d{2}$/.test(p)) continue;

      tokens.push(p);
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
// JSON mapping (updated for real saferproducts schema)
// ----------------------------
function mapJson(json: any): CpscRecallItem[] {
  // CPSC saferproducts returns a top-level array
  // Some endpoints may return { items: [...] }, so support both.
  let items: any[] = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];

  // Keep the safety cap for v1 to avoid event-loop lock.
  items = items.slice(0, 200);

  return items
    .map((it: any) => {
      // Prefer RecallID (stable), fallback to RecallNumber/others
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

      // Summary: prefer Description (canonical narrative)
      const summary = description || clean(it?.Summary) || consumerContact || undefined;

      // Hazard: prefer Hazards[].Name
      const hazard =
        clean(joinFirstNameField(it?.Hazards)) ||
        clean(it?.Hazard) ||
        clean(it?.HazardDescription) ||
        undefined;

      // Remedy: prefer Remedies[].Name
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

      // Recall date: RecallDate is present in your sample
      const recalledAt = clean(it?.RecallDate) || clean(it?.LastPublishDate) || clean(it?.RecallDateText) || undefined;

      // Affected units: in sample it's Products[].NumberOfUnits
      const affectedUnits =
        clean(it?.Products?.[0]?.NumberOfUnits) ||
        clean(it?.Units) ||
        clean(it?.NumberOfUnits) ||
        clean(it?.UnitsAffected) ||
        undefined;

      // Manufacturers: prefer Manufacturers[].Name, then Importers/Distributors, then fallbacks
      const structuredManufacturers = uniq(
        [
          ...toNameArray(it?.Manufacturers),
          ...toNameArray(it?.Importers),
          ...toNameArray(it?.Distributors),
          // some feeds might still have these as plain strings
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
      ).slice(0, 30);

      // Models: prefer structured keys if present; otherwise extract from Title+Description only
      const structuredModels = uniq(
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
      ).slice(0, 50);

      // Improved extraction: ONLY from title+description (avoid ConsumerContact noise)
      const combinedForModels = `${title || ''}\n${description || ''}`.trim();
      const extractedModels = extractModels(combinedForModels);

      // Fallback manufacturer extraction from narrative (very limited)
      const extractedManufacturers = extractManufacturersFromText(`${title || ''}\n${description || ''}`);

      const manufacturers = uniq(
        [
          ...structuredManufacturers,
          ...(extractedManufacturers ?? []),
        ]
          .map(normalizeManufacturer)
          .filter(Boolean)
      );

      const models = uniq(
        [
          ...structuredModels,
          ...(extractedModels ?? []),
        ]
          .map(normalizeModel)
          .filter(Boolean)
          .filter((s) => s.length >= 3)
      );

      return {
        externalId: String(externalId),
        title: String(title),
        summary,
        hazard,
        remedy,
        recallUrl,
        remedyUrl:
          // Optional: if you want to keep old behavior, still try these keys,
          // but sample JSON doesn’t include RemedyURL fields.
          pickFirstString(it, ['RemedyURL', 'RemedyUrl', 'RemedyURLText']) || undefined,
        recalledAt,
        affectedUnits,
        manufacturers: manufacturers.length ? manufacturers : undefined,
        models: models.length ? models : undefined,
        raw: it,
      } as CpscRecallItem;
    })
    .filter(Boolean) as CpscRecallItem[];
}

// ----------------------------
// RSS/XML mapping (unchanged, but uses improved model extractor)
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

    // For RSS, we can still try to extract manufacturers/models from narrative
    const combined = `${title}\n${summary}`;
    const manufacturers = extractManufacturersFromText(combined);
    const models = extractModels(combined);

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

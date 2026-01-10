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
// Manufacturer cleaning (CRITICAL FIX)
// ----------------------------
function stripLocationSuffix(name: string): string {
  // "Foo Inc., of China" -> "Foo Inc."
  // "Bar LLC, of Columbus" -> "Bar LLC"
  return name.replace(/,\s*of\s+.+$/i, '').trim();
}

function normalizeManufacturerName(name: string): string {
  return normalizeManufacturer(stripLocationSuffix(name));
}

function buildManufacturersFromStructured(it: any): string[] {
  // ✅ DO NOT token-split these (commas are part of the company name)
  const names = [
    ...toNameArray(it?.Manufacturers),
    ...toNameArray(it?.Importers),
    ...toNameArray(it?.Distributors),
  ];

  return uniq(
    names
      .map((s) => normalizeManufacturerName(String(s)))
      .filter((s) => s.length >= 2)
      // guard against common junk fragments if any slip in
      .filter((s) => !/^of\s+/i.test(s))
      .filter((s) => s.toLowerCase() !== 'ltd.' && s.toLowerCase() !== 'inc.' && s.toLowerCase() !== 'llc')
  ).slice(0, 30);
}

// ----------------------------
// Model extraction (improved + strict)
// ----------------------------

function isProbablyModelToken(token: string): boolean {
  const t = token.trim();
  if (t.length < 3 || t.length > 40) return false;

  // Must contain at least one digit (most model numbers do)
  if (!/\d/.test(t)) return false;

  // Exclude obvious descriptive patterns (your DB shows "9-Drawer", "13-Drawer")
  if (/^\d+\s*-\s*drawer$/i.test(t)) return false;

  // Exclude pure years like 2026
  if (/^(19|20)\d{2}$/.test(t)) return false;

  // Exclude tiny numbers like "120" unless they have letters too
  if (/^\d{1,4}$/.test(t)) return false;

  return true;
}

/**
 * Extract models ONLY from explicit "model(s)" sections.
 * This avoids polluting models with descriptive tokens from the product narrative.
 */
function extractModelsStrict(text: string): string[] | undefined {
  if (!text) return undefined;

  const blocks: string[] = [];

  // "models 2512, 2513, 2516"
  const b1 = text.match(/\bmodels?\b\s*[:\-]?\s*([^\n]{0,1500})/i);
  if (b1?.[1]) blocks.push(b1[1]);

  // "model numbers are ... 2512 ... 2513 ..."
  const b2 = text.match(/\bmodel\s+numbers?\b\s*[:\-]?\s*([\s\S]{0,1500})/i);
  if (b2?.[1]) blocks.push(b2[1]);

  if (!blocks.length) return undefined;

  const tokens: string[] = [];
  for (const b of blocks) {
    for (const t of splitTokens(b)) {
      const cleaned = normalizeModel(
        t
          .trim()
          .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '') // strip punctuation edges
      );

      if (!cleaned) continue;
      if (!isProbablyModelToken(cleaned)) continue;

      tokens.push(cleaned);
      if (tokens.length >= 200) break;
    }
    if (tokens.length >= 200) break;
  }

  const out = uniq(tokens);
  return out.length ? out.slice(0, 80) : undefined;
}

// Lightweight manufacturer extraction from narrative as a fallback only
function extractManufacturersFromText(text: string): string[] | undefined {
  if (!text) return undefined;
  const manufacturers: string[] = [];

  const mfgMatches = text.match(
    /\bmanufacturer\b\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9&\-,.;\s]{0,250})/i
  );
  if (mfgMatches?.[1]) {
    // Here splitTokens is OK because this is narrative "Manufacturer: A and B"
    splitTokens(mfgMatches[1])
      .map((s) => normalizeManufacturerName(s))
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
        clean(toNameArray(it?.Hazards)[0]) ||
        clean(it?.Hazard) ||
        clean(it?.HazardDescription) ||
        undefined;

      // Remedy: prefer Remedies[].Name
      const remedy =
        clean(toNameArray(it?.Remedies)[0]) ||
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
      const recalledAt =
        clean(it?.RecallDate) || clean(it?.LastPublishDate) || clean(it?.RecallDateText) || undefined;

      // Affected units: in sample it's Products[].NumberOfUnits
      const affectedUnits =
        clean(it?.Products?.[0]?.NumberOfUnits) ||
        clean(it?.Units) ||
        clean(it?.NumberOfUnits) ||
        clean(it?.UnitsAffected) ||
        undefined;

      // ✅ Manufacturers (FIXED): structured arrays, no comma splitting
      const structuredManufacturers = buildManufacturersFromStructured(it);

      // Models: prefer structured keys if present (rare in saferproducts); otherwise STRICT extraction from narrative
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
          .filter(isProbablyModelToken)
      ).slice(0, 80);

      // ✅ STRICT model extraction from explicit model blocks
      const combinedForModels = `${title || ''}\n${description || ''}`.trim();
      const extractedModels = extractModelsStrict(combinedForModels);

      // Fallback manufacturer extraction from narrative (limited)
      const extractedManufacturers = extractManufacturersFromText(`${title || ''}\n${description || ''}`);

      const manufacturers = uniq(
        [...structuredManufacturers, ...(extractedManufacturers ?? [])]
          .map(normalizeManufacturerName)
          .filter(Boolean)
          .filter((s) => s.length >= 2)
          .filter((s) => !/^of\s+/i.test(s))
      );

      const models = uniq(
        [...structuredModels, ...(extractedModels ?? [])]
          .map(normalizeModel)
          .filter(Boolean)
          .filter(isProbablyModelToken)
      );

      return {
        externalId: String(externalId),
        title: String(title),
        summary,
        hazard,
        remedy,
        recallUrl,
        remedyUrl:
          // Sample JSON doesn’t include RemedyURL fields, but keep backward compatibility
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
    const manufacturers = extractManufacturersFromText(combined);
    const models = extractModelsStrict(combined);

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

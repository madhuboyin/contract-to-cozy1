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
      // 2. IMPORTANT: Add a real User-Agent to bypass bot detection/404s
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
     // Log the URL to verify which one is actually being hit (check your env vars!)
     console.error(`Attempting fetch from: ${DEFAULT_URL}`);
     throw new Error(`CPSC fetch failed ${res.status} ${res.statusText}`);
  }
  
  const text = await res.text();

  // Try JSON first
  try {
    const json = JSON.parse(text);
    return mapJson(json);
  } catch {
    return mapRssXml(text);
  }
}

function mapJson(json: any): CpscRecallItem[] {
  const items = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
  return items
    .map((it: any) => {
      const externalId = String(it?.id || it?.recallId || it?.guid || it?.link || '');
      if (!externalId) return null;
      return {
        externalId,
        title: it?.title || 'Recall',
        summary: it?.summary || it?.description,
        hazard: it?.hazard,
        remedy: it?.remedy,
        recallUrl: it?.url || it?.link,
        remedyUrl: it?.remedyUrl,
        recalledAt: it?.date || it?.recalledAt || it?.pubDate,
        affectedUnits: it?.affectedUnits,
        manufacturers: toStringArray(it?.manufacturers),
        models: toStringArray(it?.models),
        raw: it,
      } as CpscRecallItem;
    })
    .filter(Boolean) as CpscRecallItem[];
}

function mapRssXml(xml: string): CpscRecallItem[] {
  const chunks = xml.split('<item>').slice(1);
  return chunks.map((chunk) => {
    const title = pickTag(chunk, 'title') || 'Recall';
    const link = pickTag(chunk, 'link') || '';
    const guid = pickTag(chunk, 'guid') || link || title;
    const description = pickTag(chunk, 'description') || '';
    const pubDate = pickTag(chunk, 'pubDate') || undefined;

    // Minimal heuristics: attempt to extract manufacturer/model strings from description
    // You can refine later once you confirm CPSC content format.
    const summary = stripCdata(description).trim();
    const { manufacturers, models } = extractMakeModel(summary);

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

function toStringArray(v: any): string[] | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
  return undefined;
}

/**
 * Best-effort extractor:
 * Looks for patterns like "Model: ABC123" or "Models ABC123, DEF456"
 * This is intentionally lightweight for v1.
 */
function extractMakeModel(text: string): { manufacturers?: string[]; models?: string[] } {
  const models: string[] = [];
  const manufacturers: string[] = [];

  const modelMatches = text.match(/model(?:s)?\s*[:\-]?\s*([A-Za-z0-9\-,\s]+)/i);
  if (modelMatches?.[1]) {
    modelMatches[1]
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3)
      .slice(0, 20)
      .forEach((m) => models.push(m));
  }

  const mfgMatches = text.match(/manufacturer\s*[:\-]?\s*([A-Za-z0-9&\-,\s]+)/i);
  if (mfgMatches?.[1]) {
    mfgMatches[1]
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
      .slice(0, 10)
      .forEach((m) => manufacturers.push(m));
  }

  return {
    manufacturers: manufacturers.length ? manufacturers : undefined,
    models: models.length ? models : undefined,
  };
}

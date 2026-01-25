// apps/backend/src/services/roomScan/provider.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export type RoomScanItem = {
  label: string;
  category?: string;
  confidence?: number;
};

export type ExtractItemsArgs = {
  images: Buffer[];
  roomType?: string | null;
};

export type RoomScanProviderResult = {
  items: RoomScanItem[];
  raw?: {
    model?: string;
    usageMetadata?: any;
    text?: string;
  };
};

export interface RoomScanVisionProvider {
  name: string;
  extractItemsFromImages(args: ExtractItemsArgs): Promise<RoomScanProviderResult>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function envInt(name: string, dflt: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

function isGeminiRetryableError(e: any) {
  const code = e?.status || e?.code || e?.response?.status;
  if (code === 429 || code === 503) return true;

  const msg = String(e?.message || '').toLowerCase();
  if (msg.includes('overloaded') || msg.includes('timeout') || msg.includes('temporarily')) return true;

  return false;
}

function backoffMs(attempt: number, baseMs: number, capMs: number) {
  const exp = Math.min(capMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * exp);
}

export class StubRoomScanProvider implements RoomScanVisionProvider {
  name = 'stub';

  async extractItemsFromImages(_: ExtractItemsArgs): Promise<RoomScanProviderResult> {
    return {
      items: [
        { label: 'Sofa', category: 'FURNITURE', confidence: 0.74 },
        { label: 'TV', category: 'ELECTRONICS', confidence: 0.78 },
        { label: 'Coffee table', category: 'FURNITURE', confidence: 0.71 },
        { label: 'Lamp', category: 'OTHER', confidence: 0.65 },
      ],
      raw: { model: 'stub', text: '{"items":[...]}', usageMetadata: null },
    };
  }
}

export class GeminiRoomScanProvider implements RoomScanVisionProvider {
  name = 'gemini';

  private apiKey: string;
  private modelName: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.modelName = process.env.ROOM_SCAN_GEMINI_MODEL || 'gemini-1.5-flash';
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY missing (required for ROOM_SCAN_PROVIDER=gemini)');
    }
  }

  private safeJsonParseLoose(text: string): any | null {
    const t = String(text || '').trim();
    if (!t) return null;

    // 1) direct parse
    try {
      return JSON.parse(t);
    } catch {}

    // 2) fenced ```json ... ```
    const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {}
    }

    // 3) try extract first {...} block
    const firstObj = t.indexOf('{');
    const lastObj = t.lastIndexOf('}');
    if (firstObj >= 0 && lastObj > firstObj) {
      try {
        return JSON.parse(t.slice(firstObj, lastObj + 1));
      } catch {}
    }

    // 4) try extract first [...] block (top-level array case)
    const firstArr = t.indexOf('[');
    const lastArr = t.lastIndexOf(']');
    if (firstArr >= 0 && lastArr > firstArr) {
      const arrSlice = t.slice(firstArr, lastArr + 1);
      try {
        const arr = JSON.parse(arrSlice);
        // If it’s an array of items, wrap it into expected shape
        if (Array.isArray(arr)) return { items: arr };
      } catch {}
    }

    return null;
  }

  async extractItemsFromImages(args: ExtractItemsArgs): Promise<RoomScanProviderResult> {
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: this.modelName });

    const schemaHint = {
      items: [{ label: 'Sofa', category: 'FURNITURE', confidence: 0.72 }],
    };

    const roomHint = args.roomType ? `Room type hint: ${args.roomType}` : 'Room type hint: unknown';

    const prompt = [
      'You are an expert home-inventory assistant.',
      'Task: From the provided room photos, list distinct visible household items suitable for a home inventory.',
      'Rules:',
      '- Return ONLY valid JSON (no prose, no markdown).',
      '- Prefer fewer, higher-quality items; merge obvious duplicates (e.g., "couch" vs "sofa").',
      '- Do NOT guess brand/model/serial/value.',
      '- Use short labels (e.g., "Sofa", "TV", "Coffee table", "Ceiling fan").',
      `- ${roomHint}`,
      '',
      `Return JSON exactly matching this shape: ${JSON.stringify(schemaHint)}`,
    ].join('\n');

    const parts: any[] = [{ text: prompt }];
    for (const img of args.images) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: img.toString('base64'),
        },
      });
    }

    const maxRetries = envInt('ROOM_SCAN_GEMINI_MAX_RETRIES', 3);
    const baseMs = envInt('ROOM_SCAN_GEMINI_BACKOFF_BASE_MS', 500);
    const capMs = envInt('ROOM_SCAN_GEMINI_BACKOFF_CAP_MS', 6000);

    let lastErr: any = null;
    let resp: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        resp = await model.generateContent({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 900,
          },
        });
        lastErr = null;
        break;
      } catch (e: any) {
        lastErr = e;
        if (!isGeminiRetryableError(e) || attempt === maxRetries) break;

        const wait = backoffMs(attempt, baseMs, capMs);
        console.warn('[room-scan][gemini] transient error; retrying', {
          model: this.modelName,
          attempt: attempt + 1,
          maxRetries,
          waitMs: wait,
          status: e?.status || e?.code || e?.response?.status,
          message: String(e?.message || '').slice(0, 160),
        });

        await sleep(wait);
      }
    }

    if (lastErr) throw lastErr;

    const text = resp?.response?.text?.() ?? '';
    const usage = resp?.response?.usageMetadata || resp?.usageMetadata || null;

    const parsed = this.safeJsonParseLoose(text);

    if (!parsed) {
      const isProd = process.env.NODE_ENV === 'production';
      console.warn('[room-scan][gemini] JSON parse failed', {
        model: this.modelName,
        textPreview: isProd ? undefined : String(text || '').slice(0, 500),
      });
    }

    const itemsRaw = Array.isArray(parsed?.items) ? parsed.items : [];

    const items: RoomScanItem[] = itemsRaw
      .map((it: any) => ({
        label: String(it?.label || '').trim(),
        category: it?.category ? String(it.category).trim() : undefined,
        confidence: typeof it?.confidence === 'number' ? it.confidence : undefined,
      }))
      .filter((it: RoomScanItem) => it.label.length > 0);

    return {
      items,
      raw: {
        model: this.modelName,
        usageMetadata: usage || undefined,
        text,
      },
    };
  }
}

export function getRoomScanProvider(): RoomScanVisionProvider {
  const choice = String(process.env.ROOM_SCAN_PROVIDER || 'stub').toLowerCase();
  if (choice === 'gemini') return new GeminiRoomScanProvider();
  if (choice === 'stub') return new StubRoomScanProvider();
  return new StubRoomScanProvider();
}

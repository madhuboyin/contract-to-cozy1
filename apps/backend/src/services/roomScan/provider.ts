// apps/backend/src/services/roomScan/provider.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export type RoomScanItem = {
  label: string;
  category?: string;
  confidence?: number; // 0..1
};

export type RoomScanProviderResult = {
  items: RoomScanItem[];
  raw?: any;
};

export interface RoomScanVisionProvider {
  name: string;
  extractItemsFromImages(args: {
    images: Buffer[];
    roomType?: string | null;
  }): Promise<RoomScanProviderResult>;
}

export class StubRoomScanProvider implements RoomScanVisionProvider {
  name = 'stub';
  async extractItemsFromImages(): Promise<RoomScanProviderResult> {
    return {
      items: [
        { label: 'Sofa', category: 'FURNITURE', confidence: 0.8 },
        { label: 'TV', category: 'ELECTRONICS', confidence: 0.75 },
        { label: 'Coffee table', category: 'FURNITURE', confidence: 0.7 },
        { label: 'Lamp', category: 'DECOR', confidence: 0.65 },
      ],
      raw: { provider: 'stub' },
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function envInt(key: string, dflt: number) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

function isGeminiRetryableError(e: any): boolean {
  const msg = String(e?.message || '').toLowerCase();
  const code = Number(e?.status || e?.code || e?.response?.status);

  // Explicit transient statuses
  if (code === 429 || code === 503) return true;

  // Common transient/network hints
  if (
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('too many requests') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed')
  ) {
    return true;
  }

  return false;
}

function backoffMs(attempt: number, baseMs: number, capMs: number) {
  // exponential backoff with full jitter
  const exp = Math.min(capMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * exp);
}

/**
 * Gemini provider: multi-image request with inlineData parts.
 * Official docs: "Image understanding" + inline image data in generateContent. :contentReference[oaicite:4]{index=4}
 */
export class GeminiRoomScanProvider implements RoomScanVisionProvider {
  name = 'gemini';

  private apiKey = process.env.GEMINI_API_KEY || '';
  private modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  constructor() {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is required when ROOM_SCAN_PROVIDER=gemini');
    }
  }

  private safeJsonParse(text: string): any | null {
    const t = String(text || '').trim();

    // Try direct JSON
    try {
      return JSON.parse(t);
    } catch {}

    // Try to extract fenced ```json ... ```
    const m = t.match(/```json\s*([\s\S]*?)```/i) || t.match(/```\s*([\s\S]*?)```/i);
    if (m?.[1]) {
      try {
        return JSON.parse(m[1].trim());
      } catch {}
    }

    // Try first {...} block
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {}
    }

    return null;
  }

  async extractItemsFromImages(args: { images: Buffer[]; roomType?: string | null }): Promise<RoomScanProviderResult> {
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: this.modelName });

    const roomHint = args.roomType ? `Room type: ${args.roomType}` : 'Room type: unknown';

    const schemaHint = {
      items: [
        {
          label: 'string (short)',
          category: 'one of: APPLIANCE|ELECTRONICS|FURNITURE|FIXTURE|DECOR|TOOL|SAFETY|OTHER',
          confidence: 'number 0..1',
        },
      ],
    };

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

    // ----------------------------
    // Retry/backoff (cost guard + resiliency)
    // ----------------------------
    const maxRetries = envInt('ROOM_SCAN_GEMINI_MAX_RETRIES', 3); // retries after first attempt
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
        // lightweight retry log (avoid noisy stack)
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

    // Usage metadata (SDK may provide this; keep it optional)
    // Some Gemini responses include usageMetadata: { promptTokenCount, candidatesTokenCount, totalTokenCount }
    const usage = resp?.response?.usageMetadata || resp?.usageMetadata || null;

    const parsed = this.safeJsonParse(text);
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

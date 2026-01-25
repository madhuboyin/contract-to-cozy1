// apps/backend/src/services/roomScan/provider.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { APIError } from '../../middleware/error.middleware';

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

function envInt(name: string, dflt: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

function isModelNotFoundOrUnsupported(e: any) {
  const msg = String(e?.message || '');
  const status = e?.status || e?.code || e?.response?.status;

  // The SDK wraps this as "[GoogleGenerativeAI Error]: ... [404 Not Found] models/... is not found ..."
  return (
    status === 404 ||
    msg.includes('[404 Not Found]') ||
    msg.toLowerCase().includes('is not found for api version') ||
    msg.toLowerCase().includes('is not supported for generatecontent')
  );
}

function safeJsonParseLoose(text: string): any | null {
  const t = String(text || '').trim();
  if (!t) return null;

  try {
    return JSON.parse(t);
  } catch {}

  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const firstObj = t.indexOf('{');
  const lastObj = t.lastIndexOf('}');
  if (firstObj >= 0 && lastObj > firstObj) {
    try {
      return JSON.parse(t.slice(firstObj, lastObj + 1));
    } catch {}
  }

  const firstArr = t.indexOf('[');
  const lastArr = t.lastIndexOf(']');
  if (firstArr >= 0 && lastArr > firstArr) {
    try {
      const arr = JSON.parse(t.slice(firstArr, lastArr + 1));
      if (Array.isArray(arr)) return { items: arr };
    } catch {}
  }

  return null;
}

export class GeminiRoomScanProvider implements RoomScanVisionProvider {
  name = 'gemini';

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new APIError('GEMINI_API_KEY missing (required for ROOM_SCAN_PROVIDER=gemini)', 500, 'ROOM_SCAN_CONFIG_ERROR');
    }
  }

  private candidateModels(): string[] {
    const forced = String(process.env.ROOM_SCAN_GEMINI_MODEL || '').trim();

    // Put forced first if provided, then fallbacks.
    const fallbacks = [
      // Many projects have these enabled; order from cheapest/fastest to heavier.
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      // Some setups still expose 1.0 names depending on account
      'gemini-1.0-pro',
    ];

    const list = forced ? [forced, ...fallbacks] : fallbacks;

    // de-dupe
    return Array.from(new Set(list));
  }

  async extractItemsFromImages(args: ExtractItemsArgs): Promise<RoomScanProviderResult> {
    const genAI = new GoogleGenerativeAI(this.apiKey);

    const schemaHint = { items: [{ label: 'Sofa', category: 'FURNITURE', confidence: 0.72 }] };
    const roomHint = args.roomType ? `Room type hint: ${args.roomType}` : 'Room type hint: unknown';

    const prompt = [
      'You are an expert home-inventory assistant.',
      'Task: From the provided room photos, list distinct visible household items suitable for a home inventory.',
      'Rules:',
      '- Return ONLY valid JSON (no prose, no markdown).',
      '- Prefer fewer, higher-quality items; merge obvious duplicates.',
      '- Do NOT guess brand/model/serial/value.',
      '- Use short labels (e.g., "Sofa", "TV", "Coffee table").',
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

    const maxRetries = envInt('ROOM_SCAN_GEMINI_MAX_RETRIES', 1);

    let lastErr: any = null;

    for (const modelName of this.candidateModels()) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });

        // If transient errors happen, retry a small number of times on the same model
        let resp: any = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            resp = await model.generateContent({
              contents: [{ role: 'user', parts }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
            });
            break;
          } catch (e: any) {
            lastErr = e;
            if (attempt === maxRetries) throw e;
          }
        }

        const text = resp?.response?.text?.() ?? '';
        const usage = resp?.response?.usageMetadata || resp?.usageMetadata || null;

        const parsed = safeJsonParseLoose(text);
        const itemsRaw = Array.isArray(parsed?.items) ? parsed.items : [];

        const items: RoomScanItem[] = itemsRaw
          .map((it: any) => ({
            label: String(it?.label || '').trim(),
            category: it?.category ? String(it.category).trim() : undefined,
            confidence: typeof it?.confidence === 'number' ? it.confidence : undefined,
          }))
          .filter((it: RoomScanItem) => it.label.length > 0);

        console.log('[room-scan][gemini] model ok:', modelName, 'items:', items.length);

        return {
          items,
          raw: { model: modelName, usageMetadata: usage || undefined, text },
        };
      } catch (e: any) {
        lastErr = e;

        if (isModelNotFoundOrUnsupported(e)) {
          console.warn('[room-scan][gemini] model not supported, trying next:', modelName);
          continue;
        }

        // Non-404 errors should bubble immediately (quota, auth, etc.)
        throw e;
      }
    }

    // If we reach here, every model failed with model-not-found / unsupported
    throw new APIError(
      `Gemini model not available for this API key/project. Tried: ${this.candidateModels().join(', ')}. Set ROOM_SCAN_GEMINI_MODEL to a supported model.`,
      500,
      'ROOM_SCAN_MODEL_UNAVAILABLE',
      { cause: String(lastErr?.message || lastErr) }
    );
  }
}

export class StubRoomScanProvider implements RoomScanVisionProvider {
  name = 'stub';
  async extractItemsFromImages(_: ExtractItemsArgs): Promise<RoomScanProviderResult> {
    return { items: [{ label: 'Sofa', category: 'FURNITURE', confidence: 0.75 }] };
  }
}

export function getRoomScanProvider(): RoomScanVisionProvider {
  const choice = String(process.env.ROOM_SCAN_PROVIDER || 'gemini').toLowerCase();
  if (choice === 'stub') return new StubRoomScanProvider();
  return new GeminiRoomScanProvider();
}

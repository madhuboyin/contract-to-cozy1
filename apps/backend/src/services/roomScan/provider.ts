// apps/backend/src/services/roomScan/provider.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { APIError } from '../../middleware/error.middleware';

export type RoomScanBox = {
  imageIndex: number; // 0..N-1 (order of uploaded images)
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  w: number; // normalized 0..1
  h: number; // normalized 0..1
  confidence?: number; // 0..1
};

export type RoomScanExplain = {
  tier?: 'HIGH' | 'MEDIUM' | 'LOW';
  why?: string[];
  cues?: string[];
  agreement?: 'SINGLE_IMAGE' | 'MULTI_IMAGE';
};

export type RoomScanItem = {
  label: string;
  category?: string;
  confidence?: number;
  boxes?: RoomScanBox[];
  explanation?: RoomScanExplain;
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

function clamp01(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return undefined;
  return Math.max(0, Math.min(1, x));
}

function clampNormBox(b: any): RoomScanBox | null {
  const imageIndex = Number(b?.imageIndex);
  if (!Number.isFinite(imageIndex)) return null;

  const x = clamp01(b?.x);
  const y = clamp01(b?.y);
  const w = clamp01(b?.w);
  const h = clamp01(b?.h);

  if ([x, y, w, h].some((v) => typeof v !== 'number')) return null;

  return {
    imageIndex,
    x: x as number,
    y: y as number,
    w: w as number,
    h: h as number,
    confidence: clamp01(b?.confidence),
  };
}

// Keep your existing resolver if you want; this is safe default behavior.
async function resolveModel(_apiKey: string): Promise<string> {
  return process.env.ROOM_SCAN_GEMINI_MODEL || 'models/gemini-2.0-flash';
}

export class GeminiRoomScanProvider implements RoomScanVisionProvider {
  name = 'gemini';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new APIError('GEMINI_API_KEY missing', 500, 'ROOM_SCAN_CONFIG_ERROR');
    }
  }

  async extractItemsFromImages(args: ExtractItemsArgs): Promise<RoomScanProviderResult> {
    const genAI = new GoogleGenerativeAI(this.apiKey);

    const modelName = await resolveModel(this.apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const roomHint = args.roomType ? `Room type hint: ${args.roomType}` : 'Room type hint: unknown';

    const schemaHint = {
      items: [
        {
          label: 'Sofa',
          category: 'FURNITURE',
          confidence: 0.78,
          boxes: [{ imageIndex: 0, x: 0.12, y: 0.32, w: 0.66, h: 0.44, confidence: 0.71 }],
          explanation: {
            tier: 'HIGH',
            why: ['Clear silhouette', 'Common in living rooms'],
            cues: ['cushions', 'armrests'],
            agreement: 'MULTI_IMAGE',
          },
        },
      ],
    };

    const prompt = [
      'You are an expert home-inventory assistant.',
      'Task: From the provided room photos, list distinct visible household items suitable for a home inventory.',
      '',
      'Return ONLY valid JSON. No prose. No markdown.',
      '',
      'Rules:',
      '- Prefer fewer, higher-quality items; merge obvious duplicates.',
      '- Do NOT guess brand/model/serial/value.',
      '- Use short labels (e.g., "Sofa", "TV", "Coffee table").',
      `- ${roomHint}`,
      '',
      'Explainability (required):',
      '- For each item, include explanation.why (1–3 short bullets) and explanation.tier (HIGH|MEDIUM|LOW).',
      '- If unsure, set tier=LOW and explain why.',
      '',
      'Bounding boxes (best-effort):',
      '- If you can, provide 1..3 boxes per item using normalized coords (x,y,w,h) within [0..1].',
      '- Each box MUST include imageIndex (0-based, order of images provided).',
      '- If you cannot provide boxes, return boxes: [] (still return the item).',
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

    let resp: any = null;
    let lastErr: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        resp = await model.generateContent({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
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
      .map((it: any) => {
        const label = String(it?.label || '').trim();
        if (!label) return null;

        const boxes = Array.isArray(it?.boxes) ? it.boxes.map(clampNormBox).filter(Boolean) : [];
        const explanation = it?.explanation && typeof it.explanation === 'object' ? it.explanation : undefined;

        return {
          label,
          category: it?.category ? String(it.category).trim() : undefined,
          confidence: typeof it?.confidence === 'number' ? clamp01(it.confidence) : clamp01(it?.confidence),
          boxes: boxes as RoomScanBox[],
          explanation,
        } as RoomScanItem;
      })
      .filter(Boolean) as RoomScanItem[];

    return {
      items,
      raw: { model: modelName, usageMetadata: usage || undefined, text },
    };
  }
}

export class StubRoomScanProvider implements RoomScanVisionProvider {
  name = 'stub';
  async extractItemsFromImages(_: ExtractItemsArgs): Promise<RoomScanProviderResult> {
    return {
      items: [
        {
          label: 'Sofa',
          category: 'FURNITURE',
          confidence: 0.75,
          boxes: [{ imageIndex: 0, x: 0.1, y: 0.35, w: 0.7, h: 0.45, confidence: 0.7 }],
          explanation: { tier: 'MEDIUM', why: ['Visible cushions + armrests'], agreement: 'SINGLE_IMAGE' },
        },
      ],
    };
  }
}

export function getRoomScanProvider(): RoomScanVisionProvider {
  const choice = String(process.env.ROOM_SCAN_PROVIDER || 'gemini').toLowerCase();
  if (choice === 'stub') return new StubRoomScanProvider();
  return new GeminiRoomScanProvider();
}

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

function envTrue(name: string) {
  return String(process.env[name] || '').toLowerCase() === 'true';
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

type ModelMeta = {
  name: string; // e.g. "models/gemini-2.5-flash"
  displayName?: string;
  supportedGenerationMethods?: string[];
};

function stripModelsPrefix(modelName: string) {
  return modelName.startsWith('models/') ? modelName.slice('models/'.length) : modelName;
}

function prefersVision(model: ModelMeta) {
  // Not perfect, but Gemini vision-capable models typically work with generateContent + image parts.
  // We primarily require generateContent; images support will be validated by actual request.
  return true;
}

function scoreModel(m: ModelMeta) {
  const name = (m.name || '').toLowerCase();
  const disp = (m.displayName || '').toLowerCase();

  // Prefer flash, then pro, then anything else
  let score = 0;

  const s = `${name} ${disp}`;
  if (s.includes('flash')) score += 100;
  if (s.includes('pro')) score += 60;

  // Prefer newer series if present (2.x/3.x) over 1.x
  if (s.includes('3')) score += 30;
  if (s.includes('2.5')) score += 25;
  if (s.includes('2')) score += 20;
  if (s.includes('1.5')) score += 5;

  // Penalize "preview" slightly
  if (s.includes('preview')) score -= 5;

  return score;
}

async function listModelsV1Beta(apiKey: string): Promise<ModelMeta[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;

  const r = await fetch(url, { method: 'GET' });
  const txt = await r.text();

  if (!r.ok) {
    throw new APIError(
      `ListModels failed (${r.status}). ${txt}`,
      500,
      'GEMINI_LIST_MODELS_FAILED'
    );
  }

  const json = JSON.parse(txt);
  const models: ModelMeta[] = Array.isArray(json?.models) ? json.models : [];
  return models;
}

let cachedResolvedModel: { model: string; expiresAt: number } | null = null;

async function resolveModel(apiKey: string): Promise<string> {
  const now = Date.now();
  const ttlMs = envInt('ROOM_SCAN_GEMINI_MODEL_CACHE_TTL_MS', 10 * 60 * 1000); // 10m default
  const debug = envTrue('ROOM_SCAN_GEMINI_DEBUG');

  if (cachedResolvedModel && cachedResolvedModel.expiresAt > now) {
    return cachedResolvedModel.model;
  }

  const models = await listModelsV1Beta(apiKey);

  const eligible = models.filter((m) => {
    const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
    return methods.includes('generateContent');
  });

  if (debug) {
    console.log('[room-scan][gemini] ListModels eligible count:', eligible.length);
    console.log(
      '[room-scan][gemini] Eligible models:',
      eligible.map((m) => ({
        name: m.name,
        displayName: m.displayName,
        methods: m.supportedGenerationMethods,
      }))
    );
  }

  if (eligible.length === 0) {
    throw new APIError(
      'No Gemini models available for this API key/project (ListModels returned 0 models supporting generateContent). Check: API enabled + billing + key restrictions.',
      500,
      'ROOM_SCAN_NO_MODELS_AVAILABLE'
    );
  }

  const override = String(process.env.ROOM_SCAN_GEMINI_MODEL || '').trim();
  if (override) {
    const overrideFull = override.startsWith('models/') ? override : `models/${override}`;
    const ok = eligible.some((m) => m.name === overrideFull);
    if (ok) {
      const resolved = stripModelsPrefix(overrideFull);
      cachedResolvedModel = { model: resolved, expiresAt: now + ttlMs };
      console.log('[room-scan][gemini] Using ROOM_SCAN_GEMINI_MODEL override:', resolved);
      return resolved;
    }

    // Override is set but not valid anymore -> warn and continue to auto-pick
    console.warn('[room-scan][gemini] ROOM_SCAN_GEMINI_MODEL override not found in ListModels:', override);
  }

  const best = eligible
    .filter(prefersVision)
    .sort((a, b) => scoreModel(b) - scoreModel(a))[0];

  const resolved = stripModelsPrefix(best.name);
  cachedResolvedModel = { model: resolved, expiresAt: now + ttlMs };
  console.log('[room-scan][gemini] Auto-resolved model from ListModels:', resolved);

  return resolved;
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

    let resp: any = null;
    let lastErr: any = null;

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

    console.log('[room-scan][gemini] model:', modelName, 'items:', items.length);

    return {
      items,
      raw: { model: modelName, usageMetadata: usage || undefined, text },
    };
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

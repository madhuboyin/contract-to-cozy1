// apps/backend/src/services/ai/geminiImageAnalysis.util.ts
//
// Shared Gemini vision helper: sends one or more images + a caller-supplied
// prompt, returns the parsed JSON response. Extracted from
// visualInspector.service.ts so other photo-review features (e.g. Inspection
// Readiness Check) don't duplicate the Gemini plumbing.

import { GoogleGenAI } from '@google/genai';

export interface ImagePart {
  buffer: Buffer;
  mimeType: string;
}

export interface AnalyzeImagesOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AnalyzeImagesResult<T = unknown> {
  raw: string;
  parsed: T;
}

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_OUTPUT_TOKENS = 2000;

export async function analyzeImagesWithPrompt<T = unknown>(
  ai: GoogleGenAI,
  images: ImagePart[],
  prompt: string,
  opts: AnalyzeImagesOptions = {}
): Promise<AnalyzeImagesResult<T>> {
  const imageParts = images.map((image) => ({
    inlineData: {
      data: image.buffer.toString('base64'),
      mimeType: image.mimeType,
    },
  }));

  const response = await ai.models.generateContent({
    model: opts.model ?? DEFAULT_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }, ...imageParts],
      },
    ],
    config: {
      maxOutputTokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
    },
  });

  if (!response.text) {
    throw new Error('AI service returned an empty response');
  }

  const raw = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(raw) as T;

  return { raw, parsed };
}

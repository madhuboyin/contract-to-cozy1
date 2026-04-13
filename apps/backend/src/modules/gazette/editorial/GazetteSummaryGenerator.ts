// apps/backend/src/modules/gazette/editorial/GazetteSummaryGenerator.ts
// Generates edition-level editorial copy (summaryHeadline, summaryDeck, tickerItems) via Gemini.
// Falls back to deterministic copy on any failure or validation reject.

import { GoogleGenAI } from '@google/genai';
import { LLM_MODEL_CONFIG } from '../../../config/ai-constants';
import { GazetteEditorialPromptBuilder } from './GazetteEditorialPromptBuilder';
import { GazetteEditorialValidator } from './GazetteEditorialValidator';
import { GazetteEditorialFallbackBuilder } from './GazetteEditorialFallbackBuilder';
import {
import { logger } from '../../../lib/logger';
  EditionEditorialInput,
  EditionEditorialOutput,
  RawAIEditionEditorial,
} from './GazetteEditorialTypes';

const EDITORIAL_MODEL = LLM_MODEL_CONFIG.DEFAULT_MODEL;
const EDITORIAL_TEMPERATURE = 0.3;
const EDITORIAL_MAX_TOKENS = 500;
const CALL_TIMEOUT_MS = 10_000;

export class GazetteSummaryGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate edition-level summary headline, deck, and ticker items.
   * Returns AI copy if valid; deterministic fallback otherwise.
   */
  async generate(input: EditionEditorialInput): Promise<EditionEditorialOutput> {
    const prompt = GazetteEditorialPromptBuilder.buildEditionPrompt(input);
    const systemInstruction = GazetteEditorialPromptBuilder.getSystemInstruction();
    const promptVersion = GazetteEditorialPromptBuilder.getPromptVersion();

    let rawText: string;
    try {
      rawText = await this._callWithTimeout(prompt, systemInstruction);
    } catch (err) {
      logger.warn(`[GazetteSummaryGenerator] AI call failed for edition ${input.editionId}:`, (err as Error).message);
      return GazetteEditorialFallbackBuilder.buildEditionFallback(input, 'FAILED');
    }

    const parsed = parseJsonFromText(rawText);
    if (!parsed || typeof parsed !== 'object') {
      logger.warn(`[GazetteSummaryGenerator] Could not parse JSON for edition ${input.editionId}`);
      return GazetteEditorialFallbackBuilder.buildEditionFallback(input, 'FALLBACK_USED');
    }

    const raw = parsed as RawAIEditionEditorial;
    const validationResult = GazetteEditorialValidator.validateEditionOutput(raw);

    if (!validationResult.valid) {
      logger.warn(
        `[GazetteSummaryGenerator] Validation failed for edition ${input.editionId}:`,
        validationResult.issues.join('; '),
      );
      return GazetteEditorialFallbackBuilder.buildEditionFallback(input, 'FALLBACK_USED');
    }

    const tickerItems = (raw.tickerItems as unknown[])
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());

    return {
      summaryHeadline: String(raw.summaryHeadline).trim(),
      summaryDeck: String(raw.summaryDeck).trim(),
      tickerItems,
      aiStatus: 'GENERATED',
      aiModel: EDITORIAL_MODEL,
      aiPromptVersion: promptVersion,
    };
  }

  private async _callWithTimeout(
    userPrompt: string,
    systemInstruction: string,
  ): Promise<string> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI call timed out')), CALL_TIMEOUT_MS),
    );

    const aiPromise = (async () => {
      const chat = this.ai.chats.create({
        model: EDITORIAL_MODEL,
        config: {
          systemInstruction,
          temperature: EDITORIAL_TEMPERATURE,
          maxOutputTokens: EDITORIAL_MAX_TOKENS,
        },
      });
      const response = await chat.sendMessage({ message: userPrompt });
      return response.text ?? '';
    })();

    return Promise.race([aiPromise, timeoutPromise]);
  }
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
  }

  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }

  return null;
}

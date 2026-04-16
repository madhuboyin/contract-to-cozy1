// apps/backend/src/modules/gazette/editorial/GazetteHeadlineGenerator.ts
// Generates story-level editorial copy (headline, dek, summary) via Gemini.
// Falls back to deterministic copy on any failure or validation reject.

import { GoogleGenAI } from '@google/genai';
import { LLM_MODEL_CONFIG } from '../../../config/ai-constants';
import { GazetteEditorialPromptBuilder } from './GazetteEditorialPromptBuilder';
import { GazetteEditorialValidator } from './GazetteEditorialValidator';
import { GazetteEditorialFallbackBuilder } from './GazetteEditorialFallbackBuilder';
import {
  StoryEditorialInput,
  StoryEditorialOutput,
  RawAIStoryEditorial,
} from './GazetteEditorialTypes';
import { logger } from '../../../lib/logger';

const EDITORIAL_MODEL = LLM_MODEL_CONFIG.DEFAULT_MODEL;
const EDITORIAL_TEMPERATURE = 0.3;
const EDITORIAL_MAX_TOKENS = 600;
const CALL_TIMEOUT_MS = 10_000;

export class GazetteHeadlineGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate headline, dek, and summary for a story.
   * Returns AI copy if valid; deterministic fallback otherwise.
   */
  async generate(input: StoryEditorialInput): Promise<StoryEditorialOutput> {
    const prompt = GazetteEditorialPromptBuilder.buildStoryPrompt(input);
    const systemInstruction = GazetteEditorialPromptBuilder.getSystemInstruction();
    const promptVersion = GazetteEditorialPromptBuilder.getPromptVersion();

    let rawText: string;
    try {
      rawText = await this._callWithTimeout(prompt, systemInstruction);
    } catch (err) {
      logger.warn({ err }, `[GazetteHeadlineGenerator] AI call failed for story ${input.storyId}`);
      return GazetteEditorialFallbackBuilder.buildStoryFallback(input, 'FAILED');
    }

    const parsed = parseJsonFromText(rawText);
    if (!parsed || typeof parsed !== 'object') {
      logger.warn(`[GazetteHeadlineGenerator] Could not parse JSON for story ${input.storyId}`);
      return GazetteEditorialFallbackBuilder.buildStoryFallback(input, 'FALLBACK_USED');
    }

    const raw = parsed as RawAIStoryEditorial;
    const validationResult = GazetteEditorialValidator.validateStoryOutput(raw, {
      urgencyScore: input.urgencyScore,
      supportingFacts: input.supportingFacts,
    });

    if (!validationResult.valid) {
      logger.warn(
        { issues: validationResult.issues.join('; ') },
        `[GazetteHeadlineGenerator] Validation failed for story ${input.storyId}`,
      );
      return {
        ...GazetteEditorialFallbackBuilder.buildStoryFallback(input, 'FALLBACK_USED'),
        validationResult,
      };
    }

    return {
      storyId: input.storyId,
      headline: String(raw.headline).trim(),
      dek: String(raw.dek).trim(),
      summary: String(raw.summary).trim(),
      ...(input.isHero && raw.whyItMatters
        ? { whyItMatters: String(raw.whyItMatters).trim() }
        : {}),
      aiStatus: 'GENERATED',
      aiModel: EDITORIAL_MODEL,
      aiPromptVersion: promptVersion,
      validationResult,
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

/**
 * Parse JSON from AI response text.
 * Handles raw JSON, markdown code fences, and embedded objects.
 */
function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  // Direct parse
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }

  // Strip markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch { /* fall through */ }
  }

  // Extract first {...} block
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch { /* fall through */ }
  }

  return null;
}

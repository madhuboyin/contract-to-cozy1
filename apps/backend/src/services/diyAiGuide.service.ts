// apps/backend/src/services/diyAiGuide.service.ts
import { GoogleGenAI } from '@google/genai';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { LLM_MODEL_CONFIG } from '../config/ai-constants';
import { Queue } from 'bullmq';
import { connection } from './JobQueue.service';
import { DEFAULT_JOB_RETENTION } from '../config/queueDefaults';
import { getPropertyContext } from '../modules/propertyContext';
import { evaluateDiyApplicability } from './diy/applicabilityPolicy';
import { knownContextValue } from './propertyContextDecision';
import { AiGuideGenerationResponseSchema } from '../validators/diy.validators';
import { APIError } from '../middleware/error.middleware';

export const DIY_AI_GUIDE_JOB = 'GENERATE_DIY_AI_GUIDE';
export const DIY_AI_GUIDE_QUEUE = 'diy-ai-guide-queue';

export const diyAiGuideQueue = new Queue<{ guideId: string }>(DIY_AI_GUIDE_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    ...DEFAULT_JOB_RETENTION,
  },
});

class DiyAiGuideService {
  private ai: GoogleGenAI | null = null;

  private getAi(): GoogleGenAI {
    if (!this.ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
      this.ai = new GoogleGenAI({ apiKey });
    }
    return this.ai;
  }

  async initiateGeneration(userId: string, propertyId: string, userPrompt: string): Promise<string> {
    // Explicit AI-disabled behavior (W3/AI-DIY): previously the only
    // "is AI available" check was an implicit throw inside getAi(), deep
    // inside the worker job — so a missing GEMINI_API_KEY meant a homeowner
    // submitted a prompt, watched a PENDING guide sit there, and only found
    // out AI was unavailable a full poll cycle later via a generic FAILED
    // state. Failing closed here, before any row is created, gives an
    // immediate, honest, request-time answer instead of a confusing delay.
    if (!process.env.GEMINI_API_KEY) {
      throw new APIError('AI features are currently unavailable. Please try again later.', 503, 'AI_UNAVAILABLE');
    }

    // Idempotency (W3/AI-DIY — "idempotency"): a double-submit (double-tap
    // before the button disables, or a retried request after a network
    // blip) previously always created a brand-new guide row and enqueued a
    // brand-new Gemini call — no dedup existed at all. Reusing an
    // already-in-flight request for the exact same prompt avoids a wasted
    // paid API call; a genuinely different prompt for the same property
    // still creates its own guide.
    const inFlight = await prisma.diyAiGuide.findFirst({
      where: { userId, propertyId, userPrompt, status: { in: ['PENDING', 'GENERATING'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (inFlight) return inFlight.id;

    const guide = await prisma.diyAiGuide.create({
      data: { userId, propertyId, userPrompt, status: 'PENDING' },
    });

    await diyAiGuideQueue.add(DIY_AI_GUIDE_JOB, { guideId: guide.id }, {
      jobId: `diy-guide-${guide.id}`,
    });

    return guide.id;
  }

  async generate(guideId: string): Promise<void> {
    const guide = await prisma.diyAiGuide.findUnique({ where: { id: guideId } });
    if (!guide || guide.status !== 'PENDING') return;

    // Atomic claim (W3/AI-DIY — "idempotency"): the previous findUnique +
    // status-check + separate update was not atomic, and the allowed-status
    // set even included GENERATING — so a second call while one was
    // already in flight (BullMQ stalled-job redelivery, a manual re-call)
    // would pass the check and fire a second, duplicate, paid Gemini call.
    // Same race class already fixed for the export jobs in the exports
    // slice. Only the caller whose guarded write actually lands proceeds.
    const claim = await prisma.diyAiGuide.updateMany({
      where: { id: guideId, status: 'PENDING' },
      data: { status: 'GENERATING' },
    });
    if (claim.count !== 1) return;

    try {
      const [skillProfile, context] = await Promise.all([
        prisma.diySkillProfile.findUnique({ where: { userId: guide.userId } }),
        getPropertyContext(
          guide.propertyId,
          { userId: guide.userId },
          { scopes: ['CORE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'INVENTORY'] },
        ),
      ]);

      const skillSummary = skillProfile
        ? `HVAC: ${skillProfile.hvac}, Plumbing: ${skillProfile.plumbing}, Electrical: ${skillProfile.electrical}, Painting: ${skillProfile.painting}, General: ${skillProfile.general}`
        : 'Not assessed';

      const propertySummary = `${knownContextValue<string>(context, 'core.dwellingType') ?? 'unknown dwelling'}, built ${knownContextValue<number>(context, 'core.yearBuilt') ?? 'unknown'}, heating: ${knownContextValue<string>(context, 'systems.heatingType') ?? 'unknown'}, cooling: ${knownContextValue<string>(context, 'systems.coolingType') ?? 'unknown'}`;

      const prompt = `You are a home maintenance expert helping a homeowner safely complete a DIY project.

Homeowner skill levels: ${skillSummary}
Property: ${propertySummary}
Project description: "${guide.userPrompt}"

Respond with a JSON object matching this exact schema (no markdown, raw JSON only):
{
  "title": string,
  "summary": string,
  "category": "HVAC" | "PLUMBING" | "ELECTRICAL" | "PAINTING" | "GENERAL" | "EXTERIOR" | "FLOORING" | "APPLIANCE" | "LANDSCAPING" | "OTHER",
  "verdict": "DIY_RECOMMENDED" | "BORDERLINE" | "HIRE_RECOMMENDED" | "HIRE_REQUIRED",
  "safetyWarnings": string[],
  "steps": [{ "stepNumber": number, "title": string, "description": string, "estimatedMinutes": number | null, "safetyNote": string | null, "tipNote": string | null }],
  "materials": [{ "name": string, "unit": string, "quantity": number, "unitPriceCents": number | null, "purchaseNote": string | null }],
  "tools": [{ "name": string, "isRequired": boolean, "defaultToolAction": "ALREADY_OWNED" | "RENT" | "BUY" | null }]
}

If the project involves main electrical panels, gas lines, load-bearing structural elements, or anything requiring a licensed contractor in most US jurisdictions, set verdict to HIRE_REQUIRED and explain in safetyWarnings. Do not generate steps for those tasks.`;

      const response = await this.getAi().models.generateContent({
        model: LLM_MODEL_CONFIG.DEFAULT_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 4096, temperature: 0.3 },
      });

      const rawText = response.text ?? '';
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(cleaned);
      } catch {
        await prisma.diyAiGuide.update({
          where: { id: guideId },
          data: { status: 'FAILED', errorMessage: 'AI response was not valid JSON.' },
        });
        return;
      }

      // Structured output validation (W3/AI-DIY): previously trusted
      // wholesale — a malformed/incomplete response (missing fields, wrong
      // types, empty steps) was persisted as COMPLETED and only surfaced
      // as a raw Prisma error later, when the homeowner converted the
      // guide into a project.
      const validation = AiGuideGenerationResponseSchema.safeParse(parsedRaw);
      if (!validation.success) {
        logger.warn(
          { guideId, issues: validation.error.issues },
          '[DIY-AI-GUIDE] AI response failed structured validation',
        );
        await prisma.diyAiGuide.update({
          where: { id: guideId },
          data: { status: 'FAILED', errorMessage: 'AI response did not match the expected guide format.' },
        });
        return;
      }
      const parsed = validation.data;

      const applicability = evaluateDiyApplicability(context, parsed.category);
      if (applicability.status !== 'APPLICABLE') {
        await prisma.diyAiGuide.update({
          where: { id: guideId },
          data: {
            status: 'FAILED',
            errorMessage: `Property applicability: ${applicability.reasonCodes.join(', ')}`,
          },
        });
        return;
      }

      await prisma.diyAiGuide.update({
        where: { id: guideId },
        data: {
          status: 'COMPLETED',
          category: parsed.category ?? null,
          generatedTitle: parsed.title ?? null,
          generatedSummary: parsed.summary ?? null,
          stepsJson: parsed.steps ?? [],
          materialsJson: parsed.materials ?? [],
          toolsJson: parsed.tools ?? [],
          decisionVerdict: parsed.verdict ?? null,
          safetyWarningsJson: parsed.safetyWarnings ?? [],
          promptTokens: response.usageMetadata?.promptTokenCount ?? null,
          completionTokens: response.usageMetadata?.candidatesTokenCount ?? null,
        },
      });
    } catch (err: any) {
      logger.error({ err }, `[DIY-AI-GUIDE] Generation failed for guide ${guideId}`);
      await prisma.diyAiGuide.update({
        where: { id: guideId },
        data: { status: 'FAILED', errorMessage: err?.message ?? 'Unknown error' },
      });
    }
  }

  async getGuide(guideId: string, propertyId: string) {
    return prisma.diyAiGuide.findFirst({ where: { id: guideId, propertyId } });
  }
}

export const diyAiGuideService = new DiyAiGuideService();

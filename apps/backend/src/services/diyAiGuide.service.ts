// apps/backend/src/services/diyAiGuide.service.ts
import { GoogleGenAI } from '@google/genai';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { LLM_MODEL_CONFIG } from '../config/ai-constants';
import { Queue } from 'bullmq';
import { connection } from './JobQueue.service';

export const DIY_AI_GUIDE_JOB = 'GENERATE_DIY_AI_GUIDE';
export const DIY_AI_GUIDE_QUEUE = 'diy-ai-guide-queue';

export const diyAiGuideQueue = new Queue<{ guideId: string }>(DIY_AI_GUIDE_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: true,
    removeOnFail: 500,
  },
});

class DiyAiGuideService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    this.ai = new GoogleGenAI({ apiKey });
  }

  async initiateGeneration(userId: string, propertyId: string, userPrompt: string): Promise<string> {
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
    if (!guide || !['PENDING', 'GENERATING'].includes(guide.status)) return;

    await prisma.diyAiGuide.update({ where: { id: guideId }, data: { status: 'GENERATING' } });

    try {
      const [skillProfile, property] = await Promise.all([
        prisma.diySkillProfile.findUnique({ where: { userId: guide.userId } }),
        prisma.property.findUnique({
          where: { id: guide.propertyId },
          select: { propertyType: true, yearBuilt: true, heatingType: true, coolingType: true },
        }),
      ]);

      const skillSummary = skillProfile
        ? `HVAC: ${skillProfile.hvac}, Plumbing: ${skillProfile.plumbing}, Electrical: ${skillProfile.electrical}, Painting: ${skillProfile.painting}, General: ${skillProfile.general}`
        : 'Not assessed';

      const propertySummary = property
        ? `${property.propertyType ?? 'home'}, built ${property.yearBuilt ?? 'unknown'}, heating: ${property.heatingType ?? 'unknown'}, cooling: ${property.coolingType ?? 'unknown'}`
        : 'Unknown property';

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

      const response = await this.ai.models.generateContent({
        model: LLM_MODEL_CONFIG.DEFAULT_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 4096, temperature: 0.3 },
      });

      const rawText = response.text ?? '';
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

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

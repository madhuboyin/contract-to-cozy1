// apps/backend/src/services/guidanceEngine/modelShortlistAdvisor.service.ts

import { GoogleGenAI } from '@google/genai';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { LLM_MODEL_CONFIG, MODEL_SHORTLIST_PROMPT_TEMPLATE } from '../../config/ai-constants';

export type AIModelRecommendation = {
  brand: string;
  modelNumber: string;
  displayName: string;
  tier: 'budget' | 'mid' | 'premium';
  estimatedPrice: number;
  rebateAdjustedPrice: number | null;
  keySpecs: Record<string, string>;
  whyThisForYou: string;
  energyStarCertified: boolean;
  warrantyYears: number;
  specConfidence: 'estimated';
};

export type ModelShortlistResult = {
  models: AIModelRecommendation[];
  assetCategory: string;
  generatedAt: string;
};

const ASSET_BUDGETS: Record<string, [number, number]> = {
  dishwasher:   [600,  1800],
  refrigerator: [1000, 3200],
  washer:       [700,  1800],
  dryer:        [600,  1600],
  water_heater: [1000, 3800],
  hvac:         [6000, 16000],
  furnace:      [2500, 7500],
  ac:           [3000, 9000],
  default:      [800,  2800],
};

export function inferAssetCategory(assetName: string): string {
  const n = assetName.toLowerCase();
  if (n.includes('dishwasher')) return 'dishwasher';
  if (n.includes('refrigerator') || n.includes('fridge')) return 'refrigerator';
  if (n.includes('dryer')) return 'dryer';
  if (n.includes('washer') || n.includes('washing machine')) return 'washer';
  if (n.includes('water heater')) return 'water_heater';
  if (n.includes('furnace')) return 'furnace';
  if (n.includes('hvac') || n.includes('heat pump')) return 'hvac';
  if (n.includes(' ac ') || n.includes('air conditioner') || n.includes('cooling unit')) return 'ac';
  return 'default';
}

function resolveBudget(category: string, budgetMin?: number, budgetMax?: number): [number, number] {
  const defaults = ASSET_BUDGETS[category] ?? ASSET_BUDGETS.default;
  return [budgetMin ?? defaults[0], budgetMax ?? defaults[1]];
}

function buildFallback(
  assetName: string,
  assetCategory: string,
  budgetMin: number,
  budgetMax: number,
  rebateAmount: number,
): AIModelRecommendation[] {
  const range = budgetMax - budgetMin;
  const prices: [number, 'budget' | 'mid' | 'premium'][] = [
    [Math.round(budgetMin + range * 0.15), 'budget'],
    [Math.round(budgetMin + range * 0.50), 'mid'],
    [Math.round(budgetMin + range * 0.85), 'premium'],
  ];
  return prices.map(([price, tier]) => ({
    brand: 'To be researched',
    modelNumber: 'See retailer',
    displayName: `${tier === 'budget' ? 'Entry-level' : tier === 'mid' ? 'Mid-range' : 'Premium'} ${assetName}`,
    tier,
    estimatedPrice: price,
    rebateAdjustedPrice: rebateAmount > 0 ? Math.max(0, price - rebateAmount) : null,
    keySpecs: {
      Note: 'AI recommendations unavailable — search a retailer for current models in this price range',
    },
    whyThisForYou: `A ${tier}-tier option near $${price.toLocaleString()} that fits your budget range.`,
    energyStarCertified: false,
    warrantyYears: 1,
    specConfidence: 'estimated',
  }));
}

class ModelShortlistAdvisorService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateShortlist(params: {
    propertyId: string;
    assetName: string;
    budgetMin?: number;
    budgetMax?: number;
    rebateAmount?: number;
    primaryPriority?: string;
    homeOwnershipYears?: string;
    mustHaves?: string[];
    journeyContext?: string;
  }): Promise<ModelShortlistResult> {
    const { propertyId, assetName, budgetMin, budgetMax, rebateAmount = 0, primaryPriority, homeOwnershipYears, mustHaves, journeyContext } = params;

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { city: true, state: true },
    });

    const city = property?.city ?? 'your area';
    const state = property?.state ?? '';
    const assetCategory = inferAssetCategory(assetName);
    const [min, max] = resolveBudget(assetCategory, budgetMin, budgetMax);

    const prompt = MODEL_SHORTLIST_PROMPT_TEMPLATE({
      assetName,
      assetCategory,
      budgetMin: min,
      budgetMax: max,
      rebateAmount,
      city,
      state,
      primaryPriority,
      homeOwnershipYears,
      mustHaves,
      journeyContext,
    });

    try {
      const response = await this.ai.models.generateContent({
        model: LLM_MODEL_CONFIG.ADVANCED_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 1400, temperature: 0.35 },
      });

      const text = response.text;
      if (!text) throw new Error('Empty AI response');

      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const raw: AIModelRecommendation[] = JSON.parse(cleaned);
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('AI returned empty array');

      const models: AIModelRecommendation[] = raw.slice(0, 3).map((m) => ({
        brand: String(m.brand ?? ''),
        modelNumber: String(m.modelNumber ?? ''),
        displayName: String(m.displayName ?? ''),
        tier: (['budget', 'mid', 'premium'].includes(m.tier) ? m.tier : 'mid') as 'budget' | 'mid' | 'premium',
        estimatedPrice: Number(m.estimatedPrice) || 0,
        rebateAdjustedPrice: rebateAmount > 0 ? Math.max(0, (Number(m.estimatedPrice) || 0) - rebateAmount) : null,
        keySpecs: typeof m.keySpecs === 'object' && m.keySpecs !== null ? (m.keySpecs as Record<string, string>) : {},
        whyThisForYou: String(m.whyThisForYou ?? ''),
        energyStarCertified: Boolean(m.energyStarCertified),
        warrantyYears: Number(m.warrantyYears) || 1,
        specConfidence: 'estimated',
      }));

      logger.info(`[MODEL-SHORTLIST] Generated ${models.length} models for ${assetName} in ${city}, ${state}`);
      return { models, assetCategory, generatedAt: new Date().toISOString() };
    } catch (error) {
      logger.error({ err: error }, '[MODEL-SHORTLIST] AI generation failed, returning fallback');
      return {
        models: buildFallback(assetName, assetCategory, min, max, rebateAmount),
        assetCategory,
        generatedAt: new Date().toISOString(),
      };
    }
  }
}

export const modelShortlistAdvisorService = new ModelShortlistAdvisorService();

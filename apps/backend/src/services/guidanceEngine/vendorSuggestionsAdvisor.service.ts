// apps/backend/src/services/guidanceEngine/vendorSuggestionsAdvisor.service.ts

import { GoogleGenAI } from '@google/genai';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { LLM_MODEL_CONFIG, VENDOR_SUGGESTIONS_PROMPT_TEMPLATE } from '../../config/ai-constants';

export type AIVendorSuggestion = {
  vendorName: string;
  vendorType: 'big_box' | 'online' | 'local_dealer' | 'manufacturer' | 'wholesale';
  unitPrice: number;
  deliveryCost: number;
  installationAvailable: boolean;
  installationCost: number | null;
  returnWindowDays: number;
  whyBuyHere: string;
  badges: string[];
};

export type VendorSuggestionsResult = {
  vendors: AIVendorSuggestion[];
  generatedAt: string;
};

const VALID_VENDOR_TYPES = new Set(['big_box', 'online', 'local_dealer', 'manufacturer', 'wholesale']);

function buildFallback(): AIVendorSuggestion[] {
  return [
    {
      vendorName: 'Home Depot',
      vendorType: 'big_box',
      unitPrice: 0,
      deliveryCost: 0,
      installationAvailable: true,
      installationCost: 149,
      returnWindowDays: 30,
      whyBuyHere: 'In-store pickup available, price match guarantee, and certified installation services.',
      badges: ['Price match', 'Free delivery'],
    },
    {
      vendorName: 'AJ Madison',
      vendorType: 'online',
      unitPrice: 0,
      deliveryCost: 0,
      installationAvailable: true,
      installationCost: 179,
      returnWindowDays: 30,
      whyBuyHere: 'Appliance specialist with competitive pricing, white-glove delivery, and haul-away service.',
      badges: ['Free delivery', 'Haul away included'],
    },
    {
      vendorName: 'Local Dealer',
      vendorType: 'local_dealer',
      unitPrice: 0,
      deliveryCost: 79,
      installationAvailable: true,
      installationCost: 199,
      returnWindowDays: 14,
      whyBuyHere: 'Local support with faster response times and personalized service.',
      badges: ['Local support'],
    },
  ];
}

class VendorSuggestionsAdvisorService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateSuggestions(params: {
    propertyId: string;
    assetName: string;
    modelName: string;
    budgetMax?: number;
  }): Promise<VendorSuggestionsResult> {
    const { propertyId, assetName, modelName, budgetMax } = params;

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { city: true, state: true },
    });

    const city = property?.city ?? 'your area';
    const state = property?.state ?? '';

    const prompt = VENDOR_SUGGESTIONS_PROMPT_TEMPLATE({ assetName, modelName, city, state, budgetMax });

    try {
      const response = await this.ai.models.generateContent({
        model: LLM_MODEL_CONFIG.ADVANCED_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 900, temperature: 0.35 },
      });

      const text = response.text;
      if (!text) throw new Error('Empty AI response');

      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const raw: AIVendorSuggestion[] = JSON.parse(cleaned);
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('AI returned empty array');

      const vendors: AIVendorSuggestion[] = raw.slice(0, 3).map((v) => ({
        vendorName: String(v.vendorName ?? ''),
        vendorType: (VALID_VENDOR_TYPES.has(v.vendorType) ? v.vendorType : 'online') as AIVendorSuggestion['vendorType'],
        unitPrice: Number(v.unitPrice) || 0,
        deliveryCost: Number(v.deliveryCost) || 0,
        installationAvailable: Boolean(v.installationAvailable),
        installationCost: v.installationCost != null ? Number(v.installationCost) : null,
        returnWindowDays: Number(v.returnWindowDays) || 30,
        whyBuyHere: String(v.whyBuyHere ?? ''),
        badges: Array.isArray(v.badges) ? v.badges.map(String).slice(0, 3) : [],
      }));

      logger.info(`[VENDOR-SUGGESTIONS] Generated ${vendors.length} vendors for ${assetName} (${modelName}) in ${city}, ${state}`);
      return { vendors, generatedAt: new Date().toISOString() };
    } catch (error) {
      logger.error({ err: error }, '[VENDOR-SUGGESTIONS] AI generation failed, returning fallback');
      return { vendors: buildFallback(), generatedAt: new Date().toISOString() };
    }
  }
}

export const vendorSuggestionsAdvisorService = new VendorSuggestionsAdvisorService();

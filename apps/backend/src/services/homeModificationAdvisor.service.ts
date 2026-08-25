// apps/backend/src/services/homeModificationAdvisor.service.ts

import { GoogleGenAI } from "@google/genai";
import { executeGovernedAIRequest, resolveGovernedAIModel } from './ai/aiRequestGovernance.service';
import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import type { PropertyContextSnapshot } from '../modules/propertyContext';
import type { HomeModificationApplicability } from './homeModification/applicabilityPolicy';
import { knownContextValue } from './propertyContextDecision';

type RecommendationCategory = 'ACCESSIBILITY' | 'AGING_IN_PLACE' | 'FAMILY' | 'RESALE' | 'ENERGY' | 'SAFETY';

interface RawModificationRecommendation {
  title: string;
  category: RecommendationCategory;
  estimatedCostMin: number;
  estimatedCostMax: number;
  timeline: string;
  description: string;
  benefits: string[];
  whyThisFits: string;
  contractorType: string;
  source?: 'AI_ESTIMATE' | 'BASELINE_HEURISTIC';
}

interface ModificationRecommendation {
  title: string;
  category: RecommendationCategory;
  costRange: {
    min: number;
    max: number;
    currency: 'USD';
  };
  timeline: string;
  description: string;
  benefits: string[];
  whyThisFits: string;
  professionalToConsult: string;
  permitGuidance: 'VERIFY_WITH_LOCAL_AUTHORITY';
  source: 'AI_ESTIMATE' | 'BASELINE_HEURISTIC';
  confidence?: 'LOW' | 'MEDIUM';
  assumptions: string[];
  validation: {
    costModel: 'STATE_MULTIPLIER_BASELINE_V1';
    stateCostMultiplier: number;
    costRangeWasAdjusted: boolean;
    notes: string[];
  };
}

interface ModificationReport {
  propertyId: string;
  propertyAddress: string;
  userNeeds: string[];
  propertyAge: number | null;
  applicability: HomeModificationApplicability;
  recommendations: ModificationRecommendation[];
  meta: {
    classification: 'EDUCATIONAL_ESTIMATE';
    regionalCostModel: 'STATE_MULTIPLIER_BASELINE_V1';
    financialPlanningSafe: false;
    selectionRequired: true;
    disclaimer: string;
  };
  generatedAt: Date;
}

const COMMON_MODIFICATIONS: Record<RecommendationCategory, Array<{ title: string; cost: number }>> = {
  ACCESSIBILITY: [
    { title: 'Wheelchair Ramp Installation', cost: 3500 },
    { title: 'Walk-in Shower Conversion', cost: 6000 },
    { title: 'Grab Bars & Handrails', cost: 800 },
    { title: 'Widened Doorways', cost: 2500 },
  ],
  AGING_IN_PLACE: [
    { title: 'Zero-Step Entry', cost: 4500 },
    { title: 'Lever-Style Door Handles', cost: 600 },
    { title: 'Non-Slip Flooring', cost: 3500 },
    { title: 'Stair Lift Installation', cost: 8000 },
  ],
  FAMILY: [
    { title: 'Additional Bedroom', cost: 35000 },
    { title: 'Finished Basement', cost: 45000 },
    { title: 'Home Office Conversion', cost: 8000 },
    { title: 'Playroom/Nursery Update', cost: 5000 },
  ],
  RESALE: [
    { title: 'Kitchen Remodel', cost: 25000 },
    { title: 'Bathroom Renovation', cost: 15000 },
    { title: 'Curb Appeal Enhancement', cost: 5000 },
    { title: 'Deck/Patio Addition', cost: 12000 },
  ],
  ENERGY: [
    { title: 'Solar Panel Installation', cost: 18000 },
    { title: 'Smart Thermostat System', cost: 1200 },
    { title: 'Energy-Efficient Windows', cost: 8000 },
    { title: 'Insulation Upgrade', cost: 3500 },
  ],
  SAFETY: [
    { title: 'Smart Security System', cost: 2500 },
    { title: 'Outdoor Lighting Upgrade', cost: 1500 },
    { title: 'Fire Suppression System', cost: 4000 },
    { title: 'Radon Mitigation', cost: 2000 },
  ],
};

const STATE_COST_MULTIPLIER: Record<string, number> = {
  CA: 1.34,
  NY: 1.28,
  NJ: 1.24,
  WA: 1.21,
  MA: 1.2,
  CO: 1.15,
  FL: 1.12,
  TX: 1.05,
  NC: 1.02,
  AZ: 1.03,
  IL: 1.03,
  OH: 0.96,
  GA: 0.97,
  MI: 0.95,
  PA: 0.99,
  IN: 0.93,
  MO: 0.92,
  TN: 0.94,
  AL: 0.9,
  OK: 0.89,
  DEFAULT: 1.0,
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundCost(value: number): number {
  return Math.max(100, Math.round(value / 100) * 100);
}

export class HomeModificationAdvisorService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('[HOME-MODIFICATION] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async generateModificationReport(
    propertyId: string,
    userId: string,
    userNeeds: string[],
    context: PropertyContextSnapshot,
    applicability: HomeModificationApplicability,
  ): Promise<ModificationReport> {
    const property = await prisma.property.findUnique({ where: { id: propertyId } });

    if (!property) {
      throw new Error('Property not found');
    }

    const canonicalYearBuilt = knownContextValue<number>(context, 'core.yearBuilt');
    const propertyAge = canonicalYearBuilt
      ? new Date().getFullYear() - canonicalYearBuilt
      : null;
    const applicableNeeds = applicability.outdoor.status === 'APPLICABLE'
      ? userNeeds
      : userNeeds.filter((need) => !/outdoor/i.test(need));

    const rawRecommendations = await this.getAIRecommendations(
      property,
      applicableNeeds,
      propertyAge
    );
    let recommendations = this.applyRegionalGuardrails(
      rawRecommendations,
      property.state,
    );
    if (applicability.outdoor.status !== 'APPLICABLE') {
      recommendations = recommendations.filter((recommendation) => !/(deck|patio|outdoor|curb appeal|landscap)/i.test(recommendation.title));
    }

    return {
      propertyId,
      propertyAddress: property.address,
      userNeeds,
      propertyAge,
      applicability,
      recommendations,
      meta: {
        classification: 'EDUCATIONAL_ESTIMATE',
        regionalCostModel: 'STATE_MULTIPLIER_BASELINE_V1',
        financialPlanningSafe: false,
        selectionRequired: true,
        disclaimer:
          'Each option is an educational starting point, not a combined renovation plan. Cost ranges use broad state-level baselines and are not contractor bids. Permit requirements must be verified with the local authority after the scope is defined.',
      },
      generatedAt: new Date(),
    };
  }

  private async getAIRecommendations(
    property: any,
    userNeeds: string[],
    propertyAge: number | null
  ): Promise<RawModificationRecommendation[]> {
    if (!this.ai) {
      return this.getBasicRecommendations(userNeeds, propertyAge);
    }

    try {
      const prompt = `Analyze home modification needs and provide detailed recommendations:

Property Details:
- Dwelling type: ${property.dwellingType}
- Age: ${propertyAge === null ? 'unknown' : `${propertyAge} years`}
- Location: ${property.city}, ${property.state}

User Needs/Goals:
${userNeeds.map((need, i) => `${i + 1}. ${need}`).join('\n')}

Provide 6-8 specific home modification recommendations. Return ONLY valid JSON (no markdown):
[
  {
    "title": "Kitchen Island Addition",
    "category": "FAMILY",
    "estimatedCostMin": 6000,
    "estimatedCostMax": 12000,
    "timeline": "2-3 weeks",
    "description": "Add functional kitchen island with seating",
    "benefits": ["Extra counter space", "Casual dining area", "Increased storage"],
    "whyThisFits": "Supports the selected goal of creating more functional family space.",
    "contractorType": "General Contractor"
  }
]

Categories: ACCESSIBILITY, AGING_IN_PLACE, FAMILY, RESALE, ENERGY, SAFETY
Use broad cost ranges rather than point estimates. Do not provide ROI, urgency rankings, or permit conclusions.
Include diverse, independent options across categories.`;

      const model = resolveGovernedAIModel('FAST');
      const response = await executeGovernedAIRequest({ routeId: 'ai:home-modification', model, structuredOutputRequired: true, structuredOutputConfigured: true, work: () => this.ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 2000, temperature: 0.7, responseMimeType: 'application/json' }
      }) });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const recommendations = JSON.parse(text);

      return this.normalizeRecommendationsFromAI(recommendations).slice(0, 8);

    } catch (error) {
      logger.error({ err: error }, '[HOME-MODIFICATION] AI error');
      return this.getBasicRecommendations(userNeeds, propertyAge);
    }
  }

  private normalizeRecommendationsFromAI(input: unknown): RawModificationRecommendation[] {
    if (!Array.isArray(input)) return [];
    const allowedCategories: RecommendationCategory[] = [
      'ACCESSIBILITY',
      'AGING_IN_PLACE',
      'FAMILY',
      'RESALE',
      'ENERGY',
      'SAFETY',
    ];

    return input
      .map((raw): RawModificationRecommendation | null => {
        if (!raw || typeof raw !== 'object') return null;
        const rec = raw as Record<string, unknown>;
        const category = String(rec.category || '').toUpperCase() as RecommendationCategory;
        const title = String(rec.title || '').trim();
        const description = String(rec.description || '').trim();
        const whyThisFits = String(rec.whyThisFits || description).trim();
        const contractorType = String(rec.contractorType || 'General Contractor').trim() || 'General Contractor';
        const timeline = String(rec.timeline || '2-4 weeks').trim() || '2-4 weeks';
        const costMin = Number(rec.estimatedCostMin);
        const costMax = Number(rec.estimatedCostMax);
        const benefits = Array.isArray(rec.benefits)
          ? rec.benefits.map((b) => String(b).trim()).filter(Boolean).slice(0, 6)
          : [];

        if (!title || !description) return null;

        return {
          title: title.slice(0, 140),
          category: allowedCategories.includes(category) ? category : 'RESALE',
          estimatedCostMin: Number.isFinite(costMin) && costMin > 0 ? Math.round(costMin) : 3500,
          estimatedCostMax: Number.isFinite(costMax) && costMax > 0 ? Math.round(costMax) : 7000,
          timeline,
          description: description.slice(0, 500),
          benefits,
          whyThisFits: whyThisFits.slice(0, 500),
          contractorType: contractorType.slice(0, 80),
          source: 'AI_ESTIMATE',
        };
      })
      .filter((rec): rec is RawModificationRecommendation => rec !== null);
  }

  private applyRegionalGuardrails(
    recommendations: RawModificationRecommendation[],
    state?: string | null,
  ): ModificationRecommendation[] {
    const stateKey = String(state || '').toUpperCase();
    const stateMultiplier = STATE_COST_MULTIPLIER[stateKey] ?? STATE_COST_MULTIPLIER.DEFAULT;

    return recommendations.map((rec) => {
      const baseline = this.findBaselineForCategory(rec.category, rec.title);
      const notes: string[] = [];

      const rawMin = Math.min(rec.estimatedCostMin, rec.estimatedCostMax);
      const rawMax = Math.max(rec.estimatedCostMin, rec.estimatedCostMax);
      const expectedCost = baseline
        ? baseline.cost * stateMultiplier
        : (rawMin + rawMax) / 2 || 5000;
      const baselineMin = roundCost(expectedCost * 0.7);
      const baselineMax = roundCost(expectedCost * 1.4);
      const rawRangeOutsideBaseline = rawMin > baselineMax || rawMax < baselineMin;
      const boundedMin = rawRangeOutsideBaseline
        ? baselineMin
        : roundCost(clamp(rawMin, baselineMin, baselineMax));
      const boundedMax = rawRangeOutsideBaseline
        ? baselineMax
        : roundCost(clamp(rawMax, Math.max(boundedMin, baselineMin), baselineMax));
      const costRangeWasAdjusted = boundedMin !== roundCost(rawMin) || boundedMax !== roundCost(rawMax);
      if (costRangeWasAdjusted) {
        notes.push(`Cost range adjusted to a broad ${stateKey || 'default'} state baseline.`);
      }
      notes.push('Actual cost depends on scope, site conditions, labor, materials, and contractor quotes.');
      notes.push('Permit applicability is unknown until the scope and local authority are verified.');

      return {
        title: rec.title,
        category: rec.category,
        costRange: {
          min: boundedMin,
          max: boundedMax,
          currency: 'USD',
        },
        timeline: rec.timeline,
        description: rec.description,
        benefits: rec.benefits,
        whyThisFits: rec.whyThisFits,
        professionalToConsult: rec.contractorType,
        permitGuidance: 'VERIFY_WITH_LOCAL_AUTHORITY',
        confidence: costRangeWasAdjusted ? 'LOW' : 'MEDIUM',
        source: rec.source ?? 'BASELINE_HEURISTIC',
        assumptions: [
          `State-level cost factor: ${stateMultiplier.toFixed(2)}.`,
          'The option has not been scoped, quoted, or checked against local requirements.',
        ],
        validation: {
          costModel: 'STATE_MULTIPLIER_BASELINE_V1',
          stateCostMultiplier: stateMultiplier,
          costRangeWasAdjusted,
          notes,
        },
      };
    });
  }

  private findBaselineForCategory(
    category: RecommendationCategory,
    title: string,
  ): { title: string; cost: number } | null {
    const catalog = COMMON_MODIFICATIONS[category] ?? [];
    if (catalog.length === 0) return null;
    const normalizedTitle = title.toLowerCase();
    const match = catalog.find((entry) => {
      const firstWord = entry.title.toLowerCase().split(' ')[0];
      return normalizedTitle.includes(firstWord);
    });
    return match ?? catalog[0];
  }

  private getBasicRecommendations(userNeeds: string[], propertyAge: number | null): RawModificationRecommendation[] {
    const recommendations: RawModificationRecommendation[] = [];
    const needsLower = userNeeds.map(n => n.toLowerCase()).join(' ');

    if (needsLower.includes('accessibility') || needsLower.includes('wheelchair')) {
      recommendations.push({
        title: 'Wheelchair Ramp Installation',
        category: 'ACCESSIBILITY',
        estimatedCostMin: 2500,
        estimatedCostMax: 5000,
        timeline: '1-2 weeks',
        description: 'Install an accessible ramp at the main entrance.',
        benefits: ['Wheelchair access', 'Improved safety', 'Universal design'],
        whyThisFits: 'Supports the selected accessibility and mobility goal.',
        contractorType: 'Accessibility Specialist',
        source: 'BASELINE_HEURISTIC',
      });
    }

    if (needsLower.includes('aging') || needsLower.includes('senior')) {
      recommendations.push({
        title: 'Walk-in Shower Conversion',
        category: 'AGING_IN_PLACE',
        estimatedCostMin: 4200,
        estimatedCostMax: 8400,
        timeline: '1-2 weeks',
        description: 'Convert a tub to a lower-barrier walk-in shower.',
        benefits: ['Safer bathing', 'Reduced fall risk', 'Easier access'],
        whyThisFits: 'Supports the selected aging-in-place goal by reducing bathing barriers.',
        contractorType: 'Bathroom Remodeler',
        source: 'BASELINE_HEURISTIC',
      });
    }

    if (needsLower.includes('family') || needsLower.includes('children') || needsLower.includes('baby')) {
      recommendations.push({
        title: 'Home Office Conversion',
        category: 'FAMILY',
        estimatedCostMin: 5600,
        estimatedCostMax: 11200,
        timeline: '2-3 weeks',
        description: 'Convert a spare room to a functional home office.',
        benefits: ['Dedicated workspace', 'Quieter work area', 'Flexible room use'],
        whyThisFits: 'Supports the selected family-space goal using an existing room.',
        contractorType: 'General Contractor',
        source: 'BASELINE_HEURISTIC',
      });
    }

    if (needsLower.includes('resale') || needsLower.includes('sell')) {
      recommendations.push({
        title: 'Kitchen Remodel',
        category: 'RESALE',
        estimatedCostMin: 17500,
        estimatedCostMax: 35000,
        timeline: '4-6 weeks',
        description: 'Update kitchen function, appliances, and finishes.',
        benefits: ['Updated function', 'Buyer appeal', 'Modern aesthetics'],
        whyThisFits: 'Supports the selected resale goal through a visible, high-use space.',
        contractorType: 'Kitchen Specialist',
        source: 'BASELINE_HEURISTIC',
      });
    }

    if (needsLower.includes('energy') || needsLower.includes('efficiency')) {
      recommendations.push({
        title: 'Smart Thermostat System',
        category: 'ENERGY',
        estimatedCostMin: 800,
        estimatedCostMax: 1700,
        timeline: '1 day',
        description: 'Install a connected HVAC control with scheduling capabilities.',
        benefits: ['Energy-use controls', 'Remote control', 'Potential comfort improvements'],
        whyThisFits: 'Supports the selected energy-efficiency goal with a limited-scope control upgrade.',
        contractorType: 'HVAC Technician',
        source: 'BASELINE_HEURISTIC',
      });
    }

    if (propertyAge !== null && propertyAge > 20) {
      recommendations.push({
        title: 'Energy-Efficient Windows',
        category: 'ENERGY',
        estimatedCostMin: 5600,
        estimatedCostMax: 11200,
        timeline: '2-3 weeks',
        description: 'Evaluate replacing older windows with higher-performance units.',
        benefits: ['Potential energy savings', 'Noise reduction', 'Improved comfort'],
        whyThisFits: 'The home age suggests window performance may be worth evaluating.',
        contractorType: 'Window Installer',
        source: 'BASELINE_HEURISTIC',
      });
    }

    recommendations.push({
      title: 'Smart Security System',
      category: 'SAFETY',
      estimatedCostMin: 1800,
      estimatedCostMax: 3500,
      timeline: '1 week',
      description: 'Compare connected security and monitoring options.',
      benefits: ['Security monitoring', 'Remote visibility', 'Configurable alerts'],
      whyThisFits: 'Provides a broadly applicable safety option to compare with the selected goals.',
      contractorType: 'Security Installer',
      source: 'BASELINE_HEURISTIC',
    });

    return recommendations.slice(0, 6);
  }
}

export const homeModificationAdvisorService = new HomeModificationAdvisorService();

// apps/backend/src/services/homeModificationAdvisor.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../config/database';

type RecommendationCategory = 'ACCESSIBILITY' | 'AGING_IN_PLACE' | 'FAMILY' | 'RESALE' | 'ENERGY' | 'SAFETY';
type RecommendationPriority = 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW';

interface ModificationRecommendation {
  title: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  estimatedCost: number;
  roi: number; // Percentage return on investment
  timeline: string;
  description: string;
  benefits: string[];
  contractorType: string;
  permitRequired: boolean;
  source?: 'AI_ESTIMATE' | 'BASELINE_HEURISTIC';
  confidence?: 'LOW' | 'MEDIUM';
  validation?: {
    costModel: 'STATE_MULTIPLIER_BASELINE_V1';
    roiModel: 'CATEGORY_ROI_BOUNDS_V1';
    stateCostMultiplier: number;
    costWasClamped: boolean;
    roiWasClamped: boolean;
    notes: string[];
  };
}

interface ModificationReport {
  propertyId: string;
  propertyAddress: string;
  userNeeds: string[];
  propertyAge: number;
  recommendations: ModificationRecommendation[];
  totalEstimatedCost: number;
  averageROI: number;
  quickWins: ModificationRecommendation[];
  longTermProjects: ModificationRecommendation[];
  meta: {
    classification: 'EDUCATIONAL_ESTIMATE';
    regionalCostModel: 'STATE_MULTIPLIER_BASELINE_V1';
    roiModel: 'CATEGORY_ROI_BOUNDS_V1';
    financialPlanningSafe: false;
    disclaimer: string;
  };
  generatedAt: Date;
}

const COMMON_MODIFICATIONS: Record<RecommendationCategory, Array<{ title: string; cost: number; roi: number }>> = {
  ACCESSIBILITY: [
    { title: 'Wheelchair Ramp Installation', cost: 3500, roi: 50 },
    { title: 'Walk-in Shower Conversion', cost: 6000, roi: 65 },
    { title: 'Grab Bars & Handrails', cost: 800, roi: 70 },
    { title: 'Widened Doorways', cost: 2500, roi: 60 },
  ],
  AGING_IN_PLACE: [
    { title: 'Zero-Step Entry', cost: 4500, roi: 55 },
    { title: 'Lever-Style Door Handles', cost: 600, roi: 80 },
    { title: 'Non-Slip Flooring', cost: 3500, roi: 65 },
    { title: 'Stair Lift Installation', cost: 8000, roi: 45 },
  ],
  FAMILY: [
    { title: 'Additional Bedroom', cost: 35000, roi: 85 },
    { title: 'Finished Basement', cost: 45000, roi: 75 },
    { title: 'Home Office Conversion', cost: 8000, roi: 70 },
    { title: 'Playroom/Nursery Update', cost: 5000, roi: 60 },
  ],
  RESALE: [
    { title: 'Kitchen Remodel', cost: 25000, roi: 80 },
    { title: 'Bathroom Renovation', cost: 15000, roi: 70 },
    { title: 'Curb Appeal Enhancement', cost: 5000, roi: 100 },
    { title: 'Deck/Patio Addition', cost: 12000, roi: 75 },
  ],
  ENERGY: [
    { title: 'Solar Panel Installation', cost: 18000, roi: 95 },
    { title: 'Smart Thermostat System', cost: 1200, roi: 120 },
    { title: 'Energy-Efficient Windows', cost: 8000, roi: 70 },
    { title: 'Insulation Upgrade', cost: 3500, roi: 110 },
  ],
  SAFETY: [
    { title: 'Smart Security System', cost: 2500, roi: 85 },
    { title: 'Outdoor Lighting Upgrade', cost: 1500, roi: 90 },
    { title: 'Fire Suppression System', cost: 4000, roi: 60 },
    { title: 'Radon Mitigation', cost: 2000, roi: 75 },
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

const ROI_BOUNDS: Record<RecommendationCategory, { min: number; max: number }> = {
  ACCESSIBILITY: { min: 20, max: 75 },
  AGING_IN_PLACE: { min: 25, max: 80 },
  FAMILY: { min: 35, max: 90 },
  RESALE: { min: 40, max: 100 },
  ENERGY: { min: 45, max: 115 },
  SAFETY: { min: 30, max: 90 },
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export class HomeModificationAdvisorService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[HOME-MODIFICATION] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async generateModificationReport(
    propertyId: string,
    userId: string,
    userNeeds: string[]
  ): Promise<ModificationReport> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    const propertyAge = property.yearBuilt 
      ? new Date().getFullYear() - property.yearBuilt 
      : 10;

    const rawRecommendations = await this.getAIRecommendations(
      property,
      userNeeds,
      propertyAge
    );
    const recommendations = this.applyRegionalGuardrails(
      rawRecommendations,
      property.state,
    );

    // Calculate totals
    const totalEstimatedCost = recommendations.reduce((sum, r) => sum + r.estimatedCost, 0);
    const averageROI = recommendations.length
      ? Math.round(recommendations.reduce((sum, r) => sum + r.roi, 0) / recommendations.length)
      : 0;

    // Categorize
    const quickWins = recommendations.filter(r => 
      r.priority === 'IMMEDIATE' || (r.estimatedCost < 5000 && r.roi > 80)
    );

    const longTermProjects = recommendations.filter(r => 
      r.estimatedCost > 10000 || r.timeline.includes('months')
    );

    return {
      propertyId,
      propertyAddress: property.address,
      userNeeds,
      propertyAge,
      recommendations: recommendations.sort((a, b) => {
        const priorityOrder = { 'IMMEDIATE': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }),
      totalEstimatedCost,
      averageROI,
      quickWins,
      longTermProjects,
      meta: {
        classification: 'EDUCATIONAL_ESTIMATE',
        regionalCostModel: 'STATE_MULTIPLIER_BASELINE_V1',
        roiModel: 'CATEGORY_ROI_BOUNDS_V1',
        financialPlanningSafe: false,
        disclaimer:
          'Costs and ROI are educational estimates calibrated with state-level baselines, not contractor bids or jurisdiction permit records.',
      },
      generatedAt: new Date(),
    };
  }

  private async getAIRecommendations(
    property: any,
    userNeeds: string[],
    propertyAge: number
  ): Promise<ModificationRecommendation[]> {
    if (!this.ai) {
      return this.getBasicRecommendations(userNeeds, propertyAge);
    }

    try {
      const prompt = `Analyze home modification needs and provide detailed recommendations:

Property Details:
- Type: ${property.propertyType}
- Age: ${propertyAge} years
- Location: ${property.city}, ${property.state}

User Needs/Goals:
${userNeeds.map((need, i) => `${i + 1}. ${need}`).join('\n')}

Provide 6-8 specific home modification recommendations. Return ONLY valid JSON (no markdown):
[
  {
    "title": "Kitchen Island Addition",
    "category": "FAMILY",
    "priority": "MEDIUM",
    "estimatedCost": 8000,
    "roi": 75,
    "timeline": "2-3 weeks",
    "description": "Add functional kitchen island with seating",
    "benefits": ["Extra counter space", "Casual dining area", "Increased storage"],
    "contractorType": "General Contractor",
    "permitRequired": false
  }
]

Categories: ACCESSIBILITY, AGING_IN_PLACE, FAMILY, RESALE, ENERGY, SAFETY
Priority: IMMEDIATE, HIGH, MEDIUM, LOW
Include diverse recommendations across categories.`;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 2000, temperature: 0.7 }
      });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const recommendations = JSON.parse(text);

      return this.normalizeRecommendationsFromAI(recommendations).slice(0, 8);

    } catch (error) {
      console.error('[HOME-MODIFICATION] AI error:', error);
      return this.getBasicRecommendations(userNeeds, propertyAge);
    }
  }

  private normalizeRecommendationsFromAI(input: unknown): ModificationRecommendation[] {
    if (!Array.isArray(input)) return [];
    const allowedCategories: RecommendationCategory[] = [
      'ACCESSIBILITY',
      'AGING_IN_PLACE',
      'FAMILY',
      'RESALE',
      'ENERGY',
      'SAFETY',
    ];
    const allowedPriorities: RecommendationPriority[] = ['IMMEDIATE', 'HIGH', 'MEDIUM', 'LOW'];

    return input
      .map((raw): ModificationRecommendation | null => {
        if (!raw || typeof raw !== 'object') return null;
        const rec = raw as Record<string, unknown>;
        const category = String(rec.category || '').toUpperCase() as RecommendationCategory;
        const priority = String(rec.priority || '').toUpperCase() as RecommendationPriority;
        const title = String(rec.title || '').trim();
        const description = String(rec.description || '').trim();
        const contractorType = String(rec.contractorType || 'General Contractor').trim() || 'General Contractor';
        const timeline = String(rec.timeline || '2-4 weeks').trim() || '2-4 weeks';
        const cost = Number(rec.estimatedCost);
        const roi = Number(rec.roi);
        const benefits = Array.isArray(rec.benefits)
          ? rec.benefits.map((b) => String(b).trim()).filter(Boolean).slice(0, 6)
          : [];
        const permitRequired = Boolean(rec.permitRequired);

        if (!title || !description) return null;

        return {
          title: title.slice(0, 140),
          category: allowedCategories.includes(category) ? category : 'RESALE',
          priority: allowedPriorities.includes(priority) ? priority : 'MEDIUM',
          estimatedCost: Number.isFinite(cost) && cost > 0 ? Math.round(cost) : 5000,
          roi: Number.isFinite(roi) ? Math.round(roi) : 60,
          timeline,
          description: description.slice(0, 500),
          benefits,
          contractorType: contractorType.slice(0, 80),
          permitRequired,
          source: 'AI_ESTIMATE',
        };
      })
      .filter((rec): rec is ModificationRecommendation => rec !== null);
  }

  private applyRegionalGuardrails(
    recommendations: ModificationRecommendation[],
    state?: string | null,
  ): ModificationRecommendation[] {
    const stateKey = String(state || '').toUpperCase();
    const stateMultiplier = STATE_COST_MULTIPLIER[stateKey] ?? STATE_COST_MULTIPLIER.DEFAULT;

    return recommendations.map((rec) => {
      const baseline = this.findBaselineForCategory(rec.category, rec.title);
      const notes: string[] = [];

      const fallbackCost = baseline ? baseline.cost * stateMultiplier : rec.estimatedCost || 5000;
      const expectedCost = Math.round(fallbackCost);
      const minCost = Math.round(expectedCost * 0.7);
      const maxCost = Math.round(expectedCost * 1.4);
      const rawCost = Number(rec.estimatedCost);
      const boundedCost = clamp(
        Number.isFinite(rawCost) && rawCost > 0 ? Math.round(rawCost) : expectedCost,
        Math.max(300, minCost),
        Math.max(500, maxCost),
      );
      const costWasClamped = boundedCost !== rawCost;
      if (costWasClamped) {
        notes.push(`Cost adjusted to state baseline range for ${stateKey || 'DEFAULT'}.`);
      }

      const roiBounds = ROI_BOUNDS[rec.category] ?? { min: 20, max: 100 };
      const fallbackRoi = baseline?.roi ?? Math.round((roiBounds.min + roiBounds.max) / 2);
      const rawRoi = Number(rec.roi);
      const boundedRoi = clamp(
        Number.isFinite(rawRoi) ? Math.round(rawRoi) : fallbackRoi,
        roiBounds.min,
        roiBounds.max,
      );
      const roiWasClamped = boundedRoi !== rawRoi;
      if (roiWasClamped) {
        notes.push('ROI adjusted to category guardrail range.');
      }

      if (rec.permitRequired) {
        notes.push('Permit requirement is informational and should be verified with local jurisdiction.');
      }

      return {
        ...rec,
        estimatedCost: boundedCost,
        roi: boundedRoi,
        confidence: costWasClamped || roiWasClamped ? 'LOW' : 'MEDIUM',
        source: rec.source ?? 'BASELINE_HEURISTIC',
        validation: {
          costModel: 'STATE_MULTIPLIER_BASELINE_V1',
          roiModel: 'CATEGORY_ROI_BOUNDS_V1',
          stateCostMultiplier: stateMultiplier,
          costWasClamped,
          roiWasClamped,
          notes,
        },
      };
    });
  }

  private findBaselineForCategory(
    category: RecommendationCategory,
    title: string,
  ): { title: string; cost: number; roi: number } | null {
    const catalog = COMMON_MODIFICATIONS[category] ?? [];
    if (catalog.length === 0) return null;
    const normalizedTitle = title.toLowerCase();
    const match = catalog.find((entry) => {
      const firstWord = entry.title.toLowerCase().split(' ')[0];
      return normalizedTitle.includes(firstWord);
    });
    return match ?? catalog[0];
  }

  private getBasicRecommendations(userNeeds: string[], propertyAge: number): ModificationRecommendation[] {
    const recommendations: ModificationRecommendation[] = [];

    // Map user needs to categories
    const needsLower = userNeeds.map(n => n.toLowerCase()).join(' ');

    if (needsLower.includes('accessibility') || needsLower.includes('wheelchair')) {
      recommendations.push({
        title: 'Wheelchair Ramp Installation',
        category: 'ACCESSIBILITY',
        priority: 'HIGH',
        estimatedCost: 3500,
        roi: 50,
        timeline: '1-2 weeks',
        description: 'Install ADA-compliant wheelchair ramp at main entrance',
        benefits: ['Wheelchair access', 'Improved safety', 'Universal design'],
        contractorType: 'Accessibility Specialist',
        permitRequired: true,
        source: 'BASELINE_HEURISTIC',
      });
    }

    if (needsLower.includes('aging') || needsLower.includes('senior')) {
      recommendations.push({
        title: 'Walk-in Shower Conversion',
        category: 'AGING_IN_PLACE',
        priority: 'HIGH',
        estimatedCost: 6000,
        roi: 65,
        timeline: '1-2 weeks',
        description: 'Convert tub to zero-threshold walk-in shower',
        benefits: ['Safer bathing', 'Reduced fall risk', 'Modern look'],
        contractorType: 'Bathroom Remodeler',
        permitRequired: false,
        source: 'BASELINE_HEURISTIC',
      });
    }

    if (needsLower.includes('family') || needsLower.includes('children') || needsLower.includes('baby')) {
      recommendations.push({
        title: 'Home Office Conversion',
        category: 'FAMILY',
        priority: 'MEDIUM',
        estimatedCost: 8000,
        roi: 70,
        timeline: '2-3 weeks',
        description: 'Convert spare room to functional home office',
        benefits: ['Work from home capability', 'Quiet workspace', 'Increased productivity'],
        contractorType: 'General Contractor',
        permitRequired: false,
        source: 'BASELINE_HEURISTIC',
      });
    }

    if (needsLower.includes('resale') || needsLower.includes('sell')) {
      recommendations.push({
        title: 'Kitchen Remodel',
        category: 'RESALE',
        priority: 'HIGH',
        estimatedCost: 25000,
        roi: 80,
        timeline: '4-6 weeks',
        description: 'Update kitchen with modern appliances and finishes',
        benefits: ['Increased home value', 'Better buyer appeal', 'Modern aesthetics'],
        contractorType: 'Kitchen Specialist',
        permitRequired: true,
        source: 'BASELINE_HEURISTIC',
      });
    }

    if (needsLower.includes('energy') || needsLower.includes('efficiency')) {
      recommendations.push({
        title: 'Smart Thermostat System',
        category: 'ENERGY',
        priority: 'IMMEDIATE',
        estimatedCost: 1200,
        roi: 120,
        timeline: '1 day',
        description: 'Install smart HVAC control with learning capabilities',
        benefits: ['Lower energy bills', 'Remote control', 'Reduced carbon footprint'],
        contractorType: 'HVAC Technician',
        permitRequired: false,
        source: 'BASELINE_HEURISTIC',
      });
    }

    // Add universal recommendations
    if (propertyAge > 20) {
      recommendations.push({
        title: 'Energy-Efficient Windows',
        category: 'ENERGY',
        priority: 'MEDIUM',
        estimatedCost: 8000,
        roi: 70,
        timeline: '2-3 weeks',
        description: 'Replace old windows with double-pane energy efficient models',
        benefits: ['Lower heating costs', 'Noise reduction', 'Increased comfort'],
        contractorType: 'Window Installer',
        permitRequired: false,
        source: 'BASELINE_HEURISTIC',
      });
    }

    recommendations.push({
      title: 'Smart Security System',
      category: 'SAFETY',
      priority: 'MEDIUM',
      estimatedCost: 2500,
      roi: 85,
      timeline: '1 week',
      description: 'Install comprehensive smart home security system',
      benefits: ['Enhanced security', 'Remote monitoring', 'Insurance discounts'],
      contractorType: 'Security Installer',
      permitRequired: false,
      source: 'BASELINE_HEURISTIC',
    });

    return recommendations.slice(0, 6);
  }
}

export const homeModificationAdvisorService = new HomeModificationAdvisorService();

// apps/backend/src/services/applianceOracle.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../lib/prisma';
// [NEW IMPORT] Import AI constants
import { 
  LLM_MODEL_CONFIG, 
  ORACLE_RECOMMENDATION_PROMPT_TEMPLATE 
} from '../config/ai-constants';
import { listPropertyAppliancesAsHomeAssets } from './propertyApplianceInventory.service';

interface ApplianceFailurePrediction {
  applianceName: string;
  category: string;
  currentAge: number;
  expectedLife: number;
  remainingLife: number;
  failureRisk: number; // 0-100%
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedFailureDate: Date;
  replacementCost: number;
  recommendations: ApplianceRecommendation[];
  maintenanceImpact: string;
}

interface ApplianceRecommendation {
  brand: string;
  model: string;
  features: string[];
  estimatedCost: number;
  energyRating: string;
  warranty: string;
  reasoning: string;
}

interface OracleReport {
  propertyId: string;
  propertyAddress: string;
  totalAppliances: number;
  criticalCount: number;
  highRiskCount: number;
  estimatedTotalCost: number;
  predictions: ApplianceFailurePrediction[];
  generatedAt: Date;
}

const APPLIANCE_LIFESPAN_DATA = {
  'HVAC': { avgLife: 15, variance: 3, category: 'HVAC' },
  'HVAC Furnace': { avgLife: 15, variance: 3, category: 'HVAC' },
  'HVAC Air Conditioner': { avgLife: 15, variance: 3, category: 'HVAC' },
  'Water Heater': { avgLife: 10, variance: 2, category: 'PLUMBING' },
  'Water Heater (Tank)': { avgLife: 10, variance: 2, category: 'PLUMBING' },
  'Water Heater (Tankless)': { avgLife: 20, variance: 3, category: 'PLUMBING' },
  'Refrigerator': { avgLife: 13, variance: 2, category: 'APPLIANCE' },
  'Dishwasher': { avgLife: 10, variance: 2, category: 'APPLIANCE' },
  'Washer': { avgLife: 11, variance: 2, category: 'APPLIANCE' },
  'Dryer': { avgLife: 13, variance: 2, category: 'APPLIANCE' },
  'Oven': { avgLife: 15, variance: 3, category: 'APPLIANCE' },
  'Range': { avgLife: 15, variance: 3, category: 'APPLIANCE' },
  'Microwave': { avgLife: 9, variance: 1, category: 'APPLIANCE' },
  'Garbage Disposal': { avgLife: 12, variance: 2, category: 'PLUMBING' },
  'Roof': { avgLife: 20, variance: 5, category: 'ROOFING' },
};

const REPLACEMENT_COST_ESTIMATES = {
  'HVAC': 5500,
  'HVAC Furnace': 4500,
  'HVAC Air Conditioner': 5000,
  'Water Heater': 1200,
  'Water Heater (Tank)': 1200,
  'Water Heater (Tankless)': 2500,
  'Refrigerator': 1500,
  'Dishwasher': 800,
  'Washer': 900,
  'Dryer': 850,
  'Oven': 1200,
  'Range': 1200,
  'Microwave': 300,
  'Garbage Disposal': 400,
  'Roof': 12000,
};

export class ApplianceOracleService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[APPLIANCE-ORACLE] GEMINI_API_KEY not set - recommendations will be basic');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async generateOracleReport(propertyId: string, userId: string): Promise<OracleReport> {
    // Get property with all appliance data
    const property = await prisma.property.findFirst({
      where: { id: propertyId, homeownerProfile: { userId } },
      include: {
        homeownerProfile: true,
        // REMOVED: homeAssets: true
      }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }
    
    const homeAssets = await listPropertyAppliancesAsHomeAssets(propertyId);  // ✅ NEW

    if (!Array.isArray(homeAssets) || homeAssets.length === 0) {
      return {
        propertyId,
        propertyAddress: property.address,
        totalAppliances: 0,
        criticalCount: 0,
        highRiskCount: 0,
        estimatedTotalCost: 0,
        predictions: [],
        generatedAt: new Date(),
      };
    }

    // Analyze each appliance
    const predictions: ApplianceFailurePrediction[] = [];

    for (const asset of homeAssets) {
      const prediction = await this.analyzeSingleAppliance(asset, property);
      if (prediction) {
        predictions.push(prediction);
      }
    }

    // Sort by urgency and failure risk
    predictions.sort((a, b) => {
      const urgencyOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      return b.failureRisk - a.failureRisk;
    });

    // Calculate summary stats
    const criticalCount = predictions.filter(p => p.urgency === 'CRITICAL').length;
    const highRiskCount = predictions.filter(p => p.urgency === 'HIGH').length;
    const estimatedTotalCost = predictions
      .filter(p => p.urgency === 'CRITICAL' || p.urgency === 'HIGH')
      .reduce((sum, p) => sum + p.replacementCost, 0);

    return {
      propertyId,
      propertyAddress: property.address,
      totalAppliances: predictions.length,
      criticalCount,
      highRiskCount,
      estimatedTotalCost,
      predictions,
      generatedAt: new Date(),
    };
  }

  private async analyzeSingleAppliance(
    asset: any, 
    property: any
  ): Promise<ApplianceFailurePrediction | null> {
    const applianceName = asset.assetType || asset.name || asset.type || 'Unknown';
    // Calculate age from installationYear if available
    const currentYear = new Date().getFullYear();
    const age = asset.installationYear 
      ? currentYear - asset.installationYear 
      : (asset.age || 0);

    if (age === 0) return null; // Skip if no age data

    // Get lifespan data
    const lifespanData = this.getLifespanData(applianceName);
    const expectedLife = lifespanData.avgLife;
    const category = lifespanData.category;

    // Calculate remaining life and failure risk
    const remainingLife = Math.max(0, expectedLife - age);
    const ageRatio = age / expectedLife;
    
    // Failure risk calculation (exponential curve)
    let failureRisk = 0;
    if (ageRatio < 0.5) {
      failureRisk = ageRatio * 10; // 0-5% risk in first half of life
    } else if (ageRatio < 0.75) {
      failureRisk = 5 + (ageRatio - 0.5) * 40; // 5-15% in 50-75% range
    } else if (ageRatio < 1.0) {
      failureRisk = 15 + (ageRatio - 0.75) * 100; // 15-40% in 75-100% range
    } else {
      failureRisk = 40 + Math.min(60, (ageRatio - 1.0) * 120); // 40-100% past expected life
    }

    failureRisk = Math.min(100, Math.max(0, failureRisk));

    // Determine urgency
    let urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (failureRisk >= 75 || remainingLife <= 0) {
      urgency = 'CRITICAL';
    } else if (failureRisk >= 50 || remainingLife <= 2) {
      urgency = 'HIGH';
    } else if (failureRisk >= 25 || remainingLife <= 5) {
      urgency = 'MEDIUM';
    } else {
      urgency = 'LOW';
    }

    // Estimate failure date
    const monthsRemaining = remainingLife * 12;
    const estimatedFailureDate = new Date();
    estimatedFailureDate.setMonth(estimatedFailureDate.getMonth() + Math.max(0, monthsRemaining));

    // Get replacement cost
    const replacementCost = this.getReplacementCost(applianceName);

    // Generate AI recommendations
    const recommendations = await this.getAIRecommendations(
      applianceName,
      category,
      replacementCost,
      property
    );

    // Maintenance impact
    const maintenanceImpact = this.getMaintenanceImpact(failureRisk, urgency);

    return {
      applianceName,
      category,
      currentAge: age,
      expectedLife,
      remainingLife,
      failureRisk: Math.round(failureRisk),
      urgency,
      estimatedFailureDate,
      replacementCost,
      recommendations,
      maintenanceImpact,
    };
  }

  private getLifespanData(applianceName: string): { avgLife: number; variance: number; category: string } {
    // Try exact match first
    if (APPLIANCE_LIFESPAN_DATA[applianceName as keyof typeof APPLIANCE_LIFESPAN_DATA]) {
      return APPLIANCE_LIFESPAN_DATA[applianceName as keyof typeof APPLIANCE_LIFESPAN_DATA];
    }

    // Try partial match
    const nameLower = applianceName.toLowerCase();
    for (const [key, value] of Object.entries(APPLIANCE_LIFESPAN_DATA)) {
      if (nameLower.includes(key.toLowerCase()) || key.toLowerCase().includes(nameLower)) {
        return value;
      }
    }

    // Default
    return { avgLife: 12, variance: 2, category: 'APPLIANCE' };
  }

  private getReplacementCost(applianceName: string): number {
    // Try exact match
    if (REPLACEMENT_COST_ESTIMATES[applianceName as keyof typeof REPLACEMENT_COST_ESTIMATES]) {
      return REPLACEMENT_COST_ESTIMATES[applianceName as keyof typeof REPLACEMENT_COST_ESTIMATES];
    }

    // Try partial match
    const nameLower = applianceName.toLowerCase();
    for (const [key, value] of Object.entries(REPLACEMENT_COST_ESTIMATES)) {
      if (nameLower.includes(key.toLowerCase()) || key.toLowerCase().includes(nameLower)) {
        return value;
      }
    }

    // Default estimate
    return 1000;
  }

  private async getAIRecommendations(
    applianceName: string,
    category: string,
    budget: number,
    property: any
  ): Promise<ApplianceRecommendation[]> {
    if (!this.ai) {
      // Fallback recommendations without AI
      return this.getBasicRecommendations(applianceName, budget);
    }

    try {
      // [REFACTORED] Use imported template function
      const prompt = ORACLE_RECOMMENDATION_PROMPT_TEMPLATE(applianceName, budget, property);

      const response = await this.ai.models.generateContent({
        // [REFACTORED] Use constant for model
        model: LLM_MODEL_CONFIG.ADVANCED_MODEL,
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }],
        config: {
          // [REFACTORED] Use constant for maxOutputTokens
          maxOutputTokens: LLM_MODEL_CONFIG.ORACLE_MAX_TOKENS,
          // [REFACTORED] Use constant for temperature
          temperature: LLM_MODEL_CONFIG.RECOMMENDATION_TEMPERATURE,
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('AI service returned an empty response');
      }
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const recommendations = JSON.parse(cleanedText);

      return recommendations.slice(0, 3);
    } catch (error) {
      console.error('[APPLIANCE-ORACLE] AI recommendation error:', error);
      return this.getBasicRecommendations(applianceName, budget);
    }
  }

  private getBasicRecommendations(applianceName: string, budget: number): ApplianceRecommendation[] {
    // Fallback recommendations
    const nameLower = applianceName.toLowerCase();
    
    if (nameLower.includes('hvac') || nameLower.includes('furnace')) {
      return [
        {
          brand: 'Carrier',
          model: 'Infinity Series',
          features: ['Variable speed', 'Smart thermostat compatible', 'SEER 20+'],
          estimatedCost: Math.round(budget),
          energyRating: 'Energy Star Certified',
          warranty: '10 year parts',
          reasoning: 'Industry-leading efficiency and reliability'
        }
      ];
    }

    if (nameLower.includes('water heater')) {
      return [
        {
          brand: 'Rheem',
          model: 'Performance Platinum',
          features: ['50 gallon capacity', 'Self-cleaning', 'Leak detection'],
          estimatedCost: Math.round(budget),
          energyRating: 'Energy Factor 0.95',
          warranty: '10 year tank, 1 year parts',
          reasoning: 'Excellent value with long warranty'
        }
      ];
    }

    // Generic recommendation
    return [
      {
        brand: 'Major Brand',
        model: 'Premium Model',
        features: ['Energy efficient', 'Reliable', 'Good warranty'],
        estimatedCost: Math.round(budget),
        energyRating: 'Energy Star',
        warranty: '5-10 years',
        reasoning: 'Consult a professional for specific recommendations'
      }
    ];
  }

  private getMaintenanceImpact(failureRisk: number, urgency: string): string {
    if (urgency === 'CRITICAL') {
      return 'Replace immediately to avoid emergency failure and higher costs';
    }
    if (urgency === 'HIGH') {
      return 'Schedule replacement within 6 months. Budget accordingly';
    }
    if (urgency === 'MEDIUM') {
      return 'Plan replacement in 1-2 years. Start researching options';
    }
    return 'Monitor condition. No immediate action needed';
  }
}

export const applianceOracleService = new ApplianceOracleService();
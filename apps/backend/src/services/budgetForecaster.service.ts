// apps/backend/src/services/budgetForecaster.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../lib/prisma';
// [NEW IMPORT] Import AI and business logic constants
import { 
  LLM_MODEL_CONFIG, 
  BUDGET_RECOMMENDATION_PROMPT_TEMPLATE,
  MONTHLY_BASE_COSTS, 
  SEASONAL_TASKS, 
  MAINTENANCE_CATEGORY_BREAKDOWN 
} from '../config/ai-constants';

interface MonthlyForecast {
  month: string;
  routine: number;
  preventive: number;
  unexpected: number;
  total: number;
  tasks: string[];
}

interface CategoryBreakdown {
  category: string;
  annualCost: number;
  percentage: number;
  items: string[];
}

interface BudgetForecast {
  propertyId: string;
  propertyAddress: string;
  propertyAge: number;
  totalAnnualCost: number;
  monthlyAverage: number;
  confidenceLevel: number;
  monthlyForecasts: MonthlyForecast[];
  categoryBreakdowns: CategoryBreakdown[];
  recommendations: string[];
  generatedAt: Date;
}

// [REMOVED HARDCODED CONSTANTS: MONTHLY_BASE_COSTS and SEASONAL_TASKS]

export class BudgetForecasterService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[BUDGET-FORECASTER] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async generateBudgetForecast(propertyId: string, userId: string): Promise<BudgetForecast> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      },
      include: {
        homeownerProfile: true,
        homeAssets: true
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    // Calculate property age
    const propertyAge = property.yearBuilt 
      ? new Date().getFullYear() - property.yearBuilt 
      : 10;

    // Get base monthly cost
    // [REFACTORED] Use imported constant
    const baseMonthlyCost = MONTHLY_BASE_COSTS[property.propertyType as keyof typeof MONTHLY_BASE_COSTS] || 150;

    // Age multiplier (older homes cost more)
    const ageMultiplier = 1 + (propertyAge / 100);

    // Generate monthly forecasts
    const monthlyForecasts = await this.generateMonthlyForecasts(
      property,
      baseMonthlyCost,
      ageMultiplier
    );

    // Calculate totals
    const totalAnnualCost = monthlyForecasts.reduce((sum, m) => sum + m.total, 0);
    const monthlyAverage = totalAnnualCost / 12;

    // Generate category breakdowns
    const categoryBreakdowns = this.generateCategoryBreakdowns(property, totalAnnualCost);

    // Get AI recommendations
    const recommendations = await this.getAIRecommendations(property, totalAnnualCost, propertyAge);

    // Confidence level (higher for more data)
    const homeAssets = property.homeAssets || [];
    const confidenceLevel = Math.min(95, 60 + (homeAssets.length * 5));

    return {
      propertyId,
      propertyAddress: property.address,
      propertyAge,
      totalAnnualCost: Math.round(totalAnnualCost),
      monthlyAverage: Math.round(monthlyAverage),
      confidenceLevel,
      monthlyForecasts,
      categoryBreakdowns,
      recommendations,
      generatedAt: new Date(),
    };
  }

  private async generateMonthlyForecasts(
    property: any,
    baseCost: number,
    ageMultiplier: number
  ): Promise<MonthlyForecast[]> {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const forecasts: MonthlyForecast[] = [];

    for (let i = 0; i < 12; i++) {
      const month = months[i];
      // [REFACTORED] Use imported constant
      const seasonalTasks = SEASONAL_TASKS[month as keyof typeof SEASONAL_TASKS] || [];

      // Seasonal variation
      let seasonalMultiplier = 1.0;
      if (['March', 'April', 'May'].includes(month)) seasonalMultiplier = 1.2; // Spring prep
      if (['September', 'October', 'November'].includes(month)) seasonalMultiplier = 1.3; // Fall/winter prep
      if (['June', 'July', 'August'].includes(month)) seasonalMultiplier = 1.1; // Summer

      const routine = Math.round(baseCost * 0.5 * seasonalMultiplier * ageMultiplier);
      const preventive = Math.round(baseCost * 0.3 * seasonalMultiplier * ageMultiplier);
      const unexpected = Math.round(baseCost * 0.2 * (0.8 + Math.random() * 0.4) * ageMultiplier);

      forecasts.push({
        month,
        routine,
        preventive,
        unexpected,
        total: routine + preventive + unexpected,
        tasks: seasonalTasks
      });
    }

    return forecasts;
  }

  private generateCategoryBreakdowns(property: any, totalAnnual: number): CategoryBreakdown[] {
    const homeAssets = property.homeAssets || [];
    
    // [REFACTORED] Use imported constant
    const categories = MAINTENANCE_CATEGORY_BREAKDOWN;

    // Adjust percentages based on property specifics
    if (homeAssets.length > 0) {
      // Custom logic based on actual appliances
    }

    return categories.map(cat => ({
      category: cat.category,
      annualCost: Math.round(totalAnnual * (cat.percentage / 100)),
      percentage: cat.percentage,
      items: cat.items
    }));
  }

  private async getAIRecommendations(
    property: any,
    totalAnnual: number,
    propertyAge: number
  ): Promise<string[]> {
    if (!this.ai) {
      return this.getBasicRecommendations(totalAnnual, propertyAge);
    }

    try {
      // [REFACTORED] Use imported template function
      const prompt = BUDGET_RECOMMENDATION_PROMPT_TEMPLATE(property, totalAnnual, propertyAge);

      const response = await this.ai.models.generateContent({
        // [REFACTORED] Use constant for model
        model: LLM_MODEL_CONFIG.ADVANCED_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { 
          // [REFACTORED] Use constant for maxOutputTokens
          maxOutputTokens: LLM_MODEL_CONFIG.BUDGET_MAX_TOKENS, 
          // [REFACTORED] Use constant for temperature
          temperature: LLM_MODEL_CONFIG.RECOMMENDATION_TEMPERATURE 
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('AI service returned an empty response');
      }
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const recommendations = JSON.parse(cleanedText);
      return recommendations.slice(0, 5);
    } catch (error) {
      console.error('[BUDGET-FORECASTER] AI error:', error);
      return this.getBasicRecommendations(totalAnnual, propertyAge);
    }
  }

  private getBasicRecommendations(totalAnnual: number, propertyAge: number): string[] {
    const recommendations = [
      'Set aside 1% of home value annually for maintenance',
      'Schedule seasonal HVAC maintenance to prevent costly repairs',
      'Build an emergency fund equal to 3 months of maintenance costs',
    ];

    if (propertyAge > 15) {
      recommendations.push('Consider upgrading aging systems to reduce repair frequency');
    }

    if (totalAnnual > 3000) {
      recommendations.push('Review service contracts for potential bundling discounts');
    } else {
      recommendations.push('Track all maintenance expenses to identify cost patterns');
    }

    return recommendations;
  }
}

export const budgetForecasterService = new BudgetForecasterService();
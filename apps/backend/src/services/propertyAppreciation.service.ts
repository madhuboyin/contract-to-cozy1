// apps/backend/src/services/propertyAppreciation.service.ts

// --- FIX: TypeScript declaration for the 'google' tool ---
declare const google: {
  search: (params: { queries: string[] }) => Promise<{ result: string }>;
};
// --- END FIX ---

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../config/database';

interface AppreciationDataPoint {
  date: string;
  value: number;
  source: 'USER_INPUT' | 'AI_ESTIMATE' | 'MARKET_TREND';
}

interface AppreciationReport {
  propertyId: string;
  propertyAddress: string;
  purchasePrice: number;
  purchaseDate: string;
  currentEstimatedValue: number;
  totalAppreciation: number;
  totalAppreciationPercent: number;
  annualAppreciationRate: number;
  historicalData: AppreciationDataPoint[];
  projectedValues: AppreciationDataPoint[];
  marketComparison: {
    propertyPerformance: number;
    regionalAverage: number;
    nationalAverage: number;
  };
  insights: string[];
  generatedAt: Date;
}

// FHFA House Price Index data (simplified - in production, fetch from API or database)
const REGIONAL_APPRECIATION_RATES: Record<string, number> = {
  // Annual appreciation rates by state (2023 averages)
  'CA': 4.2,
  'TX': 5.8,
  'FL': 6.5,
  'NY': 3.5,
  'PA': 2.8,
  'IL': 3.1,
  'OH': 4.0,
  'GA': 5.2,
  'NC': 4.9,
  'MI': 4.3,
  'NJ': 3.2,
  'VA': 4.1,
  'WA': 5.0,
  'AZ': 6.2,
  'MA': 3.8,
  'TN': 5.5,
  'IN': 4.4,
  'MO': 3.9,
  'MD': 3.6,
  'WI': 3.7,
  // National average
  'DEFAULT': 4.5,
};

export class PropertyAppreciationService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[APPRECIATION] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async generateAppreciationReport(
    propertyId: string,
    userId: string,
    purchasePrice?: number,
    purchaseDate?: string
  ): Promise<AppreciationReport> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    // Require user to provide purchase price
    if (!purchasePrice) {
        throw new Error('Purchase price is required');
    }
    
    const finalPurchasePrice = purchasePrice;
    const finalPurchaseDate = purchaseDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    
    // Get regional appreciation rate
    const regionalRate = REGIONAL_APPRECIATION_RATES[property.state] || REGIONAL_APPRECIATION_RATES['DEFAULT'];
    const nationalRate = REGIONAL_APPRECIATION_RATES['DEFAULT'];

    // Calculate time since purchase
    const purchaseDateObj = new Date(finalPurchaseDate);
    const today = new Date();
    const yearsOwned = (today.getTime() - purchaseDateObj.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    // === START ENHANCEMENT (OPTION 1) ===

    let localMarketContext = '';
    
    try {
        // Step 1: Perform targeted Google Search for median home value (best proxy for comps)
        const zipCode = property.zipCode || property.state; // Fallback to state if zip not available
        const searchQuery = `median home value ${property.city}, ${property.state} zip code ${zipCode} Zillow Redfin`;
        
        const searchResults = await google.search({ 
            queries: [searchQuery] 
        });
        
        localMarketContext = searchResults.result;
    } catch (error) {
        console.error('[APPRECIATION] Google Search error:', error);
        // Fail gracefully: if search fails, localMarketContext remains empty string, and AI uses fallback logic.
    }

    // Step 2: Estimate current value using compound growth, now with augmented context
    const currentEstimatedValue = await this.estimateCurrentValue(
      property,
      finalPurchasePrice,
      yearsOwned,
      regionalRate,
      localMarketContext // <--- NEW ARGUMENT PASSED
    );

    // === END ENHANCEMENT (OPTION 1) ===


    const totalAppreciation = currentEstimatedValue - finalPurchasePrice;
    const totalAppreciationPercent = (totalAppreciation / finalPurchasePrice) * 100;
    const annualAppreciationRate = yearsOwned > 0 
      ? Math.pow(currentEstimatedValue / finalPurchasePrice, 1 / yearsOwned) * 100 - 100 
      : 0;

    // Generate historical data points
    const historicalData = this.generateHistoricalData(
      finalPurchasePrice,
      purchaseDateObj,
      today,
      regionalRate
    );

    // Project future values
    const projectedValues = this.generateProjectedValues(
      currentEstimatedValue,
      regionalRate,
      5 // 5 years projection
    );

    // Get AI insights
    const insights = await this.getAIInsights(
      property,
      finalPurchasePrice,
      currentEstimatedValue,
      annualAppreciationRate,
      regionalRate
    );

    return {
      propertyId,
      propertyAddress: property.address,
      purchasePrice: finalPurchasePrice,
      purchaseDate: finalPurchaseDate,
      currentEstimatedValue: Math.round(currentEstimatedValue),
      totalAppreciation: Math.round(totalAppreciation),
      totalAppreciationPercent: Math.round(totalAppreciationPercent * 100) / 100,
      annualAppreciationRate: Math.round(annualAppreciationRate * 100) / 100,
      historicalData,
      projectedValues,
      marketComparison: {
        propertyPerformance: annualAppreciationRate,
        regionalAverage: regionalRate,
        nationalAverage: nationalRate,
      },
      insights,
      generatedAt: new Date(),
    };
  }

  private async estimateCurrentValue(
    property: any,
    purchasePrice: number,
    yearsOwned: number,
    regionalRate: number,
    localMarketContext: string 
  ): Promise<number> {
    const fallbackValue = purchasePrice * Math.pow(1 + regionalRate / 100, yearsOwned);

    if (!this.ai) {
      // Simple compound growth if no AI
      return fallbackValue;
    }

    try {
      // Step 3: Prompt updated for maximum output strictness
      const prompt = `You are an expert, data-driven real estate valuation algorithm (like Zillow's Zestimate or Redfin's Estimate). Your goal is to determine the highest probable *current market selling price* that is consistent with local market data, NOT simply applying the baseline regional growth rate.

Purchase Price: $${purchasePrice.toLocaleString()}
Purchase Date: ${yearsOwned.toFixed(1)} years ago
Location: ${property.city}, ${property.state} ${property.zipCode || ''}
Property Type: ${property.propertyType}
Square Footage: ${property.squareFootage || 'Unknown'}
Year Built: ${property.yearBuilt || 'Unknown'}
FHFA Baseline Regional Appreciation Rate: ${regionalRate}% annually

---
CRITICAL LOCAL MARKET DATA (From Current Web Search for ${property.city}, ${property.state}):
${localMarketContext || 'No specific local data was found. Use only the provided FHFA baseline and general market knowledge.'}
---

Consider:
1. **Location Market Dynamics:** Prioritize the "CRITICAL LOCAL MARKET DATA" (which includes current median home values) as the most recent and localized indicator of value over the baseline rate. This is essential for matching competitive estimates like Zillow/Redfin.
2. **Property Characteristics:** Adjust the appreciation rate based on the age, size, and type of the specific property.
3. **Goal:** The valuation must be realistic for a competitive market.

**FINAL OUTPUT INSTRUCTION: The estimated price is required to be a single, clean integer number. Output nothing else. Do not include any text, dollar signs, commas, periods, or leading/trailing whitespace. THE OUTPUT MUST BE ONLY THE RAW NUMBER.**

`; 

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 100, temperature: 0.3 }
      });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      // === CRITICAL FIX: Ultra-Robust Parsing Logic ===
      const rawResponse = response.text.trim();
      
      // 1. Find the first continuous sequence of digits (with optional commas/decimals)
      const match = rawResponse.match(/(\d[\d,.]*)/); 
      
      let estimatedValue: number = NaN;
      if (match && match[0]) {
          // 2. Remove commas (if the AI used them) and then parse
          const cleanNumberString = match[0].replace(/,/g, ''); 
          estimatedValue = parseFloat(cleanNumberString);
          // For property values, we typically want an integer (rounded)
          estimatedValue = Math.round(estimatedValue); 
      }
      // === END CRITICAL FIX ===
      
      if (isNaN(estimatedValue) || estimatedValue < purchasePrice * 0.5 || estimatedValue > purchasePrice * 3) {
        // Fallback if AI gives unreasonable value or is unparsable (i.e., NaN)
        console.warn(`[APPRECIATION] AI estimate unparsable (NaN) or out of bounds. Estimated: ${estimatedValue}. Falling back to regional rate (${Math.round(fallbackValue)}).`);
        return fallbackValue;
      }
      
      return estimatedValue;

    } catch (error) {
      console.error('[APPRECIATION] AI estimation error, forcing fallback:', error);
      return fallbackValue;
    }
  }

  private generateHistoricalData(
    purchasePrice: number,
    purchaseDate: Date,
    currentDate: Date,
    appreciationRate: number
  ): AppreciationDataPoint[] {
    const dataPoints: AppreciationDataPoint[] = [];
    const monthsBetween = Math.ceil((currentDate.getTime() - purchaseDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
    
    // Generate quarterly data points
    const quarterlyIntervals = Math.min(Math.ceil(monthsBetween / 3), 20); // Max 20 points

    for (let i = 0; i <= quarterlyIntervals; i++) {
      const date = new Date(purchaseDate);
      date.setMonth(date.getMonth() + (i * 3));
      
      const yearsElapsed = (date.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      const value = purchasePrice * Math.pow(1 + appreciationRate / 100, yearsElapsed);

      dataPoints.push({
        date: date.toISOString().split('T')[0],
        value: Math.round(value),
        source: i === 0 ? 'USER_INPUT' : 'MARKET_TREND'
      });
    }

    return dataPoints;
  }

  private generateProjectedValues(
    currentValue: number,
    appreciationRate: number,
    years: number
  ): AppreciationDataPoint[] {
    const projections: AppreciationDataPoint[] = [];
    
    for (let year = 1; year <= years; year++) {
      const date = new Date();
      date.setFullYear(date.getFullYear() + year);
      
      const projectedValue = currentValue * Math.pow(1 + appreciationRate / 100, year);
      
      projections.push({
        date: date.toISOString().split('T')[0],
        value: Math.round(projectedValue),
        source: 'AI_ESTIMATE'
      });
    }

    return projections;
  }

  private async getAIInsights(
    property: any,
    purchasePrice: number,
    currentValue: number,
    annualRate: number,
    regionalRate: number
  ): Promise<string[]> {
    if (!this.ai) {
      return this.getBasicInsights(purchasePrice, currentValue, annualRate, regionalRate);
    }

    try {
      const prompt = `Provide 4 specific insights about this property's appreciation:

Location: ${property.city}, ${property.state}
Purchase Price: $${purchasePrice.toLocaleString()}
Current Value: $${currentValue.toLocaleString()}
Annual Rate: ${annualRate.toFixed(2)}%
Regional Average: ${regionalRate}%

Return as JSON array (no markdown):
["Insight 1", "Insight 2", "Insight 3", "Insight 4"]

Focus on:
1. Performance vs market
2. Market factors
3. Future outlook
4. Actionable advice`;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 500, temperature: 0.7 }
      });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(text).slice(0, 4);

    } catch (error) {
      console.error('[APPRECIATION] AI insights error:', error);
      return this.getBasicInsights(purchasePrice, currentValue, annualRate, regionalRate);
    }
  }

  private getBasicInsights(
    purchasePrice: number,
    currentValue: number,
    annualRate: number,
    regionalRate: number
  ): string[] {
    const insights = [];

    const appreciation = currentValue - purchasePrice;
    insights.push(`Your property has gained $${appreciation.toLocaleString()} in value since purchase`);

    if (annualRate > regionalRate) {
      insights.push(`Your property is outperforming the regional average by ${(annualRate - regionalRate).toFixed(2)}%`);
    } else {
      insights.push(`Regional properties are appreciating at ${regionalRate}% annually on average`);
    }

    if (annualRate > 5) {
      insights.push('Strong appreciation indicates a hot market. Consider leveraging equity for improvements');
    } else {
      insights.push('Steady appreciation provides long-term wealth building opportunities');
    }

    insights.push('Track your property value quarterly to monitor market trends');

    return insights;
  }
}

export const propertyAppreciationService = new PropertyAppreciationService();
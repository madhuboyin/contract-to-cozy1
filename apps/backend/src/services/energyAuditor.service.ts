// apps/backend/src/services/energyAuditor.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../config/database';

interface EnergyInputData {
  averageMonthlyKWh: number;
  averageMonthlyBill: number;
  squareFootage: number;
  occupants: number;
  
  // Optional seasonal data
  summerPeakKWh?: number;
  winterPeakKWh?: number;
  
  // Appliances
  hasElectricHeat: boolean;
  hasElectricWaterHeater: boolean;
  hasCentralAC: boolean;
  hasPool: boolean;
  hasSolarPanels: boolean;
}

interface BillData {
  month: string;
  kwh: number;
  cost: number;
}

interface EnergyRecommendation {
  title: string;
  category: 'HVAC' | 'WATER_HEATING' | 'LIGHTING' | 'APPLIANCES' | 'INSULATION' | 'SOLAR' | 'BEHAVIORAL';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedSavings: {
    kWhPerYear: number;
    dollarsPerYear: number;
    percentReduction: number;
  };
  implementationCost: number;
  paybackMonths: number;
  difficulty: 'EASY' | 'MODERATE' | 'PROFESSIONAL';
  description: string;
  steps: string[];
}

interface EnergyAuditReport {
  propertyId: string;
  propertyAddress: string;
  
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  
  annualUsage: {
    totalKWh: number;
    totalCost: number;
    kWhPerSqFt: number;
  };
  
  comparison: {
    vsStateAverage: number;
    vsEnergyStar: number;
    vsEfficientHome: number;
  };
  
  breakdown: {
    category: string;
    estimatedKWh: number;
    estimatedCost: number;
    percentage: number;
  }[];
  
  recommendations: EnergyRecommendation[];
  
  carbonFootprint: {
    annualCO2Pounds: number;
    equivalentTrees: number;
    equivalentCarMiles: number;
  };
  
  potentialSavings: {
    annualKWhSavings: number;
    annualCostSavings: number;
    percentageReduction: number;
  };
  
  generatedAt: Date;
}

// Free data from EIA (Energy Information Administration)
const STATE_ELECTRICITY_DATA: Record<string, { avgRate: number; avgKWh: number; carbonIntensity: number }> = {
  'AL': { avgRate: 0.12, avgKWh: 1200, carbonIntensity: 0.85 },
  'AZ': { avgRate: 0.13, avgKWh: 1050, carbonIntensity: 0.65 },
  'CA': { avgRate: 0.22, avgKWh: 550, carbonIntensity: 0.25 },
  'CO': { avgRate: 0.12, avgKWh: 700, carbonIntensity: 0.75 },
  'CT': { avgRate: 0.21, avgKWh: 750, carbonIntensity: 0.35 },
  'FL': { avgRate: 0.13, avgKWh: 1150, carbonIntensity: 0.55 },
  'GA': { avgRate: 0.12, avgKWh: 1100, carbonIntensity: 0.70 },
  'IL': { avgRate: 0.13, avgKWh: 750, carbonIntensity: 0.60 },
  'MA': { avgRate: 0.22, avgKWh: 650, carbonIntensity: 0.45 },
  'MD': { avgRate: 0.13, avgKWh: 1000, carbonIntensity: 0.65 },
  'MI': { avgRate: 0.16, avgKWh: 700, carbonIntensity: 0.70 },
  'NC': { avgRate: 0.11, avgKWh: 1100, carbonIntensity: 0.65 },
  'NJ': { avgRate: 0.16, avgKWh: 750, carbonIntensity: 0.45 },
  'NY': { avgRate: 0.19, avgKWh: 650, carbonIntensity: 0.40 },
  'OH': { avgRate: 0.12, avgKWh: 900, carbonIntensity: 0.80 },
  'PA': { avgRate: 0.14, avgKWh: 900, carbonIntensity: 0.70 },
  'TX': { avgRate: 0.12, avgKWh: 1150, carbonIntensity: 0.60 },
  'VA': { avgRate: 0.12, avgKWh: 1150, carbonIntensity: 0.55 },
  'WA': { avgRate: 0.10, avgKWh: 950, carbonIntensity: 0.15 },
  'DEFAULT': { avgRate: 0.14, avgKWh: 900, carbonIntensity: 0.60 },
};

// Energy Star benchmarks (kWh per sqft per year)
const ENERGY_STAR_TARGETS = {
  'Excellent': 3.5,
  'Good': 5.0,
  'Average': 7.0,
  'Poor': 10.0,
};

// DOE appliance energy breakdown (percentage of total usage)
const APPLIANCE_BREAKDOWN = {
  'HVAC': 35,
  'Water Heating': 18,
  'Lighting': 12,
  'Refrigeration': 8,
  'Washer/Dryer': 6,
  'Electronics': 6,
  'Cooking': 4,
  'Other': 11,
};

export class EnergyAuditorService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[ENERGY-AUDITOR] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async generateEnergyAudit(
    propertyId: string,
    userId: string,
    inputData: EnergyInputData,
    billFiles?: Express.Multer.File[]
  ): Promise<EnergyAuditReport> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    // Get state data
    const stateData = STATE_ELECTRICITY_DATA[property.state] || STATE_ELECTRICITY_DATA['DEFAULT'];

    // Extract bill data if provided (smart extraction)
    let billData: BillData[] = [];
    if (billFiles && billFiles.length > 0) {
      billData = await this.extractBillData(billFiles);
    }

    // Calculate actual electricity rate
    const actualRate = inputData.averageMonthlyBill / inputData.averageMonthlyKWh;

    // Annual calculations
    const annualKWh = inputData.averageMonthlyKWh * 12;
    const annualCost = inputData.averageMonthlyBill * 12;
    const kWhPerSqFt = annualKWh / inputData.squareFootage;

    // Energy Star comparison
    const energyStarTarget = ENERGY_STAR_TARGETS['Good'] * inputData.squareFootage;
    const stateAverageAnnual = stateData.avgKWh * 12;

    // Calculate score (0-100)
    const score = this.calculateEfficiencyScore(
      annualKWh,
      energyStarTarget,
      stateAverageAnnual,
      inputData
    );

    // Generate grade
    const grade = this.getGrade(score);

    // Calculate usage breakdown
    const breakdown = this.calculateUsageBreakdown(
      annualKWh,
      actualRate,
      inputData
    );

    // Get AI recommendations
    const recommendations = await this.getAIRecommendations(
      property,
      inputData,
      annualKWh,
      actualRate,
      stateData,
      billData
    );

    // Calculate carbon footprint
    const carbonFootprint = this.calculateCarbonFootprint(
      annualKWh,
      stateData.carbonIntensity
    );

    // Calculate potential savings
    const potentialSavings = this.calculatePotentialSavings(
      recommendations,
      annualKWh,
      annualCost
    );

    return {
      propertyId,
      propertyAddress: property.address,
      score,
      grade,
      annualUsage: {
        totalKWh: Math.round(annualKWh),
        totalCost: Math.round(annualCost),
        kWhPerSqFt: Math.round(kWhPerSqFt * 100) / 100,
      },
      comparison: {
        vsStateAverage: Math.round(((annualKWh - stateAverageAnnual) / stateAverageAnnual) * 100),
        vsEnergyStar: Math.round(((annualKWh - energyStarTarget) / energyStarTarget) * 100),
        vsEfficientHome: Math.round(((annualKWh - (ENERGY_STAR_TARGETS['Excellent'] * inputData.squareFootage * 12)) / annualKWh) * 100),
      },
      breakdown,
      recommendations,
      carbonFootprint,
      potentialSavings,
      generatedAt: new Date(),
    };
  }

  private async extractBillData(billFiles: Express.Multer.File[]): Promise<BillData[]> {
    if (!this.ai) {
      return [];
    }

    const billData: BillData[] = [];

    // Only process first 3 bills to save tokens
    const filesToProcess = billFiles.slice(0, 3);

    for (const file of filesToProcess) {
      try {
        const prompt = `Extract energy usage data from this utility bill.

Return ONLY valid JSON (no markdown, no explanation):
{
  "month": "July 2024",
  "kwh": 1245,
  "cost": 162.50
}

If you cannot extract the data, return null.`;

        const fileData = {
          inlineData: {
            data: file.buffer.toString('base64'),
            mimeType: file.mimetype,
          }
        };

        const response = await this.ai.models.generateContent({
          model: "gemini-2.0-flash-exp",
          contents: [{ 
            role: "user", 
            parts: [
              { text: prompt },
              fileData
            ] 
          }],
          config: { maxOutputTokens: 200, temperature: 0.1 }
        });

        if (!response.text) {
          continue; // Skip this file if no response
        }

        const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        if (text !== 'null') {
          const data = JSON.parse(text);
          billData.push(data);
        }
      } catch (error) {
        console.error('[ENERGY-AUDITOR] Bill extraction error:', error);
      }
    }

    return billData;
  }

  private calculateEfficiencyScore(
    annualKWh: number,
    energyStarTarget: number,
    stateAverage: number,
    inputData: EnergyInputData
  ): number {
    let score = 100;

    // Compare to Energy Star target (40% weight)
    const vsEnergyStar = (annualKWh - energyStarTarget) / energyStarTarget;
    score -= Math.max(0, Math.min(40, vsEnergyStar * 100));

    // Compare to state average (30% weight)
    const vsState = (annualKWh - stateAverage) / stateAverage;
    score -= Math.max(0, Math.min(30, vsState * 75));

    // Appliance efficiency bonus/penalty (30% weight)
    if (inputData.hasSolarPanels) score += 15;
    if (!inputData.hasElectricHeat) score += 5; // Gas heat is more efficient
    if (inputData.hasPool) score -= 10;
    if (!inputData.hasCentralAC) score -= 5; // Central AC is more efficient than window units

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private calculateUsageBreakdown(
    annualKWh: number,
    rate: number,
    inputData: EnergyInputData
  ): { category: string; estimatedKWh: number; estimatedCost: number; percentage: number }[] {
    const breakdown: any[] = [];

    // Adjust percentages based on appliances
    let adjustedBreakdown = { ...APPLIANCE_BREAKDOWN };

    if (inputData.hasElectricHeat) {
      adjustedBreakdown['HVAC'] = 45; // Electric heat uses more
      adjustedBreakdown['Other'] = 6;
    }

    if (inputData.hasElectricWaterHeater) {
      adjustedBreakdown['Water Heating'] = 22;
      adjustedBreakdown['Other'] = 7;
    }

    if (inputData.hasPool) {
      adjustedBreakdown['Other'] = 20; // Pool pump
      adjustedBreakdown['HVAC'] = 25;
    }

    for (const [category, percentage] of Object.entries(adjustedBreakdown)) {
      const kwh = Math.round((annualKWh * percentage) / 100);
      breakdown.push({
        category,
        estimatedKWh: kwh,
        estimatedCost: Math.round(kwh * rate),
        percentage,
      });
    }

    return breakdown.sort((a, b) => b.estimatedKWh - a.estimatedKWh);
  }

  private async getAIRecommendations(
    property: any,
    inputData: EnergyInputData,
    annualKWh: number,
    rate: number,
    stateData: any,
    billData: BillData[]
  ): Promise<EnergyRecommendation[]> {
    if (!this.ai) {
      return this.getBasicRecommendations(inputData, annualKWh, rate);
    }

    try {
      const seasonalInfo = billData.length > 0 
        ? `Bill data: ${JSON.stringify(billData)}`
        : `Summer peak: ${inputData.summerPeakKWh || 'unknown'}, Winter peak: ${inputData.winterPeakKWh || 'unknown'}`;

      const prompt = `Energy audit for home in ${property.city}, ${property.state}:

Property: ${inputData.squareFootage} sqft, ${inputData.occupants} occupants
Annual usage: ${annualKWh} kWh ($${Math.round(annualKWh * rate)})
Rate: $${rate.toFixed(3)}/kWh
State average: ${stateData.avgKWh * 12} kWh/year

Appliances:
- Electric heat: ${inputData.hasElectricHeat}
- Electric water heater: ${inputData.hasElectricWaterHeater}
- Central AC: ${inputData.hasCentralAC}
- Pool: ${inputData.hasPool}
- Solar panels: ${inputData.hasSolarPanels}

${seasonalInfo}

Provide 6-8 specific energy-saving recommendations.

Return ONLY valid JSON (no markdown):
[
  {
    "title": "Upgrade to LED lighting",
    "category": "LIGHTING",
    "priority": "MEDIUM",
    "estimatedAnnualSavingsKWh": 500,
    "estimatedAnnualSavingsDollars": 70,
    "implementationCost": 150,
    "difficulty": "EASY",
    "description": "Replace all incandescent bulbs",
    "steps": ["Audit current bulbs", "Purchase LED replacements", "Install"]
  }
]

Categories: HVAC, WATER_HEATING, LIGHTING, APPLIANCES, INSULATION, SOLAR, BEHAVIORAL
Priority: HIGH, MEDIUM, LOW
Difficulty: EASY, MODERATE, PROFESSIONAL`;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 2000, temperature: 0.7 }
      });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const aiRecs = JSON.parse(text);

      return aiRecs.map((rec: any) => ({
        title: rec.title,
        category: rec.category,
        priority: rec.priority,
        estimatedSavings: {
          kWhPerYear: rec.estimatedAnnualSavingsKWh || 0,
          dollarsPerYear: rec.estimatedAnnualSavingsDollars || 0,
          percentReduction: Math.round((rec.estimatedAnnualSavingsKWh / annualKWh) * 100),
        },
        implementationCost: rec.implementationCost || 0,
        paybackMonths: rec.implementationCost && rec.estimatedAnnualSavingsDollars
          ? Math.round((rec.implementationCost / rec.estimatedAnnualSavingsDollars) * 12)
          : 0,
        difficulty: rec.difficulty,
        description: rec.description,
        steps: rec.steps || [],
      })).slice(0, 8);

    } catch (error) {
      console.error('[ENERGY-AUDITOR] AI recommendations error:', error);
      return this.getBasicRecommendations(inputData, annualKWh, rate);
    }
  }

  private getBasicRecommendations(
    inputData: EnergyInputData,
    annualKWh: number,
    rate: number
  ): EnergyRecommendation[] {
    const recs: EnergyRecommendation[] = [];

    // LED lighting
    recs.push({
      title: 'Upgrade to LED Lighting',
      category: 'LIGHTING',
      priority: 'MEDIUM',
      estimatedSavings: {
        kWhPerYear: 500,
        dollarsPerYear: Math.round(500 * rate),
        percentReduction: Math.round((500 / annualKWh) * 100),
      },
      implementationCost: 150,
      paybackMonths: Math.round((150 / (500 * rate)) * 12),
      difficulty: 'EASY',
      description: 'Replace incandescent bulbs with LED equivalents',
      steps: ['Audit current lighting', 'Purchase LED bulbs', 'Replace all bulbs'],
    });

    // Programmable thermostat
    if (inputData.hasCentralAC || inputData.hasElectricHeat) {
      recs.push({
        title: 'Install Smart Thermostat',
        category: 'HVAC',
        priority: 'HIGH',
        estimatedSavings: {
          kWhPerYear: Math.round(annualKWh * 0.15),
          dollarsPerYear: Math.round(annualKWh * 0.15 * rate),
          percentReduction: 15,
        },
        implementationCost: 250,
        paybackMonths: Math.round((250 / (annualKWh * 0.15 * rate)) * 12),
        difficulty: 'MODERATE',
        description: 'Smart thermostat can reduce HVAC costs by 15%',
        steps: ['Choose compatible model', 'Install or hire electrician', 'Configure schedule'],
      });
    }

    // Water heater
    if (inputData.hasElectricWaterHeater) {
      recs.push({
        title: 'Lower Water Heater Temperature',
        category: 'WATER_HEATING',
        priority: 'HIGH',
        estimatedSavings: {
          kWhPerYear: 400,
          dollarsPerYear: Math.round(400 * rate),
          percentReduction: Math.round((400 / annualKWh) * 100),
        },
        implementationCost: 0,
        paybackMonths: 0,
        difficulty: 'EASY',
        description: 'Lower from 140°F to 120°F',
        steps: ['Locate temperature dial', 'Adjust to 120°F', 'Wait 24 hours to test'],
      });
    }

    // Insulation
    recs.push({
      title: 'Add Attic Insulation',
      category: 'INSULATION',
      priority: 'MEDIUM',
      estimatedSavings: {
        kWhPerYear: Math.round(annualKWh * 0.10),
        dollarsPerYear: Math.round(annualKWh * 0.10 * rate),
        percentReduction: 10,
      },
      implementationCost: 1500,
      paybackMonths: Math.round((1500 / (annualKWh * 0.10 * rate)) * 12),
      difficulty: 'PROFESSIONAL',
      description: 'Proper attic insulation reduces heating/cooling costs',
      steps: ['Get energy audit', 'Hire insulation contractor', 'Install R-38 or higher'],
    });

    // Solar
    if (!inputData.hasSolarPanels && annualKWh > 8000) {
      recs.push({
        title: 'Consider Solar Panel Installation',
        category: 'SOLAR',
        priority: 'LOW',
        estimatedSavings: {
          kWhPerYear: Math.round(annualKWh * 0.70),
          dollarsPerYear: Math.round(annualKWh * 0.70 * rate),
          percentReduction: 70,
        },
        implementationCost: 15000,
        paybackMonths: Math.round((15000 / (annualKWh * 0.70 * rate)) * 12),
        difficulty: 'PROFESSIONAL',
        description: 'Solar panels can offset 70-90% of electricity costs',
        steps: ['Get solar quotes', 'Check incentives', 'Schedule installation'],
      });
    }

    return recs.slice(0, 6);
  }

  private calculateCarbonFootprint(annualKWh: number, carbonIntensity: number) {
    const annualCO2Pounds = Math.round(annualKWh * carbonIntensity);
    
    return {
      annualCO2Pounds,
      equivalentTrees: Math.round(annualCO2Pounds / 48), // 1 tree absorbs ~48 lbs CO2/year
      equivalentCarMiles: Math.round(annualCO2Pounds / 0.89), // 1 mile = 0.89 lbs CO2
    };
  }

  private calculatePotentialSavings(
    recommendations: EnergyRecommendation[],
    annualKWh: number,
    annualCost: number
  ) {
    const totalKWhSavings = recommendations.reduce((sum, r) => sum + r.estimatedSavings.kWhPerYear, 0);
    const totalCostSavings = recommendations.reduce((sum, r) => sum + r.estimatedSavings.dollarsPerYear, 0);

    return {
      annualKWhSavings: Math.round(totalKWhSavings),
      annualCostSavings: Math.round(totalCostSavings),
      percentageReduction: Math.round((totalKWhSavings / annualKWh) * 100),
    };
  }
}

export const energyAuditorService = new EnergyAuditorService();
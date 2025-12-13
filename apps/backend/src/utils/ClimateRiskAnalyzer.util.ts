// apps/backend/src/utils/ClimateRiskAnalyzer.util.ts

import { Prisma, Property } from '@prisma/client';
// Assuming a structure for AssetRiskDetail from riskCalculator.util
// Note: In a real implementation, this import would be from a shared types file or riskCalculator.util
interface AssetRiskDetail {
    assetName: string;
    systemType: string;
    category: 'SAFETY' | 'FINANCIAL' | 'MAINTENANCE';
    age: number;
    expectedLife: number;
    replacementCost: number;
    probability: number;
    coverageFactor: number;
    outOfPocketCost: number;
    riskDollar: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    actionCta: string;
}

export interface ClimateRiskInsight {
    riskType: 'FLOOD' | 'FIRE' | 'HEAT' | 'WIND';
    riskScoreIncrease: number; // 0-100 score increase
    financialExposureIncrease: Prisma.Decimal;
    predictionYear: number;
    actionCta: string; // The specific recommendation text
    systemType: string; // e.g., 'Foundation', 'Roof', 'HVAC'
}

/**
 * MOCK: Simulates the process of fetching external climate data and running AI analysis.
 * In a real application, this would call external APIs (NOAA, FEMA, Zillow) and then Gemini.
 */
export function analyzeClimateRisk(property: Property): ClimateRiskInsight[] {
    // Check for mock high-risk coastal/wildfire property (e.g., California Single-Family)
    if (property.state === 'CA' && property.propertyType === 'SINGLE_FAMILY') {
        const currentYear = new Date().getFullYear();
        
        return [
            {
                riskType: 'FLOOD',
                riskScoreIncrease: 25, // Significant flood risk increase
                financialExposureIncrease: new Prisma.Decimal(15000.00), // High dollar value
                predictionYear: currentYear + 10,
                actionCta: 'CRITICAL: Upgrade foundation drainage and review flood insurance coverage.',
                systemType: 'Foundation',
            },
            {
                riskType: 'FIRE',
                riskScoreIncrease: 10, // Moderate fire risk increase
                financialExposureIncrease: new Prisma.Decimal(5000.00),
                predictionYear: currentYear + 10,
                actionCta: 'MODERATE: Invest in fire-resistant landscaping and check roof material fire rating.',
                systemType: 'Roof',
            }
        ];
    }
    
    // Check for mock extreme heat/wind property (e.g., Florida/Texas)
    if (property.state === 'FL' || property.state === 'TX') {
         const currentYear = new Date().getFullYear();
         return [
             {
                riskType: 'HEAT',
                riskScoreIncrease: 15, 
                financialExposureIncrease: new Prisma.Decimal(3000.00),
                predictionYear: currentYear + 10,
                actionCta: 'MODERATE: Consider insulating attic and upgrading to a higher SEER HVAC unit.',
                systemType: 'HVAC',
            },
         ];
    }

    // Default: Low/No additional climate risk
    return [];
}

/**
 * Transforms the structured climate insights into the generic AssetRiskDetail array
 * for seamless integration into the core risk report JSON data structure.
 */
export function mapClimateToAssetRisk(insights: ClimateRiskInsight[]): AssetRiskDetail[] {
    return insights.map(i => ({
        assetName: `Climate Risk: ${i.riskType}`,
        systemType: i.systemType,
        category: 'FINANCIAL' as any, // Treat future risk as Financial/Safety exposure
        age: 0, 
        expectedLife: 10,
        replacementCost: 0, 
        probability: i.riskScoreIncrease / 100, // Probability derived from model score
        coverageFactor: 0,    
        outOfPocketCost: i.financialExposureIncrease.toNumber(), 
        riskDollar: i.financialExposureIncrease.toNumber(),        
        riskLevel: i.riskScoreIncrease > 20 ? 'CRITICAL' : i.riskScoreIncrease > 10 ? 'HIGH' : 'MEDIUM',
        actionCta: i.actionCta,
    })) as AssetRiskDetail[];
}
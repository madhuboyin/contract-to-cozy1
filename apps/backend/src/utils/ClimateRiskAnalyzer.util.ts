// apps/backend/src/utils/ClimateRiskAnalyzer.util.ts

import { Prisma, Property, RiskCategory } from '@prisma/client';
import type { AssetRiskDetail } from './riskCalculator.util';

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
function mapClimateScoreToRiskLevel(riskScoreIncrease: number): AssetRiskDetail['riskLevel'] {
    if (riskScoreIncrease > 20) return 'CRITICAL';
    if (riskScoreIncrease > 15) return 'HIGH';
    if (riskScoreIncrease > 10) return 'ELEVATED';
    if (riskScoreIncrease > 5) return 'MODERATE';
    return 'LOW';
}

export function mapClimateToAssetRisk(insights: ClimateRiskInsight[]): AssetRiskDetail[] {
    return insights.map((i): AssetRiskDetail => {
        const exposure = i.financialExposureIncrease.toNumber();
        return {
            assetName: `Climate Risk: ${i.riskType}`,
            systemType: i.systemType,
            category: RiskCategory.FINANCIAL_GAP, // Treat future risk as financial exposure
            age: 0,
            expectedLife: 10,
            replacementCost: 0,
            probability: i.riskScoreIncrease / 100, // Probability derived from model score
            coverageFactor: 0,
            outOfPocketCost: exposure,
            riskDollar: exposure,
            riskLevel: mapClimateScoreToRiskLevel(i.riskScoreIncrease),
            actionCta: i.actionCta,
        };
    });
}

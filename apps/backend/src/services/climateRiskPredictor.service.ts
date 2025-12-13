// apps/backend/src/services/climateRiskPredictor.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../config/database';

interface ClimateRisk {
  category: string;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  score: number; // 0-100
  description: string;
  trends: string;
  mitigationSteps: string[];
}

interface ClimateReport {
  propertyId: string;
  propertyAddress: string;
  location: {
    city: string;
    state: string;
    zipCode: string;
  };
  overallRiskScore: number;
  overallRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  risks: ClimateRisk[];
  recommendations: string[];
  insuranceImpact: string;
  propertyValueImpact: string;
  generatedAt: Date;
}

const CLIMATE_RISK_CATEGORIES = [
  'Flooding',
  'Hurricanes',
  'Wildfires',
  'Extreme Heat',
  'Tornadoes',
  'Earthquakes',
  'Winter Storms',
  'Drought',
  'Sea Level Rise',
];

export class ClimateRiskPredictorService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[CLIMATE-RISK] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async generateClimateReport(propertyId: string, userId: string): Promise<ClimateReport> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      },
      include: {
        homeownerProfile: true
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    const location = {
      city: property.city,
      state: property.state,
      zipCode: property.zipCode || '',
    };

    // Get AI-powered climate risk analysis
    const risks = await this.analyzeClimateRisks(location, property);

    // Calculate overall risk
    const overallRiskScore = Math.round(
      risks.reduce((sum, r) => sum + r.score, 0) / risks.length
    );

    const overallRiskLevel = this.getRiskLevel(overallRiskScore);

    // Get AI recommendations
    const recommendations = await this.getAIRecommendations(location, risks, overallRiskScore);

    // Insurance and property value impact
    const insuranceImpact = this.getInsuranceImpact(overallRiskLevel, risks);
    const propertyValueImpact = this.getPropertyValueImpact(overallRiskLevel);

    return {
      propertyId,
      propertyAddress: property.address,
      location,
      overallRiskScore,
      overallRiskLevel,
      risks,
      recommendations,
      insuranceImpact,
      propertyValueImpact,
      generatedAt: new Date(),
    };
  }

  private async analyzeClimateRisks(
    location: { city: string; state: string; zipCode: string },
    property: any
  ): Promise<ClimateRisk[]> {
    if (!this.ai) {
      return this.getBasicRisks(location);
    }

    try {
      const prompt = `Analyze climate risks for this property location and provide detailed assessment:

Location: ${location.city}, ${location.state}
Property Type: ${property.propertyType || 'Residential'}

For each applicable climate risk category, provide:
1. Risk level (LOW, MODERATE, HIGH, SEVERE)
2. Risk score (0-100)
3. Brief description of the specific risk
4. Historical trends (past 10 years)
5. 3 specific mitigation steps

Climate categories to assess:
${CLIMATE_RISK_CATEGORIES.join(', ')}

Return ONLY valid JSON (no markdown, no code blocks):
[
  {
    "category": "Flooding",
    "riskLevel": "HIGH",
    "score": 75,
    "description": "Property in 100-year flood zone",
    "trends": "Flood events increasing 15% per decade",
    "mitigationSteps": ["Install sump pump", "Elevate utilities", "Flood insurance"]
  }
]

Only include categories with risk level MODERATE or higher.`;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 1500, temperature: 0.3 }
      });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const risks = JSON.parse(text);

      return risks.map((r: any) => ({
        category: r.category,
        riskLevel: r.riskLevel,
        score: Math.min(100, Math.max(0, r.score)),
        description: r.description,
        trends: r.trends,
        mitigationSteps: r.mitigationSteps || [],
      }));

    } catch (error) {
      console.error('[CLIMATE-RISK] AI analysis error:', error);
      return this.getBasicRisks(location);
    }
  }

  private getBasicRisks(location: { state: string }): ClimateRisk[] {
    // State-based basic risk assessment
    const stateRisks: Record<string, ClimateRisk[]> = {
      'FL': [
        {
          category: 'Hurricanes',
          riskLevel: 'HIGH',
          score: 80,
          description: 'Florida is in active hurricane zone',
          trends: 'Hurricane intensity increasing',
          mitigationSteps: ['Hurricane shutters', 'Roof reinforcement', 'Emergency kit']
        },
        {
          category: 'Flooding',
          riskLevel: 'MODERATE',
          score: 60,
          description: 'Coastal flooding risk',
          trends: 'Sea level rising',
          mitigationSteps: ['Flood insurance', 'Elevation certificates', 'Drainage improvements']
        }
      ],
      'CA': [
        {
          category: 'Wildfires',
          riskLevel: 'HIGH',
          score: 75,
          description: 'Wildfire-prone region',
          trends: 'Fire season lengthening',
          mitigationSteps: ['Defensible space', 'Fire-resistant materials', 'Evacuation plan']
        },
        {
          category: 'Earthquakes',
          riskLevel: 'MODERATE',
          score: 65,
          description: 'Seismic activity zone',
          trends: 'Stable seismic patterns',
          mitigationSteps: ['Seismic retrofit', 'Emergency supplies', 'Secure heavy items']
        }
      ],
      'TX': [
        {
          category: 'Extreme Heat',
          riskLevel: 'HIGH',
          score: 70,
          description: 'High summer temperatures',
          trends: 'Heat waves increasing',
          mitigationSteps: ['AC maintenance', 'Insulation upgrade', 'Shade trees']
        }
      ],
    };

    return stateRisks[location.state] || [
      {
        category: 'General Climate',
        riskLevel: 'LOW',
        score: 30,
        description: 'Moderate climate risks for this area',
        trends: 'Climate patterns stable',
        mitigationSteps: ['Regular maintenance', 'Monitor weather', 'Insurance review']
      }
    ];
  }

  private async getAIRecommendations(
    location: any,
    risks: ClimateRisk[],
    overallScore: number
  ): Promise<string[]> {
    if (!this.ai) {
      return this.getBasicRecommendations(overallScore);
    }

    try {
      const topRisks = risks
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(r => `${r.category} (${r.score}/100)`)
        .join(', ');

      const prompt = `Based on these climate risks for ${location.city}, ${location.state}:

Top Risks: ${topRisks}
Overall Risk Score: ${overallScore}/100

Provide 5 actionable recommendations for the homeowner.
Return as JSON array of strings (no markdown):
["Recommendation 1", "Recommendation 2", "Recommendation 3", "Recommendation 4", "Recommendation 5"]`;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 500, temperature: 0.7 }
      });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(text).slice(0, 5);

    } catch (error) {
      console.error('[CLIMATE-RISK] Recommendations error:', error);
      return this.getBasicRecommendations(overallScore);
    }
  }

  private getBasicRecommendations(overallScore: number): string[] {
    const recommendations = [
      'Review and update homeowners insurance to cover climate-related risks',
      'Create an emergency preparedness plan for your household',
      'Conduct annual property inspections focusing on vulnerable areas',
    ];

    if (overallScore >= 60) {
      recommendations.push('Consider climate-resilient home improvements');
      recommendations.push('Document all property improvements for insurance purposes');
    } else {
      recommendations.push('Monitor climate risk trends for your area annually');
      recommendations.push('Maintain adequate emergency fund for repairs');
    }

    return recommendations;
  }

  private getRiskLevel(score: number): 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' {
    if (score >= 75) return 'SEVERE';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MODERATE';
    return 'LOW';
  }

  private getInsuranceImpact(level: string, risks: ClimateRisk[]): string {
    const hasFlood = risks.some(r => r.category === 'Flooding' && r.score >= 50);
    const hasHurricane = risks.some(r => r.category === 'Hurricanes' && r.score >= 50);
    const hasWildfire = risks.some(r => r.category === 'Wildfires' && r.score >= 50);

    if (level === 'SEVERE') {
      return 'High-risk area: Expect 20-40% higher premiums. Additional coverage strongly recommended.';
    }
    if (level === 'HIGH') {
      let impact = 'Elevated risk area: Premiums may be 10-25% higher.';
      if (hasFlood) impact += ' Flood insurance required.';
      if (hasHurricane) impact += ' Hurricane coverage essential.';
      if (hasWildfire) impact += ' Fire insurance critical.';
      return impact;
    }
    if (level === 'MODERATE') {
      return 'Moderate risk: Standard premiums. Review coverage limits annually.';
    }
    return 'Low risk: Standard premiums apply. Maintain basic coverage.';
  }

  private getPropertyValueImpact(level: string): string {
    if (level === 'SEVERE') {
      return 'Property values may decrease 5-15% due to climate risk. Mitigation improvements can help.';
    }
    if (level === 'HIGH') {
      return 'Some impact on property values (2-8%). Climate-resilient upgrades increase appeal.';
    }
    if (level === 'MODERATE') {
      return 'Minimal impact on property values. Market awareness increasing.';
    }
    return 'No significant impact on property values from climate risk.';
  }
}

export const climateRiskPredictorService = new ClimateRiskPredictorService();
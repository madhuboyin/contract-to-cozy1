// apps/backend/src/services/taxAppeal.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../config/database';

interface TaxBillData {
  parcelId?: string;
  assessedValue: number;
  landValue?: number;
  improvementValue?: number;
  taxRate: number;
  assessmentYear: number;
  propertyAddress?: string;
  propertyType?: string;
  squareFootage?: number;
  lotSize?: number;
  bedrooms?: number;
  bathrooms?: number;
}

interface ComparableSale {
  address: string;
  salePrice: number;
  saleDate: string;
  squareFootage?: number;
  source: 'USER_PROVIDED' | 'COUNTY_RECORDS' | 'PUBLIC_MLS';
}

interface AppealAnalysisInput {
  taxBillData: TaxBillData;
  userMarketEstimate?: number;
  comparableSales: ComparableSale[];
  propertyConditionNotes?: string;
  recentImprovements?: string;
}

interface AppealOpportunity {
  appealProbability: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  confidenceScore: number; // 0-100
  
  findings: {
    assessedValue: number;
    estimatedMarketValue: number;
    overassessment: number;
    overassessmentPercent: number;
  };
  
  estimatedSavings: {
    annualTaxSavings: number;
    totalSavingsOver3Years: number;
  };
  
  appealReasons: string[];
  comparableEvidence: ComparableSale[];
  
  appealLetter: string;
  
  recommendations: string[];
  
  timeline: {
    filingDeadline?: string;
    hearingEstimate?: string;
    generalGuidance: string;
  };
}

interface AppealReport {
  propertyId: string;
  propertyAddress: string;
  taxBillData: TaxBillData;
  appealOpportunity: AppealOpportunity;
  generatedAt: Date;
}

// State-specific appeal deadlines and processes (sample data)
const STATE_APPEAL_INFO: Record<string, { deadline: string; process: string }> = {
  'NJ': { 
    deadline: 'April 1 (or 45 days after bulk mailing)',
    process: 'File with county tax board, informal hearing, then formal hearing if needed'
  },
  'CA': { 
    deadline: 'September 15 - December 31 annually',
    process: 'File with county assessment appeals board, hearing scheduled within 2 years'
  },
  'TX': { 
    deadline: 'May 15 or 30 days after notice',
    process: 'File with appraisal review board, informal then formal hearing'
  },
  'NY': { 
    deadline: 'Grievance Day (varies by municipality)',
    process: 'File with board of assessment review, hearing scheduled'
  },
  'FL': { 
    deadline: '25 days after TRIM notice',
    process: 'File with value adjustment board, magistrate hearing'
  },
  'PA': { 
    deadline: 'August 1 or 40 days after notice',
    process: 'File with board of assessment appeals'
  },
  'DEFAULT': {
    deadline: 'Check your county tax assessor website',
    process: 'Contact your local tax assessor for appeal procedures'
  }
};

export class TaxAppealService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[TAX-APPEAL] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async extractTaxBillData(file: Express.Multer.File): Promise<TaxBillData> {
    if (!this.ai) {
      throw new Error('AI service not configured');
    }

    const prompt = `Extract property tax information from this tax bill.

Return ONLY valid JSON (no markdown, no explanation):
{
  "parcelId": "123-456-789",
  "assessedValue": 450000,
  "landValue": 120000,
  "improvementValue": 330000,
  "taxRate": 1.2,
  "assessmentYear": 2024,
  "propertyAddress": "123 Main St, City, ST 12345",
  "propertyType": "Single Family Residence",
  "squareFootage": 2400,
  "lotSize": 0.25,
  "bedrooms": 4,
  "bathrooms": 2.5
}

Extract all visible fields. If a field is not present, omit it.
Tax rate should be percentage (e.g., 1.2 for 1.2%).
Lot size in acres.`;

    const imageData = {
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
          imageData
        ] 
      }],
      config: { maxOutputTokens: 500, temperature: 0.1 }
    });

    if (!response.text) {
      throw new Error('AI service returned an empty response');
    }

    const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(text);
  }

  async analyzeAppealOpportunity(
    propertyId: string,
    userId: string,
    input: AppealAnalysisInput
  ): Promise<AppealReport> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    const { taxBillData, userMarketEstimate, comparableSales, propertyConditionNotes } = input;

    // Calculate estimated market value
    const estimatedMarketValue = this.calculateMarketValue(
      userMarketEstimate,
      comparableSales,
      taxBillData
    );

    // Calculate overassessment
    const overassessment = taxBillData.assessedValue - estimatedMarketValue;
    const overassessmentPercent = (overassessment / estimatedMarketValue) * 100;

    // Determine appeal probability
    const { probability, confidenceScore } = this.determineAppealProbability(
      overassessment,
      overassessmentPercent,
      comparableSales.length,
      !!userMarketEstimate
    );

    // Calculate savings
    const annualTaxSavings = (overassessment * taxBillData.taxRate) / 100;
    const totalSavingsOver3Years = annualTaxSavings * 3;

    // Generate appeal reasons
    const appealReasons = this.generateAppealReasons(
      overassessment,
      overassessmentPercent,
      comparableSales,
      propertyConditionNotes
    );

    // Get AI-generated appeal letter
    const appealLetter = await this.generateAppealLetter(
      property,
      taxBillData,
      estimatedMarketValue,
      comparableSales,
      appealReasons
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      probability,
      comparableSales.length,
      property.state
    );

    // Get state-specific timeline
    const stateInfo = STATE_APPEAL_INFO[property.state] || STATE_APPEAL_INFO['DEFAULT'];

    return {
      propertyId,
      propertyAddress: property.address,
      taxBillData,
      appealOpportunity: {
        appealProbability: probability,
        confidenceScore,
        findings: {
          assessedValue: taxBillData.assessedValue,
          estimatedMarketValue: Math.round(estimatedMarketValue),
          overassessment: Math.round(overassessment),
          overassessmentPercent: Math.round(overassessmentPercent * 100) / 100,
        },
        estimatedSavings: {
          annualTaxSavings: Math.round(annualTaxSavings),
          totalSavingsOver3Years: Math.round(totalSavingsOver3Years),
        },
        appealReasons,
        comparableEvidence: comparableSales,
        appealLetter,
        recommendations,
        timeline: {
          filingDeadline: stateInfo.deadline,
          generalGuidance: stateInfo.process,
        },
      },
      generatedAt: new Date(),
    };
  }

  private calculateMarketValue(
    userEstimate?: number,
    comparables: ComparableSale[] = [],
    taxBillData?: TaxBillData
  ): number {
    const values: number[] = [];

    // User estimate (highest weight if provided)
    if (userEstimate) {
      values.push(userEstimate);
    }

    // Comparable sales average
    if (comparables.length > 0) {
      const avgComparable = comparables.reduce((sum, c) => sum + c.salePrice, 0) / comparables.length;
      values.push(avgComparable);
      
      // Add weighted comparables
      comparables.forEach(c => values.push(c.salePrice));
    }

    // If no data provided, use assessed value as baseline
    if (values.length === 0 && taxBillData) {
      return taxBillData.assessedValue;
    }

    // Calculate weighted average (user estimate gets 40% weight if present)
    if (userEstimate && values.length > 1) {
      const otherValues = values.filter(v => v !== userEstimate);
      const avgOthers = otherValues.reduce((sum, v) => sum + v, 0) / otherValues.length;
      return (userEstimate * 0.4) + (avgOthers * 0.6);
    }

    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private determineAppealProbability(
    overassessment: number,
    overassessmentPercent: number,
    comparableCount: number,
    hasUserEstimate: boolean
  ): { probability: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'; confidenceScore: number } {
    let score = 0;

    // Overassessment percentage (0-50 points)
    if (overassessmentPercent > 20) score += 50;
    else if (overassessmentPercent > 15) score += 40;
    else if (overassessmentPercent > 10) score += 30;
    else if (overassessmentPercent > 5) score += 20;
    else if (overassessmentPercent > 0) score += 10;

    // Evidence quality (0-30 points)
    if (comparableCount >= 5) score += 30;
    else if (comparableCount >= 3) score += 25;
    else if (comparableCount >= 1) score += 15;

    // User estimate provided (0-20 points)
    if (hasUserEstimate) score += 20;

    // Determine probability
    let probability: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    
    if (score >= 70 && overassessmentPercent > 10) probability = 'HIGH';
    else if (score >= 50 && overassessmentPercent > 5) probability = 'MEDIUM';
    else if (score >= 30 && overassessmentPercent > 0) probability = 'LOW';
    else probability = 'NONE';

    return { probability, confidenceScore: Math.min(100, score) };
  }

  private generateAppealReasons(
    overassessment: number,
    overassessmentPercent: number,
    comparables: ComparableSale[],
    conditionNotes?: string
  ): string[] {
    const reasons: string[] = [];

    if (overassessmentPercent > 10) {
      reasons.push(`Property is overassessed by ${overassessmentPercent.toFixed(1)}% ($${overassessment.toLocaleString()})`);
    }

    if (comparables.length >= 3) {
      const avgComparable = comparables.reduce((sum, c) => sum + c.salePrice, 0) / comparables.length;
      reasons.push(`${comparables.length} comparable properties sold for an average of $${avgComparable.toLocaleString()}`);
    }

    if (comparables.length > 0) {
      const recentComps = comparables.filter(c => {
        const saleDate = new Date(c.saleDate);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        return saleDate >= sixMonthsAgo;
      });
      
      if (recentComps.length > 0) {
        reasons.push(`${recentComps.length} comparable sale(s) within the last 6 months support lower valuation`);
      }
    }

    if (conditionNotes) {
      reasons.push(`Property condition factors: ${conditionNotes}`);
    }

    return reasons;
  }

  private async generateAppealLetter(
    property: any,
    taxBillData: TaxBillData,
    estimatedMarketValue: number,
    comparables: ComparableSale[],
    reasons: string[]
  ): Promise<string> {
    if (!this.ai) {
      return this.generateBasicAppealLetter(property, taxBillData, estimatedMarketValue, comparables);
    }

    try {
      const prompt = `Write a professional property tax appeal letter.

Property Details:
- Address: ${property.address}
- Parcel ID: ${taxBillData.parcelId || 'N/A'}
- Assessment Year: ${taxBillData.assessmentYear}
- Assessed Value: $${taxBillData.assessedValue.toLocaleString()}
- Estimated Market Value: $${Math.round(estimatedMarketValue).toLocaleString()}

Appeal Reasons:
${reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Comparable Sales:
${comparables.map((c, i) => `${i + 1}. ${c.address} - $${c.salePrice.toLocaleString()} (${c.saleDate})`).join('\n')}

Write a formal, professional appeal letter to the tax assessor's office.
Include:
1. Formal greeting
2. Property identification
3. Current assessment
4. Requested assessment
5. Supporting evidence (comparables)
6. Appeal reasons
7. Request for review
8. Professional closing

Keep it concise (300-400 words). Use professional, respectful tone.`;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 800, temperature: 0.5 }
      });

      if (!response.text) {
        throw new Error('AI service returned an empty response');
      }

      return response.text;

    } catch (error) {
      console.error('[TAX-APPEAL] Letter generation error:', error);
      return this.generateBasicAppealLetter(property, taxBillData, estimatedMarketValue, comparables);
    }
  }

  private generateBasicAppealLetter(
    property: any,
    taxBillData: TaxBillData,
    estimatedMarketValue: number,
    comparables: ComparableSale[]
  ): string {
    const today = new Date().toLocaleDateString();
    
    return `[Your Name]
[Your Address]
${property.address}

${today}

[County] Tax Assessor's Office
[County Address]

Re: Property Tax Assessment Appeal
Parcel ID: ${taxBillData.parcelId || 'N/A'}
Property Address: ${property.address}

Dear Tax Assessor,

I am writing to formally appeal the ${taxBillData.assessmentYear} property tax assessment for the above-referenced property. The current assessed value of $${taxBillData.assessedValue.toLocaleString()} significantly exceeds the fair market value.

Based on recent comparable sales in the area, I believe the fair market value is approximately $${Math.round(estimatedMarketValue).toLocaleString()}. This is supported by the following evidence:

Recent Comparable Sales:
${comparables.map((c, i) => `${i + 1}. ${c.address} - $${c.salePrice.toLocaleString()} (Sold: ${c.saleDate})`).join('\n')}

I respectfully request that you review this assessment and adjust it to reflect the true market value of the property. I am available to provide additional documentation or attend a hearing if necessary.

Thank you for your consideration.

Sincerely,
[Your Signature]
[Your Name]`;
  }

  private generateRecommendations(
    probability: string,
    comparableCount: number,
    state: string
  ): string[] {
    const recs: string[] = [];

    // State-specific filing guidance
    const stateInfo = STATE_APPEAL_INFO[state] || STATE_APPEAL_INFO['DEFAULT'];
    recs.push(`File your appeal by: ${stateInfo.deadline}`);
    recs.push(`Appeal process: ${stateInfo.process}`);

    if (probability === 'HIGH' || probability === 'MEDIUM') {
      recs.push('Strong case for appeal - proceed with filing');
    }

    if (comparableCount < 3) {
      recs.push('Gather at least 3 comparable sales from the last 6 months to strengthen your appeal');
      recs.push('Visit county property records or online real estate sites for recent sales data');
    }

    if (comparableCount >= 3) {
      recs.push('Attach copies of comparable sale listings to your appeal');
    }

    recs.push('Consider requesting an informal review before formal hearing');
    recs.push('Take photos documenting any property condition issues');
    recs.push('Keep copies of all submitted documents for your records');

    if (probability === 'LOW' || probability === 'NONE') {
      recs.push('Overassessment may be minimal - consider cost/benefit of appeal process');
      recs.push('Monitor market conditions and reassess next year if values continue declining');
    }

    return recs;
  }
}

export const taxAppealService = new TaxAppealService();
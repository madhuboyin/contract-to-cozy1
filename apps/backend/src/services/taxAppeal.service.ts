import { GoogleGenAI } from '@google/genai';
import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { executeGovernedAIRequest, resolveGovernedAIModel } from './ai/aiRequestGovernance.service';

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

export interface AppealReadinessReport {
  propertyId: string;
  propertyAddress: string;
  taxBillData: TaxBillData;
  readiness: {
    status: 'RULES_NOT_VERIFIED';
    canDetermineAppealMerit: false;
    canDetermineDeadline: false;
    canGenerateFilingPacket: false;
    evidenceSummary: {
      homeownerMarketEstimateProvided: boolean;
      homeownerComparableCount: number;
      conditionNotesProvided: boolean;
      improvementNotesProvided: boolean;
    };
    requiredNextSteps: string[];
    guidance: string;
  };
  generatedAt: Date;
}

function requiredFiniteNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return parsed;
}

function normalizeExtractedTaxBillData(value: unknown): TaxBillData {
  if (!value || typeof value !== 'object') {
    throw new Error('AI service returned an invalid tax bill');
  }

  const candidate = value as Record<string, unknown>;
  return {
    ...candidate,
    assessedValue: requiredFiniteNumber(candidate.assessedValue, 'assessedValue'),
    taxRate: requiredFiniteNumber(candidate.taxRate, 'taxRate'),
    assessmentYear: requiredFiniteNumber(candidate.assessmentYear, 'assessmentYear'),
  } as TaxBillData;
}

export class TaxAppealService {
  private ai: GoogleGenAI | null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('[TAX-APPEAL] GEMINI_API_KEY not set');
    }
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
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

Extract only visible fields. Tax rate should be a percentage (for example, 1.2 for 1.2%).
This extraction is unverified and must be confirmed by the homeowner before use.`;

    const model = resolveGovernedAIModel('FAST');
    const response = await executeGovernedAIRequest({
      routeId: 'ai:tax-appeal', model, structuredOutputRequired: true, structuredOutputConfigured: true,
      work: () => this.ai!.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: file.buffer.toString('base64'),
              mimeType: file.mimetype,
            },
          },
        ],
      }],
      config: { maxOutputTokens: 500, temperature: 0.1, responseMimeType: 'application/json' },
    }), });

    if (!response.text) {
      throw new Error('AI service returned an empty response');
    }

    const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return normalizeExtractedTaxBillData(JSON.parse(text));
  }

  async analyzeAppealOpportunity(
    propertyId: string,
    userId: string,
    input: AppealAnalysisInput,
  ): Promise<AppealReadinessReport> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
      select: {
        id: true,
        address: true,
      },
    });

    if (!property) {
      throw new Error('Property not found');
    }

    const taxBillData = normalizeExtractedTaxBillData(input.taxBillData);
    const comparables = Array.isArray(input.comparableSales) ? input.comparableSales : [];

    return {
      propertyId,
      propertyAddress: property.address,
      taxBillData,
      readiness: {
        status: 'RULES_NOT_VERIFIED',
        canDetermineAppealMerit: false,
        canDetermineDeadline: false,
        canGenerateFilingPacket: false,
        evidenceSummary: {
          homeownerMarketEstimateProvided: Number.isFinite(input.userMarketEstimate),
          homeownerComparableCount: comparables.length,
          conditionNotesProvided: Boolean(input.propertyConditionNotes?.trim()),
          improvementNotesProvided: Boolean(input.recentImprovements?.trim()),
        },
        requiredNextSteps: [
          'Confirm the parcel, tax year, assessment stage, valuation date, classification, assessment ratio, exemptions, and taxable value.',
          'Confirm the current deadline, permitted grounds, official form, fee, and evidence standard with the official local authority.',
          'Verify each evidence item against the jurisdiction rules before relying on it.',
        ],
        guidance:
          'No appeal probability, savings estimate, filing deadline, or submission-ready letter is available until reviewed jurisdiction rules and qualified evidence are connected.',
      },
      generatedAt: new Date(),
    };
  }
}

export const taxAppealService = new TaxAppealService();

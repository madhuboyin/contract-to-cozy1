// apps/backend/src/services/documentIntelligence.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../lib/prisma';
import { Prisma, WarrantyCategory } from '@prisma/client';
import { logger } from '../lib/logger';
import { ProductAnalyticsService } from './analytics/service';

export interface DocumentInsights {
  documentType: 'WARRANTY' | 'RECEIPT' | 'MANUAL' | 'INSPECTION' | 'INVOICE' | 'INSURANCE' | 'UNKNOWN';
  confidence: number;
  extractedData: {
    productName?: string;
    modelNumber?: string;
    serialNumber?: string;
    purchaseDate?: Date;
    warrantyExpiration?: Date;
    vendor?: string;
    manufacturer?: string;
    amount?: number;
    category?: string;
    // Insurance specific
    carrierName?: string;
    policyNumber?: string;
    premiumAmount?: number;
    deductible?: number;
    coverageLimits?: string;
    startDate?: Date;
    expiryDate?: Date;
    coverageType?: string;
  };
  suggestedActions: string[];
  rawText?: string;
}

const DOCUMENT_ANALYSIS_PROMPT = `Analyze this home-related document and extract key information.

Document types: WARRANTY, RECEIPT, MANUAL, INSPECTION, INVOICE, INSURANCE, UNKNOWN

For GENERAL documents (WARRANTY, RECEIPT, etc.) extract:
- Document type
- Product/appliance name
- Model number
- Serial number  
- Purchase or installation date (YYYY-MM-DD)
- Warranty expiration date (YYYY-MM-DD)
- Vendor/store name
- Manufacturer name
- Purchase amount (numbers only)
- Category (HVAC, PLUMBING, ELECTRICAL, APPLIANCE, ROOFING, etc.)

For INSURANCE documents (Declaration pages) extract:
- Carrier name (e.g., State Farm, Allstate)
- Policy number
- Coverage type (Homeowners, Flood, Landlord)
- Premium amount (Annual cost)
- Deductible amount
- Major coverage limits (e.g., Dwelling: $450k, Liability: $300k)
- Policy start date (YYYY-MM-DD)
- Policy expiration/renewal date (YYYY-MM-DD)

Return ONLY valid JSON with this EXACT structure (no markdown, no code blocks):
{
  "documentType": "WARRANTY|RECEIPT|MANUAL|INSPECTION|INVOICE|INSURANCE|UNKNOWN",
  "confidence": 0.0-1.0,
  "extractedData": {
    "productName": "string or null",
    "modelNumber": "string or null",
    "serialNumber": "string or null",
    "purchaseDate": "YYYY-MM-DD or null",
    "warrantyExpiration": "YYYY-MM-DD or null",
    "vendor": "string or null",
    "manufacturer": "string or null",
    "amount": number or null,
    "category": "string or null",
    "carrierName": "string or null",
    "policyNumber": "string or null",
    "premiumAmount": number or null,
    "deductible": number or null,
    "coverageLimits": "string or null",
    "startDate": "YYYY-MM-DD or null",
    "expiryDate": "YYYY-MM-DD or null",
    "coverageType": "string or null"
  },
  "suggestedActions": ["action1", "action2"]
}`;

export class DocumentIntelligenceService {
  private ai: GoogleGenAI;
  private static readonly AUTO_WARRANTY_MIN_CONFIDENCE = 0.7;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async analyzeDocument(
    fileBuffer: Buffer, 
    mimeType: string
  ): Promise<DocumentInsights> {
    try {
      // Convert buffer to base64
      const base64Data = fileBuffer.toString('base64');

      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{
          role: "user",
          parts: [
            { text: DOCUMENT_ANALYSIS_PROMPT },
            { 
              inlineData: {
                mimeType,
                data: base64Data
              }
            }
          ]
        }],
        config: {
          maxOutputTokens: 1000,
          temperature: 0.1, // Low temperature for accuracy
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('AI service returned an empty response');
      }
      logger.info({ text }, '[DOC-INTELLIGENCE] Raw AI response');

      // Clean response (remove markdown code blocks if present)
      const cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const insights: DocumentInsights = JSON.parse(cleanedText);

      // Convert date strings to Date objects
      if (insights.extractedData.purchaseDate) {
        insights.extractedData.purchaseDate = new Date(insights.extractedData.purchaseDate);
      }
      if (insights.extractedData.warrantyExpiration) {
        insights.extractedData.warrantyExpiration = new Date(insights.extractedData.warrantyExpiration);
      }
      if (insights.extractedData.startDate) {
        insights.extractedData.startDate = new Date(insights.extractedData.startDate);
      }
      if (insights.extractedData.expiryDate) {
        insights.extractedData.expiryDate = new Date(insights.extractedData.expiryDate);
      }

      return insights;
    } catch (error: any) {
      logger.error({ err: error }, '[DOC-INTELLIGENCE] Analysis error');
      
      // Return fallback response
      return {
        documentType: 'UNKNOWN',
        confidence: 0,
        extractedData: {},
        suggestedActions: ['Manual review required - AI analysis failed'],
        rawText: error.message
      };
    }
  }

  async autoCreateWarranty(
    homeownerProfileId: string,
    propertyId: string,
    insights: DocumentInsights,
    documentId: string
  ): Promise<any | null> {
    try {
      const { extractedData } = insights;

      if ((insights.confidence ?? 0) < DocumentIntelligenceService.AUTO_WARRANTY_MIN_CONFIDENCE) {
        logger.info(
          `[DOC-INTELLIGENCE] Confidence ${(insights.confidence ?? 0).toFixed(2)} below threshold ` +
            `${DocumentIntelligenceService.AUTO_WARRANTY_MIN_CONFIDENCE.toFixed(2)}, skipping auto-create`
        );
        return null;
      }

      // Only create if we have minimum required data
      if (!extractedData.warrantyExpiration) {
        logger.info('[DOC-INTELLIGENCE] No warranty expiration found, skipping auto-create');
        return null;
      }

      // Check if warranty already exists
      const existingWarranty = await prisma.warranty.findFirst({
        where: {
          homeownerProfileId,
          propertyId,
          OR: [
            { policyNumber: extractedData.modelNumber || undefined },
            { 
              AND: [
                { providerName: extractedData.vendor || extractedData.manufacturer },
                { coverageDetails: { contains: extractedData.productName || '' } }
              ]
            }
          ]
        }
      });

      if (existingWarranty) {
        logger.info('[DOC-INTELLIGENCE] Warranty already exists, skipping creation');
        return null;
      }

      // Determine warranty category
      const category = this.mapCategoryToWarrantyCategory(extractedData.category);

      // Create warranty
      const warranty = await prisma.warranty.create({
        data: {
          homeownerProfileId,
          propertyId,
          category,
          providerName: extractedData.vendor || extractedData.manufacturer || 'Unknown',
          policyNumber: extractedData.modelNumber || `AUTO-${Date.now()}`,
          coverageDetails: `Auto-detected: ${extractedData.productName || 'Product'}${extractedData.modelNumber ? ` (Model: ${extractedData.modelNumber})` : ''}. Auto-created from document ${documentId}. AI Confidence: ${(insights.confidence * 100).toFixed(0)}%`,
          startDate: extractedData.purchaseDate || new Date(),
          expiryDate: extractedData.warrantyExpiration,
          cost: extractedData.amount ? new Prisma.Decimal(extractedData.amount) : null,
        }
      });

      logger.info({ warrantyId: warranty.id }, '[DOC-INTELLIGENCE] Auto-created warranty');

      // Track outcome generated for the user
      void ProductAnalyticsService.trackOutcomeGenerated({
        propertyId,
        outcomeType: 'RISK_PREVENTION',
        sourceEngine: 'WARRANTY_AUTO_DETECTION',
        metadataJson: {
          warrantyId: warranty.id,
          category: warranty.category,
          docId: documentId
        }
      });

      return warranty;
    } catch (error: any) {
      logger.error({ err: error }, '[DOC-INTELLIGENCE] Warranty creation error');
      return null;
    }
  }

  private mapCategoryToWarrantyCategory(category?: string): WarrantyCategory {
    if (!category) return WarrantyCategory.OTHER;
    
    const upperCategory = category.toUpperCase();
    
    if (upperCategory.includes('HVAC') || upperCategory.includes('AC') || upperCategory.includes('HEAT')) {
      return WarrantyCategory.HVAC;
    }
    if (upperCategory.includes('ROOF')) {
      return WarrantyCategory.ROOFING;
    }
    if (upperCategory.includes('PLUMB')) {
      return WarrantyCategory.PLUMBING;
    }
    if (upperCategory.includes('ELECTRIC')) {
      return WarrantyCategory.ELECTRICAL;
    }
    if (upperCategory.includes('APPLIANCE') || upperCategory.includes('FRIDGE') || 
        upperCategory.includes('WASHER') || upperCategory.includes('DRYER')) {
      return WarrantyCategory.APPLIANCE;
    }
    if (upperCategory.includes('STRUCTURE') || upperCategory.includes('FOUNDATION')) {
      return WarrantyCategory.STRUCTURAL;
    }
    
    return WarrantyCategory.OTHER;
  }
  async autoCreateInsurancePolicy(
    homeownerProfileId: string,
    propertyId: string,
    insights: DocumentInsights,
    documentId: string
  ): Promise<any | null> {
    try {
      const { extractedData } = insights;

      if ((insights.confidence ?? 0) < DocumentIntelligenceService.AUTO_WARRANTY_MIN_CONFIDENCE) {
        return null;
      }

      if (!extractedData.carrierName || !extractedData.policyNumber) {
        return null;
      }

      // Check if policy already exists
      const existingPolicy = await prisma.insurancePolicy.findFirst({
        where: {
          homeownerProfileId,
          propertyId,
          policyNumber: extractedData.policyNumber,
        }
      });

      if (existingPolicy) {
        return existingPolicy;
      }

      const policy = await prisma.insurancePolicy.create({
        data: {
          homeownerProfileId,
          propertyId,
          carrierName: extractedData.carrierName,
          policyNumber: extractedData.policyNumber,
          coverageType: extractedData.coverageType || 'Homeowner',
          premiumAmount: extractedData.premiumAmount || 0,
          startDate: extractedData.startDate || new Date(),
          expiryDate: extractedData.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        }
      });

      logger.info({ policyId: policy.id }, '[DOC-INTELLIGENCE] Auto-created insurance policy');

      // Track outcome generated for the user
      void ProductAnalyticsService.trackOutcomeGenerated({
        propertyId,
        outcomeType: 'SAVINGS',
        sourceEngine: 'INSURANCE_AUTO_DETECTION',
        valueUsd: extractedData.premiumAmount,
        metadataJson: {
          policyId: policy.id,
          carrierName: policy.carrierName,
          docId: documentId
        }
      });

      return policy;
    } catch (error: any) {
      logger.error({ err: error }, '[DOC-INTELLIGENCE] Insurance creation error');
      return null;
    }
  }

  async autoCreate(
    homeownerProfileId: string,
    propertyId: string,
    insights: DocumentInsights,
    documentId: string
  ): Promise<any | null> {
    if (insights.documentType === 'WARRANTY') {
      return this.autoCreateWarranty(homeownerProfileId, propertyId, insights, documentId);
    }
    if (insights.documentType === 'INSURANCE') {
      return this.autoCreateInsurancePolicy(homeownerProfileId, propertyId, insights, documentId);
    }
    return null;
  }
}

export const documentIntelligenceService = new DocumentIntelligenceService();

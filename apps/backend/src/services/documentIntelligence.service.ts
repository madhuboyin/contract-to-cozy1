// apps/backend/src/services/documentIntelligence.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../lib/prisma';
import { Prisma, WarrantyCategory } from '@prisma/client';

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
  };
  suggestedActions: string[];
  rawText?: string;
}

const DOCUMENT_ANALYSIS_PROMPT = `Analyze this home-related document and extract key information.

Document types: WARRANTY, RECEIPT, MANUAL, INSPECTION, INVOICE, INSURANCE, UNKNOWN

Extract ALL available information:
- Document type
- Product/appliance name
- Model number
- Serial number  
- Purchase or installation date (format: YYYY-MM-DD)
- Warranty expiration date (format: YYYY-MM-DD)
- Vendor/store name
- Manufacturer name
- Purchase amount (numbers only)
- Category (HVAC, PLUMBING, ELECTRICAL, APPLIANCE, ROOFING, etc.)

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
    "category": "string or null"
  },
  "suggestedActions": ["action1", "action2"]
}`;

export class DocumentIntelligenceService {
  private ai: GoogleGenAI;

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
        model: "gemini-2.0-flash-exp",
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
      console.log('[DOC-INTELLIGENCE] Raw AI response:', text);

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

      return insights;
    } catch (error: any) {
      console.error('[DOC-INTELLIGENCE] Analysis error:', error);
      
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

      // Only create if we have minimum required data
      if (!extractedData.warrantyExpiration) {
        console.log('[DOC-INTELLIGENCE] No warranty expiration found, skipping auto-create');
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
        console.log('[DOC-INTELLIGENCE] Warranty already exists, skipping creation');
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

      console.log('[DOC-INTELLIGENCE] Auto-created warranty:', warranty.id);
      return warranty;
    } catch (error: any) {
      console.error('[DOC-INTELLIGENCE] Warranty creation error:', error);
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
}

export const documentIntelligenceService = new DocumentIntelligenceService();
// apps/backend/src/services/documentIntelligence.service.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { AICircuitBreaker, AICircuitOpenError, AITimeoutError, withTimeout } from '../lib/aiResilience';
import { executeGovernedAIRequest, resolveGovernedAIModel } from './ai/aiRequestGovernance.service';
import { sanitizeBox, sanitizePage, type PageBox } from './documentLocationEvidence';
import { parseServiceQuoteResponse, SERVICE_QUOTE_ANALYSIS_PROMPT, type ServiceQuoteParse } from './serviceQuoteExtraction';

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
    dwellingLimit?: number;
    personalPropertyLimit?: number;
    liabilityLimit?: number;
    valuationBasis?: string;
    endorsements?: string[];
    coverageLimits?: string;
    startDate?: Date;
    expiryDate?: Date;
    coverageType?: string;
  };
  suggestedActions: string[];
  rawText?: string;
  /** Where each extracted field appears in the file, as the reader reported it (unverified). Keys are extractedData keys. */
  fieldLocations?: Record<string, { page: number | null; box: PageBox | null }>;
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
- Dwelling coverage limit
- Personal-property coverage limit
- Personal liability limit
- Valuation basis (for example replacement cost or actual cash value)
- Listed endorsements
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
    "dwellingLimit": number or null,
    "personalPropertyLimit": number or null,
    "liabilityLimit": number or null,
    "valuationBasis": "string or null",
    "endorsements": ["string"] or null,
    "coverageLimits": "string or null",
    "startDate": "YYYY-MM-DD or null",
    "expiryDate": "YYYY-MM-DD or null",
    "coverageType": "string or null"
  },
  "suggestedActions": ["action1", "action2"],
  "fieldLocations": {
    "<an extractedData key you filled in>": { "page": 1-based page number or null, "box": [ymin, xmin, ymax, xmax] or null }
  }
}

For fieldLocations, give only the fields you actually extracted. "box" is where that value is printed, as four numbers from 0 to 1000 relative to the page (top-left is 0,0). Use null for page or box when you cannot tell. Never guess a location.`;

// Material Specs' AI-review pipeline (Slice 5 of the continuity plan):
// extracts only what's visibly printed on a product photo (paint can,
// tile box, hardware label) — deliberately narrower than
// DOCUMENT_ANALYSIS_PROMPT's warranty/receipt/insurance fields, since
// those aren't visible on a product label. No confidence-per-field: the
// model returns one overall number, same limitation already documented
// on homeRecordsExtraction.service.ts's warranty/receipt candidates.
const MATERIAL_PHOTO_ANALYSIS_PROMPT = `Analyze this photo of a home material or product (e.g. paint can, tile box, flooring sample, hardware label, or product sticker).

Extract ONLY what is visibly printed or shown on the label/packaging in the photo. Do not guess or infer a value that is not actually visible — leave it null instead.

Return ONLY valid JSON with this EXACT structure (no markdown, no code blocks):
{
  "confidence": 0.0-1.0,
  "extractedData": {
    "manufacturer": "string or null",
    "productLine": "string or null",
    "productName": "string or null",
    "sku": "string or null",
    "colorCode": "string or null",
    "finish": "string or null",
    "dimensions": "string or null",
    "material": "string or null"
  }
}`;

const DEFAULT_AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 10_000);
const DOCUMENT_AI_TIMEOUT_MS = Number(process.env.DOCUMENT_AI_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS);
const AI_CIRCUIT_FAILURE_THRESHOLD = Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD || 3);
const AI_CIRCUIT_OPEN_MS = Number(process.env.AI_CIRCUIT_OPEN_MS || 30_000);
const documentIntelligenceCircuit = new AICircuitBreaker('document-intelligence', {
  failureThreshold: AI_CIRCUIT_FAILURE_THRESHOLD,
  openMs: AI_CIRCUIT_OPEN_MS,
});

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

      const response = await documentIntelligenceCircuit.execute(async () =>
        withTimeout(
          async () => {
            const model = resolveGovernedAIModel('FAST');
            return executeGovernedAIRequest({ routeId: 'ai:document-intelligence', model, structuredOutputRequired: true, structuredOutputConfigured: true, work: () => this.ai.models.generateContent({
              model,
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
                maxOutputTokens: 2000, // room for fieldLocations; a truncated reply would be unparseable
                temperature: 0.1, // Low temperature for accuracy
                responseMimeType: 'application/json',
              }
            }) });
          },
          {
            timeoutMs: DOCUMENT_AI_TIMEOUT_MS,
            operation: 'document_analysis',
          }
        )
      );

      const text = response.text;
      if (!text) {
        throw new APIError('AI service returned an empty response', 502, 'AI_EMPTY_RESPONSE');
      }
      logger.info(
        { responseLength: text.length },
        '[DOC-INTELLIGENCE] AI response received'
      );

      // Clean response (remove markdown code blocks if present)
      const cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const insights: DocumentInsights = JSON.parse(cleanedText);
      // Locations are optional and unverified: keep only well-formed ones, for fields that were actually extracted.
      const rawLocations = (insights.fieldLocations ?? {}) as Record<string, { page?: unknown; box?: unknown }>;
      const locations: NonNullable<DocumentInsights['fieldLocations']> = {};
      for (const [key, value] of Object.entries(rawLocations)) {
        if (!value || typeof value !== 'object' || (insights.extractedData as Record<string, unknown> | undefined)?.[key] == null) continue;
        const page = sanitizePage(value.page);
        const box = sanitizeBox(value.box);
        if (page !== null || box !== null) locations[key] = { page, box };
      }
      insights.fieldLocations = Object.keys(locations).length > 0 ? locations : undefined;

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
      if (error instanceof APIError) {
        throw error;
      }
      if (error instanceof AITimeoutError) {
        throw new APIError('Document analysis timed out. Please try again.', 504, 'AI_TIMEOUT');
      }
      if (error instanceof AICircuitOpenError) {
        throw new APIError(
          'Document analysis is temporarily unavailable due to upstream failures. Please retry shortly.',
          503,
          'AI_CIRCUIT_OPEN',
          { retryAfterMs: error.retryAfterMs }
        );
      }
      if (error instanceof SyntaxError) {
        logger.warn({ err: error }, '[DOC-INTELLIGENCE] Non-JSON AI response; using fallback insights');
        return {
          documentType: 'UNKNOWN',
          confidence: 0,
          extractedData: {},
          suggestedActions: ['Manual review required - AI response format was invalid'],
          rawText: error.message
        };
      }

      logger.error({ err: error }, '[DOC-INTELLIGENCE] Analysis error');
      throw new APIError('Failed to analyze document with AI service.', 502, 'AI_UPSTREAM_ERROR');
    }
  }

  // Slice 4 of the continuity plan (§8): "add OCR/full-text and structured
  // search" — a separate, simpler call from analyzeDocument()'s structured-
  // field extraction (different prompt, no JSON schema, no record-type
  // restriction). Callers treat a thrown error or null text as "extraction
  // unavailable for this document" and keep the record searchable by
  // title/description alone — never a reason to fail the upload itself.
  async extractFullText(
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<{ text: string } | null> {
    const base64Data = fileBuffer.toString('base64');
    const response = await documentIntelligenceCircuit.execute(async () =>
      withTimeout(
        async () => {
          const model = resolveGovernedAIModel('FAST');
          return executeGovernedAIRequest({ routeId: 'ai:document-intelligence', model, work: () => this.ai.models.generateContent({
            model,
            contents: [{
              role: 'user',
              parts: [
                {
                  text: 'Transcribe all readable text from this document, in reading order. '
                    + 'Return only the transcribed text with no commentary, headers, or markdown formatting. '
                    + 'If the document contains no readable text, return an empty response.',
                },
                { inlineData: { mimeType, data: base64Data } },
              ],
            }],
            config: {
              maxOutputTokens: 4000,
              temperature: 0,
            },
          }) });
        },
        {
          timeoutMs: DOCUMENT_AI_TIMEOUT_MS,
          operation: 'document_text_extraction',
        },
      )
    );

    const text = response.text?.trim();
    if (!text) return null;
    return { text };
  }

  // See MATERIAL_PHOTO_ANALYSIS_PROMPT above. Deliberately lets
  // AITimeoutError/AICircuitOpenError/upstream errors propagate — this is
  // always called from a fire-and-forget wrapper (materialSpec.service.ts's
  // runPhotoExtraction) whose own try/catch is the actual failure boundary,
  // matching extractFullText()'s same contract.
  async analyzeMaterialPhoto(
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<{ candidateFields: Record<string, string>; confidence: number }> {
    const base64Data = fileBuffer.toString('base64');
    const response = await documentIntelligenceCircuit.execute(async () =>
      withTimeout(
        async () => {
          const model = resolveGovernedAIModel('FAST');
          return executeGovernedAIRequest({ routeId: 'ai:document-intelligence', model, structuredOutputRequired: true, structuredOutputConfigured: true, work: () => this.ai.models.generateContent({
            model,
            contents: [{
              role: 'user',
              parts: [
                { text: MATERIAL_PHOTO_ANALYSIS_PROMPT },
                { inlineData: { mimeType, data: base64Data } },
              ],
            }],
            config: {
              maxOutputTokens: 500,
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }) });
        },
        {
          timeoutMs: DOCUMENT_AI_TIMEOUT_MS,
          operation: 'material_photo_analysis',
        },
      )
    );

    const text = response.text;
    if (!text) return { candidateFields: {}, confidence: 0 };

    const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed: { confidence?: number; extractedData?: Record<string, unknown> };
    try {
      parsed = JSON.parse(cleanedText);
    } catch (error) {
      logger.warn({ err: error }, '[DOC-INTELLIGENCE] Non-JSON material-photo AI response; treating as nothing extracted');
      return { candidateFields: {}, confidence: 0 };
    }

    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    const candidateFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.extractedData ?? {})) {
      if (typeof value === 'string' && value.trim()) candidateFields[key] = value.trim();
    }
    return { candidateFields, confidence };
  }

  // Quote extraction (Quote Comparison import design §3.2): a typed, validated reply, not the general document insights. Like analyzeMaterialPhoto,
  // upstream failures (timeout, open circuit) propagate to the caller, which owns the failure boundary; an unreadable or off-schema reply is a
  // FAILED parse, never an empty quote.
  async analyzeServiceQuote(fileBuffer: Buffer, mimeType: string): Promise<ServiceQuoteParse & { modelId: string }> {
    const base64Data = fileBuffer.toString('base64');
    const model = resolveGovernedAIModel('FAST');
    const response = await documentIntelligenceCircuit.execute(async () =>
      withTimeout(
        async () => executeGovernedAIRequest({ routeId: 'ai:document-intelligence', model, structuredOutputRequired: true, structuredOutputConfigured: true, work: () => this.ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: SERVICE_QUOTE_ANALYSIS_PROMPT }, { inlineData: { mimeType, data: base64Data } }] }],
          config: { maxOutputTokens: 6000, temperature: 0, responseMimeType: 'application/json' },
        }) }),
        { timeoutMs: DOCUMENT_AI_TIMEOUT_MS * 3, operation: 'service_quote_analysis' },
      )
    );
    const parse = parseServiceQuoteResponse(response.text);
    if (parse.status === 'FAILED') logger.warn({ reason: parse.reason }, '[DOC-INTELLIGENCE] Quote extraction reply was not usable');
    return { ...parse, modelId: String(model) };
  }

}

export const documentIntelligenceService = new DocumentIntelligenceService();

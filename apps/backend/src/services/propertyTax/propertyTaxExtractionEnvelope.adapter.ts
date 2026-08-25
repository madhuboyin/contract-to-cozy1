import type { ExtractionEnvelope } from '../intelligence/extractionEnvelope.contract';

export type PropertyTaxStagedField = {
  fieldKey: string;
  value: unknown;
  confidence?: number;
  pageNumber?: number;
  sourceText?: string;
};

export function propertyTaxFieldsToExtractionEnvelope(input: {
  documentId: string;
  fields: PropertyTaxStagedField[];
  method: 'MANUAL' | 'OCR' | 'AI';
  provider?: string | null;
  model?: string | null;
  extractedAt?: Date;
}): ExtractionEnvelope {
  const envelopeValue = (value: unknown): string | number | boolean | readonly string[] | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value;
    return JSON.stringify(value) ?? null;
  };
  return {
    documentId: input.documentId,
    documentVersionId: null,
    extractorId: input.provider ?? `property-tax-${input.method.toLowerCase()}`,
    extractorVersion: 'v1',
    modelId: input.model ?? null,
    candidateEntityType: 'PROPERTY_TAX',
    fields: input.fields.map((field) => ({
      fieldKey: field.fieldKey,
      value: envelopeValue(field.value),
      confidence: field.confidence ?? (input.method === 'MANUAL' ? 1 : null),
      evidence: {
        page: field.pageNumber ?? null,
        excerpt: field.sourceText ?? null,
      },
    })),
    overallConfidence: input.fields.length
      ? Math.min(...input.fields.map((field) => field.confidence ?? (input.method === 'MANUAL' ? 1 : 0)))
      : null,
    parseStatus: input.fields.length > 0 ? 'PARSED' : 'FALLBACK_UNSTRUCTURED',
    warnings: input.fields.length > 0 ? [] : ['No property-tax fields were staged.'],
    extractedAt: (input.extractedAt ?? new Date()).toISOString(),
  };
}

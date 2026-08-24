// Home Intelligence Functional Completeness FRD §8.7 (HI-DOC-001), Phase 5
// work item 3 — wraps documentIntelligenceService's existing DocumentInsights
// output (the AI extractor already used by homeRecordsExtraction.service.ts's
// promoteWarranty/promoteExpense/promoteInsurancePolicy) into the common
// ExtractionEnvelope contract. Purely additive: the AI prompt, model call,
// and DocumentInsights shape are untouched — this only reshapes an already-
// computed result, so no extraction behavior changes.
import type { DocumentInsights } from './documentIntelligence.service';
import type { ExtractionCandidateField, ExtractionEnvelope, ExtractionParseStatus } from './intelligence/extractionEnvelope.contract';

export const DOCUMENT_INTELLIGENCE_EXTRACTOR_ID = 'document-intelligence-gemini';
export const DOCUMENT_INTELLIGENCE_MODEL_ID = 'gemini-2.0-flash';
export const DOCUMENT_INTELLIGENCE_EXTRACTOR_VERSION = 'v1';

// The exact fallback DocumentInsights object documentIntelligence.service.ts's
// analyzeDocument() catch block returns on a non-JSON AI response — the only
// signal available today that parsing actually failed (a legitimately
// AI-classified UNKNOWN document is still a successful JSON parse and must
// not be reported as FAILED).
const FALLBACK_SUGGESTED_ACTION = 'Manual review required - AI response format was invalid';

function isKnownParseFallback(insights: DocumentInsights): boolean {
  return insights.documentType === 'UNKNOWN'
    && insights.confidence === 0
    && insights.suggestedActions.length === 1
    && insights.suggestedActions[0] === FALLBACK_SUGGESTED_ACTION;
}

const LOW_CONFIDENCE_WARNING_THRESHOLD = 0.5;

function fieldValue(value: unknown): ExtractionCandidateField['value'] {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

export function documentInsightsToExtractionEnvelope(
  insights: DocumentInsights,
  meta: { documentId?: string | null; documentVersionId?: string | null; extractedAt?: Date } = {},
): ExtractionEnvelope {
  const parseStatus: ExtractionParseStatus = isKnownParseFallback(insights) ? 'FAILED' : 'PARSED';

  const fields: ExtractionCandidateField[] = parseStatus === 'FAILED'
    ? []
    : Object.entries(insights.extractedData)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([fieldKey, value]) => ({
        fieldKey,
        value: fieldValue(value),
        // The extractor reports one overall confidence today, not
        // per-field — every field shares it rather than inventing a
        // per-field number the model never actually produced.
        confidence: insights.confidence,
      }));

  const warnings: string[] = parseStatus === 'FAILED'
    ? [...insights.suggestedActions]
    : insights.confidence < LOW_CONFIDENCE_WARNING_THRESHOLD
      ? [`Low extraction confidence (${insights.confidence.toFixed(2)}) — review every field before promoting.`]
      : [];

  return {
    documentId: meta.documentId ?? null,
    documentVersionId: meta.documentVersionId ?? null,
    extractorId: DOCUMENT_INTELLIGENCE_EXTRACTOR_ID,
    extractorVersion: DOCUMENT_INTELLIGENCE_EXTRACTOR_VERSION,
    modelId: DOCUMENT_INTELLIGENCE_MODEL_ID,
    candidateEntityType: insights.documentType,
    fields,
    overallConfidence: parseStatus === 'FAILED' ? 0 : insights.confidence,
    parseStatus,
    warnings,
    extractedAt: (meta.extractedAt ?? new Date()).toISOString(),
  };
}

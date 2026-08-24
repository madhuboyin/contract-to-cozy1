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

// Home Intelligence Functional Completeness FRD Phase 5 work item 4 —
// wraps documentIntelligenceService.analyzeMaterialPhoto()'s output
// (materialSpec.service.ts's runPhotoExtraction) into the same
// ExtractionEnvelope contract. analyzeMaterialPhoto returns { candidateFields,
// confidence }, a different shape from DocumentInsights, so this is a
// separate mapping rather than a shared code path with
// documentInsightsToExtractionEnvelope — but unlike that adapter,
// analyzeMaterialPhoto's own catch block makes "the AI response wasn't
// valid JSON" and "the model genuinely found nothing on the label"
// indistinguishable (both return { candidateFields: {}, confidence: 0 } —
// see documentIntelligence.service.ts). Reporting either as FAILED would
// overclaim a parse error that may not have happened, and reporting either
// as PARSED would violate this contract's own "PARSED implies at least one
// field" invariant — FALLBACK_UNSTRUCTURED is exactly the status this third
// value exists for.
export const MATERIAL_PHOTO_EXTRACTOR_ID = 'document-intelligence-gemini-material-photo';

export function materialPhotoInsightsToExtractionEnvelope(
  insights: { candidateFields: Record<string, string>; confidence: number },
  meta: { documentId?: string | null; documentVersionId?: string | null; extractedAt?: Date } = {},
): ExtractionEnvelope {
  const fieldEntries = Object.entries(insights.candidateFields);
  const parseStatus: ExtractionParseStatus = fieldEntries.length === 0 ? 'FALLBACK_UNSTRUCTURED' : 'PARSED';

  return {
    documentId: meta.documentId ?? null,
    documentVersionId: meta.documentVersionId ?? null,
    extractorId: MATERIAL_PHOTO_EXTRACTOR_ID,
    extractorVersion: DOCUMENT_INTELLIGENCE_EXTRACTOR_VERSION,
    modelId: DOCUMENT_INTELLIGENCE_MODEL_ID,
    candidateEntityType: 'MATERIAL_SPEC',
    fields: fieldEntries.map(([fieldKey, value]) => ({ fieldKey, value, confidence: insights.confidence })),
    overallConfidence: parseStatus === 'PARSED' ? insights.confidence : null,
    parseStatus,
    warnings: parseStatus === 'FALLBACK_UNSTRUCTURED'
      ? ['No fields could be read from this photo — the label may be unclear, or nothing matched the expected format.']
      : [],
    extractedAt: (meta.extractedAt ?? new Date()).toISOString(),
  };
}

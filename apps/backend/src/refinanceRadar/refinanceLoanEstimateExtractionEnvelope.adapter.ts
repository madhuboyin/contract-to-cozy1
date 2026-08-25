// Home Intelligence Functional Completeness FRD §8.7 (HI-DOC-001), Phase 5
// work item 4 — wraps refinanceLoanEstimateExtraction.service.ts's own
// RefinanceLoanEstimateExtraction output into the common ExtractionEnvelope
// contract. This extractor is deterministic (PDF text/OCR + regex
// matching, not AI-backed), unlike documentIntelligenceService — a
// separate adapter rather than reusing
// documentIntelligenceExtractionEnvelope.adapter.ts's AI-specific one.
// The live controller returns this envelope alongside the editable raw
// extraction and a server attestation. The homeowner may correct prefilled
// offer values, but cannot fabricate document-derived provenance at save.
import type { RefinanceLoanEstimateExtraction } from './refinanceLoanEstimateExtraction.service';
import type { ExtractionCandidateField, ExtractionEnvelope, ExtractionParseStatus } from '../services/intelligence/extractionEnvelope.contract';

export const LOAN_ESTIMATE_EXTRACTOR_ID = 'refinance-loan-estimate-parser';
export const LOAN_ESTIMATE_EXTRACTOR_VERSION = 'v1';

const CONFIDENCE_BY_TIER: Record<'HIGH' | 'MEDIUM', number> = {
  HIGH: 0.9,
  MEDIUM: 0.6,
};

function resolveParseStatus(extraction: RefinanceLoanEstimateExtraction): ExtractionParseStatus {
  if (extraction.pageIntegrity.status === 'UNVERIFIED' || extraction.requiredFieldsFound === 0) {
    return 'FAILED';
  }
  if (
    extraction.pageIntegrity.status !== 'COMPLETE'
    || extraction.requiredFieldsFound < extraction.requiredFieldCount
  ) {
    return 'FALLBACK_UNSTRUCTURED';
  }
  return 'PARSED';
}

export function loanEstimateExtractionToEnvelope(
  extraction: RefinanceLoanEstimateExtraction,
  meta: { documentId?: string | null; documentVersionId?: string | null; extractedAt?: Date } = {},
): ExtractionEnvelope {
  const parseStatus = resolveParseStatus(extraction);

  const fields: ExtractionCandidateField[] = parseStatus === 'FAILED'
    ? []
    : Object.entries(extraction.fields)
      .filter(([, field]) => field.confidence !== 'MISSING' && field.value !== null)
      .map(([fieldKey, field]) => ({
        fieldKey,
        value: field.value as ExtractionCandidateField['value'],
        confidence: CONFIDENCE_BY_TIER[field.confidence as 'HIGH' | 'MEDIUM'] ?? null,
        evidence: { excerpt: field.sourceLabel },
      }));

  return {
    documentId: meta.documentId ?? null,
    documentVersionId: meta.documentVersionId ?? null,
    extractorId: LOAN_ESTIMATE_EXTRACTOR_ID,
    extractorVersion: LOAN_ESTIMATE_EXTRACTOR_VERSION,
    // Deterministic parser — no AI model involved.
    modelId: null,
    candidateEntityType: 'LOAN_ESTIMATE',
    fields,
    overallConfidence: parseStatus === 'FAILED'
      ? 0
      : extraction.documentConfidencePct != null
        ? extraction.documentConfidencePct / 100
        : null,
    parseStatus,
    warnings: extraction.warnings,
    extractedAt: (meta.extractedAt ?? new Date()).toISOString(),
  };
}

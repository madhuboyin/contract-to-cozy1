/**
 * Home Intelligence Functional Completeness FRD §8.7 (HI-DOC-001) — the
 * common extraction envelope every document/photo extraction service
 * shall return before any domain-specific candidate mapping happens.
 * Phase 5 work item 3.
 *
 * This is a per-call runtime contract (validated by
 * validateExtractionEnvelope against a real instance), not a startup
 * registry — see documentPromotionAdapterRegistry.contract.ts for the
 * HI-DOC-003 registry this envelope feeds into.
 */

export const EXTRACTION_PARSE_STATUSES = ['PARSED', 'FALLBACK_UNSTRUCTURED', 'FAILED'] as const;
export type ExtractionParseStatus = typeof EXTRACTION_PARSE_STATUSES[number];

export interface ExtractionEvidenceLocation {
  page?: number | null;
  excerpt?: string | null;
  excerptHash?: string | null;
}

export interface ExtractionCandidateField {
  fieldKey: string;
  value: string | number | boolean | readonly string[] | null;
  /** null when the extractor reports one overall confidence rather than per-field — see overallConfidence. */
  confidence: number | null;
  evidence?: ExtractionEvidenceLocation;
}

export interface ExtractionEnvelope {
  /** Document Vault id when the source is a stored Document; null for a photo/upload with no durable document row (e.g. a Material Spec photo). */
  documentId: string | null;
  /** PropertyRecordVersion id, when the source flows through Home Records; null otherwise. */
  documentVersionId: string | null;
  extractorId: string;
  extractorVersion: string;
  /** The underlying AI model id, when the extractor is AI-backed; null for a deterministic parser. */
  modelId: string | null;
  /** The extractor's own classification of what it found (e.g. "WARRANTY", "INSURANCE") — informational, not itself a promotion target. */
  candidateEntityType: string;
  fields: readonly ExtractionCandidateField[];
  overallConfidence: number | null;
  parseStatus: ExtractionParseStatus;
  warnings: readonly string[];
  extractedAt: string;
}

export function validateExtractionEnvelope(envelope: ExtractionEnvelope): string[] {
  const issues: string[] = [];
  if (!envelope.extractorId.trim()) issues.push('ExtractionEnvelope is missing extractorId.');
  if (!envelope.extractorVersion.trim()) issues.push('ExtractionEnvelope is missing extractorVersion.');
  if (!envelope.candidateEntityType.trim()) issues.push('ExtractionEnvelope is missing candidateEntityType.');
  if (!EXTRACTION_PARSE_STATUSES.includes(envelope.parseStatus)) {
    issues.push(`ExtractionEnvelope has an unknown parseStatus "${envelope.parseStatus}".`);
  }
  if (envelope.parseStatus === 'PARSED' && envelope.fields.length === 0) {
    issues.push('ExtractionEnvelope reports PARSED but declares no candidate fields.');
  }
  if (envelope.parseStatus === 'FAILED' && envelope.fields.length > 0) {
    issues.push('ExtractionEnvelope reports FAILED but declares candidate fields — a failed parse must not carry candidates a caller might promote.');
  }
  if (envelope.overallConfidence != null && (envelope.overallConfidence < 0 || envelope.overallConfidence > 1)) {
    issues.push('ExtractionEnvelope overallConfidence must be a 0..1 ratio.');
  }
  for (const field of envelope.fields) {
    if (!field.fieldKey.trim()) issues.push('ExtractionEnvelope declares a field with no fieldKey.');
    if (field.confidence != null && (field.confidence < 0 || field.confidence > 1)) {
      issues.push(`ExtractionEnvelope field "${field.fieldKey}" confidence must be a 0..1 ratio.`);
    }
  }
  return issues;
}

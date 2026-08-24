// Home Intelligence Functional Completeness FRD §8.7 (HI-DOC-001/HI-DOC-006),
// Phase 5 work item 5 — wraps inspectionExtraction.service.ts's Gemini-based
// finding extraction into the common ExtractionEnvelope contract.
//
// Unlike the single-entity extractors (Warranty/Insurance/Material Spec/
// Loan Estimate), one inspection extraction call produces a *batch* of
// distinct candidate records, each already multi-field in its own right
// (homeSystem, severity, inspectorDescription, ...). Forcing every one of
// those fields into the envelope's flat fields[] would either lose the
// per-finding grouping or require a nested shape the contract doesn't
// have. Instead, this envelope describes the *extraction call's* own
// outcome — one fields[] entry per accepted finding, compactly summarized
// — which is what HI-DOC-001's parseStatus/warnings/confidence signals
// are actually about; each finding's full structured detail already lives
// in its own canonical InspectionFinding row.
//
// callGemini() only ever returns on a successful, schema-valid AI JSON
// response (a malformed response throws AI_PARSE_ERROR before this
// adapter would ever run) — so this envelope's only real ambiguity is the
// same one HI-DOC-006 exists to make visible: a findings array that
// parsed but had every entry filtered out by
// callGemini's own validation (invalid homeSystem or missing
// inspectorDescription) is indistinguishable, from the report row alone,
// from a genuinely clean inspection with nothing to flag.
import type { ExtractionCandidateField, ExtractionEnvelope, ExtractionParseStatus } from './intelligence/extractionEnvelope.contract';

export const INSPECTION_EXTRACTOR_ID = 'inspection-extraction-gemini';
export const INSPECTION_EXTRACTOR_VERSION = 'v1';
export const INSPECTION_MODEL_ID = 'gemini-1.5-flash';

const CONFIDENCE_BY_TIER: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = {
  HIGH: 0.9,
  MEDIUM: 0.6,
  LOW: 0.35,
};

export interface InspectionExtractionFindingSummary {
  homeSystem: string;
  severity: string;
  inspectorDescription: string;
  extractionConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export function inspectionExtractionToEnvelope(
  findings: readonly InspectionExtractionFindingSummary[],
  rawFindingCount: number,
  meta: { documentId?: string | null; documentVersionId?: string | null; extractedAt?: Date } = {},
): ExtractionEnvelope {
  // The AI returned a findings array (callGemini didn't throw) but every
  // entry failed validation and was dropped — a schema-mismatch signal
  // worth surfacing, not the same as "this inspection had nothing to
  // report." rawFindingCount > 0 with an empty accepted list is exactly
  // that case.
  const droppedEverything = rawFindingCount > 0 && findings.length === 0;
  const parseStatus: ExtractionParseStatus = droppedEverything ? 'FALLBACK_UNSTRUCTURED' : 'PARSED';

  const fields: ExtractionCandidateField[] = findings.map((finding, index) => ({
    fieldKey: `finding-${index}-${finding.homeSystem}`,
    value: `${finding.severity}: ${finding.inspectorDescription}`.slice(0, 500),
    confidence: CONFIDENCE_BY_TIER[finding.extractionConfidence] ?? null,
  }));

  const averageConfidence = findings.length > 0
    ? findings.reduce((sum, f) => sum + (CONFIDENCE_BY_TIER[f.extractionConfidence] ?? 0), 0) / findings.length
    : null;

  return {
    documentId: meta.documentId ?? null,
    documentVersionId: meta.documentVersionId ?? null,
    extractorId: INSPECTION_EXTRACTOR_ID,
    extractorVersion: INSPECTION_EXTRACTOR_VERSION,
    modelId: INSPECTION_MODEL_ID,
    candidateEntityType: 'INSPECTION_FINDING',
    fields,
    overallConfidence: averageConfidence,
    parseStatus,
    warnings: droppedEverything
      ? [`The AI returned ${rawFindingCount} finding(s), but none passed validation (invalid homeSystem or missing description) — review the source PDF manually before treating this report as clean.`]
      : [],
    extractedAt: (meta.extractedAt ?? new Date()).toISOString(),
    // A batch extractor: zero fields on a genuinely clean inspection
    // (rawFindingCount also 0) is a legitimate PARSED outcome, not a bug —
    // see extractionEnvelope.contract.ts's isBatch doc comment.
    isBatch: true,
  };
}

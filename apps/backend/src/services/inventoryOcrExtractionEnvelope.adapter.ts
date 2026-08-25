// Home Intelligence Functional Completeness FRD §8.7 (HI-DOC-001), Phase 5
// remediation item (d) — wraps extractLabelFieldsFromImage's existing
// OcrExtractResult (inventoryOcr.service.ts) into the common
// ExtractionEnvelope contract, the same shape homeRecordsExtraction.service.ts
// and materialSpec.service.ts consume. Purely additive: the OCR passes,
// regex extraction, and confidence scoring are untouched — this only
// reshapes an already-computed result.
import type { OcrExtractResult } from './inventoryOcr.service';
import type { ExtractionCandidateField, ExtractionEnvelope, ExtractionParseStatus } from './intelligence/extractionEnvelope.contract';

export const INVENTORY_OCR_EXTRACTOR_ID = 'inventory-ocr-tesseract';
export const INVENTORY_OCR_EXTRACTOR_VERSION = 'v1';

// tesseract.js always completes its recognize() call (or the caller's own
// try/catch turns a real engine failure into a thrown error, a separate
// code path from this envelope entirely) — so an empty fields array here
// means "nothing on the label matched a known pattern," not an extractor
// crash. That is exactly what FALLBACK_UNSTRUCTURED is for, not FAILED.
export function inventoryOcrToExtractionEnvelope(
  ocr: OcrExtractResult,
  meta: { extractedAt?: Date } = {},
): ExtractionEnvelope {
  const parseStatus: ExtractionParseStatus = ocr.fields.length === 0 ? 'FALLBACK_UNSTRUCTURED' : 'PARSED';

  const fields: ExtractionCandidateField[] = ocr.fields.map((field) => ({
    fieldKey: field.key,
    value: field.value,
    confidence: ocr.confidenceByField[field.key] ?? field.confidence ?? null,
  }));

  const overallConfidence = parseStatus === 'PARSED'
    ? fields.reduce((sum, field) => sum + (field.confidence ?? 0), 0) / fields.length
    : null;

  return {
    documentId: null,
    documentVersionId: null,
    extractorId: INVENTORY_OCR_EXTRACTOR_ID,
    extractorVersion: INVENTORY_OCR_EXTRACTOR_VERSION,
    // tesseract is a deterministic OCR engine, not an AI model call.
    modelId: null,
    candidateEntityType: 'INVENTORY_ITEM',
    fields,
    overallConfidence,
    parseStatus,
    warnings: parseStatus === 'FALLBACK_UNSTRUCTURED'
      ? ['No recognizable label fields were found in this image — the label may be unclear, glare-affected, or outside the extractor\'s supported patterns.']
      : [],
    extractedAt: (meta.extractedAt ?? new Date()).toISOString(),
  };
}

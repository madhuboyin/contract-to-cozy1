import type { ExtractionEnvelope } from '../intelligence/extractionEnvelope.contract';

export function claimDocumentToExtractionEnvelope(input: {
  documentId: string;
  claimDocumentType: string;
  fileName: string;
  mimeType: string;
  title?: string | null;
  notes?: string | null;
  extractedAt?: Date;
}): ExtractionEnvelope {
  const fields = [
    { fieldKey: 'claimDocumentType', value: input.claimDocumentType },
    { fieldKey: 'fileName', value: input.fileName },
    { fieldKey: 'mimeType', value: input.mimeType },
    ...(input.title ? [{ fieldKey: 'title', value: input.title }] : []),
    ...(input.notes ? [{ fieldKey: 'notes', value: input.notes }] : []),
  ].map((field) => ({ ...field, confidence: 1, evidence: undefined }));

  return {
    documentId: input.documentId,
    documentVersionId: null,
    extractorId: 'claim-document-homeowner-upload',
    extractorVersion: 'v1',
    modelId: null,
    candidateEntityType: 'CLAIM',
    fields,
    overallConfidence: 1,
    parseStatus: 'PARSED',
    warnings: [],
    extractedAt: (input.extractedAt ?? new Date()).toISOString(),
  };
}

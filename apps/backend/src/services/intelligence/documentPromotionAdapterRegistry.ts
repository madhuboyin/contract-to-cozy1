import type { DocumentPromotionAdapterEntry } from './documentPromotionAdapterRegistry.contract';

/**
 * Home Intelligence Functional Completeness FRD §15 Phase 5 work item 3
 * (HI-DOC-003) — one row per target domain, confirmed by direct code
 * read rather than assumed from the FRD's own gap language. Two domains
 * (MATERIAL_SPEC, INSPECTION_FINDING) turned out to already have a real,
 * working, review-gated promotion adapter through a domain-specific model
 * of their own (MaterialExtractionReview, legacy inspection findings) —
 * not through the shared ExtractedFactCandidate table WARRANTY/EXPENSE/
 * INSURANCE_POLICY use, and not yet consuming the common ExtractionEnvelope
 * (HI-DOC-001) — but a real adapterExists row nonetheless, correcting an
 * earlier, less-verified "3 of ~10 adapters exist" estimate.
 */
export const DOCUMENT_PROMOTION_ADAPTER_REGISTRY: readonly DocumentPromotionAdapterEntry[] = [
  {
    targetDomain: 'WARRANTY',
    adapterExists: true,
    adapterFunction: 'HomeRecordsExtractionService.promoteWarranty',
    sourceFile: 'apps/backend/src/services/homeRecordsExtraction.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: true,
    notes: 'Candidates persisted as ExtractedFactCandidate (targetDomain WARRANTY), confirmed/corrected/rejected before promoteWarranty writes a canonical Warranty row. Corrected 2026-08-24 (Phase 5 remediation item e): warrantyCandidatesFromEnvelope now reads only from the ExtractionEnvelope (documentInsightsToExtractionEnvelope) — the envelope is the actual return contract this code consumes, not a side artifact built only for parseStatus/warnings logging. Field-name renaming (manufacturer/vendor -> providerName, etc.), date formatting (envelope Date fields are full ISO timestamps; sliced to the same 10-character date the prior direct-DocumentInsights read produced), and category normalization are unchanged — verified behavior-preserving against the existing runExtraction test coverage (homeRecordsExtraction.test.js, 20/20 passing). Phase 5 work item 6 added conflictDetection: promoteWarranty itself still does not check for an existing active Warranty in the same category before creating a new one, but loadWarrantyConflictActions (homeActionSourcePromotion.service.ts) live-correlates active warranties per category on every read and surfaces a Home Action when two disagree on provider or expiry, routing to Property Context\'s own registered warranty correction path (/dashboard/warranties, factCatalog.ts\'s coverage.warranties entry).',
  },
  {
    targetDomain: 'EXPENSE',
    adapterExists: true,
    adapterFunction: 'HomeRecordsExtractionService.promoteExpense',
    sourceFile: 'apps/backend/src/services/homeRecordsExtraction.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: true,
    notes: 'Same ExtractedFactCandidate (targetDomain EXPENSE) pipeline as WARRANTY, same 2026-08-24 correction: receiptCandidatesFromEnvelope now reads only from the ExtractionEnvelope. Phase 5 work item 6: expenses are discrete transactions, so repeats in one category are normal, not a conflict — loadExpenseDuplicateActions instead flags a likely duplicate entry (same amount within a 3-day window), which is the meaningful failure mode for this domain, live-correlated on every read.',
  },
  {
    targetDomain: 'INSURANCE_POLICY',
    adapterExists: true,
    adapterFunction: 'HomeRecordsExtractionService.promoteInsurancePolicy + stageExtractedPolicyTerm',
    sourceFile: 'apps/backend/src/services/homeRecordsExtraction.service.ts; apps/backend/src/services/insurancePolicyRecord.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: true,
    notes: 'Two-layer review: ExtractedFactCandidate (targetDomain INSURANCE_POLICY) gates promoteInsurancePolicy, which calls stageExtractedPolicyTerm to create a PENDING_CONFIRMATION InsurancePolicyTerm with its own per-field InsurancePolicyFact review (confirmPolicyFact). Corrected 2026-08-24 (Phase 5 remediation item e): insurancePolicyCandidatesFromEnvelope now reads only from the ExtractionEnvelope, same migration as WARRANTY/EXPENSE. Home Intelligence FRD Phase 5 work item 2 rule 7 (HI-CMP-002, DOCUMENT_PROMOTED_FACT_CONFLICT) added the conflictDetection: loadInsurancePolicyFactConflictActions (homeActionSourcePromotion.service.ts) surfaces a Home Action when a pending fact disagrees with an already-CONFIRMED fact on another term of the same policy.',
  },
  {
    targetDomain: 'MATERIAL_SPEC',
    adapterExists: true,
    adapterFunction: 'MaterialSpecService.reviewExtraction',
    sourceFile: 'apps/backend/src/services/materialSpec.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: false,
    notes: 'A parallel, domain-specific review-gated candidate system (MaterialExtractionReview, not ExtractedFactCandidate) — CONFIRMED writes reviewedFields into the canonical MaterialSpec, matching the same "review before promotion" HI-DOC-002 principle through a different table. Phase 5 work item 4: runPhotoExtraction now wraps analyzeMaterialPhoto\'s own { candidateFields, confidence } output through materialPhotoInsightsToExtractionEnvelope before creating a review row, gated on parseStatus === \'PARSED\' — a photo with nothing readable reports FALLBACK_UNSTRUCTURED (not FAILED), since analyzeMaterialPhoto\'s own catch block makes a genuine parse failure and "nothing visible on the label" indistinguishable.',
  },
  {
    targetDomain: 'INSPECTION_FINDING',
    adapterExists: true,
    adapterFunction: 'ingestInspectionReport + applyWriteBacks',
    sourceFile: 'apps/backend/src/services/inspectionExtraction.service.ts; apps/backend/src/services/inspectionWriteBack.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: false,
    notes: 'Phase 5 work item 5 verified HI-DOC-006\'s "shall not maintain a separate finding truth" concern directly against the code: ingestInspectionReport writes straight into the canonical InspectionReport/InspectionFinding tables — there is no separate/duplicate finding store anywhere in the backend. The review gate is real, just report-level rather than per-field: InspectionFinding rows are created immediately (status OPEN) but every downstream consumer (loadInspectionFindingActions, work disposition, negotiation packages, report comparisons — inspectionHub.service.ts) hard-gates on report.status === \'CONFIRMED\', which only applyWriteBacks (inspectionWriteBack.service.ts) sets, after the homeowner reviews/corrects findings. ingestInspectionReport now also builds an ExtractionEnvelope (inspectionExtractionToEnvelope, a batch/isBatch envelope — one call extracts many findings, not fields for one record) and logs its warnings; a genuinely new signal this closes: the AI returning a findings array that fails validation on every entry is now distinguishable (FALLBACK_UNSTRUCTURED + a warning) from a genuinely clean inspection (PARSED, zero fields) — previously both looked identical (totalFindings: 0). No retirement needed — this is the live, only ingestion path for Inspection Hub, not a competing legacy system.',
  },
  {
    targetDomain: 'INVENTORY',
    adapterExists: true,
    adapterFunction: 'InventoryDraftService.confirmDraftToInventoryItem + InventoryDraftService.bulkConfirm',
    sourceFile: 'apps/backend/src/services/inventoryDraft.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: false,
    notes: 'Corrected 2026-08-24 (Phase 5 remediation item d): the prior "no persisted review-gated candidate, client-form-prefill only" note was factually wrong — extractLabelFieldsFromImage\'s output already becomes a persisted InventoryDraftItem (status DRAFT), the homeowner edits it in place, and confirmDraftToInventoryItem/bulkConfirm explicitly promote it into a canonical InventoryItem, exactly the same "persisted candidate, explicit confirm" shape WARRANTY/EXPENSE use. What was genuinely missing has been hardened, not rebuilt: both confirm paths are now transactional (previously two independent calls could leave a CONFIRMED-looking draft with no item on partial failure), the resulting InventoryItem now carries durable provenance back to its InventoryOcrSession (new sourceOcrSessionId field — distinct from sourceHash, the unrelated bulk-CSV-import dedup key), both emit a PropertyChange (HI-DOC-005) referencing the new item and inventory.items, and ocrLabelToDraft now wraps extractLabelFieldsFromImage\'s output through inventoryOcrExtractionEnvelope.adapter.ts (HI-DOC-001) for parseStatus/warning visibility. Also fixed in the same pass: createDraftFromOcr was writing the OCR session id into scanSessionId, a real foreign key to the unrelated InventoryRoomScanSession model (room-batch scans), not the InventoryOcrSession this flow actually created — now written to the correct sessionId field.',
  },
  {
    targetDomain: 'LOAN_ESTIMATE',
    adapterExists: true,
    adapterFunction: 'saveRefinanceLoanEstimateComparison',
    sourceFile: 'apps/backend/src/refinanceRadar/refinanceLoanEstimateSnapshot.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'CLIENT_FORM_PREFILL_ONLY',
    conflictDetection: false,
    notes: 'Corrected 2026-08-24 (Phase 5 remediation item d). reviewGate stays CLIENT_FORM_PREFILL_ONLY — extractLoanEstimateFromUpload still returns fields directly to the client for form prefill with no persisted candidate row, and that remains accurate — but saveRefinanceLoanEstimateComparison, the homeowner\'s save action, is now the registered promotion adapter: it is transactional and emits a PropertyChange (changeType DOCUMENT_PROMOTED when at least one saved offer carries extractionProvenance, else SOURCE_RECORD_CREATED for an all-hand-typed comparison) referencing the new RefinanceLoanEstimateComparisonSnapshot. The frontend does not need a new response field for this: RefinanceLoanEstimateExtraction.fields already carries per-field confidence and sourceLabel (evidence), which LoanEstimateComparisonCard.tsx\'s applyExtraction() now stamps onto the offer as extractionProvenance (extractorId/extractorVersion/parseStatus/extractedAt/fieldConfidence/fieldEvidence — the same shape loanEstimateExtractionEnvelope.adapter.ts\'s ExtractionEnvelope computes) — durable once saved, since offersJson is an existing JSON column, no schema change needed for it. A hand-typed offer with no extractionProvenance is unaffected. consumesExtractionEnvelope is true because the promoted record now durably carries envelope-shaped per-field provenance, even though the envelope object itself is never serialized over the wire a second time.',
  },
  {
    targetDomain: 'PROPERTY_TAX',
    adapterExists: false,
    adapterFunction: null,
    sourceFile: null,
    consumesExtractionEnvelope: false,
    reviewGate: 'NONE',
    conflictDetection: false,
    notes: 'No document extraction pipeline exists for property tax records at all — confirmed by direct code search (no PropertyTaxExtraction/extractPropertyTax anywhere in the backend). Property tax data entry today is homeowner-typed only.',
  },
  {
    targetDomain: 'CLAIM',
    adapterExists: false,
    adapterFunction: null,
    sourceFile: null,
    consumesExtractionEnvelope: false,
    reviewGate: 'NONE',
    conflictDetection: false,
    notes: 'No document extraction pipeline exists for claim records at all — confirmed by direct code search (no ClaimExtraction/extractClaim anywhere in the backend). Claim data entry today is homeowner-typed only.',
  },
];

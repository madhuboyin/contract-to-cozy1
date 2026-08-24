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
    consumesExtractionEnvelope: false,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: true,
    notes: 'Candidates persisted as ExtractedFactCandidate (targetDomain WARRANTY), confirmed/corrected/rejected before promoteWarranty writes a canonical Warranty row. Reads documentIntelligenceService.analyzeDocument()\'s raw DocumentInsights directly (warrantyCandidatesFromInsights) rather than the ExtractionEnvelope contract — the extractor call site now also builds an envelope alongside it (documentInsightsToExtractionEnvelope) for parseStatus/warnings visibility, but candidate mapping itself is unchanged. Phase 5 work item 6 added conflictDetection: promoteWarranty itself still does not check for an existing active Warranty in the same category before creating a new one, but loadWarrantyConflictActions (homeActionSourcePromotion.service.ts) live-correlates active warranties per category on every read and surfaces a Home Action when two disagree on provider or expiry, routing to Property Context\'s own registered warranty correction path (/dashboard/warranties, factCatalog.ts\'s coverage.warranties entry).',
  },
  {
    targetDomain: 'EXPENSE',
    adapterExists: true,
    adapterFunction: 'HomeRecordsExtractionService.promoteExpense',
    sourceFile: 'apps/backend/src/services/homeRecordsExtraction.service.ts',
    consumesExtractionEnvelope: false,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: true,
    notes: 'Same ExtractedFactCandidate (targetDomain EXPENSE) pipeline as WARRANTY. Phase 5 work item 6: expenses are discrete transactions, so repeats in one category are normal, not a conflict — loadExpenseDuplicateActions instead flags a likely duplicate entry (same amount within a 3-day window), which is the meaningful failure mode for this domain, live-correlated on every read.',
  },
  {
    targetDomain: 'INSURANCE_POLICY',
    adapterExists: true,
    adapterFunction: 'HomeRecordsExtractionService.promoteInsurancePolicy + stageExtractedPolicyTerm',
    sourceFile: 'apps/backend/src/services/homeRecordsExtraction.service.ts; apps/backend/src/services/insurancePolicyRecord.service.ts',
    consumesExtractionEnvelope: false,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: true,
    notes: 'Two-layer review: ExtractedFactCandidate (targetDomain INSURANCE_POLICY) gates promoteInsurancePolicy, which calls stageExtractedPolicyTerm to create a PENDING_CONFIRMATION InsurancePolicyTerm with its own per-field InsurancePolicyFact review (confirmPolicyFact). Home Intelligence FRD Phase 5 work item 2 rule 7 (HI-CMP-002, DOCUMENT_PROMOTED_FACT_CONFLICT) added the conflictDetection: loadInsurancePolicyFactConflictActions (homeActionSourcePromotion.service.ts) surfaces a Home Action when a pending fact disagrees with an already-CONFIRMED fact on another term of the same policy.',
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
    adapterExists: false,
    adapterFunction: null,
    sourceFile: null,
    consumesExtractionEnvelope: false,
    reviewGate: 'CLIENT_FORM_PREFILL_ONLY',
    conflictDetection: false,
    notes: 'extractLabelFieldsFromImage (services/inventoryOcr.service.ts) creates an InventoryOcrSession and returns OCR text/fields directly to the client for form prefill — there is no persisted review-gated candidate row and no server-side promotion adapter; the homeowner\'s own inventory-item form submission is the only review step.',
  },
  {
    targetDomain: 'LOAN_ESTIMATE',
    adapterExists: false,
    adapterFunction: null,
    sourceFile: null,
    consumesExtractionEnvelope: false,
    reviewGate: 'CLIENT_FORM_PREFILL_ONLY',
    conflictDetection: false,
    notes: 'extractLoanEstimateFromUpload (refinanceRadar/refinanceLoanEstimateExtraction.service.ts) returns extracted fields directly to the client (refinanceRadar.controller.ts) for form prefill — still no persisted review-gated candidate row and no server-side promotion adapter into PropertyFinancingProfile. Phase 5 work item 4 added loanEstimateExtractionToEnvelope (refinanceRadar/refinanceLoanEstimateExtractionEnvelope.adapter.ts), a tested envelope adapter for this extractor\'s output (per-field confidence and sourceLabel-as-evidence map cleanly — this was the best-fitting extractor for the shared contract of any domain) — but it is not yet wired into the controller\'s response, since that would change the API response contract the frontend already consumes and needs a coordinated frontend change this backend-only pass did not make. adapterExists stays false: the envelope adapter alone is not a promotion adapter.',
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

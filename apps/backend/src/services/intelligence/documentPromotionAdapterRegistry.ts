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
    conflictDetection: false,
    notes: 'Candidates persisted as ExtractedFactCandidate (targetDomain WARRANTY), confirmed/corrected/rejected before promoteWarranty writes a canonical Warranty row. Reads documentIntelligenceService.analyzeDocument()\'s raw DocumentInsights directly (warrantyCandidatesFromInsights) rather than the ExtractionEnvelope contract — the extractor call site now also builds an envelope alongside it (documentInsightsToExtractionEnvelope) for parseStatus/warnings visibility, but candidate mapping itself is unchanged. No conflict check against an existing active Warranty for the same category/item before promotion.',
  },
  {
    targetDomain: 'EXPENSE',
    adapterExists: true,
    adapterFunction: 'HomeRecordsExtractionService.promoteExpense',
    sourceFile: 'apps/backend/src/services/homeRecordsExtraction.service.ts',
    consumesExtractionEnvelope: false,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: false,
    notes: 'Same ExtractedFactCandidate (targetDomain EXPENSE) pipeline as WARRANTY. No conflict detection — an expense duplicate is a lower-stakes record than a coverage/warranty conflict, not yet reviewed as a priority gap.',
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
    consumesExtractionEnvelope: false,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: false,
    notes: 'A parallel, domain-specific review-gated candidate system (MaterialExtractionReview, not ExtractedFactCandidate) — CONFIRMED writes reviewedFields into the canonical MaterialSpec, matching the same "review before promotion" HI-DOC-002 principle through a different table. Extraction (documentIntelligenceService.analyzeMaterialPhoto) uses its own narrower prompt/shape (candidateFields, one overall confidence), not yet wrapped into the shared ExtractionEnvelope.',
  },
  {
    targetDomain: 'INSPECTION_FINDING',
    adapterExists: true,
    adapterFunction: 'ingestInspectionReport (legacy)',
    sourceFile: 'apps/backend/src/services/inspectionExtraction.service.ts',
    consumesExtractionEnvelope: false,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: false,
    notes: 'HI-DOC-006 explicitly targets this path for retirement/convergence: "legacy inspection extraction shall either promote into canonical Inspection Reports/Findings through the common adapter or be retired. It shall not maintain a separate finding truth." Marked adapterExists here because it genuinely ingests and creates InspectionFinding rows today, not because it already satisfies HI-DOC-003\'s "common adapter" bar — that convergence is Phase 5 work item 5, not yet done.',
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
    notes: 'extractLoanEstimateFromUpload (refinanceRadar/refinanceLoanEstimateExtraction.service.ts) returns extracted fields directly to the client (refinanceRadar.controller.ts) for form prefill — no persisted review-gated candidate row and no server-side promotion adapter into PropertyFinancingProfile.',
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

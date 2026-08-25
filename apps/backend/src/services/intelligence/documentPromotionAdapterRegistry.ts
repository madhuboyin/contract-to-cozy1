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
    notes: 'A parallel, domain-specific review-gated candidate system (MaterialExtractionReview, not ExtractedFactCandidate) — CONFIRMED writes reviewedFields into the selected canonical MaterialSpec, matching the same "review before promotion" HI-DOC-002 principle through a different table. Phase 5 work item 4: runPhotoExtraction wraps analyzeMaterialPhoto\'s own { candidateFields, confidence } output through materialPhotoInsightsToExtractionEnvelope before creating a review row, gated on parseStatus === \'PARSED\'. conflictDetection is false by design: review revises one explicitly selected spec rather than choosing between competing canonical records.',
  },
  {
    targetDomain: 'INSPECTION_FINDING',
    adapterExists: true,
    adapterFunction: 'ingestInspectionReport + applyWriteBacks',
    sourceFile: 'apps/backend/src/services/inspectionExtraction.service.ts; apps/backend/src/services/inspectionWriteBack.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: false,
    notes: 'ingestInspectionReport writes into the canonical InspectionReport/InspectionFinding tables — there is no separate finding truth. The report-level review gate blocks every downstream consumer until applyWriteBacks confirms the homeowner-reviewed report. inspectionExtractionToEnvelope is a batch envelope, distinguishing an unreadable extraction from a genuinely clean report. conflictDetection is false by design: findings are distinct observations, and corrections revise the selected finding/report rather than selecting an arbitrary duplicate fact.',
  },
  {
    targetDomain: 'INVENTORY',
    adapterExists: true,
    adapterFunction: 'InventoryDraftService.confirmDraftToInventoryItem + InventoryDraftService.bulkConfirm',
    sourceFile: 'apps/backend/src/services/inventoryDraft.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: false,
    notes: 'InventoryDraftItem is a persisted candidate: the homeowner edits it and confirmDraftToInventoryItem/bulkConfirm transactionally promote it into InventoryItem, retain OCR-session provenance, and emit PropertyChange. OCR values are consumed through inventoryOcrExtractionEnvelope. conflictDetection is false by design because separate household items are additive records; confirmation targets one explicit draft and never selects between competing values for one canonical item.',
  },
  {
    targetDomain: 'LOAN_ESTIMATE',
    adapterExists: true,
    adapterFunction: 'saveRefinanceLoanEstimateComparison',
    sourceFile: 'apps/backend/src/refinanceRadar/refinanceLoanEstimateSnapshot.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'CLIENT_FORM_PREFILL_ONLY',
    conflictDetection: false,
    notes: 'reviewGate stays CLIENT_FORM_PREFILL_ONLY: extraction prefills an editable homeowner form, and saveRefinanceLoanEstimateComparison is the canonical promotion. The extraction endpoint returns the actual server-built ExtractionEnvelope plus an HMAC attestation bound to the property and envelope contents; save verifies it before persisting provenance, then transactionally creates the comparison and emits PropertyChange. conflictDetection is false by design because separate lender offers are intentional comparison inputs, not competing truth for one fact.',
  },
  {
    targetDomain: 'PROPERTY_TAX',
    adapterExists: true,
    adapterFunction: 'PropertyTaxDocumentIntakeService.confirm',
    sourceFile: 'apps/backend/src/services/propertyTax/propertyTaxDocumentIntake.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'REVIEW_GATED_CANDIDATE',
    conflictDetection: true,
    notes: 'PropertyTaxDocumentIntake is a persisted review-gated candidate workflow. Manual/OCR/AI-capable staged fields are normalized through propertyTaxFieldsToExtractionEnvelope; confirm atomically promotes homeowner-confirmed fields into canonical parcel/assessment/bill records, links field evidence, and emits PropertyChange. PropertyTaxRecordService reconciles document, official-source, and homeowner observations into real per-field CONFLICTED state; appeal readiness and homeowner actions block on unresolved conflicts instead of selecting a value.',
  },
  {
    targetDomain: 'CLAIM',
    adapterExists: true,
    adapterFunction: 'ClaimsService.addClaimDocument + bulkUploadClaimDocuments + checklist document upload',
    sourceFile: 'apps/backend/src/services/claims/claims.service.ts',
    consumesExtractionEnvelope: true,
    reviewGate: 'CLIENT_FORM_PREFILL_ONLY',
    conflictDetection: false,
    notes: 'Claim document promotion is homeowner-reviewed categorization at upload time; the Claims PRD intentionally defers AI extraction. Every claim and checklist upload is normalized through claimDocumentToExtractionEnvelope, stores that envelope in Document.metadata, atomically creates the canonical ClaimDocument/timeline links, and emits PropertyChange. Distinct claim documents are additive evidence, so fact-conflict detection is not applicable.',
  },
];

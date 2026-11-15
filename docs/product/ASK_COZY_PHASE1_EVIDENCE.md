# Ask Cozy cross-domain semantic architecture — Phase 1 evidence

This is the maintained evidence index for `ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md` §18 Phase 1.

- Selected and deferred basic-read families, selection reasons, representative prompts and target waves: `apps/backend/src/services/ask/semantic/phase1/phase1FamilyManifest.ts`.
- Shared generated runtime vocabulary: `sharedSemanticLexicon.ts`.
- Typed grammar and complete-example verification: `deterministicSemanticParser.ts` and `verifyPhase1RuntimeWiring()`.
- Provisional-family disposition and evidence lineage: `PROVISIONAL_READ_FAMILY_DISPOSITIONS` in `support/provisionalRead.ts`.
- Warranty read/write containment and reconciliation telemetry: `transitionalWarrantyRead.ts`; reconciliation cases increment `ask_warranty_reconciliation_cases_total` and emit structured warning records.
- Receipts and structural entailment: `semanticExecutionReceipt.ts` and `semanticReceiptEntailment.ts`.
- Focused executable evidence: `crossDomainSemanticArchitecturePhase1.test.js`, `transitionalWarrantyRead.test.js`, `provisionalWarranty.test.js`, `askRemoteFallbackTypedClaims.test.js`, and `askPromptMinimization.test.js`.

Correctness is limited to the families declared in the Phase 1 manifest. This artifact does not claim broader homeowner-language coverage or completion of later phases.

# Ask Cozy Best-in-Class Conversational Concierge — Implementation Plan

**Status:** Draft v0.1 for owner review; implementation slices and acceptance plan, not a delivery claim

**Date:** 2026-11-22

**Governing FRD:** [`ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md`](../product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md)

**Source audit:** [`ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_AUDIT.md`](ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_AUDIT.md)

## 1. Purpose and authority

This plan turns the governing FRD into reviewable implementation slices. The FRD and its cited governing requirements remain authoritative for product behavior. This plan identifies the expected repository touch points, dependencies, focused evidence, and the gate that makes each slice eligible to merge or activate.

The plan does not create a second Ask architecture. Cross-domain semantic changes extend the existing semantic request plan, catalogues, validation, execution, evaluation, and implementation ledger governed by `ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md` and `ASK_COZY_UNDERSTANDING_RELIABILITY_FRD.md`.

The existing owner rule remains controlling:

1. safety, restricted-request, authentication, and property/audience boundaries run first;
2. certified deterministic routing, registered direct reads, and deterministic recovery run next;
3. model-assisted semantic planning is last resort, only for approved certified strata the deterministic path did not safely resolve;
4. handlers and canonical domain engines produce answers and values;
5. a model never writes answer wording, executes a write, assigns authority, or replaces an eligible deterministic result.

General guidance and social turns use approved authored content or deterministic composition. Model-generated guidance is outside this plan unless the owner approves a separate FRD amendment and certification contract.

## 2. Working rules

- Each slice preserves existing authorization, confirmation, idempotency, freshness, receipt, and reconciliation controls.
- A slice may narrow its declared files after call-path tracing, but it may not add a parallel registry, planner, answer engine, or source of truth.
- Before editing a slice, trace every affected target through the operation registry, audience policy, handler, canonical service, response contract, frontend renderer, and focused tests.
- New semantic behavior updates the governing semantic implementation ledger and generated inventories in the same slice.
- No model-assisted stratum activates merely because its code compiles or its provider returns schema-valid output. Its privacy, calibration, availability, and held-out gates must pass.
- No write family inherits certification from another family.
- `BICC-GATE-006` and `BICC-EVAL-010` are continuous invariants for every applicable slice.
- Validation is repository-local and environment-independent unless an authoritative requirement explicitly requires more. No development database, service stack, browser environment, or staged user rollout is implied by this plan.

## 3. Dependency and delivery map

| Slice | Outcome | Depends on | Activation or completion gate |
|---|---|---|---|
| `BICC-0.1` | Evaluation contract and sealed pools | Owner decisions D01, D06, D11, D12 | BICC-EVAL-001–017 executable; scorer and pool provenance approved |
| `BICC-0.2` | Provider-boundary inventory | `BICC-0.1`; applicable provider facts | BICC-OPS-006–008 evidence complete before any new external call |
| `BICC-0.5` | Independent UX corrections | Current defect reproduction | Focused regression and accessibility evidence per accepted defect |
| `BICC-1A.1` | Deterministic reach inventory | `BICC-0.1` | Reachability denominator and missing-target list approved |
| `BICC-1A.2` | Deterministic data-point/entity/filter reach | `BICC-1A.1` | Phase 1A portions of GATE-001 and GATE-003 pass |
| `BICC-1A.3` | Clarification and bounded recovery | `BICC-1A.2` | UND-006–009, PORT-003, and UX-009 corpus passes |
| `BICC-1B.1` | Last-resort semantic-plan contract | `BICC-0.2`, `BICC-1A.2` | Ordering, schema, eligibility, privacy, and no-answer-authority tests pass |
| `BICC-1B.2` | First approved model-assisted read stratum | `BICC-1B.1`; approved calibration stratum | Held-out GATE-001/GATE-003 subset and availability model pass |
| `BICC-1C.1` | Atomic answer-mode contract | `BICC-0.1`, `BICC-1A.2` | GATE-004A, GATE-004B1, supported-mode GATE-005 subset pass |
| `BICC-1C.2` | Authored general guidance and social turns | `BICC-1C.1` | GATE-007/007B and EVAL-016 pass without a model answer call |
| `BICC-1C.3` | Emergency interception | `BICC-0.1` and D11 | GATE-002, GATE-009, and SAFE-001–003 pass |
| `BICC-1D.n` | One approved write-proposal family | `BICC-1A.2`; family selected by D06 | Family-specific GATE-008 and EVAL-010 pass |
| `BICC-2.1` | Structured continuity and follow-ups | Phase 1A; applicable Phase 1C modes | CTX-001–005 follow-up corpus passes |
| `BICC-2.2` | Bounded composed reads | `BICC-2.1` | Compound/facet coverage passes with no silent loss or retargeting |
| `BICC-3.1` | Attachment lifecycle and isolation | D04, D10, `BICC-0.2` | MM-001–005 and MM-010 pass |
| `BICC-3.2` | Document-grounded answers | `BICC-3.1`, scorer from `BICC-0.1` | GATE-004B2 and `USER_DOCUMENT` GATE-005 subset pass |
| `BICC-3.3` | Injection isolation and promotion | `BICC-3.2` | EVAL-015 and MM-008/MM-011/MM-012 pass |
| `BICC-4.1` | Candidate workspace and buyer reads | D03, D09; Phase 1A | BUY-001–006 and buyer read matrix pass |
| `BICC-4.2` | Fair-housing boundary | `BICC-4.1` | EVAL-017 and BUY-011 pass |
| `BICC-4.3` | Candidate promotion and buyer actions | `BICC-4.1` | BUY-007–010 authorization and confirmation corpus passes |
| `BICC-5.1` | Transport and recovery | Phase 1 answer contract | TRN-001–007 pass |
| `BICC-5.2` | Memory and proactive continuation | D05; `BICC-5.1` | MEM-001–005 and PRO-001–002 pass |

`n` means repeat the slice independently for each approved write family.

## 4. Slice specifications

### BICC-0.1 — Evaluation contract, held-out pools, and scorer

**Scope**

- Build the rotating sealed-shard manifest, burn/replenishment ledger, overlap checks, sample floors, and held-out-first report.
- Implement the versioned claim segmentation and entailment/unsupported-claim scorer contract.
- Record human-label protocol, reviewer independence, adjudication, scorer calibration, and exact confidence methods.

**Expected existing files**

- `apps/backend/src/services/ask/semantic/evaluation/endToEndEvaluationHarness.ts`
- `apps/backend/src/services/ask/modelRouting/calibration.ts`
- `apps/backend/scripts/ask-compound-sweep.js`
- `apps/backend/scripts/ask-answer-contract-manifest.js`
- `apps/backend/tests/ask/modelRouting.test.js`
- `apps/backend/tests/ask/compoundSweepRatchet.test.js`
- `docs/architecture/ASK_COZY_UNDERSTANDING_BASELINE_0A.md`
- `docs/library/requirement_status.csv`

**Focused evidence**

- Manifest rejects tuning/certification overlap and burned shards.
- Report cannot emit a certification headline from main-corpus results alone.
- Confidence-bound fixtures include zero-event and non-zero-event cases.
- LLM-judge fixtures pin provider/model/prompt/schema versions and fail when calibration is absent or stale.
- Human-label fixtures cover agreement, adjudication, and safety-critical escalation.

**Gate**

All BICC-EVAL requirements are executable. D01, D06, D11, and D12 remain owner decisions and are not inferred from code.

### BICC-0.2 — Provider-boundary register and egress proof

**Scope**

- Inventory routing, document, vision, synthesis, recommendation, and evaluator call paths separately.
- Add purpose-specific allowlisted serializers and captured-payload evidence at the governed egress boundary.
- Record real-data versus synthetic-only approvals.

**Expected existing files**

- `apps/backend/src/services/ask/modelRouting/understandingProvider.ts`
- `apps/backend/src/services/ask/modelRouting/requestPlan.ts`
- `apps/backend/src/services/ask/askRemoteFallbackTypedClaims.ts`
- `apps/backend/src/services/ask/askConciergePromptPolicy.ts`
- `apps/backend/src/services/ask/askPromptMinimization.ts`
- `apps/backend/tests/ask/modelRouting.test.js`
- `apps/backend/tests/ask/askConciergePromptPolicy.test.js`
- governing provider and privacy documentation identified during call-path tracing

**Focused evidence**

- Captured outbound payload contains only approved serialized fields.
- Raw record values, unrestricted history, unrelated document content, credentials, and prohibited identifiers fail closed.
- Synthetic approval cannot activate real-homeowner payloads.
- Approval for one call purpose cannot activate another.

**Gate**

BICC-OPS-006–008 pass before a new provider path or real homeowner payload is enabled.

### BICC-0.5 — Independent experience corrections

**Scope**

Cancellation, copy, persisted feedback, mobile overlap, duplicate-close behavior, headings, lazy loading, and existing voice-dictation state corrections. This slice does not change routing, model authority, confirmation, or canonical execution.

**Expected existing files**

- `apps/frontend/src/components/ask/workspace/ConciergeHome.tsx`
- `apps/frontend/src/components/ask/workspace/ExecutionCard.tsx`
- `apps/frontend/src/features/ask/conversationView.ts`
- relevant existing component and `e2e/ask` tests selected from the reproduced defect

**Focused evidence and gate**

Each accepted defect has a current reproduction and a focused component or pure-logic regression. Accessibility-sensitive changes verify focus, accessible name, keyboard behavior, and narrow layout without requiring a service environment.

### BICC-1A.1 — Deterministic reach inventory

**Scope**

- Generate the authoritative operation/data-point reach denominator.
- Classify gaps as missing catalogue entry, deterministic parser gap, entity/filter gap, unavailable canonical reader, or intentional boundary.
- Do not add model routing in this slice.

**Expected existing files**

- `apps/backend/src/services/ask/askOperationRegistry.ts`
- `apps/backend/src/services/ask/semantic/semanticRequestPlan.ts`
- `apps/backend/src/services/ask/semantic/deterministicSemanticParser.ts`
- `apps/backend/src/services/ask/semantic/crossDomain/crossDomainPlanBuilder.ts`
- `apps/backend/scripts/generate-ask-interface-inventory.ts`
- governing semantic ontology, catalogue, and implementation-ledger files

**Focused evidence and gate**

Generated inventory is reproducible, has no duplicate identifiers, and distinguishes reachable, intentionally unavailable, and missing behavior. The slice produces evidence only; it does not claim a reach gate passes.

### BICC-1A.2 — Deterministic data-point, entity, and filter reach

**Scope**

Implement missing deterministic reads and query shapes one domain slice at a time through the existing semantic plan and `DATA_POINT_READ` path.

**Expected existing files**

- `apps/backend/src/services/ask/askRoutingCascade.ts`
- `apps/backend/src/services/ask/semantic/deterministicSemanticParser.ts`
- `apps/backend/src/services/ask/semantic/slice/sliceExecutor.ts`
- `apps/backend/src/services/ask/handlers/dataPointRead.handler.ts`
- domain catalogue/adapter files identified by the inventory
- `apps/backend/tests/ask/crossDomainSemanticContainment.test.js`
- `apps/backend/tests/ask/deterministicParserProjectionOverlap.test.js`
- domain-focused semantic tests such as `inventoryAgeFilter.test.js` and `warrantyNegativeRelationRecovery.test.js`

**Focused evidence**

- Positive, adjacent-negative, wrong-entity, wrong-property, missing-value, and authorization cases.
- Parser/legacy agreement and containment remain intact.
- Values come only from the canonical reader.

**Gate**

The approved Phase 1A domain slice passes its BICC-GATE-001 and BICC-GATE-003 subset; BICC-GATE-006 remains zero.

### BICC-1A.3 — Clarification and bounded recovery

**Scope**

Implement one-focused-clarification behavior, the consecutive-clarification limit, safe best-interpretation recovery, property selection for unsupported portfolio requests, and unsupported-language recovery.

**Expected existing files**

- `apps/backend/src/services/ask/support/didYouMean.ts`
- `apps/backend/src/services/ask/askRoutingCascade.ts`
- `apps/backend/src/services/ask/semantic/semanticEntryDispatcher.ts`
- `apps/frontend/src/components/ask/workspace/ExecutionCard.tsx`
- clarification, routing-recovery, property-selection, and language-focused tests located during the slice trace

**Focused evidence and gate**

No repeated clarification loop; no best-interpretation escape for material ambiguity; no silent current-property answer to a portfolio question; no mutation from recovery. UND-006–009, PORT-003, and UX-009 pass.

### BICC-1B.1 — Last-resort semantic-plan boundary

**Scope**

- Enforce deterministic-first ordering before the model bridge.
- Restrict model output to the typed semantic plan; remove any model answer-wording authority.
- Validate eligibility, entity references, filters, dependencies, materiality, and schema server-side.
- Preserve fail-closed/no-call recovery.

**Expected existing files**

- `apps/backend/src/services/ask/askRoutingCascade.ts`
- `apps/backend/src/services/ask/modelRouting/runtimeUnderstanding.ts`
- `apps/backend/src/services/ask/modelRouting/requestPlan.ts`
- `apps/backend/src/services/ask/modelRouting/understandingProvider.ts`
- `apps/backend/src/services/ask/modelRouting/availabilityModel.ts`
- `apps/backend/tests/ask/modelRouting.test.js`
- `apps/backend/tests/ask/askRuntimeBootstrap.test.js`
- fast-path manifest and certificate files generated by `apps/backend/scripts/ask-fast-path-rules.js`

**Focused evidence**

- A certified deterministic match makes no model call.
- Safety, emergency, boundary, and material ambiguity cases make no impermissible call.
- Out-of-catalogue targets, malformed plans, conflicting entities, provider errors, and stale calibration fail closed.
- Model output never supplies a factual answer or executable write.

**Gate**

Contract tests pass, but no stratum activates until BICC-1B.2.

### BICC-1B.2 — First approved model-assisted read stratum

**Scope**

Enable exactly one owner-approved read stratum after calibration and provider approval. Additional strata repeat this slice.

**Expected existing files**

The BICC-1B.1 paths plus the selected domain's catalogue, handler, canonical reader, calibration corpus, and semantic implementation-ledger row.

**Focused evidence**

- Sealed held-out routing, entity/filter accuracy, and answer end-to-end correctness.
- Provider unavailable, timeout, schema-invalid, and partial-stage failure cases.
- No reduction in deterministic-path correctness or latency contract.
- Captured payload and model-call accounting.

**Gate**

The stratum-specific portions of GATE-001 and GATE-003 pass with approved availability assumptions or measurements. Passing one stratum activates only that stratum.

### BICC-1C.1 — Atomic answer modes

**Scope**

Implement atomic facet labels and presentation for `HOME_RECORD`, `CALCULATION`, `ESTIMATE`, `RECOMMENDATION`, `GENERAL_GUIDANCE`, and `UNAVAILABLE`. `USER_DOCUMENT` remains BICC-3.2.

**Expected existing files**

- Ask response and presentation contracts reached through `apps/backend/src/services/ask/askOperationRegistry.ts`
- `apps/backend/src/services/ask/execution/askConcierge.ts`
- answer validation and trust-policy files identified from each selected operation
- `apps/frontend/src/components/ask/workspace/ExecutionCard.tsx`
- selected presentation-block renderers and their component tests
- `apps/backend/scripts/ask-answer-contract-manifest.js`

**Focused evidence and gate**

Mixed-facet answers retain separate modes and evidence; calculations use authoritative/explicit inputs; assumed inputs become estimates; recommendations retain supporting facets. GATE-004A, GATE-004B1, and the supported-mode portion of GATE-005 pass.

### BICC-1C.2 — Authored general guidance and social turns

**Scope**

Keep general guidance and small talk deterministic or approved-content based. Do not add a model call.

**Expected existing files**

- `apps/backend/src/services/ask/support/generalGuidanceCard.ts`
- `apps/backend/src/services/ask/askRemoteFallbackTypedClaims.ts`
- `apps/backend/src/services/ask/askConciergePromptPolicy.ts`
- `apps/backend/tests/ask/generalGuidanceCard.test.js`
- `apps/backend/tests/ask/askConciergePromptPolicy.test.js`
- landing/social presentation paths in `apps/frontend/src/components/ask/workspace/ConciergeHome.tsx`

**Focused evidence and gate**

Social turns do not route, execute, clarify, or create an action row; guidance is clearly not home-record-derived and never claims inspection, eligibility, coverage, diagnosis, or a guaranteed outcome. GATE-007, GATE-007B, and EVAL-016 pass.

### BICC-1C.3 — Emergency interception

**Scope**

Extend and certify active-emergency detection without turning educational, historical, conditional, or resolved mentions into active emergencies.

**Expected existing files**

- `apps/backend/src/services/ask/support/emergencyBoundary.ts`
- `apps/backend/src/services/ask/askRoutingCascade.ts`
- `apps/backend/tests/ask/emergencyParaphrases.test.js`
- `apps/backend/tests/ask/emergencyBoundaryRoutineDetector.test.js`
- `apps/backend/tests/ask/emergencyBoundaryWording.test.js`

**Focused evidence and gate**

Critical canonical cases have zero misses; broader recall and false-positive results include sample sizes and intervals; emergency presentation precedes normal work and exact-four behavior. GATE-002 and GATE-009 pass after D11 approval.

### BICC-1D.n — Write-proposal family

**Scope**

Choose one family, trace its current deterministic command, and close proposal recall without broadening execution authority. Model classification, if already permitted by the governing FRD, can open only a validated preview; the canonical writer still requires review and confirmation.

**Expected existing files**

- `apps/backend/src/services/ask/execution/askCapture.ts`
- `apps/backend/src/services/ask/handlers/workflowConfirm.handler.ts`
- the selected command's handler and support module
- operation, command, confirmation, mutation-impact, audience, and answer-trust registries reached by that command
- the selected family's existing focused Ask tests

**Focused evidence**

Clear intent, required-field extraction, ambiguous entity, unauthorized role, stale context, edited confirmation, replay/idempotency, canonical service call, receipt, and reconciliation.

**Gate**

The family passes GATE-008 and EVAL-010. Other families remain unverified.

### BICC-2.1 and BICC-2.2 — Continuity and bounded composition

**Scope**

Add bounded structured follow-up state, canonical entity references, context invalidation, and approved multi-facet read composition without raw unlimited history or composed writes.

**Expected existing files**

- `apps/backend/src/services/ask/semantic/semanticRequestPlan.ts`
- `apps/backend/src/services/ask/semantic/slice/sliceExecutor.ts`
- composition runtime and withholding files located through the governing composition FRD
- `apps/backend/tests/ask/composedTurn.test.js`
- `apps/backend/tests/ask/conversationalFilterFollowUps.test.js`
- `apps/backend/tests/ask/roomListComposition.test.js`

**Focused evidence and gate**

Follow-up identity, property switching, access loss, expired/deleted entity, dependencies, partial failure, facet coverage, and no write composition. CTX requirements and compound/follow-up certification pass.

### BICC-3.1 to BICC-3.3 — Attachments and document-grounded answers

**Scope**

Deliver upload/preview lifecycle, authorized retrieval, citations, version/deletion invalidation, untrusted-content isolation, and reviewed promotion into canonical records.

**Expected existing files**

- `apps/backend/src/services/ask/handlers/documents.handler.ts`
- document retrieval/index and promotion paths identified through that handler and governing document FRDs
- `apps/frontend/src/components/ask/DocumentResultList.tsx`
- `apps/frontend/src/components/ask/__tests__/documentResultContinuity.test.tsx`
- `apps/frontend/src/components/ask/__tests__/calmDocumentAnswer.test.tsx`
- `apps/backend/tests/ask/documentLookup.test.js`
- `apps/backend/tests/ask/documentViews.test.js`
- `apps/backend/tests/ask/documentsRefinementRuntime.test.js`
- `apps/backend/tests/ask/documentPromotionPolicyFacts.test.js`

**Focused evidence and gate**

Wrong user/property/version, access loss, deletion, replacement, retention expiry, citation mismatch, incomplete/conflicting evidence, injection attempts, and promotion confirmation. GATE-004B2, the `USER_DOCUMENT` GATE-005 subset, EVAL-009, EVAL-015, and MM-001–012 pass.

### BICC-4.1 to BICC-4.3 — Prospective Buyer Discovery

**Scope**

Deliver authenticated candidate workspaces, comparisons, buyer cost/document answers, fair-housing refusal/redirection, and explicit promotion to the under-contract canonical workflow.

**Expected existing files**

- `apps/backend/src/services/ask/handlers/buyerPlan.handler.ts`
- `apps/backend/src/services/ask/handlers/buyerLoanEstimates.handler.ts`
- `apps/backend/src/services/ask/handlers/buyerClosingItemCommands.handler.ts`
- `apps/backend/src/services/ask/handlers/buyerWalkthroughCommands.handler.ts`
- `apps/backend/src/services/ask/support/buyerPlanSetupCommand.ts`
- `apps/backend/src/services/ask/support/buyerLoanEstimateCommand.ts`
- `apps/backend/src/services/ask/support/buyerWalkthroughCommand.ts`
- buyer domain services, contracts, and schema selected after authority tracing
- `apps/backend/tests/ask/buyerPlanSetupCommands.test.js`
- `apps/backend/tests/ask/buyerClosingCapabilitySlice.test.js`
- `apps/backend/tests/ask/buyerWalkthroughCommands.test.js`
- `apps/backend/tests/ask/buyerLoanEstimateCommands.test.js`
- `apps/frontend/src/components/ask/__tests__/buyerTaskResultList.test.tsx`

**Focused evidence and gate**

Candidate/owned-home isolation, account eligibility, provenance, comparison gaps, cost uncertainty, fair-housing explicit/proxy prompts, deduplication, promotion confirmation, and no anonymous guest access. BUY-001–011 and EVAL-017 pass.

### BICC-5.1 and BICC-5.2 — Transport, memory, and proactive continuation

**Scope**

Deliver cancellation/reconnect truthfulness, workload limits, measured latency, opt-in preference memory, and explainable proactive continuation without silent writes.

**Expected existing files**

- Ask request/execution transport paths reached through `apps/backend/src/services/ask/execution/askConcierge.ts`
- `apps/frontend/src/components/ask/workspace/ConciergeHome.tsx`
- `apps/frontend/src/features/ask/conversationView.ts`
- canonical preference and proactive services identified through their governing FRDs
- focused execution-state, cancellation, memory-control, and proactive-policy tests selected during slice tracing

**Focused evidence and gate**

Stop, reload, reconnect, duplicate prevention, offline disclosure, retention/deletion, preference inspection/correction/deletion, saved-preference disclosure, and no unsolicited consequential action. TRN-001–007, MEM-001–005, and PRO-001–002 pass.

## 5. Per-slice completion record

Every completed slice shall append or update a record containing:

| Field | Required content |
|---|---|
| Slice | Stable ID from this plan |
| Requirements | Exact BICC and governing requirement IDs |
| Code revision | Commit identifier |
| Files changed | Exact repository paths, including generated artifacts |
| Authority trace | Canonical service, contract, registry, audience rule, and schema involved |
| Tests/checks | Commands executed and exact pass/fail/skip counts |
| Evaluation | Dataset/scorer versions, sample sizes, intervals, exclusions, and contamination status |
| Gate result | Applicable gate only; unrelated future gates marked not applicable |
| Not run | Environment-dependent checks explicitly omitted |
| Remaining discrepancy | Known incomplete behavior or decision |

Update `docs/library/requirement_status.csv` only with requirement-specific evidence. A compile, route, component, or unit test alone does not establish end-to-end delivery.

## 6. Plan completion definition

The program is complete only when every in-scope FRD requirement has requirement-specific evidence, all applicable phase gates pass on eligible held-out data, provider and model strata have explicit approval, and no later phase is being used to conceal a failed earlier invariant. A roadmap bullet, implemented file, or passing main corpus is not completion evidence.

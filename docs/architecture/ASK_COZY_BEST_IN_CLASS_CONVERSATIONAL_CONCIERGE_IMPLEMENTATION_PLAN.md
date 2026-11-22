# Ask Cozy Best-in-Class Conversational Concierge — Implementation Plan

**Status:** Draft v0.9; FRD defaults active, owner review optional; implementation slices and acceptance plan, not a delivery claim

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

The following three named structured-analysis exceptions are currently authorized and sit outside the last-resort semantic-routing order: conversational-capture candidate extraction, document evidence/citation candidate extraction, and image observation/urgency candidate extraction. A fourth exception for sensitive-document classification is conditional under BICC-D04 and is not authorized unless deterministic checks prove insufficient and its separate provider flow satisfies BICC-OPS-006 through BICC-OPS-009. Every exception is a governed provider flow, never an answer author, and receives no authority beyond closed-schema candidates that deterministic validation accepts or rejects.

## 2. Working rules

- Each slice preserves existing authorization, confirmation, idempotency, freshness, receipt, and reconciliation controls.
- A slice may narrow its declared files after call-path tracing, but it may not add a parallel registry, planner, answer engine, or source of truth.
- Before editing a slice, trace every affected target through the operation registry, audience policy, handler, canonical service, response contract, frontend renderer, and focused tests.
- New semantic behavior updates the governing semantic implementation ledger and generated inventories in the same slice.
- No model-assisted stratum activates merely because its code compiles or its provider returns schema-valid output. Its privacy, calibration, availability, and held-out gates must pass.
- No write family inherits certification from another family.
- `BICC-GATE-006` and `BICC-EVAL-010` are continuous invariants for every applicable slice.
- Owner review does not block implementation. FRD §18 defaults govern immediately; a later versioned override applies prospectively and updates affected slices and evidence.
- Validation is repository-local and environment-independent unless an authoritative requirement explicitly requires more. No development database, service stack, browser environment, or staged user rollout is implied by this plan. One-stratum-at-a-time activation is technical capability gating based on evaluation evidence, not a cohort, canary, compatibility phase, or staged user release.

### 2.1 Model-call register

Every Ask-related model call shall be present in the provider-boundary register before it can run. The initial known calls have these dispositions:

| Call and path | Purpose | Governing authority | Output authority | Control and disposition |
|---|---|---|---|---|
| Conversational extraction — `apps/backend/src/services/ask/conversationalUnderstanding/extractionContract.ts`, route `ai:ask-conversational-capture-extraction` | Extract typed fact, event, warranty, evidence, or goal candidates after a deterministic pre-filter | `MF-014`, `MF-017`, `MF-034`, `MF-038`, `MF-046` | Candidate proposals only; it does not route, change the answer, or commit a material write | `ASK_CONVERSATIONAL_CAPTURE_ENABLED`, default off; retain and certify by candidate/write family |
| Semantic understanding — `apps/backend/src/services/ask/modelRouting/understandingProvider.ts` | Last-resort typed target/plan proposal after certified deterministic paths do not resolve the request | `FR-UND-*`, `FR-PRV-*`, BICC-INV-011, BICC-UND-012 | Validated plan only; handlers remain answer authority; write targets are preview-only | `ASK_UNDERSTANDING_PLANNER_ENABLED`, provider-terms and homeowner-text approvals, all default off; retain disabled until each stratum passes |
| Document evidence extraction — implementation selected by BICC-3.2 | Extract typed spans, claims, fields, and citation candidates from authorized document chunks | BICC-MM-004–008, BICC-MM-012–013 | Evidence candidates only, with page/chunk provenance; deterministic handler assigns mode and renders prose | No call may activate before BICC-0.2 registration and BICC-3.2 gates pass |
| Vision observation/urgency extraction — implementation selected by BICC-3.2 | Extract typed observations, condition candidates, and urgency class from an authorized image | BICC-MM-009, BICC-MM-012–013, BICC-SAFE-* | Observation/urgency candidates only, with image/region provenance; no diagnosis or recommendation authority | No call may activate before BICC-0.2 registration and BICC-3.2 gates pass |
| Sensitive-document classification — no model implementation authorized by default | If deterministic D04 checks prove insufficient, classify a minimized upload into allowed, prohibited, or uncertain sensitivity classes | BICC-D04, BICC-OPS-006–009 | Classification candidate only; uncertain and prohibited outcomes fail closed and reveal no sensitive content | Fourth named structured-analysis exception only if registered and evaluated under BICC-0.2; default implementation remains deterministic |
| Result synthesis — `apps/backend/src/services/ask/askResultSynthesis.service.ts` | Generate homeowner-facing summary text from result blocks | No compatible named exception | Writes answer wording | `ASK_RESULT_SYNTHESIS_ENABLED`, default off; retire service, control, call site, provider method, metrics, and dedicated tests after consumer tracing |
| Offline evaluation judge — implementation selected by BICC-0.1 | Score semantic properties that deterministic checks and human review cannot decide economically | BICC-EVAL-014, BICC-OPS-006–009 | Evaluation evidence only; never runtime behavior | Synthetic approved evaluation material only; never real or replayed homeowner payloads |

BICC-0.2 shall trace the repository for additional model/provider call sites and fail the inventory if any call lacks a purpose, authorizing requirement, allowed input, output authority, control default, failure behavior, evaluation gate, and retain/retire decision.

## 3. Dependency and delivery map

| Slice | Outcome | Depends on | Activation or completion gate |
|---|---|---|---|
| `BICC-0.1` | Evaluation contract, sealed pools, deterministic fidelity suites, and cross-revision baseline | Active FRD §18 defaults D01, D06, D11, D12, D13 | BICC-EVAL-001–019 executable; scorer, pool provenance, fixture partitions, and historical comparison recorded |
| `BICC-0.2` | Provider-boundary and model-call inventory | `BICC-0.1`; applicable provider facts | BICC-OPS-006–009 evidence complete before any new external call |
| `BICC-0.3` | Retire model-backed result synthesis | Model-call inventory in `BICC-0.2` | No consumer or configuration path can invoke model-written result synthesis |
| `BICC-0.5` | Independent UX corrections | Current defect reproduction | Focused regression and accessibility evidence per accepted defect |
| `BICC-1A.1` | Deterministic reach inventory | `BICC-0.1` | Reachability denominator, baseline, and missing-target list recorded |
| `BICC-1A.2` | Deterministic data-point/entity/filter reach | `BICC-1A.1` | GATE-004A1, Phase 1A portions of GATE-001/GATE-003, deterministic-reachable target, and overall non-regression pass; full GATE-010 remains combined-system |
| `BICC-1A.3` | Clarification and bounded recovery | `BICC-1A.2` | UND-006–009, PORT-003, and UX-009 corpus passes |
| `BICC-1S` | Immediate-safety interception | `BICC-0.1` and D11; runs alongside Phase 1A | GATE-002, GATE-009, and SAFE-001–003 pass |
| `BICC-1B.1` | Last-resort semantic-plan contract | `BICC-0.2`, `BICC-1A.2` | Ordering, schema, eligibility, privacy, and no-answer-authority tests pass |
| `BICC-1B.2` | Conditional first model-assisted read stratum | `BICC-1B.1`; material residual gap and D06 selection rule | Deferred when no stratum qualifies; otherwise held-out GATE-001/GATE-003 subset and availability model pass |
| `BICC-1C.1` | Atomic answer-mode contract | `BICC-0.1`, `BICC-1A.2` | GATE-004A2, GATE-004B1, supported-mode GATE-005 subset pass |
| `BICC-1C.2` | Authored general guidance and social turns | `BICC-1C.1`, D13 | GATE-007/007B/010/011 and EVAL-016 pass without a model answer call |
| `BICC-1D.n` | One write-proposal family | `BICC-1A.2`; family selected under active D06 default | Family-specific GATE-008 and EVAL-010 pass |
| `BICC-2.1` | Structured continuity and follow-ups | Phase 1A; applicable Phase 1C modes | CTX-001–005 follow-up corpus passes |
| `BICC-2.2` | Bounded composed reads | `BICC-2.1` | Compound/facet coverage passes with no silent loss or retargeting |
| `BICC-2.3` | Safe regeneration and per-attempt feedback | `BICC-2.1`; execution identity and retry paths | CTX-006 and UX-003 attempt-linking, preservation, feedback, and no-write-replay corpus passes |
| `BICC-3.1` | Attachment lifecycle and isolation | D04, D10, `BICC-0.2` | MM-001–005 and MM-010 pass |
| `BICC-3.2` | Document-grounded answers with injection isolation | `BICC-3.1`, scorer from `BICC-0.1` | EVAL-015 and MM-012/MM-013 injection-isolation evidence, GATE-004B2, and `USER_DOCUMENT` GATE-005 subset pass; no document-grounded answer activates before all pass |
| `BICC-3.3` | Reviewed promotion into canonical records | `BICC-3.2` | MM-008 and MM-011 promotion, confirmation, and retention-boundary corpus passes |
| `BICC-4.1` | Candidate workspace and buyer reads | D03, D09; Phase 1A | BUY-001–006 and buyer read matrix pass |
| `BICC-4.2` | Fair-housing boundary | `BICC-4.1` | EVAL-017 and BUY-011 pass |
| `BICC-4.3` | Candidate promotion and buyer actions | `BICC-4.1` | BUY-007–010 authorization and confirmation corpus passes |
| `BICC-5.1` | Transport and recovery | Phase 1 answer contract | TRN-001–007 pass |
| `BICC-5.2` | Memory and proactive continuation | D05; `BICC-5.1` | MEM-001–005 and PRO-001–002 pass |
| `BICC-5.3` | Reviewed route-context starters and measured interaction budgets | `BICC-0.5`, `BICC-5.1`; reviewed route allowlist | UX-002, UX-006, and UX-007 route authorization, fallback, offline, bundle, and interaction evidence pass |

`n` means repeat the slice independently for each approved write family.

## 4. Slice specifications

### BICC-0.1 — Evaluation contract, held-out pools, and scorer

**Scope**

- Build the rotating sealed-shard manifest, burn/replenishment ledger, overlap checks, sample floors, and held-out-first report.
- Implement the versioned claim segmentation and entailment/unsupported-claim scorer contract.
- Record human-label protocol, reviewer independence, adjudication, scorer calibration, and exact confidence methods.
- Define reusable deterministic fidelity partition manifests separately from burnable human-authored NLU shards.
- Re-evaluate the current and recent comparable revisions using the same all-prompt success definition and still-eligible held-out prompts. Record routing-path movement. Record any reproduced ratchet failure with revision, command, prompt identifier, and result; do not carry an unsourced external count or cause into the evidence record.
- Keep offline evaluator models synthetic-only and use deterministic lint, exact assertions, and human review for fixed authored content wherever sufficient.

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
- Deterministic fidelity fixtures cover the approved entity/value/date/unit/formula/boundary/missing-data/authorization partitions, remain reusable after failure, and gain permanent regression cases.
- A fixed or exhaustive fixture matrix reports partition coverage without a population confidence claim; any statistical bound uses an approved sampled input distribution.
- LLM-judge fixtures pin provider/model/prompt/schema versions and fail when calibration is absent or stale.
- Evaluator egress rejects real or replayed homeowner prompts and production payloads.
- Human-label fixtures cover agreement, adjudication, and safety-critical escalation.
- Cross-revision reports show absolute success, change, confidence intervals, and prompt/routing movements without comparing incompatible historical metrics as though they used the same denominator.

**Gate**

All BICC-EVAL requirements are executable and the cross-revision baseline exists. D01, D06, D11, D12, and D13 use the active default decisions recorded in FRD §18; later overrides are prospective and versioned.

### BICC-0.2 — Provider-boundary register and egress proof

**Scope**

- Inventory semantic planning, conversational extraction, document evidence, vision observation/urgency, any sensitive-document classifier, and evaluator call paths separately; reconcile every path with the §2.1 register. Trace model-backed synthesis only for BICC-0.3 retirement and verify that no model-backed recommendation-authoring path is enabled or treated as permitted.
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

BICC-OPS-006–009 pass before a new provider path or real homeowner payload is enabled.

### BICC-0.3 — Retire model-backed result synthesis

**Scope**

- Trace every consumer of `synthesizeAskResult` and `ASK_RESULT_SYNTHESIS_ENABLED`.
- Preserve only deterministic composition of validated facets under BICC-ANS-010.
- Remove the model synthesis service, operational control and kill switch, provider method, call site, model-stage metrics, and dedicated tests after confirming no required consumer remains.

**Expected existing files**

- `apps/backend/src/services/ask/askResultSynthesis.service.ts`
- `apps/backend/src/services/ask/support/answerGuards.ts`
- `apps/backend/src/config/askOperationalControls.ts`
- `apps/backend/src/services/gemini.service.ts`
- synthesis-focused tests and configuration references found by repository-wide consumer tracing

**Focused evidence and gate**

Repository search and import/call-graph checks find no callable model-backed synthesis path or synthesis flag. Existing deterministic results and summaries remain unchanged except where deterministic composition is explicitly corrected. No model call writes answer text.

### BICC-0.5 — Independent experience corrections

**Scope**

Cancellation, copy, persisted feedback, mobile overlap, duplicate-close behavior, headings, lazy loading, and existing voice-dictation state corrections. This slice does not change routing, model authority, confirmation, or canonical execution.

**Expected existing files**

- `apps/frontend/src/components/ask/workspace/ConciergeHome.tsx`
- `apps/frontend/src/components/ask/workspace/ExecutionCard.tsx`
- `apps/frontend/src/components/AIChat.tsx`
- `apps/frontend/src/components/ask/AskWorkspace.tsx`
- `apps/frontend/src/app/(dashboard)/layout.tsx`
- `apps/frontend/src/components/ask/workspace/useAskRequest.ts`
- `apps/frontend/src/components/ask/VoiceInputButton.tsx`
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
- At least 300 distinct reusable parameterized deterministic home-record cases cover the approved BICC-EVAL-019 partition manifest with zero errors before BICC-1B activation. These contract fixtures are not burnable NLU shards.
- All-prompt held-out success and change from the last accepted revision are reported under GATE-010; improved precision cannot conceal lost reach.

**Gate**

The Phase 1A matrix passes its per-domain BICC-GATE-001 and BICC-GATE-003 subset, BICC-GATE-004A1, the Phase 0 deterministic-reachable target, and the BICC-GATE-010 two-percentage-point overall non-regression margin; BICC-GATE-006 remains zero. The full 90% GATE-010 target remains a combined-system gate and does not block this slice.

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

### BICC-1S — Immediate-safety interception, parallel with Phase 1A

**Scope**

Extend and certify deterministic active-emergency detection without waiting for model planning or answer-mode work and without turning educational, historical, conditional, or resolved mentions into active emergencies.

**Expected existing files**

- `apps/backend/src/services/ask/support/emergencyBoundary.ts`
- `apps/backend/src/services/ask/askRoutingCascade.ts`
- `apps/backend/tests/ask/emergencyParaphrases.test.js`
- `apps/backend/tests/ask/emergencyBoundaryRoutineDetector.test.js`
- `apps/backend/tests/ask/emergencyBoundaryWording.test.js`

**Focused evidence and gate**

Critical canonical cases have zero misses; broader recall and false-positive results include sample sizes and intervals; emergency presentation precedes deterministic routing, model planning, normal work, guidance, and exact-four behavior. GATE-002 and GATE-009 pass under the active BICC-D11 default unless a later versioned override applies.

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

### BICC-1B.2 — Conditional first model-assisted read stratum

**Scope**

Defer this slice when no model-assisted stratum qualifies. A material gap requires at least 100 eligible versioned tuning or calibration prompts in a domain that remains at least 10 percentage points below its applicable correctness target after Phase 1A. Select the eligible domain with the largest qualifying gap. Positive expected value requires calibrated improvement of at least 5 percentage points on that domain, no deterministic-path correctness reduction greater than 2 percentage points, zero new authorization or critical-safety failures, and compliance with active privacy, latency, availability, and cost ceilings. Gap selection and improvement measurement never use the sealed shard reserved for final certification. After the stratum and thresholds are frozen, a fresh previously unexposed sealed shard provides certification evidence and is burned if revealed under BICC-EVAL-002. Enable only that stratum after calibration and provider-boundary approval. Additional strata repeat this rule; owner sign-off is not a prerequisite, and deferral with recorded measurements does not block Phase 1C or later deterministic slices.

**Expected existing files**

The BICC-1B.1 paths plus the selected domain's catalogue, handler, canonical reader, calibration corpus, and semantic implementation-ledger row.

**Focused evidence**

- Sealed held-out routing, entity/filter accuracy, and answer end-to-end correctness.
- Provider unavailable, timeout, schema-invalid, and partial-stage failure cases.
- No reduction in deterministic-path correctness or latency contract.
- Captured payload and model-call accounting.

**Gate**

The stratum-specific portions of GATE-001, GATE-003, and GATE-010 pass with approved availability assumptions or measurements. Passing one stratum activates only that technical capability stratum for all eligible users; it is not a cohort or staged user rollout.

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

Mixed-facet answers retain separate modes and evidence; calculations use authoritative/explicit inputs; assumed inputs become estimates; recommendations retain supporting facets. GATE-004A2, GATE-004B1, and the supported-mode portion of GATE-005 pass.

### BICC-1C.2 — Authored general guidance and social turns

**Scope**

Keep general guidance and small talk deterministic or approved-content based. Govern the existing guidance catalogue with stable identifiers, role-based ownership until a person is named, evidence basis, review dates, deterministic lint, and a reviewed growth process. Freeze the FRD §18 default core homeowner/buyer topic taxonomy and denominator before certification; include topic/prompt families, demand or product-priority basis, safety/professional-boundary classes, and explicit exclusions. Do not add a model call.

**Expected existing files**

- `apps/backend/src/services/ask/support/generalGuidanceCard.ts`
- `apps/backend/src/services/ask/askGeneralGuidanceCatalog.ts`
- `apps/backend/src/services/ask/askRemoteFallbackTypedClaims.ts`
- `apps/backend/src/services/ask/askConciergePromptPolicy.ts`
- `apps/backend/tests/ask/generalGuidanceCard.test.js`
- `apps/backend/tests/ask/askConciergePromptPolicy.test.js`
- landing/social presentation paths in `apps/frontend/src/components/ask/workspace/ConciergeHome.tsx`

**Focused evidence and gate**

Social turns do not route, execute, clarify, or create an action row; guidance is clearly not home-record-derived and never claims inspection, eligibility, coverage, diagnosis, or a guaranteed outcome. Catalogue schema, prohibited-claim lint, required boundaries, evidence/source checks, duplicate/conflict checks, stale-review checks, and human content/safety review exhaustively gate static entries. The statistical unsupported-claim gate remains inapplicable unless a future amendment permits variable/generated guidance. Held-out mapping measures coverage only against the frozen core taxonomy and cannot narrow the denominator after failures. GATE-007, GATE-007B, GATE-010, GATE-011, and EVAL-016 pass.

### BICC-1D.n — Write-proposal family

**Scope**

Choose one family, trace its current deterministic command, and close proposal recall without broadening execution authority. The retained conversational-extraction model exception is governed by MF-014/MF-017/MF-034/MF-038/MF-046 and may produce only typed candidates. The retained understanding-provider exception is governed by FR-UND/FR-PRV and may identify a write target only as a validated preview. Neither model executes the canonical writer, which still requires review and confirmation.

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

### BICC-2.3 — Safe regeneration and per-attempt feedback

**Scope**

Deliver user-requested regeneration as a new attempt linked to the original execution. Preserve both results and their attempt identities, persist feedback against the selected attempt, and never overwrite a prior answer or replay a consequential write.

**Expected existing files**

- `apps/backend/src/services/ask/askFollowUpContext.ts`
- `apps/backend/src/services/ask/execution/askRetry.ts`
- `apps/backend/src/services/ask/execution/askFeedback.ts`
- `apps/backend/src/controllers/ask.controller.ts`
- `apps/backend/src/routes/ask.routes.ts`
- `apps/frontend/src/components/ask/workspace/ExecutionCard.tsx`
- `apps/frontend/src/components/ask/workspace/useAskRequest.ts`
- focused retry, regeneration, attempt-linking, feedback persistence, reload, and consequential-write replay tests

**Focused evidence and gate**

Duplicate delivery, reload, concurrent retry, original/result preservation, attempt-specific feedback, failed retry, and prior consequential-write scenarios prove CTX-006 and UX-003. Every regenerated result links to its source execution/attempt, both remain auditable, feedback reloads against the intended attempt, and no material effect is repeated.

### BICC-3.1 to BICC-3.3 — Attachments and document-grounded answers

**Scope**

Deliver upload/preview lifecycle, authorized retrieval, citations, version/deletion invalidation, untrusted-content isolation, and reviewed promotion into canonical records. Any document or vision model emits only typed evidence/observation candidates with source provenance; deterministic validation and templates assign answer modes and render final prose.

**Expected existing files**

- `apps/backend/src/services/ask/handlers/documents.handler.ts`
- `apps/backend/src/services/ask/askIntake.service.ts`
- `apps/backend/src/controllers/askIntake.controller.ts`
- document retrieval/index and promotion paths identified through that handler and governing document FRDs
- `apps/frontend/src/components/ask/DocumentResultList.tsx`
- `apps/frontend/src/components/ask/intake/AskIntakeDialog.tsx`
- `apps/frontend/src/components/ask/AttachEvidenceControl.tsx`
- `apps/frontend/src/components/ask/__tests__/documentResultContinuity.test.tsx`
- `apps/frontend/src/components/ask/__tests__/calmDocumentAnswer.test.tsx`
- `apps/backend/tests/ask/documentLookup.test.js`
- `apps/backend/tests/ask/documentViews.test.js`
- `apps/backend/tests/ask/documentsRefinementRuntime.test.js`
- `apps/backend/tests/ask/documentPromotionPolicyFacts.test.js`

**Focused evidence and gate**

Wrong user/property/version, access loss, deletion, replacement, retention expiry, citation mismatch, incomplete/conflicting evidence, typed-schema rejection, provenance loss, injection attempts, and promotion confirmation. Tests prove model candidates cannot diagnose, recommend, write records, select actions, or become free-form answer prose. BICC-3.2 shall not activate document-grounded answers until EVAL-015 and MM-012/MM-013 injection-isolation evidence passes alongside GATE-004B2, the `USER_DOCUMENT` GATE-005 subset, and EVAL-009; BICC-3.3 promotion additionally passes MM-008 and MM-011. MM-001–013 pass across the group.

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
- `apps/backend/src/routes/ask.routes.ts`
- `apps/backend/src/controllers/ask.controller.ts`
- `apps/backend/src/services/ask/execution/createAskExecution.ts`
- `apps/frontend/src/components/ask/workspace/ConciergeHome.tsx`
- `apps/frontend/src/components/ask/workspace/useAskRequest.ts`
- `apps/frontend/src/features/ask/conversationView.ts`
- canonical preference and proactive services identified through their governing FRDs
- focused execution-state, cancellation, memory-control, and proactive-policy tests selected during slice tracing

**Focused evidence and gate**

Stop, reload, reconnect, duplicate prevention, offline disclosure, retention/deletion, preference inspection/correction/deletion, saved-preference disclosure, and no unsolicited consequential action. TRN-001–007, MEM-001–005, and PRO-001–002 pass.

### BICC-5.3 — Reviewed route-context starters and interaction budgets

**Scope**

Deliver current-page starters only for reviewed routes with parseable property/entity identifiers and server-side reauthorization. Unsupported or stale routes fall back to generic starters without inferred context. Complete offline-read disclosure and measure the lazy-loaded Ask bundle and interaction budgets rather than inferring them from source size.

**Expected existing files**

- `apps/frontend/src/features/ask/routeContext.ts`
- `apps/frontend/src/components/ask/RouteContextStarter.tsx`
- `apps/frontend/src/components/AIChat.tsx`
- `apps/frontend/src/components/ask/AskWorkspace.tsx`
- `apps/frontend/src/components/ask/workspace/useAskRequest.ts`
- route parsing, authorization, generic-fallback, offline, lazy-load, bundle, and interaction-budget tests

**Focused evidence and gate**

Reviewed supported routes retain the correct property/entity only after server reauthorization; malformed, unsupported, stale, unauthorized, or cross-property routes remain generic. Offline behavior is truthful, writes remain prohibited offline, launch context survives lazy loading, and measured bundle/interaction budgets are recorded. BICC-UX-002, BICC-UX-006, and BICC-UX-007 pass.

## 5. Requirement-to-slice traceability

This table is the authoritative initial assignment for every in-scope BICC requirement. Cross-cutting requirements may appear in more than one slice; every completion record still supplies requirement-specific evidence.

| Requirement IDs | Accountable slice or slices |
|---|---|
| BICC-INV-001, BICC-INV-005, BICC-INV-006, BICC-INV-007 | BICC-1A.2, BICC-1C.1, BICC-2.2 |
| BICC-INV-002, BICC-INV-011 | BICC-0.2, BICC-1B.1, BICC-1B.2 |
| BICC-INV-003, BICC-INV-008, BICC-INV-009 | Cross-cutting gate for every activating slice |
| BICC-INV-004 | BICC-1A.3 |
| BICC-INV-010 | BICC-3.3 (record/document promotion), BICC-4.3 (candidate promotion), BICC-5.2 (persistent memory) |
| BICC-EVAL-001, BICC-EVAL-002, BICC-EVAL-003, BICC-EVAL-004, BICC-EVAL-005, BICC-EVAL-006, BICC-EVAL-007, BICC-EVAL-008, BICC-EVAL-009, BICC-EVAL-010, BICC-EVAL-011, BICC-EVAL-012, BICC-EVAL-013, BICC-EVAL-014, BICC-EVAL-015, BICC-EVAL-016, BICC-EVAL-017, BICC-EVAL-018, BICC-EVAL-019 | BICC-0.1; applicable feature slice supplies its corpus and result |
| BICC-GATE-001, BICC-GATE-003, BICC-GATE-004A1, BICC-GATE-010 | BICC-1A.2; BICC-1B.2 where selected; final combined-system certification |
| BICC-GATE-002, BICC-GATE-009 | BICC-1S |
| BICC-GATE-004A2, BICC-GATE-004B1, BICC-GATE-005 | BICC-1C.1; USER_DOCUMENT subset of BICC-GATE-005 in BICC-3.2 |
| BICC-GATE-004B2 | BICC-3.2 |
| BICC-GATE-006 | Cross-cutting gate for every certification slice |
| BICC-GATE-007, BICC-GATE-007B, BICC-GATE-011 | BICC-1C.2 |
| BICC-GATE-008 | BICC-1D.n |
| BICC-UND-001, BICC-UND-002, BICC-UND-003, BICC-UND-005, BICC-UND-010 | BICC-1A.1, BICC-1A.2 |
| BICC-UND-004, BICC-UND-012 | BICC-1B.1, BICC-1B.2 |
| BICC-UND-006, BICC-UND-007, BICC-UND-008, BICC-UND-009 | BICC-1A.3 |
| BICC-UND-011 | BICC-2.2 and BICC-1D.n |
| BICC-SAFE-001, BICC-SAFE-002, BICC-SAFE-003 | BICC-1S |
| BICC-ANS-001, BICC-ANS-002, BICC-ANS-003, BICC-ANS-005, BICC-ANS-006, BICC-ANS-007, BICC-ANS-008, BICC-ANS-009, BICC-ANS-011 | BICC-1C.1 |
| BICC-ANS-004 | BICC-3.2 |
| BICC-ANS-010 | BICC-0.3, BICC-2.2 |
| BICC-ANS-012 | Cross-cutting gate for every activating slice that renders or proposes a next action, handoff, recovery, or navigation target |
| BICC-ANS-013, BICC-ANS-014 | BICC-1C.2 |
| BICC-CTX-001, BICC-CTX-002, BICC-CTX-003, BICC-CTX-004, BICC-CTX-005 | BICC-2.1 |
| BICC-CTX-006 | BICC-2.3 |
| BICC-MM-001, BICC-MM-002, BICC-MM-003, BICC-MM-004, BICC-MM-005, BICC-MM-010 | BICC-3.1 |
| BICC-MM-006, BICC-MM-007, BICC-MM-009, BICC-MM-012, BICC-MM-013 | BICC-3.2 |
| BICC-MM-008, BICC-MM-011 | BICC-3.3 |
| BICC-BUY-001, BICC-BUY-002, BICC-BUY-003, BICC-BUY-004, BICC-BUY-005, BICC-BUY-006 | BICC-4.1 |
| BICC-BUY-007, BICC-BUY-008, BICC-BUY-009, BICC-BUY-010 | BICC-4.3 |
| BICC-BUY-011 | BICC-4.2 |
| BICC-PORT-001, BICC-PORT-002, BICC-PORT-003 | BICC-1A.3, BICC-4.1 |
| BICC-TRN-001, BICC-TRN-002, BICC-TRN-003, BICC-TRN-004, BICC-TRN-005, BICC-TRN-006, BICC-TRN-007 | BICC-5.1 |
| BICC-MEM-001, BICC-MEM-002, BICC-MEM-003, BICC-MEM-004, BICC-MEM-005, BICC-PRO-001, BICC-PRO-002 | BICC-5.2 |
| BICC-UX-001, BICC-UX-004, BICC-UX-005, BICC-UX-008 | BICC-0.5 |
| BICC-UX-002, BICC-UX-006, BICC-UX-007 | BICC-5.3 |
| BICC-UX-003 | BICC-0.5, BICC-2.3 |
| BICC-UX-009 | BICC-1A.3 |
| BICC-UX-010 | BICC-1C.2 |
| BICC-OPS-001, BICC-OPS-002, BICC-OPS-003, BICC-OPS-005 | BICC-0.1 and every applicable activating slice |
| BICC-OPS-004 | BICC-1A.1 generates the inventory; BICC-0.1 consumes it in the evaluation baseline |
| BICC-OPS-006, BICC-OPS-007, BICC-OPS-008, BICC-OPS-009 | BICC-0.2 |
| BICC-D01, BICC-D06, BICC-D11, BICC-D12, BICC-D13 | BICC-0.1 active defaults |
| BICC-D02 | BICC-1C.2 |
| BICC-D03, BICC-D09 | BICC-4.1, BICC-4.3 |
| BICC-D04, BICC-D10 | BICC-3.1, BICC-3.2, BICC-3.3 |
| BICC-D05 | BICC-5.2 |
| BICC-D07, BICC-D08 | BICC-5.1, BICC-5.3 |

## 6. Per-slice completion record

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
| Inline-action evidence | For a slice that renders or proposes a next action, handoff, recovery, or navigation target: evidence that supported actions remain inline and no desktop link is introduced except an explicitly governed exception (BICC-ANS-012); otherwise not applicable |
| Not run | Environment-dependent checks explicitly omitted |
| Remaining discrepancy | Known incomplete behavior or decision |

Update `docs/library/requirement_status.csv` only with requirement-specific evidence. A compile, route, component, or unit test alone does not establish end-to-end delivery.

## 7. Plan completion definition

The program is complete only when every in-scope FRD requirement has requirement-specific evidence, all applicable phase gates pass on eligible held-out data, provider and model strata have explicit approval, and no later phase is being used to conceal a failed earlier invariant. A roadmap bullet, implemented file, or passing main corpus is not completion evidence.

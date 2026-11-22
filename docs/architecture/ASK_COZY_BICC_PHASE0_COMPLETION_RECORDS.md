# Ask Cozy BICC — Phase 0 Slice Completion Records

**Date:** 2026-11-22
**Plan:** [`ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_IMPLEMENTATION_PLAN.md`](ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_IMPLEMENTATION_PLAN.md) §6 (per-slice completion record)
**Cross-revision evidence:** [`ASK_COZY_BICC_PHASE0_BASELINE.md`](ASK_COZY_BICC_PHASE0_BASELINE.md)

Every record states what ran, what did not, and what is still open. Nothing here ran against a real database, browser, Redis or external model. No unrelated future gate is claimed.

## BICC-0.3 — Retire model-backed result synthesis — COMPLETE

| Field | Record |
|---|---|
| Requirements | `BICC-ANS-010`, `BICC-ANS-013`, `BICC-INV-002`, `BICC-OPS-008` |
| Code revision | `6e0d2ce7` |
| Files changed | Removed `apps/backend/src/services/ask/askResultSynthesis.service.ts`. Edited `answerGuards.ts`, `createAskExecution.ts`, `askClarification.ts`, `askOperationalControls.ts`, `lib/metrics.ts`, `gemini.service.ts`, `askTurnStageContract.ts`, `skillExecutionTelemetry.ts`, `recognizerRetirementManifest.ts`; tests `askGovernance`, `askPhase6ModelOptimization`, `askPhase9Drills`, `askTurnStageContract`; `docs/operations/ASK_TURN_PERFORMANCE_MEASUREMENT.md`. |
| Authority trace | Consumers traced by repository search: `maybeSynthesizeDeterministicResult` had three call sites (one in `createAskExecution`, two in `askClarification`); all removed. The `ASK_RESULT_SYNTHESIS_ENABLED` and `_KILL_SWITCH` controls, the `GeminiService.synthesizeAskResult` provider method, the `ask_result_synthesis_total` metric and the `SYNTHESIS` turn stage were removed. Deterministic results now pass through unchanged. |
| Tests/checks | `npm run typecheck` clean. `node --test` on `askGovernance`, `askPhase6ModelOptimization`, `askPhase9Drills`, `askTurnStageContract`, `startupRegistryValidation`: 59 pass, 0 fail. `providerBoundaryRegister.test.js` asserts no source file references `synthesizeAskResult`, `askResultSynthesis` or `ASK_RESULT_SYNTHESIS`. |
| Gate result | `BICC-0.3` gate met: no callable model-backed synthesis path or flag remains. |
| Not run | Full `tests/ask` suite. `crossDomainSemanticGovernance.test.js` has 3 failures from recognizer-manifest drift on files this slice did not touch (counts and uninventoried files such as `answerFamilyAnatomy.ts`); none mention synthesis. Not compared against a clean checkout. |
| Remaining discrepancy | The `ASK_TURN_STAGES` list no longer contains `SYNTHESIS`; any external dashboard keyed on that label (none found in the repo) would need updating. |

## BICC-0.5 — Independent experience corrections — PARTIAL

| Field | Record |
|---|---|
| Requirements | `BICC-UX-003` (copy only), `BICC-UX-004` (launcher), `BICC-UX-007` (lazy load), `BICC-TRN-001` and `BICC-TRN-002` (client side), `BICC-UX-001` |
| Code revision | `53a48bda` |
| Files changed | `AIChat.tsx`, `AskWorkspace.tsx`, `ExecutionCard.tsx`, `useAskRequest.ts`, `lib/api/client.ts`; new `features/ask/answerText.ts`; tests `AIChat.test.tsx` (also repaired: it lacked an auth mock and failed before this change), `useAskRequest.test.tsx`, new `stopAsking.test.tsx`, `copyAnswer.test.tsx`, `answerText.test.ts`. |
| Reproduced defects fixed | (1) The launcher used `bottom: safe-area + 1rem` with `z-40` while the mobile `BottomNav` is `h-16`, `z-50`, so the launcher sat behind it below `lg`; it now clears the nav. (2) The panel exposed three close controls: a full-screen scrim button and an absolute-positioned X, both named "Close Ask Cozy", plus the workspace header "Close". The scrim is now a pointer-only element and the X is removed; the header button carries the single accessible name. (3) Stop only set a flag; the browser request ran to completion and an error alert was shown. It now aborts the request through `AbortController` and shows a calm status notice. (4) `AIChat` imported `AskWorkspace` statically so every dashboard page loaded it; it is now loaded on first open and launch context is held in launcher state. (5) No copy control existed; completed answers now offer Copy (plain text of summary, list and table only). |
| Tests/checks | `AIChat.test.tsx` 4 pass; the new `stopAsking.test.tsx` and `copyAnswer.test.tsx` 3 pass; `answerText.test.ts` 2 pass; `useAskRequest.test.tsx` 13 pass. `next build` exit 0. Broader run `src/components/ask src/features/ask src/components/__tests__`: 137 suites pass, 12 fail. Eleven of those suites fail identically on a clean checkout of the prior commit (19 failures there); the twelfth was `useAskRequest.test.tsx`, updated for the new notice behaviour and now passing. |
| Gate result | Per accepted defect, a current reproduction and a focused regression exist. |
| Not run | No browser or Playwright run, so no visual overlap check and no screen-reader pass. Server-side propagation of cancellation (`BICC-TRN-001`) is **not** done: the server still finishes a request the browser aborted. |
| Not reproduced | FeedbackWidget overlap (it is positioned bottom-left and the launcher bottom-right; no collision found in code). Panel heading structure (the panel uses an `h2` inside a labelled dialog; no conflict found). Voice dictation already has start, listening, stop, error and permission messages, transcript-into-composer without auto-submit, and a polite status region; no defect found, and it was not independently tested. |
| Remaining discrepancy | **Persisted feedback across reload (`BICC-UX-003`) is not done.** `ExecutionFeedback` keeps the rating in component state and the execution response carries no saved rating, so a reload shows an unrated answer. Fixing it needs an execution-contract change (backend `executionState.ts`, shared contract, frontend types) and is left for a decision. **Regenerate (`BICC-CTX-006`) belongs to `BICC-2.3`.** |

## BICC-0.2 — Provider-boundary register and egress proof — PARTIAL

| Field | Record |
|---|---|
| Requirements | `BICC-OPS-006`, `BICC-OPS-007`, `BICC-OPS-008`, `BICC-OPS-009` |
| Code revision | `f33a7cc8` |
| Files changed | New `apps/backend/src/services/ask/modelRouting/providerBoundaryRegister.ts` and `tests/ask/providerBoundaryRegister.test.js`. |
| Authority trace | Ten flows are registered: five with a call site today (`CAPTURE_EXTRACTION`, `SEMANTIC_REQUEST_PLAN`, `SEMANTIC_STAGED_UNDERSTANDING`, `REMOTE_FALLBACK_TYPED_CLAIM_SELECTION`, `LEGACY_GEMINI_CHAT`), three planned or conditional (`DOCUMENT_EVIDENCE_EXTRACTION`, `VISION_OBSERVATION_EXTRACTION`, `EVALUATION_JUDGE`), one not authorised (`SENSITIVE_DOCUMENT_CLASSIFIER`) and one retired (`RESULT_SYNTHESIS`). A scan of `services/ask/**`, `gemini.service.ts` and `groundedAsk.service.ts` fails if any `generateContent`, `chats.create` or `executeGovernedAIRequest` caller is unregistered, and every `geminiService.*` method called from Ask must match a registered marker. |
| Tests/checks | `node --test tests/ask/providerBoundaryRegister.test.js`: 8 pass, 0 fail. `npm run typecheck` clean. Captured-payload tests replace the provider client, run the real serializers, and prove that the three Gemini-service calls send only their registered keys with email and phone redacted, and that the capture-extraction request contains no address, owner name, email or database identifier outside the supplied lists. |
| Gate result | The register, call-site scan, no-inheritance rule and synthetic-only evaluator rule are executable. **The "evidence complete" half of the gate is not met:** provider terms and real-homeowner-data approvals are owner and vendor facts that exist nowhere in the repository, so every flow is recorded `NOT_APPROVED` with terms `UNRECORDED`. |
| Not run | No real provider call. The payload tests do not cover `semanticProviderOrchestrator` or `understandingProvider.ts` end to end (their serializers sit behind the Gemini-service methods that were covered). |
| Findings | (a) `REMOTE_FALLBACK_TYPED_CLAIM_SELECTION` is **live by default** (`ASK_REMOTE_GENERATION_ENABLED` defaults true), sends home-fact values to the provider, is not one of the three named exceptions, and has no recorded approval. (b) The runtime activation control for the staged semantic provider was not identified. (c) `LEGACY_GEMINI_CHAT` still exists and needs a consumer trace. |

## BICC-0.1 — Evaluation contract, held-out pools, scorer, baseline — PARTIAL

| Field | Record |
|---|---|
| Requirements | `BICC-EVAL-002`, `-003`, `-004` (partly), `-006`, `-013`, `-014`, `-018`, `-019`, `BICC-OPS-009` |
| Code revision | `bf9852b6` |
| Files changed | New `semantic/evaluation/biccStatistics.ts`, `biccShardManifest.ts`, `biccEvaluationReport.ts`; `scripts/ask-bicc-routing-run.js`, `scripts/ask-bicc-cross-revision.js`; `tests/ask/biccStatistics.test.js`, `tests/ask/biccEvaluationContract.test.js`; the two Phase 0 documents. |
| Built and tested | Exact Clopper–Pearson bounds and the zero-failure sample size; a shard manifest that rejects near-duplicate and same-family certification prompts, requires an independent reviewer, burns a revealed shard into tuning evidence and discloses pool size, burn rate and remaining eligible coverage; an all-prompt success report that **refuses a certification headline from main-corpus or contaminated results**; same-pool revision comparison with the two-point non-inferiority margin; deterministic claim segmentation; scorer-contract validation (pinned judge versions, fresh calibration against a sealed human set, no judge for static authored content, human adjudication of borderline and safety-critical items); an evaluator egress guard that rejects real, replayed or identifier-bearing material; fidelity-suite manifests with partition coverage, no population-bound claim for a fixed matrix, and permanent regression cases. |
| Tests/checks | `node --test tests/ask/biccStatistics.test.js tests/ask/biccEvaluationContract.test.js`: 22 pass, 0 fail. `npm run typecheck` clean. Cross-revision run: see the baseline document. |
| Gate result | **Not met.** `BICC-EVAL-001` to `-019` are not all executable. Not built because each needs authored corpora or a runtime path that does not exist yet: `-001` stratified taxonomy, `-005` latency and cost measures, `-007` compound per-facet scoring, `-008` guidance, `-009` attachments, `-010`/`-011` write families, `-015` injection corpus, `-016` social turns, `-017` buyer fairness. `-002` has the mechanism but **no sealed pool has been authored**; `-014` has the contract but no human-labelled set; `-019` has the validator but the 300-case fidelity suites are authored under `BICC-1A.2`. |
| Not run | No human labelling, no LLM judge, no sealed shard. |
| Reproduced finding | Routing success fell from about 64% to about 21% at `558b506b` (fast-path certification enforcement) and is 30.5% at HEAD; all 125 fast-path rules are demoted. See the baseline document. |

## Consolidated owner decisions

These are the points where the work stopped rather than guess. Defaults in FRD §18 stay in force until each is answered.

1. **Restoring deterministic coverage (the cause of the fall in success).** All 125 deterministic rules are demoted because none has a certificate, and certification needs a human-confirmed sealed set. Options: (a) author and independently review sealed prompts per operation pool so the existing certification runner can certify rules; (b) widen the provisional-read allowlist (14 operations today) to more low-consequence read operations as an interim measure; (c) a combination, starting with the highest-volume operations. A model is not required for any option.
2. **`REMOTE_FALLBACK_TYPED_CLAIM_SELECTION`.** Live by default, transmits home-fact values, not a named exception, no recorded approval. Choose: name it a fourth exception; fold it into last-resort semantic planning; disable it by default until an approval is recorded; or retire it.
3. **Provider terms and real-homeowner-data approvals.** For the five flows that reach a provider today, record the provider, model, region, retention, training-use, abuse-monitoring, logging and deletion terms and an approval, or confirm that those flows stay disabled for real data.
4. **Persisted feedback after reload.** Approve a change to the execution response contract so a saved rating comes back on reload (backend `executionState.ts`, shared contract, frontend types).
5. **Server-side cancellation.** Approve propagating a browser abort to the server so cancellable work stops (currently the server finishes).
6. **`LEGACY_GEMINI_CHAT` and the staged semantic provider.** Confirm a consumer trace and retirement of the legacy chat endpoint, and which control (if any) should gate the staged semantic provider.
7. **Authoring the sealed pool.** Name who authors and who independently reviews certification prompts (`BICC-EVAL-002` requires a reviewer other than the author). The role-based owner in FRD §18 D13 covers guidance content, not evaluation prompts.

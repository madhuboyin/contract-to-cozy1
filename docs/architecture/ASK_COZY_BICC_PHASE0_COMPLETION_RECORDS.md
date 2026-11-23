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
| Remaining discrepancy | **Update 2026-11-22: persisted feedback and server-side cancellation were completed after owner approval (see "Owner decisions" below).** Original note: **Persisted feedback across reload (`BICC-UX-003`) is not done.** `ExecutionFeedback` keeps the rating in component state and the execution response carries no saved rating, so a reload shows an unrated answer. Fixing it needs an execution-contract change (backend `executionState.ts`, shared contract, frontend types) and is left for a decision. **Regenerate (`BICC-CTX-006`) belongs to `BICC-2.3`.** |

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

## Owner decisions (answered 2026-11-22) and what was done

| # | Decision | Implementation | Evidence |
|---|---|---|---|
| 1 | Restore deterministic coverage with independently reviewed prompts, highest-volume operations first; no allowlist widening to improve a metric; tuning first, then fresh sealed shards | Work queue and procedure in `ASK_COZY_BICC_CERTIFICATION_WORK_QUEUE.md`; `tests/ask/provisionalAllowlistGuard.test.js` plus `tests/fixtures/provisionalAllowlistEvidence.json` fail on any allowlist addition without authorization, value-integrity, routing and held-out evidence. **Prompt authoring has not started: it needs the named roles.** | Guard test 2 pass |
| 2 | Disable `REMOTE_FALLBACK_TYPED_CLAIM_SELECTION` by default; no new exception | `ASK_REMOTE_GENERATION_ENABLED` defaults false in code and `infrastructure/kubernetes/base/configmap.yaml`. With it off `GROUNDED_GUIDANCE` still serves its deterministic authored/Knowledge Hub branch and no provider call is made (`provider: null`). The understanding planner no longer depends on this flag. Consumer trace: `answerGroundedAsk` is called only by the `GROUNDED_GUIDANCE` handler once the legacy endpoint is gone. Retire-or-fold is left until deterministic coverage is certified. | `providerBoundaryRegister.test.js` (default-off test), commit `a8f7c70e` |
| 3 | Real-data model flows disabled until exact terms and approval are recorded | Every Ask-controlled flow (`CAPTURE_EXTRACTION`, `SEMANTIC_REQUEST_PLAN`, `SEMANTIC_STAGED_UNDERSTANDING`, `REMOTE_FALLBACK_TYPED_CLAIM_SELECTION`) ships off and a test asserts it and the base config. The register still has no approval for any flow. The Guidance Advisor's direct `sendMessageToChat` call is **not** an Ask flow and is **not disabled**: it is registered as `GUIDANCE_ADVISOR_CHAT`, live, with no recorded approval. | Same test |
| 4 | Persisted feedback | `AskExecutionResponse.feedback` (rating, attempt execution id, comment, time) is populated from the stored `Feedback` row for the execution being returned (session read and single read) and hydrated into the UI. A regenerated answer is a new execution, so it never inherits a rating. | `askFeedbackState.test.js` 3 pass; `copyAnswer.test.tsx` 4 pass |
| 5 | Server-side cancellation | A browser close fires an `AbortSignal` in the controller; `createAskExecution` races only non-write-capable work against it, ends the turn as `CANCELLED` with a calm "Stopped" block, abandons the planner provider call, and skips the optional extraction call. A write-capable operation is never raced, so committed work finishes and a reload shows its true state. | `serverCancellation.test.js` 5 pass |
| 6 | Retire the legacy chat; staged provider inherits planner controls | `/api/gemini/chat` route, controller and client method removed (it was a wrapper over `answerGroundedAsk` with no frontend caller); `GeminiService.sendMessageToChat` stays for the Guidance Advisor. The staged provider now also requires the planner flag on and kill switch off, in `resolveDefaultSemanticProviderPolicy` and the capability handler check. The per-stratum certification check already exists for the planner (`isUnderstandingStratumCertified`) and is added to the staged path with `BICC-1B.2`. | `crossDomainSemanticEvaluation.test.js`, `groundedAskProposalRetirement.test.js` |
| 7 | Role-based sealed-pool ownership | `EVALUATION_ROLES` in `biccShardManifest.ts`; a safety-critical certification prompt also needs the Home Safety/Policy Reviewer. FRD §18 D19. | `biccEvaluationContract.test.js` 17 pass |

### Follow-up decisions (2026-11-22, second round)

| Decision | Implementation | Evidence |
|---|---|---|
| Guidance Advisor: same real-data rule across the product | `GUIDANCE_ADVISOR_AI_ENABLED` (default off), `GUIDANCE_ADVISOR_AI_KILL_SWITCH`, provider-terms and property-data approvals in `config/guidanceAdvisorControls.ts`; an allowlisted, minimized serializer (`guidanceAdvisorPayload.ts`: eight fields, free text redacted and capped, cost rounded, no identifier or property context); a stateless `generateGuidanceAdvice` provider method replaces the old `sendMessageToChat`, which injected property facts and is removed; a new governed route `ai:guidance-advisor`; failure returns no advice and the authored journey output is unchanged. Registered as `GUIDANCE_ADVISOR_STRATEGIC_TAKE`. No Ask approval enables it. | `tests/unit/guidanceAdvisorProviderFlow.test.js` 7 pass (default off, no Ask approval enables it, captured payload, fallback) |
| Cancellation through composed reads | `ComposedTurnInput.signal`; a part not yet dispatched is recorded `CANCELLED` and named ("You stopped this part before it finished"), started read children observe the signal, completed parts keep their answers, attempt recording keeps its compare-and-set so a stop racing a completion is consistent, and a stopped part is terminal so recovery never replays it. | `composedTurn.test.js` 5 new tests (45 pass) |
| Prompt authoring, first wave | 301 tuning prompts authored for `DATA_POINT_READ`, `INVENTORY_LOOKUP`, `SELL_HOLD_RENT_ANALYSIS` (`tests/fixtures/certification/wave1-tuning.json`, AI-assisted provenance, not human-confirmed); routing corrected for three genuine wrong claims with two narrow guards (three other disagreements were label corrections against recorded product contracts); behaviour and thresholds frozen (`wave1-frozen.json`). **No shard is sealed**: a different human Ask Evaluation Reviewer is required first. `DATA_POINT_READ` is not governed by fast-path certification (its rules are not message-routable) and follows `BICC-1A.2`. | `certificationWave1Tuning.test.js` 5 pass; `ask-certification-wave1-tuning.js` |

### Still open after these decisions

- **A different human must be assigned as Ask Evaluation Reviewer** before any shard is sealed; the sealed shards for the first wave do not exist yet.
- **Provider terms and approvals**: none recorded; every real-data flow stays off (Ask flows and the Guidance Advisor).
- **Document analysis** must observe the abort signal before `BICC-3.2` activation (recorded in the plan gate).
- **Regeneration** (`BICC-CTX-006`) still belongs to `BICC-2.3`.
- **No browser verification** of any frontend change and **no real-database run** of the feedback overlay or cancelled-execution persistence; both are unit-tested against stubs.

## Unblocked engineering, third round (2026-11-23)

Work that does not depend on a person. Nothing here ran against a real database, browser or provider; behavior is unit-tested against stubs and the integration points are type-checked.

| Slice | What was built | Evidence | Not done |
|---|---|---|---|
| `BICC-1A.1` reach inventory | `scripts/ask-bicc-reach-inventory.js` generates the denominators: 231 operations by route and 107 data points by reachability, with the missing-target list; output committed as `ASK_COZY_BICC_REACH_INVENTORY.md`. Findings: 107 operations are not message-routable, 69 have only demoted fast-path rules, 11 are provisional reads and none is certified; 106 of 107 data points are reachable by their own aliases (one has an alias collision) and 83 have no tuning question. | `biccReachInventory.test.js` 5 pass | Gap classes "unavailable reader" and "intentional boundary" need a reader and boundary inventory. Probes come from the catalogue, so this measures catalogue self-consistency, not real phrasings. |
| `BICC-1A.3` bounded recovery | **Portfolio questions** ("which of my homes has overdue maintenance?") used to be answered silently for the selected home; they now get a boundary that explains the limit and offers to choose a home (PORT-003). **Other languages** get a respectful, non-destructive recovery (UX-009); the detector is checked against more than 1,000 English prompts. **Clarification limit** (UND-007/008/009): a repeated or rephrased request after one clarification gets the best-supported plain read, labelled "How I read your question"; an unresolved entity, write or material decision is never guessed. | `portfolioAndLanguageBoundaries.test.js` 7 pass; `clarificationLoop.test.js` 9 pass | The clarification integration in `createAskExecution` is not run against a database. The portfolio boundary offers the selector in text, with no inline property-picker action. |
| `BICC-1C.1` answer modes | Each response now carries `answerMode` (home record, estimate, recommendation, general guidance, unavailable), assigned by the operation, never by a model. `CALCULATION` is deliberately unused until an operation declares authoritative-only inputs; forecasts and computed figures are labelled `ESTIMATE`. | `answerModes.test.js` 6 pass | Per-facet modes for composed answers, `USER_DOCUMENT` (`BICC-3.2`), the UI label, and the GATE-004B1/005 evaluation. |
| `BICC-1C.2` authored guidance | The 7-entry catalogue now carries owner, topic family, evidence basis, scope, exclusions, boundary, review state and dates, with a deterministic lint (prohibited claims, duplicates, conflicts, overdue review) and a coverage report that names the excluded topics. The lint caught and I loosened one over-strict rule. | `generalGuidanceGovernance.test.js` 6 pass | **All 7 entries have evidence basis `UNRECORDED` and safety and editorial review `PENDING`**: a person must supply sources and review them. No topic inventory or held-out demand measure yet, so GATE-011 is not measurable. |
| `BICC-2.3` regeneration | `POST /api/ask/executions/:id/regenerate` creates a new execution linked to the original (`regeneratedFromExecutionId`), keeps both, is idempotent on `clientRequestId`, and refuses writes, confirmations, failures, composed parents and model-backed operations. A Regenerate control appears only when the answer is regenerable. Feedback stays per attempt. | `askRegenerate.test.js` 8 pass; frontend `copyAnswer`/`regenerate` tests pass | Not exercised against a real database or browser. |

### Remaining unbuilt engineering

- `BICC-2.1` structured conversation summary and entity-reference carrying (CTX-001 to CTX-005).
- `BICC-1S` emergency interception improvements and corpus (the certification half needs the Home Safety/Policy Reviewer).
- `BICC-1A.2` fidelity suites of at least 300 cases and the held-out data-point reach measure.
- `BICC-1B` stays conditional on a measured residual gap.
- `BICC-1C.2`/`BICC-UX-010` social-turn contract.
- Evaluation corpora for `BICC-EVAL-001`, `-005`, `-007` to `-011` and `-015` to `-017`.
- `INVENTORY_LOOKUP` recall: 12 of 37 tuning positives are claimed by an inventory rule.
- Phases 3 to 5.

## Fourth round (2026-11-23): fidelity suite and conversation summary

| Slice | What was built | Evidence | Not done |
|---|---|---|---|
| `BICC-1A.2` / `GATE-004A1` home-record read fidelity | A reusable parameterised suite of **415 distinct cases** (`tests/ask/fidelity/homeRecordReadFidelity.js`) runs the real `readDataPoint` reader and the value formatter against an in-memory property database: VALUE and MISSING_DATA for every one of the 71 reachable data points, an exact-text check per family, per-role audience-floor cases for every point, property-isolation and reviewed-column cases per entity, named-record entity cases, read-mode branches, and boundary cases (zero and false are values, an empty string or list is missing, the row cap, named and latest tax years, superseded and low-confidence tax records, a never-recalculated reserve). It is a fixed partition matrix: it reports coverage and claims no population bound, and a failure adds a permanent regression case. | `homeRecordReadFidelity.test.js` 415 pass. Mutation checks: removing property scoping fails 4 cases, removing the audience floor fails 19. It **found two defects, now fixed**: an unreadable stored date made the formatter throw, and a single-word enum such as `GOOD` or `HIGH` was shown in capitals because the shared humanizer only rewrites multi-word codes (this also fixes one previously failing `dataPointRead.test.js` case). | It runs against an in-memory database, not a real one; it does not cover routing from a message to a data point (that is the held-out `GATE-001`/`-003` measure), nor relation, claim-child or record-version reads, nor list/filter/aggregate shapes. The calculation suite (`GATE-004A2`) is not built. |
| `BICC-2.1` conversation summary | `conversationSummary.ts`: a bounded, structured summary (scope, referenced result, entities, stated values, corrections, open clarification, sources, workflow ids) built from typed fields only, with a turn window, a recency window, per-field limits and a 4 KB budget that drops the least important context first and records the truncation; reconciliation that removes context on property switch, access loss, entity deletion and result expiry by canonical id and discloses the reset; and a user- and session-scoped persistence read. | `conversationSummary.test.js` 13 pass | **It is not yet consumed.** Follow-up resolution (`askFollowUpContext`) still uses its own prior-execution lookup, and nothing supplies the deleted-entity and expired-result sets. It is deliberately sent to no model. Wiring it into follow-up resolution is the next step and needs a database run. |

### Conversation summary wired into follow-up resolution (2026-11-23)

`resolveAskFollowUpMessage` now takes the caller's user and, for an ordinary follow-up (a declared control pinned to its own execution bypasses it), builds the conversation summary, reconciles it against the home the person is on, and **fails closed** when the latest settled result belongs to another home: the follow-up does not continue from an older turn of this home, and `createAskExecution` appends a "Starting fresh" note saying why (`BICC-CTX-003`). Same-home continuation is unchanged. The summary is read only for messages that look like follow-ups, scoped to the user and session. Evidence: `followUpSummaryGate.test.js` 8 pass (switch blocks and discloses, same home continues, pinned control bypasses, no user skips, non-follow-up reads nothing, scoping, ancient switch ignored); typecheck clean; the Ask suite shows no new failures beyond a database-dependent file that already fails alone.

Not done: entity and slot resolution still use their existing logic (the summary's entities and stated values are not yet read by them); access loss, entity deletion and result expiry reconcile correctly but nothing supplies those sets (the gate has no access lookup); not run against a real database.

### Canonical entity resolution from the summary (2026-11-23)

"Now complete it" after an answer that listed exactly one maintenance task now resolves by that task's **canonical id**: the follow-up reads only the typed `id` and `entityType` of the single listed row (`singularEntityOf`), requires the conversation summary to agree (same result, same id), and sends the id through the same id lookup a proactive card uses (`MAINTENANCE_TASK_COMPLETE` with `suppliedInput.taskId`). No title is matched and the message is not rewritten. A list of several tasks names nothing and is not guessed; other verbs (reschedule, cancel, update), other entity types, and calls without a user keep the existing title-rewrite behaviour unchanged. The summary builder now also records the one entity a settled answer named. Evidence: `followUpSummaryGate.test.js` and `conversationSummary.test.js` 26 pass; typecheck clean; the Ask suite shows no new failures.

Not done: slot and elliptical resolution still use the existing slot logic; the id path covers completion only (not reschedule or update); deleted-entity and access-loss sets are still not supplied to the reconciliation.

### Update verbs by canonical id, and slot carry from the summary (2026-11-23)

**Update verbs.** Reschedule, update, cancel, archive, reopen and mark of a single listed maintenance task now resolve by the task's canonical id: the follow-up forces `MAINTENANCE_TASK_UPDATE` and carries the id as the launch entity (the path a row button already uses; `withFollowUpEntity` applies it only when the client declared no entity). The message is left as the person's own words, so a date or priority in it ("to Friday", "urgent") is still read. "Complete" still wins over the update verbs. Several tasks, other entity types and calls without a user keep the existing title behaviour.

**Slot carry.** Elliptical follow-ups ("what about the water heater?", "make it 10 years") now read their carried slots from the conversation summary through one scoped read (this home, settled turns only, within the summary's 2-hour window) instead of a separate read of prior turns. `carriedSlotsFromSummary` agrees with the existing `carriedSlots` on the same turns (tested), the carried operation and source execution come from the newest settled turn that stated anything, and revalidation of the item and the home is unchanged. Values stated in a turn that did not answer are not carried (as before). One deliberate change: a slot older than the 2-hour window is no longer carried (the previous rule had no age limit).

Evidence: `followUpSummaryGate.test.js` and `conversationSummary.test.js` pass (15 + 18); `conversationalSlots.test.js` still passes unchanged; typecheck clean; the Ask suite shows no new failures.

Not done: the update path covers maintenance tasks only; slot carry uses the summary's redaction and caps (item, date, objective text) which are stricter than before; not run against a real database; deleted-entity and access-loss sets are still not supplied to the reconciliation.

### Live reconciliation checks and inventory by id (2026-11-23)

**Live checks.** The follow-up gate now supplies the reconciliation with facts instead of assumptions (`buildContinuationChecks`): access to each earlier home (`resolvePropertyAccess`), whether the entities the summary carries still exist on this home (maintenance tasks and inventory items, scoped to the property), and whether the referenced result has expired (scoped to the user). A home the person can no longer reach now reads as `ACCESS_LOST` ("a home from earlier in this conversation is no longer available to you") rather than a switch. If the single entity the last answer named was deleted, "complete it", "reschedule it" and "update it" do nothing, match no title, and say so ("the item we were looking at is no longer on this home"). The checks add at most one access lookup per earlier home plus two scoped reads, and only for messages that look like follow-ups.

**Inventory by id.** A single listed inventory item answered by `INVENTORY_LOOKUP` can be updated with "update it": the follow-up forces `INVENTORY_ITEM_CORRECT` with the item as launch entity. The result is a review (the write still needs confirmation). Other verbs, two listed items and a deleted item are never targeted by id.

Evidence: `followUpSummaryGate.test.js` and `conversationSummary.test.js` 39 pass (deleted entity, access lost, scoping of the existence check, inventory update and refusals, real-checks scoping); typecheck clean; the Ask suite shows no new failures.

Not done: the inventory row shape (`id` and `entityType` on a single list row) is tested with synthetic rows, not confirmed against a real inventory answer; other entity types are assumed to exist; the real checks have not run against a real database.

### Social-turn contract (BICC-UX-010, 2026-11-23)

A message that is only a social phrase (greeting, thanks, acknowledgement, goodbye, "how are you", "how is my day", "tell me a joke") is decided right after safety in the routing cascade (`classifySocialTurn`, `support/socialTurn.ts`) and answered with one authored summary block: no tool, no clarification, no confirmation, no capture, empty suggestions (so no suggested-action row) and no skill handoff. Wording is fixed, brief, and states no home fact, memory, feeling or completed work; the day-check reply says it cannot see the person's day. A message that adds anything ("hi, what is due this week", "thanks, now complete the gutter task") is not a social turn and routes normally; an emergency still wins because safety is decided first.

Evidence: `tests/ask/socialTurn.test.js` 5 pass; typecheck clean; Ask suite 292 failing, none new versus the previous run.
Not done: the old small-talk branch still routes its wider phrases ("what's up today?") to the fallback; reply wording is English only; not run on a real database or in a browser.

### Emergency interception, phase 1S (2026-11-23)

**Measured first.** An engineer-written tuning corpus (`tests/fixtures/safety/emergencyCorpus.js`: active rows across gas, CO, fire, smoke, electrical, overheating, flooding near electricity, flooding, structural, intrusion; benign rows across education, history, hypotheticals, resolved incidents and routine maintenance) was run against the existing interception. Result before any change: **recall 39/44 and 8/42 false positives**. Misses were live/exposed wiring, a sparking panel or wire, and an overheating water heater. False positives were the gas and CO nouns inside education ("what should I do if I smell gas"), history ("we had a gas leak last year"), a hypothetical and a resolved incident.

**Changes.** (1) New `electricalHazardPattern` for live or exposed wires, sparking/arcing/smoking panels, wires, outlets and cords, and an overheating or smoking appliance. (2) `isActiveEmergencyMessage` replaces the bare pattern test: a pattern hit counts unless its clause is education, history, a hypothetical or a resolved incident (`support/emergencyFraming.ts`). Any present-tense cue ("right now", "my", "this", "again", "help") keeps the clause active, framing in one clause never silences another, and a message with no framing keeps the whole-message check. (3) "smelled gas" now matches. Fast-path manifest regenerated (condition text changed).

**After.** 52/52 active, 0/45 benign fired. Writing the stricter rows (an emergency beside a question) found one more miss ("is it normal for my outlet to be sparking right now"), fixed.

**What this is not.** The corpus was visible while the patterns were tuned, so these numbers are tuning evidence, not certification (BICC-EVAL-002). BICC-GATE-009 is not met: it needs a sealed corpus written independently and a Home Safety/Policy Reviewer. The framing check is deliberately narrow; unseen educational or historical phrasing can still fire, and unseen present-tense phrasing can still be missed. English only.

Evidence: `tests/ask/emergencyInterception.test.js` 5 pass plus the four existing emergency suites; typecheck clean; Ask suite 292 failing, none new (one known DB-dependent test shifted a line number).

### Calculation fidelity suite, BICC-GATE-004A2 (2026-11-23)

`tests/ask/fidelity/calculationFidelity.js` with `tests/ask/calculationFidelity.test.js`: **519 distinct cases** over the eight EVAL-019 partitions (VALUE 159, FORMULA_BRANCH 126, DATE 81, UNIT 80, ENTITY 30, BOUNDARY 22, MISSING_DATA 15, AUTHORIZATION 6), all passing, no population claim (a fixed matrix reports partition coverage). It runs the real calculators: `grow`, `itemCostBases`, `pointEstimate`, `monthsUntil`, `buildFundingPlan`, `depositsPerMonth`, the target-date and amount readers, the funding-item selectors, and the two capital handlers' access check. Expected values are not taken from the code: cost growth and rebasing use exact BigInt rational arithmetic, calendar months and deposit windows use separately written date arithmetic, and the funding plan is recomputed from first principles.

**It found a real defect on its first run.** `grow` rounded floating-point compounding, so an exact half cent landed the wrong way: 100,000 cents at 3.5% for two years is exactly 107,122.5 but 1.035² evaluates to 1.0712249999999999, which rounded to 107,122. `grow` now rounds at twelve significant digits (restores the exact tie). The case is recorded as a permanent regression. A one-cent error is small, but the gate allows none.

A second failure was the suite's own expectation (1,200 million exceeds the one-billion cap); corrected.

Not covered: break-even, refinance and reserve-fund calculators, and any calculation delivered through a handler that needs a database. AUTHORIZATION here means the two capital handlers refuse a home the person cannot reach before reading anything; it is not a claim about every calculation. The gate applies when calculation mode is delivered (BICC-1C.1), which has not shipped.

Evidence: 520 tests pass (519 cases plus the manifest check); typecheck clean; five pre-existing failures in `itemFundingGoal.test.js` and `ownerFailingPrompts.test.js` are unchanged by this work (same count with and without it).

### INVENTORY_LOOKUP recall (2026-11-23)

Tuning positives claimed by an inventory rule rose from **12 to 21 of 37**; wrong claims by a pool rule stay **0** (adjacent 32 and cross 30 negatives unchanged). New rules: `DET_INVENTORY_LOOKUP_06` (do I have / own / is there a named household item), `_07` (show all items, how many items), `_08` (the full record for a named item), `_09` (items that still need details); the room-contents list now accepts "primary" and "main" bedroom; the incomplete-records filter in the answer reads "items that still need details" so the claim is answered as asked. Each rule requires the whole question to be the shape (anchored) and a recordable household noun, so "do I have a warranty / a mortgage / a leak" and "how many documents" stay elsewhere (15 adjacent checks in `tests/ask/inventoryLookupRecall.test.js`).

**What was not claimed, and why.** Age, cost, condition, photo, installed-before and bought-this-year filters, "oldest item", "wear out soon", and electrical/plumbing categories. The inventory answer has no such filters (its categories are HVAC, appliance and roof), so a rule would promise an answer the handler cannot give. They need handler features first.

**The freeze was ended on purpose.** Adding rules changes the wave-1 rule versions, which the freeze guards. No sealed shard existed (none can until a human Ask Evaluation Reviewer is assigned), so nothing was burned; `wave1-frozen.json` records the new versions and a `refreezes` entry. These are tuning-set numbers: the tuning prompts were visible while the rules were written, so they measure recall on the set I tuned against, not on held-out phrasing.

Evidence: `inventoryLookupRecall.test.js` 3 pass, `certificationWave1Tuning.test.js` pass; typecheck clean; Ask suite 6015 tests, 292 failing, none new.

### Answer-mode label in the UI (BICC-ANS-001/007, 2026-11-23)

The server-declared `answerMode` is now worded on the answer card (`features/ask/answerModeLabel.ts`, rendered by `ExecutionCard` above the answer, both chromes): "From your home record", "From your documents", "Calculated", "Estimate", "Recommendation", and "General guidance · not from your home record" (ANS-007), each with a sentence for assistive technology and the hover title. Nothing is shown for UNAVAILABLE (the answer states its own reason), a missing mode, or an unknown one. A social reply (BICC-UX-010) now declares no mode (`deriveAnswerMode` takes the reason code) so "hello" is never labelled as a home record.

Evidence: 4 label tests plus 162 workspace/feature jest tests pass; `next build` passes; backend `answerModes` 8 pass; backend typecheck clean.
Not done: no component render test (the card needs a large prop surface and has none today) and no browser check, so placement, spacing and the folded state are unverified visually. Per-facet labels for composed answers wait on BICC-2.2. The existing HOME_RECORD label also appears on grounded-guidance answers that found nothing, which is the backend's existing classification and is not changed here.

### Unblocked engineering round, 2026-11-23 (later)

**Inventory attribute questions.** The inventory answer now reads condition ("in poor condition"), age ("more than ten years old", "older than 15 years"), install year ("installed before 2010"), purchase year ("did I buy this year"), cost ("cost more than $1,000") and "oldest" (`support/inventoryAttributeFilter.ts`, `DET_INVENTORY_LOOKUP_10`). The filter reads the recorded fields only. An item that lacks the field is never guessed at: it is left out and counted, and the answer says "N items have no recorded purchase cost, so they were not judged". Age uses the install date, else the purchase date. A cost exactly at the threshold is not "more than" it. An empty result says nothing matched and names the field it judged by. Tuning positives claimed: 21 → 25 of 37, 0 wrong claims; the wave-1 freeze was re-recorded again (no shard existed). Still not built: photos (the record has no photo field), electrical/plumbing categories (the answer knows HVAC, appliance and roof only), "wear out soon", and any condition word beyond new/good/fair/poor. Tests: 6 in `inventoryAttributeFilter.test.js` (filters, disclosure, handler list, empty result, routing and neighbours).

**Calculation fidelity** grew from 519 to **593 cases** with the mortgage-rate resolver: the unit verdict for 27 values (a percent entered as a decimal, too low, out of range, not a number), basis-point conversion, percent formatting, the 24-way override/profile/assumption precedence matrix, and request refusal (HTTP 400, never rescaled). All pass first time. Break-even and the reserve fund calculators remain uncovered: they only run against a database.

**Answer-mode badge** extracted to `AnswerModeBadge` with a render test (3 tests): label and assistive text, the general-guidance wording, and nothing for unavailable, none or unknown. `next build` passes.

Evidence: Ask suite 6022 tests, 292 failing, none new (one known DB-dependent test shifted a line number); backend typecheck clean; frontend 13 workspace tests pass.

### Break-even and mortgage arithmetic fidelity (2026-11-23)

The calculation suite grew from 593 to **708 cases**. Added: five level-payment figures checked against an arbitrary-precision decimal calculation (separate from the code), a 36-loan matrix (balance x rate x term) asserting the computed payment pays the loan off exactly and total interest equals payments minus principal, the same matrix through `projectDebtByYear` at 5 and 10 years (balance equals principal paid plus ending balance, no negative amounts, a loan shorter than the horizon is paid off, same payment), boundary cases (payoff pads zero years, a payment below the interest never pays negative principal, a negative rate accrues nothing, a zero term is one month), and the break-even helpers (`clampYears`, `toMoney`, `firstBreakEvenIndex`, `rangeLabel`, `bumpConfidence`). The helpers are now exported from `breakEven.service.ts` (an `export` keyword only; behaviour unchanged). All pass; one expectation of mine was off by a cent (250,000 at 4% over 15 years is 1,849.22, not 1,849.21), which the decimal calculation settled.

Not covered: `BreakEvenService.compute` end to end (needs a database) and the reserve-fund calculator. One existing break-even test fails with and without this change.

### Per-facet answer modes for composed answers (BICC-ANS-001/002, 2026-11-23)

A composed answer (two or more parts) now declares a mode per part. `facetModesOf` reads the stored composite's sections in delivery order and derives each part's mode from its own operation and status exactly as a single answer's is, so "how old is my roof" (home record) and "what would a new one cost" (estimate) keep different labels. The response gains `facetModes` (`blockIdPrefix` matching the delivery projection's `sN-` ids, operation, mode, clause) and its response-level `answerMode` is null so the facets are never collapsed (ANS-001). The frontend labels the first block of each part with that part's mode (`facetBadgeFor`); the assistive text names the part ("Answer type for 'what would a new one cost'"). A part with no mode, a part whose first block was filtered out, a single answer, and malformed stored data are each handled (tests). An unknown operation id gives a null mode and no throw.

Evidence: backend `answerModes` 13 pass; frontend 170 pass; `next build` and backend typecheck pass; Ask suite 6216 tests, 292 failing, none new.
Not done: not exercised against a real composed turn read back from a database, and not seen in a browser. USER_DOCUMENT mode waits on BICC-3.2; per-facet evidence and freshness display (ANS-002's other half) is not built.

### Composed-read cancellation matrix (BICC-2.2 exit criterion, 2026-11-23)

The plan's exit criterion names four cases: stop before start, stop racing a running child, completion winning, no replay of a stopped part. All four already had tests in `composedTurn.test.js` (and the signal is passed to every composed path in `createAskExecution`: start, recover, clarification resume, refresh; write-capable operations are never raced against it). Checking for what the matrix did not reach, I added five tests, all passing the first time, so no defect was found: a stop during the first facet of a dependency chain never starts the dependent facet and the finished facet keeps its answer; a stop between waves leaves the unstarted facet accounted for in the answer; a stop after a retryable failure suppresses the automatic retry (and without a stop the same failure IS retried once, so the stop is what suppressed it); and a fully stopped turn is not reported as a failure.

Limits: all of this runs against a faked child runner and in-memory database, not a real request closed mid-flight; the "unstarted facet is accounted for" test accepts either a CANCELLED attempt or a stated not-answered part, so it does not pin which. The remaining 2.2 exit item, "compound/facet coverage with no silent loss or retargeting", is covered by existing composition tests but was not re-audited here.

### Decision review closed with defaults (2026-11-23)

The owner directed that the governing default applies to every open decision from the 2026-11-23 review. Recorded in FRD §18 as D23-D31 (FRD v0.3.5). What this changes and what it does not:

- **Changes:** the decisions are no longer open. Cross-session continuity, buyer account eligibility, portfolio reads, `CALCULATION` mode, measurement headline, similarity threshold, performance ceilings, inventory scope and copy each have a recorded default.
- **Does not change:** a default cannot supply a fact only a person or provider can. Provider approvals stay unrecorded and the flows stay off; the Ask Evaluation Reviewer and Home Safety/Policy Reviewer are still unnamed, so no shard is sealed, no emergency corpus is certified, and the guidance entries are still unreviewed. `BICC-GATE-009`, `GATE-001/003/010` certification and the guidance coverage gates remain unmet, and the ledger still says so.
- **One default I chose, not the FRD:** D27 (only workflow ids resume across sessions, same user and home, ids only) had no prior default; it is the narrowest reading of CTX-005 and is flagged as such. It is not yet built.

### Pre-launch amendment to the provider rule (FRD D32, 2026-11-23)

Recorded at the owner's direction (there are no real users). FRD v0.3.6, row `BICC-D32`: real-data model flows may be enabled for owner and test data without a recorded provider approval until the first real user is onboarded; the provider facts (product, tier, billing, region, retention, training, abuse monitoring, logging, deletion) and a purpose-specific approval are then required for every enabled flow, and a flow without them is switched off at that point.

What did not change: the register still reads `UNRECORDED` and `NOT_APPROVED` for every flow (the amendment defers the review, it does not claim one); no approval is inherited between flows; evaluator calls stay synthetic-only; no flow was enabled by this change and no flag, default or code was touched. Enabling a flow, for example the semantic planner, is a separate step and may need routing baselines re-recorded.

Pre-launch checklist item: look up the tier and billing state of the key behind `GEMINI_API_KEY` and the data-use terms for that product and tier, and record them in the register for each enabled flow.

### Owner prompt run, 2026-11-23: one fix kept, three rule changes reverted

The owner ran the 764 corpus prompts through the app. The aggregate matched the offline baseline exactly (116 direct hits, 116 right-option clarifications, 31 dead ends, 481 fallbacks, 20 wrong), which confirms the planner is not involved.

**Kept.** A "did you mean" clarification no longer claims a failed lookup. Ten of 25 sampled clarifications were headed "I couldn't find that in your home record" although nothing had been looked up. Multi-option title is now "Which of these did you mean?", the single-option body says Ask was unsure which request was meant and has not looked anything up yet. Test added in `didYouMean.test.js`; no other test or frontend file referenced the old wording.

**Tried and reverted, with the reason.** I added reviewed wording rules for the Home Timeline ("what work has been done on this house"), document lookup ("pull up my uploaded manuals") and coverage holes ("what am I not covered for"). Measured on all 764 prompts: right-option clarifications +2, direct hits -1, dead ends -3, wrong unchanged. The single direct hit lost was "which things in my house have no protection", which the local classifier was already answering directly: a deterministic rule that is demoted (uncertified) claims the prompt, blocks the classifier from executing it (FR-FAST-3/7), and for an operation outside the provisional allowlist ends at a clarification or fallback. So **a new wording rule for a non-provisional operation can lose an answer that works today**, and the gain is only a more focused "did you mean". Reverted to the exact baseline (verified: identical counts).

**What would move direct answers.** Certified rules (a human reviewer) or the provisional-read allowlist, which D14 forbids widening. Not done.

**Not touched.** Inspection finding updates and negotiation prompts (writes: safe-routing clarifications are by design until certified); contractor payment totals (no operation computes them); "what should I ask for after the home inspection" answered as "No inspection report yet" (needs authored guidance); the "saved response can't be displayed" shield on prompt #27 (needs the backend log line listing the failing schema paths).

### Cross-session resume, FRD D27 (2026-11-23): already built, now pinned

I set out to build D27 and found it already exists as the Work destination: `resolveAskWork` / `resolveAskWorkForUser` resume a piece of work from its typed `workKey` (an id behind a fixed prefix) for the same user and home, re-check existence, supersession, completion and role, authorize the home first, and return exactly one plain outcome with no row when it cannot resume. Building another path would have duplicated it. Instead `crossSessionResumeConformance.test.js` (7 tests) pins each D27 clause: ids only (free text, unknown prefix and oversized ids never resolve), same home (every existence probe is scoped by `propertyId`, another home's id reads as gone), same user (executions are found only for the asker), access re-checked (a role below the provider floor is ACCESS_LOST and the reader is never called; the service authorizes before probing, source-asserted), says why it could not resume, and no conversation text across sessions. Gap: the stub-level tests do not run a real database; and "expiry" is covered through the existing execution/STALE outcomes, not a new check.

### Per-facet freshness on composed answers (BICC-ANS-002, 2026-11-23)

Each facet's own evidence, limitations and assumptions were already kept byte-for-byte in its section (the composite validator checks the blocks hash), so a composed answer never merged them. What was missing was a visible per-part freshness. `facetModes` now carries `asOf`, the oldest KNOWN observation time among that part's own evidence, and the part's badge reads "From your home record · as of <date>" (with an assistive sentence). A part with no known time shows no date; the request time is never substituted, and an invalid timestamp is ignored. Tests: backend `answerModes` (freshness cases) and frontend badge (date shown, none shown for null, undefined or invalid).

Not done: the composite-level freshest/stalest range is still not shown; not viewed in a browser; assumptions and limitations are shown only through each part's own blocks, not summarized in the badge.

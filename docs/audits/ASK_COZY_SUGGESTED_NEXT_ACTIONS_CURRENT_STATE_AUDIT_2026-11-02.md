# Ask Cozy Suggested Next Actions — Current-State Audit

**Audit date:** November 2, 2026  
**Repository baseline:** `main` at `11102124209fd0c78e4754512ae2010c015b75d0` The two earlier entity-governance fixes are included in this commit. The only uncommitted files during review (`AGENTS.md`, `docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md`) are unrelated to Suggested Next Actions code.  
**Scope:** governed compact follow-up actions (`suggestedNextActions`), exact-four selection, operation-specific continuations, lifecycle/history suppression, contextual result actions, recovery, and frontend rendering  
**Status:** code-read plus focused environment-independent execution; no database, services, browser, or production data used

## 1. Executive summary

Ask Cozy's Suggested Next Actions implementation is substantially healthier than the earlier audit described. The earlier two P0 entity-governance failures are resolved in commit `11102124`: property-wide outcomes have an explicit allowlist, HVAC continuation recipes carry an active decision-thread identity, and `DECISION_THREAD` and `GUIDANCE_JOURNEY` are present in the freshness matrix. The focused entity-eligibility suite passes.

The current system nevertheless has eleven findings (F1-F5, F9 and F10 are P1; F6-F8 and F11 are P2). F10 is fixed and pushed; F4, F9 and F11 are fixed in the working tree (see their sections); the rest are open:

1. **F1 (P1)** — The continuation-coverage completion gate is red. The operation registry changed without updating its reviewed hash, and `COMMUNITY_UPDATES` is the sole remaining `MIGRATION_REQUIRED` operation.
2. **F2 (P1, owner decision)** — Completion semantics suppress most read/navigation outcomes after one successful use. Of 95 registered outcomes on read, status, decision-analysis, and guidance operations, 84 are non-repeatable. Changing this is a product-policy ruling, not a bug fix.
3. **F3 (P1)** — Ten continuation recipes target an operation with a higher role floor than their source operation. `QUOTE_COMPARISON_REVIEW` loses both of its domain recipes for a viewer.
4. **F4 (P1, fixed in working tree)** — State-aware gating was limited to `HOME_ACTIONS`. Multiple operations can offer `MAINTENANCE_FORECAST` on a property with no verified forecastable system, producing a `NOT_APPLICABLE` answer with no recovery chip.
5. **F5 (P1)** — Presentation ownership is broader than the reviewed contextual-operation registry. A single receipt button can turn into an exact-four exemption.
6. **F6 (P2)** — Many block actions omit `outcomeKey`, which prevents cross-surface semantic deduplication (duplicate chips, not broken behavior).
7. **F7 (P2)** — Recent-prompt suppression can block return-to-list actions after a mutation.
8. **F8 (P2)** — Architecture documentation and executable inventories have drifted.
9. **F9 (P1, fixed in working tree)** — HVAC continuation candidates were eligible but not necessarily executable on the intended decision thread.
10. **F10 (P1, fixed)** — Status-only interactive results (`NEEDS_ENTITY` and siblings with no clarification/confirmation/capture payload) could enter exact-four.
11. **F11 (P2, fixed in working tree)** — Generic capability-recommendation conversion conflicted with target-entity requirements for `INVENTORY_LOOKUP` and `HVAC_DECISION_OUTCOME_VIEW`.

The frontend contract itself is sound: governed typed actions render whenever present, including degraded and exempt rows, and legacy string suggestions are not revived for a governed result.

## 2. Method and evidence

### 2.1 Authoritative inputs

- `docs/product/ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN.md`, especially sections covering activation, contextual ownership, availability status, and operation-specific continuation completion.
- `docs/product/ASK_COZY_EXACT_FOUR_REGISTRY_PACKET.md` for the approved separation between repeatability and prompt-history exemption.
- Current finalizer, producer, eligibility, registry, lifecycle, presentation-identity, recipe, handler, and frontend code.
- The previous attached audit as a checklist only. Every retained finding was revalidated against the current tree.

### 2.2 Executed checks

The following focused test command was run from `apps/backend`:

```text
node --test tests/ask/operationSpecificContinuationEligibility.test.js tests/ask/operationSpecificContinuationCoverage.test.js
```

Result: **7 passed, 2 failed**. The two failures are `every registered operation has exactly one continuation-coverage classification` and `the strict completion validator passes with no migration backlog`. Both also fail with the Suggested Next Actions source changes of commit `11102124` stashed, so they predate that commit.

- All current operation-specific recipes passed the entity eligibility gate once their real preconditions were supplied.
- Property-wide outcomes and active HVAC/guidance entity validation passed.
- Coverage failed because the reviewed registry hash is stale and `COMMUNITY_UPDATES` remains uncovered.

Read-only scripts also enumerated current registry totals, role-floor mismatches, and coverage classifications directly from the TypeScript registries.

### 2.3 Validation limits

- No database-backed lifecycle execution was performed. Lifecycle behavior is code-traced through the write and load paths.
- No browser or real-property run was performed.
- Counts describe `main` at the baseline commit. Findings F5, F6 and F7 are code-traced only; no executed fixture exists for them yet (see section 7).

## 3. Current architecture snapshot

### 3.1 Finalization pipeline

The shared finalizer currently performs five substantive stages:

1. **Candidate nomination.** Essential result, recipe, skill-handoff, and curated-starter producers run with optional platform/profile/opportunity producers under the pipeline budget.
2. **Batched evaluation context.** Operation availability and entity validation are loaded once. Entity validators run once per nominated entity type.
3. **Eligibility and selection.** Eleven ordered rules govern registry validity, health, property scope, authorization, audience, entity validity, freshness, context readiness, interaction conflict, history, and recovery safety. Exact-four selection applies unless an explicit exemption is resolved.
4. **Materialization.** Selected candidates receive deterministic IDs and bounded expiry.
5. **Lifecycle persistence.** Exact-four offers are recorded for cooldown, dismissal, selection, completion, and starter rotation.

Recovery is not a general candidate producer. Explicit recovery paths call `finalizeRecoveryActions` with precise recovery candidates; ordinary `NOT_APPLICABLE` operation results do not automatically gain one.

### 3.2 Producer registry

The live producer array consists of:

- handler-attached result candidates;
- operation-specific continuation recipes;
- completed skill handoffs;
- four separately registered curated-starter producers;
- urgent work;
- active plans;
- governed capability recommendations;
- actionable profile gaps;
- home opportunities.

DIY actions are handler-attached result candidates, not a separate global producer. Safe-recovery behavior is a finalizer mode plus explicit recovery candidate builders, not an ordinary producer in this list.

### 3.3 Frontend contract

The frontend renders server-ordered typed actions whenever `suggestedNextActions` is non-empty, subject only to expiry, duplicate action ID, and the display limit. `suggestedNextActionsGoverned === true` prevents fallback to historical raw strings when the governed row is empty. Rendering is not restricted to an `EXACT_FOUR` status; `READY`, `DEGRADED`, and `EXEMPT` results may all carry typed actions.

### 3.4 Current inventory

| Inventory | Current count | Notes |
|---|---:|---|
| Registered Ask operations | 226 | Current registry; documentation section 17 still describes 197 |
| Registered outcome identities | 128 | `operationId:outcomeKey` pairs |
| Repeatable outcomes | 14 | Seven starters, recurring recovery/current-record entries, and three home opportunities |
| Prompt-history-exempt outcomes | 7 | Curated starters only |
| Read/status/analysis/guidance outcomes | 95 | Families `RECORD_QUERY`, `STATUS_SUMMARY`, `DECISION_ANALYSIS`, `WORKFLOW_GUIDANCE` |
| Non-repeatable outcomes in those read-oriented families | 84 | Permanently suppressed after successful completion |
| Operation-specific recipe source operations | 206 | Registry-authored recipe map |
| Operation-specific recipes | 403 | Individual source-to-destination recipes |
| Coverage classes | 218 governed / 2 contextual / 5 exempt / 1 missing | Missing operation is `COMMUNITY_UPDATES` |
| Higher-role recipe edges | 10 | Target role floor exceeds source role floor |

## 4. Findings

### [P1] F1 — The operation-specific continuation completion gate is failing

**Evidence**

- `tests/ask/operationSpecificContinuationCoverage.test.js:24-57`
- `src/services/ask/suggestedActions/operationSpecificContinuationCoverage.ts:50-91`
- Executed result: reviewed hash expected `174f1057...`, current registry hash `2661bf5c...`.
- Executed coverage classification: 218 `CUSTOM_GOVERNED`, 2 `CUSTOM_CONTEXTUAL`, 5 `EXEMPT`, and 1 `MIGRATION_REQUIRED`.

`COMMUNITY_UPDATES` is the remaining uncovered operation. It is a viewer-floor property-scoped `RECORD_QUERY`, so it is neither terminal nor naturally exempt. Its result has useful structured filters/actions, but there is no registered result-owned compact continuation and it is not one of the two explicitly reviewed contextual continuation operations.

**User impact**

Community event, city-alert, and trash/recycling questions can fall through to generic cross-domain or starter actions instead of continuing within a relevant community/home workflow. More importantly, the strict registry-wide governance gate no longer certifies the current operation set.

**Recommendation**

Add reviewed, registered continuations for `COMMUNITY_UPDATES`, using destinations already supported by the product contract rather than inventing a new workflow. Candidate destinations should be reviewed from the operation's existing semantic package and presented actions—for example Home Timeline or Home Event Radar where semantically appropriate. Then update the reviewed operation hash only after the coverage test returns zero backlog. The hash covers all 226 registered operation IDs, not just `COMMUNITY_UPDATES`: before bumping it, the reviewer must confirm that every operation added since the last reviewed hash is classified (the test currently reports only `COMMUNITY_UPDATES` as unclassified, which is the evidence for that).

Do not merely bless `COMMUNITY_UPDATES` as exempt: it is an ordinary property-scoped read with legitimate onward paths.

### [P1] F2 — Successful read/navigation outcomes are usually exhausted permanently

**Evidence**

- `suggestedNextActionRegistry.ts:260-285`
- `askSuggestedActionLifecycle.service.ts:48-55, 155-160, 259-279`
- `createAskExecution.ts:569-574`
- `suggestedNextActionEligibility.ts:125-131`

When a verified action results in `ANSWERED` or `COMPLETED`, its lifecycle row receives `completedAt`. Any completed outcome not present in `REPEATABLE_OUTCOMES` is then suppressed in every slot and future session for that user, property, operation, outcome, and entity identity.

Current registry enumeration shows:

- 128 total registered outcomes;
- 14 repeatable outcomes;
- 95 outcomes on read/status/analysis/guidance operations;
- 84 of those 95 read-oriented outcomes are non-repeatable.

Examples include `MAINTENANCE_STATUS:REVIEW_MAINTENANCE_STATUS`, `HOME_ACTIONS:REVIEW_HOME_ACTIONS`, `DOCUMENT_LOOKUP:REVIEW_DOCUMENTS`, `OWNERSHIP_COSTS:REVIEW_OWNERSHIP_COSTS`, `BUYER_PLAN_STATUS:REVIEW_BUYER_PLAN`, `HOME_STATUS_BOARD:REVIEW_STATUS_BOARD`, and `WORK_OVERVIEW:REVIEW_WORK`.

**User impact**

A user who follows a hub or list continuation once may never see that semantically identical navigation action again on the same property, even after the underlying records materially change. This is especially risky for recurring home-management surfaces such as maintenance, work, documents, buyer readiness, and status boards.

**Assessment**

The suppression is implemented as designed; changing it is a product-policy decision, not a local bug fix, and it is **blocked on an owner ruling**. The impact statement above is derived from the registry and code paths only; no live lifecycle data was examined. The current scale, however, is inconsistent with the recurring nature of many destinations and deserves explicit owner review. Repeatability and prompt-history exemption must remain separate decisions.

**Recommendation**

Create a reviewed repeatability classification for every registered outcome:

- recurring read/navigation views;
- one-time workflow milestones;
- mutation/capture outcomes;
- recovery actions;
- entity-specific reads whose identity naturally changes with the entity.

Approve repeatability explicitly for recurring read/navigation outcomes and rely on existing offer cooldown, current-outcome exclusion, starter rotation, and prompt-history policy to prevent immediate repetition. Do not make all `CONVERSATION_CONTINUE` outcomes repeatable automatically; decision analyses and workflow steps may have materially different semantics.

### [P1] F3 — Ten continuation recipes exceed the source operation's role floor

**Evidence**

Registry enumeration found these higher-role edges:

| Source | Source floor | Destination | Destination floor |
|---|---|---|---|
| `SERVICE_PRICE_CHECK_RUN` | CONTRIBUTOR | `SERVICE_PRICE_CHECKS` | OWNER |
| `QUOTE_COMPARISON_CREATE` | CONTRIBUTOR | `SERVICE_PRICE_CHECKS` | OWNER |
| `QUOTE_COMPARISON_REVIEW` | VIEWER | `SERVICE_PRICE_CHECKS` | OWNER |
| `QUOTE_COMPARISON_REVIEW` | VIEWER | `PRICE_FINALIZATIONS_LIST` | OWNER |
| `QUOTE_COMPARISON_COMMAND` | CONTRIBUTOR | `SERVICE_PRICE_CHECKS` | OWNER |
| `PRICE_FINALIZATION_COMMAND` | CONTRIBUTOR | `PRICE_FINALIZATIONS_LIST` | OWNER |
| `HVAC_DECISION_CONTINUE` | VIEWER | `HVAC_DECISION_SCENARIO` | CONTRIBUTOR |
| `DO_NOTHING_SCENARIO_COMMAND` | CONTRIBUTOR | `DO_NOTHING_SIMULATION` | OWNER |
| `DO_NOTHING_SIMULATION_RUN` | CONTRIBUTOR | `DO_NOTHING_SIMULATION` | OWNER |
| `HIRING_GUIDE` | VIEWER | `SERVICE_PRICE_CHECKS` | OWNER |

The shared availability gate correctly rejects these recipes for users below the destination floor. The defect is therefore not unauthorized access; it is unusable configured inventory for the source operation's supported minimum role.

`QUOTE_COMPARISON_REVIEW` is the clearest total-loss case: the source supports viewers, but both configured recipes require owner access. `HIRING_GUIDE` retains its viewer-accessible quote-comparison recipe, so it loses only one of two domain continuations.

**Recommendation**

Add a registry test that evaluates every recipe at the source operation's minimum supported role. Require at least one eligible operation-specific continuation for every non-exempt source at that role. Sources whose only sensible destinations are higher-floor must be listed in a reviewed allowlist inside the test (source, destination, one-line reason), so each deliberately higher-floor recipe is recorded as supplemental rather than baseline coverage and a new unreviewed edge fails the test.

For `QUOTE_COMPARISON_REVIEW`, add at least one viewer-floor destination or raise the source floor only if product requirements truly prohibit viewers from the result itself.

### [P1] F4 — State-unaware recipes can send users into an empty `NOT_APPLICABLE` recovery dead end (fixed in working tree for `MAINTENANCE_FORECAST`)

**Evidence**

- `suggestedNextActionProducers.ts:60-78`
- `operationSpecificContinuationRecipes.ts:24-46`
- `maintenance.handler.ts:1276-1290`
- `finalizeSuggestedNextActions.ts:51-66`

The operation-specific producer loads collection state only when the source is `HOME_ACTIONS`. Other sources nominate their recipes without state checks. Several operations nominate `MAINTENANCE_FORECAST`, including maintenance creation/status and maintenance budget/template flows.

When the property has no verified HVAC, roof, or water-heater item, `MAINTENANCE_FORECAST` returns `NOT_APPLICABLE` with `MAINTENANCE_FORECAST_NO_VERIFIED_SYSTEMS` and an empty action list. `NOT_APPLICABLE` enters `SAFE_RECOVERY_ONLY`; normal recipes and starters do not have recovery traits and are suppressed. No general recovery candidate is synthesized for this operation result.

**User impact**

The product offers an apparently valid chip, the user follows it, and the next result explains that the feature cannot run but provides no compact action to verify inventory or return to maintenance work.

The same structural risk applies to recipes targeting empty collection views such as inspection findings, document promotions, claims/checklists, and incident continuations. Those destinations may render honest empty states rather than `NOT_APPLICABLE`, so each needs behavior-level verification rather than blanket suppression.

**Recommendation**

Extend continuation-state loading based on destination requirements, not only `sourceOperationId === 'HOME_ACTIONS'`:

- gate `MAINTENANCE_FORECAST` on at least one verified forecastable system;
- reuse canonical collection/readiness sources for inspections, recalls, promotions, claims, and incidents where the destination claims existing records;
- permit deliberate navigation-to-empty-state recipes only when the empty result itself has a useful, authorized setup action.

Add a precise recovery candidate for `MAINTENANCE_FORECAST_NO_VERIFIED_SYSTEMS`, such as reviewing home inventory or starting the governed inventory setup path. Keep it recovery-traited and authorization-checked.

**Fix (working tree, not yet committed) — `MAINTENANCE_FORECAST` only**

- `hasForecastableInventory` (`maintenancePrediction.service.ts`) reuses the forecast generator's own `resolveRuleGroup` predicate (verified HVAC, roof or water-heater item), so readiness matches generation.
- `loadOperationSpecificContinuationState` takes `{ records, forecast }`; the producer loads forecast readiness for every source whose recipes include `MAINTENANCE_FORECAST` (previously `HOME_ACTIONS` only), and drops the recipe when readiness is `false`. A failed read keeps the recipe (readiness is an optimisation). Record-existence gating stays `HOME_ACTIONS`-only: other sources' links to `MAINTENANCE_STATUS` etc. remain intentional navigation.
- The `NOT_APPLICABLE` result now attaches a recovery-trait candidate to `INVENTORY_LOOKUP:REVIEW_HOME_INVENTORY` (the forecast result owns it in `RESULT_OWNERSHIP_RELATIONSHIPS`), covering the case where a verified system exists but nothing falls in the forecast window.
- Tests: `maintenanceForecastReadiness.test.js` and an `exactFourActivation.test.js` case (recovery chip survives `SAFE_RECOVERY_ONLY`; a bare `NOT_APPLICABLE` still shows none).
- **Not done:** the other empty-collection destinations named above (inspection findings, document promotions, claims/checklists, incident continuations) still need behavior-level verification of what their empty states offer; they were deliberately left unchanged.

### [P1] F5 — Top-level action presence and reviewed contextual ownership are inconsistent

**Evidence**

- `suggestedNextActionPresentationIdentities.ts:17-37`
- `finalizeSuggestedNextActions.ts:149-151, 253-272, 342-399`
- `operationSpecificContinuationCoverage.ts:23-30`
- `suggestedNextActionExactFourPolicy.ts:99-138`

Any declared compact interaction in a top-level block makes the whole result `CONTEXTUAL_ACTIONS_IN_RESULT`, except for two optional-escape-route operations. The finalizer then removes curated starters and delegates to the legacy selector, which may return fewer than four actions.

Separately, the coverage registry recognizes only `SEASONAL_HOME_CARE` and `HOME_HABITS` as reviewed `CUSTOM_CONTEXTUAL` operations. Many completed command receipts contain one top-level button while their operation is classified as `CUSTOM_GOVERNED`. Examples include inventory correction/creation and warranty or room receipts.

This creates two competing definitions of ownership:

- coverage says a result is governed by operation-specific candidates;
- presentation detection says one top-level button owns the entire continuation surface and exempts the result from exact-four.

**User impact**

A receipt with a single “View this item” or “Review warranties” button can suppress the normal four-action row even when the operation's registered governed candidates represent other valid next steps. A short row is not itself a defect when the result is genuinely contextual; the defect is that contextual ownership is inferred more broadly than the reviewed ownership ledger.

**Recommendation**

Use one reviewed source of truth. Two options:

1. restrict contextual-result exemption to operations registered in `REVIEWED_CONTEXTUAL_CONTINUATION_OPERATIONS`; or
2. introduce an explicit block/action-level declaration that the top-level actions are the complete continuation surface, and validate that declaration against coverage tests.

**Recommended: option 2.** Option 1 would switch the exemption off for receipts whose single button genuinely is the whole intended continuation, forcing the footer to fill in around it. An explicit declaration keeps that case expressible, defaults every other receipt to normal exact-four with deduplication, and can be enforced by the coverage test.

Receipt escape buttons should normally participate in semantic deduplication without automatically owning the entire footer.

**Precondition before changing the exemption: path-complete receipt coverage.** Registry ownership proves an operation *may* own an outcome, not that a candidate is nominated on every receipt path. If ordinary receipts stop being exempt, each affected operation needs at least one candidate that survives every normal receipt state, or the row becomes shorter than it is today. Verify these conditional paths explicitly first: `WARRANTY_UPDATE` (expiry date unchanged), `MAINTENANCE_TASK_UPDATE` (plain update vs archive/snooze), `HOME_EVENT_CORRECT` and `HOME_EVENT_UPDATE` (non-repair events, no linked item), `INVENTORY_ITEM_CORRECT` and `INVENTORY_ITEM_CREATE` (manufacturer, model and install date already populated). `ROOM_CREATE` and `ROOM_RENAME` need no work: both own `INVENTORY_ITEM_CREATE:ADD_ITEM_TO_ROOM` and attach `roomAddItemCandidates` unconditionally (`recordConfirm.handler.ts:646,699`).

### [P2] F6 — Missing `outcomeKey` metadata prevents semantic deduplication

**Evidence**

- `suggestedNextActionPresentationIdentities.ts:39-66`
- `recordConfirm.handler.ts:277, 321, 578, 643, 758`
- `diyProjectCenter.handler.ts:54, 70, 92-100, 109`
- `diyProjectStart.handler.ts:107-123`
- `applianceOracleBudget.handler.ts:47-51, 110-113`

`collectPresentationIdentities` requires `operationId`, `interactionType`, and a registered `outcomeKey`. It correctly refuses to infer semantic identity from label or message. Many block and item actions omit `outcomeKey`, so their equivalent compact candidate cannot be suppressed.

The Appliance Oracle is a concrete collision: item rows can present an entity-specific `REPLACEMENT_GUIDANCE` action, while the handler also nominates a registered `REPLACEMENT_GUIDANCE:REVIEW_REPLACEMENT` compact candidate for the riskiest appliance. The row action lacks `outcomeKey`, so the two surfaces do not publish the same identity.

**Recommendation**

Add registered outcomes to block actions whenever they semantically match a governed compact outcome. Add a source-governance test that scans declared structured actions and requires either:

- a valid registered `outcomeKey`; or
- an explicit documented reason that the action is presentation-only and must not participate in compact-action identity.

Do not loosen the identity collector to infer outcomes from text.

### [P2] F7 — Recent-prompt suppression can block return-to-list actions after a mutation

**Evidence**

- `suggestedNextActionEligibility.ts:125-131`
- `suggestedNextActionRegistry.ts:274-285`

The last user message and recent completed messages are normalized into `askedMessageKeys`. An otherwise eligible candidate with the same prompt is suppressed unless its exact outcome is in `PROMPT_HISTORY_EXEMPT_OUTCOMES`, which currently contains only the seven curated starters.

A common flow is:

1. ask for a list, such as pending maintenance;
2. launch an item mutation from that list;
3. complete the mutation;
4. receive a result-owned “review the refreshed list” continuation using the original list prompt.

That return action can be suppressed as `EQUIVALENT_PROMPT_ASKED`, even though the underlying state has changed and the current result legitimately owns the refreshed destination.

**Recommendation**

Do not globally exempt repeatable outcomes from prompt history; the architecture intentionally separates those policies. Instead, add a narrow, reviewed exemption for post-mutation result-owned return-to-parent-list outcomes, using trusted source-operation family and ownership relationship—not message text—to establish the case. Add tests for maintenance, buyer-plan, project/work, inventory, and warranty receipts.

### [P2] F8 — Architecture documentation and executable inventories have drifted

**Evidence**

- Implementation-plan section 17 states 197 operations and zero `MIGRATION_REQUIRED` after step 8.
- Current registry contains 226 operations and one missing coverage entry.
- The coverage test's reviewed operation hash is stale.
- Some producer comments still describe starter producers as nonessential even though their implementation marks them essential.

**Impact**

Reviewers can reach incorrect conclusions from the document without running the executable parity checks. The previous audit's stale counts and architecture labels demonstrate this risk directly.

**Recommendation**

Update section 17 from generated registry output after fixing coverage. Add a small checked-in audit command or test helper that reports operations, outcomes, repeatability, recipes, coverage classes, and role-floor mismatches so future audits do not rely on hand-maintained totals.

### [P1] F9 — HVAC candidate eligibility does not guarantee executable thread continuity (fixed in working tree)

**Evidence**

- `suggestedNextActionProducers.ts` (operation-specific producer) attaches `hvacThreads[0]` from `loadActivePlanState`, which is the most recently updated active HVAC thread.
- `hvacDecision.handler.ts:965-1000`: only `decision-platform.hvac.continue` reads `launchContext.entityId`. The `scenario`, `outcome.view`, `outcome.report`, `outcome.unlink` and `abandon` handlers re-resolve from the message text.
- The scenario recipe's message ("Show an HVAC repair-or-replace scenario") does not carry the quote amount the destination needs, so following it opens another clarification.
- When no active thread exists, thread-bound recipes are dropped; five HVAC source operations can then be left with no domain recipe.

The commit that fixed the earlier `ENTITY_REQUIRED` failures made these candidates *eligible*. Eligible is not executable: for every destination except `HVAC_DECISION_CONTINUE`, the supplied entity is ignored at execution.

**User impact**

With more than one active HVAC decision, a chip can resolve against a different system than the one in view. Selecting by recency alone also conflicts with the Decision Thread contract's rule against guessing when multiple material threads exist (not re-verified in this audit).

The follow-up clarification itself is a pending interaction (those handlers use `durableFreeTextClarification`), so it does not pick up unrelated chips. The defect is the original chip, not what follows it.

**Recommendation**

Bind each thread-bound destination to the supplied `DECISION_THREAD` entity in its handler, as `continue` already does. Nominate thread-bound recipes only when exactly one active HVAC thread exists; with several, drop the recipe instead of choosing. Give the scenario recipe a message the destination can execute, or drop it. Add a handler-level test per destination proving the launch entity is honored.

**Fix (working tree, not yet committed)**

- `hvacDecision.handler.ts`: new `focusedHvacThreadItem` resolves a `DECISION_THREAD` launch context to that thread's HVAC item (active, same property, HVAC definition). The scenario, abandon, outcome-report, outcome-view and outcome-unlink handlers now pass it to `findHvacItemForMessage` instead of relying on message text, and return `HVAC_DECISION_SUBJECT_NOT_ACTIVE` when the launch thread is no longer active (never a substitute thread). Capability registrations pass `envelope.launchContext`.
- Producer: thread-bound recipes are nominated only when exactly one HVAC decision is active; with several, none are (previously `hvacThreads[0]`).
- Recipes: the `HVAC_DECISION_CONTINUE` -> `HVAC_DECISION_SCENARIO` recipe is removed (the scenario needs a quoted amount and vendor). This also removes one of the F3 role-floor edges.
- Tests: `hvacThreadFocusedLaunch.test.js` (launch thread honored; inactive thread never substituted; exactly-one-thread nomination; no scenario recipe).
- Remaining limits: a focused thread still resolves through its item, so two active threads on the *same* item produce the existing ambiguity clarification rather than an exact-thread bind. With several active HVAC threads on different systems, the HVAC continuation chips are dropped entirely. With no active thread, HVAC sources fall back to `HOME_ACTIONS` where a recipe exists. `HVAC_DECISION_ABANDON` and the two outcome-report/unlink handlers received the same change but have no recipe-driven chip, so only outcome-view is covered by a test.

### [P1] F10 — Status-only interactive results could enter exact-four (fixed, `454bdb35`)

**Evidence**

- `finalizeSuggestedNextActions.ts` computed pending interaction from `result.clarification`, `result.confirmation` and `result.captureRequests` only, in three places.
- `NEEDS_ENTITY` is a valid interactive Ask status (`INTERACTIVE_ASK_STATUSES`: `NEEDS_PROPERTY`, `NEEDS_ENTITY`, `NEEDS_CLARIFICATION`, `NEEDS_CONTEXT`, `NEEDS_CONFIRMATION`). Handlers return it with a pick-a-record list and none of those fields, for example `recallReview.handler.ts:98` and `claims.handler.ts:147`.
- A crude source scan (a `NEEDS_*` status with no clarification, confirmation or capture payload within a 28-line window) found at least 8 such sites in `handlers/` and `execution/`, including `recallReview`, `sellHoldRent`, `communityUpdates`, `buyerPlan`, `capitalPlanning`, `negotiationShieldStart` and `hvacDecision`. This is a lower bound from a text scan, not an exhaustive enumeration.

Such a result looked settled to the finalizer, so it could carry up to four unrelated chips beneath a question that was waiting on the homeowner.

**Fix**

`resultOwnsPendingInteraction` now treats any status in the new `INTERACTIVE_ASK_EXECUTION_STATUSES` (defined in `ask.contract.ts`; `INTERACTIVE_ASK_STATUSES` in `askSessions.ts` is derived from it, so there is one list) as a pending interaction, in addition to the existing payload checks. All three call sites use it. The optional-escape-route exception is unaffected because it applies only to `ANSWERED` and `READY_WITH_LIMITATIONS`. Test: `exactFourActivation.test.js`, "STATUS-ONLY INTERACTIVE RESULTS own the turn" (fails without the fix, passes with it).

### [P2] F11 — Generic capability conversion conflicts with target-entity requirements (fixed in working tree)

**Evidence**

- `capabilityRecommendationCandidates.ts` converts a `CAPABILITY_LIST` recommendation into a candidate with a null entity and the generic outcome `REVIEW_RECOMMENDED_CAPABILITY`.
- Enumeration over `isSafeCapabilityRecommendationOperation` plus `requiredAskTargetEntity` finds exactly two affected operations: `INVENTORY_LOOKUP` and `HVAC_DECISION_OUTCOME_VIEW`.
- `REVIEW_RECOMMENDED_CAPABILITY` is not in `PROPERTY_WIDE_OUTCOMES`, so both fail `ENTITY_REQUIRED`. (`QUOTE_COMPARISON_REVIEW` is not a safe capability operation and is not affected.)

**Recommendation**

Do not add a blanket property-wide exemption for the generic outcome. `INVENTORY_LOOKUP` plausibly has a property-wide mode and can be reviewed for that. `HVAC_DECISION_OUTCOME_VIEW` is thread-specific and should be excluded from generic capability conversion unless a thread identity is supplied.

**Fix (working tree, not yet committed)**

- `INVENTORY_LOOKUP:REVIEW_RECOMMENDED_CAPABILITY` is added to `PROPERTY_WIDE_OUTCOMES` (the capability launch is the property-wide inventory list).
- `isSafeCapabilityRecommendationOperation` now rejects an entity-targeted operation unless its generic capability outcome is a reviewed property-wide outcome, so `HVAC_DECISION_OUTCOME_VIEW` is no longer converted. The check is generic: any future entity-bound read that appears in a capability card stays excluded until reviewed.
- Test (`operationSpecificContinuationEligibility.test.js`): the inventory capability is eligible, the HVAC outcome capability produces no candidate, and every safe capability operation passes the entity rule with a null entity.

## 5. Entry-surface assessment

### 5.1 Curated starters

The seven curated starters themselves are repeatable and prompt-history exempt. The previous inventory/quote `ENTITY_REQUIRED` failures are resolved. Remaining risks occur after entering the target operation:

- maintenance can offer an ungated forecast destination;
- most domain continuations produced by starter destinations are non-repeatable;
- property-summary/home-basics destinations can still lead to honest empty states, which should be evaluated for useful setup actions rather than treated automatically as broken.

### 5.2 Explore with Cozy and discovery prompts

The earlier seven entity-bound broken-recipe claims no longer apply. The remaining confirmed discovery gap is `COMMUNITY_UPDATES`, which covers community events, city alerts, and trash/recycling queries and is the sole coverage backlog.

DIY project and template surfaces now author exact handler-attached candidates with entity validation. Their short contextual footer behavior is intentional under the current finalizer, but F5 requires aligning that behavior with the reviewed contextual-ownership ledger.

### 5.3 Capability cards

The earlier entity-required losses for inventory, replacement, and quote list operations are resolved through explicit property-wide outcomes. Capability-card actions still depend on the same lifecycle repeatability, role-floor, contextual-ownership, and outcome-key issues described above.

### 5.4 HVAC and guidance flows

Eligibility is fixed; execution is not. Operation-specific HVAC recipes attach the most recently updated active thread, but only `HVAC_DECISION_CONTINUE` honors a supplied launch entity (F9). With several active threads a chip can resolve to the wrong system, the scenario chip lacks the quote amount it needs, and with no active thread five HVAC source operations can lose all domain recipes. Active HVAC and Guidance Journey candidates have registered validators and freshness strategies, so the earlier P0 `ENTITY_VALIDATOR_MISSING` failure is closed; the continuity problem is F9.

### 5.5 Confirmed-write receipts

The prior claim that all listed write operations lack governed ownership is no longer accurate. Inventory corrections, events, warranties, rooms, and maintenance updates have registered result-owned outcomes and/or handler-attached candidates. The remaining issue is conditional availability combined with contextual top-level receipt actions: one block button can exempt the whole result, and missing outcome keys prevent deterministic deduplication.

## 6. Prioritized remediation plan

### Phase 1 — Restore executable governance

0. **Done in working tree:** F10 status-derived pending interaction.
1. Add reviewed `COMMUNITY_UPDATES` continuation coverage.
2. Update the reviewed operation-registry hash after review.
3. Make the focused coverage suite green.
4. Update section 17 counts from executable output.

### Phase 2 — Close deterministic dead ends

1. Gate `MAINTENANCE_FORECAST` recipes on verified forecastable systems.
2. Add a precise inventory/setup recovery action for `MAINTENANCE_FORECAST_NO_VERIFIED_SYSTEMS`.
3. Review other data-dependent destination recipes using canonical readiness state.
4. Add fixtures proving every retained empty-state destination has a useful authorized next action or is deliberately terminal.

### Phase 3 — Align roles and contextual ownership

0. Fix F9 (HVAC thread binding) and F11 (capability conversion for the two entity-bound operations).
0b. Verify path-complete receipt coverage (F5 precondition) before changing the contextual exemption.

1. Add recipe-at-source-minimum-role validation.
2. Repair the ten higher-role edges, starting with total-loss `QUOTE_COMPARISON_REVIEW`.
3. Unify contextual exemption with the reviewed ownership registry or an explicit complete-surface declaration.
4. Add registered `outcomeKey` metadata to semantically governed block actions.

### Phase 4 — Review lifecycle product policy (blocked on owner ruling)

1. Classify all 128 outcomes by repeatability semantics.
2. Approve recurring read/navigation outcomes individually or by a tightly validated registry rule.
3. Add narrow post-mutation return-to-list prompt-history exemptions.
4. Preserve cooldown, dismissal, current-outcome, and prompt-history policies as distinct controls.

## 7. Required validation after remediation

Minimum environment-independent validation:

- continuation coverage and registry-hash tests;
- every recipe through full eligibility at source minimum role;
- property-wide/entity-bound eligibility tests;
- state-gated maintenance forecast fixtures;
- `NOT_APPLICABLE` recovery fixture;
- contextual receipt versus exact-four ownership fixtures;
- cross-surface presentation-identity tests with registered outcomes;
- lifecycle tests proving recurring reads reappear after the approved cooldown while one-time outcomes remain suppressed;
- post-mutation return-to-list history tests;
- backend typecheck.

Additional required checks: (F9) a handler-level test per thread-bound HVAC destination proving the launch entity is honored, and a multi-thread fixture proving no recipe is nominated; (F10) the status-only interactive test in `exactFourActivation.test.js` (added); (F11) a capability-conversion fixture for `INVENTORY_LOOKUP` and `HVAC_DECISION_OUTCOME_VIEW`; (F5) a path-complete receipt fixture for each operation listed in F5 before the contextual exemption is changed.

Findings F5, F6 and F7 are currently code-traced only. Before remediation, add one executed fixture each: (F5) a receipt with a single top-level button through `finalizeSuggestedNextActions`, asserting the `CONTEXTUAL_ACTIONS_IN_RESULT` exemption and resulting row length; (F6) a block action without `outcomeKey` alongside its equivalent compact candidate, asserting no deduplication; (F7) a list prompt followed by a mutation receipt, asserting `EQUIVALENT_PROMPT_ASKED` suppression of the return action.

Per repository policy, database and browser execution are not prerequisites for implementation completion, but the final report must say they were not run.

## 8. Findings from the previous audit explicitly excluded as stale

The following prior claims were rechecked and are not current findings:

1. **Thirty-five recipes always fail `ENTITY_REQUIRED`.** Resolved by `PROPERTY_WIDE_OUTCOMES` plus active HVAC-thread binding; the focused full-recipe entity test passes.
2. **`DECISION_THREAD` and `GUIDANCE_JOURNEY` are absent from the freshness matrix.** Both are present with `REQUERY` strategies and registered validators.
3. **All HVAC follow-on operations lose every continuation.** Partly retired: the `ENTITY_REQUIRED` failure is closed and thread-bound recipes carry the latest active thread when one exists. Still open: with no active thread, five HVAC sources can lose all domain recipes, and the carried thread is honored only by `HVAC_DECISION_CONTINUE` (F9).
4. **Inventory/quote/replacement property-wide recipe destinations are categorically invalid.** Their three specific outcomes are explicitly reviewed property-wide exceptions; other outcomes on those operations still require an entity.
5. **The frontend renders typed actions only for exact-four/available statuses.** The frontend renders governed typed actions whenever supplied and does not gate on the status state.
6. **`NEEDS_INPUT` can enter exact-four without capture or clarification.** `NEEDS_INPUT` itself is not a valid Ask execution status, so that wording is obsolete. The underlying concern was correct for the real interactive statuses, however: `NEEDS_ENTITY` and siblings could enter exact-four with no payload. That is now F10 (fixed in working tree).
7. **DIY has no governed continuation candidates.** DIY list/template handlers now nominate exact reviewed project/template actions.
8. **The listed confirmed-write operations have no governed ownership at all.** They now have registered result-owned outcomes and/or handler candidates; F5 and F6 capture the narrower remaining problems.

## 9. Final assessment

Suggested Next Actions has a coherent governance core: entity rules fail closed, operation availability is centralized, selection is deterministic, lifecycle state is durable, and the frontend respects the governed server result. The most dangerous earlier entity failures are resolved.

The next work should not add more generic fallback inventory. It should restore the red coverage gate, prevent known data-state dead ends, ensure continuations remain usable at the source operation's minimum role, align contextual exemption with reviewed ownership, and make an explicit product decision about recurring navigation outcomes. Those changes address the remaining gaps without weakening authorization, entity integrity, recovery safety, or the distinction between completion repeatability and prompt-history policy.

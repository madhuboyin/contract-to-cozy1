# Ask Cozy — Message-Routed Write Safety Trace (FR-WRT-1)

**Date:** 2026-11-11
**Status:** Complete for the question asked; read-only investigation, no code changed.
**Question (Understanding Reliability FRD FR-WRT-1):** can a message-routed call change state without a confirmation or preview step?
**Governing documents:** `docs/product/ASK_COZY_UNDERSTANDING_RELIABILITY_FRD.md` (§11.1), `docs/architecture/AUDIT_METHODOLOGY.md`, `apps/backend/src/services/ask/askInteractionCoverageMatrix.ts` (IW-CONF-001).

**Evidence labels:** **[Executed]** a program was run and its output observed; **[Code-traced]** read from source, not run; **[Inferred]** extrapolated. **Nothing here was run against a real database or a running server.**

---

## 1. Answer

**For the user-intended mutation of every write-capable operation: no evidence of an unconfirmed write.** In all 34 candidate operations the message-time (propose) handler can neither reach the write its confirm handler performs, nor any queue, email or S3 sink, with **four operations that do reach some of the same models and are examined in §4**. The only way to run a confirm handler is an explicit HTTP confirm call on an execution that is in `NEEDS_CONFIRMATION`. **[Code-traced + Executed, static; see §7 for what that does and does not prove.]**

**But three corrections to what the FRD assumed:**
1. The set of write-capable operations is **32, not 30**, and the registry `effect` label cannot be used to find them (§3).
2. Several operations that are **reads by label also write** derived, default or bookkeeping rows at message time; a small number of these change the state of user-visible records (§5).
3. `REPLACEMENT_GUIDANCE`, the first expected `composableDecision` candidate, is **not read-only** (§6).

## 2. Method

| Step | What was done | Label |
|---|---|---|
| Confirmation boundary | Read `askDomainCommandRegistry.ts`, `confirmCapabilityHandlerRegistry.ts`, `askConfirm.ts`, `ask.controller.ts`; grepped every caller of `confirmAskExecution` and `confirmCapabilityInvoke` | Code-traced |
| Registry cross-check | Script over `ASK_OPERATION_DEFINITIONS`, `ASK_DOMAIN_COMMAND_REGISTRY` and `ASK_INTERACTION_COVERAGE_MATRIX` for all 124 message-routable operations | Executed |
| Reachability | A call graph built with the TypeScript compiler API over 3,651 source files; roots are every `registerCapabilityHandler('<key>', …)` (229 propose-time handlers) and every `registerConfirmCapabilityHandler` (126 confirm handlers); edges follow every identifier that resolves to an in-program function (so higher-order use is included) to any depth; sinks are Prisma delegate calls `create / createMany / update / updateMany / upsert / delete / deleteMany`, `$executeRaw*`, and external sinks (`Queue.add`, S3, mailer) | Executed (static) |
| Positive control | The same analysis on the confirm handlers, which are known to write | Executed |
| Triage | Compared per operation the models reachable from propose against those reachable from confirm, after removing a "plumbing" model reachable from ≥ 25% of all handlers (`HouseholdMember`); read the code at every overlap | Executed + Code-traced |

An earlier, simpler analyzer (direct imports, one level) was **discarded**: its positive control found writers in only 4 of 7 confirm-handler files. The call graph finds a non-Ask database write reachable from **124 of 126** confirm handlers (the two it misses: `guidance-overview.journey-dismiss`, `negotiation-shield.update`, neither among the 34).

## 3. The write-capable set is 32, and the `effect` label is wrong in both directions

**[Executed]** 124 operations are message-routable; 126 domain commands exist (94 belong to operations reachable only by a declared action). Every one of the 126 commands is `material: true` and `supportsCancelBeforeExecution: true`.

| Group | Operations | Count |
|---|---|---|
| Labelled `WRITE`, has a command, confirmation-gated per the matrix | `MAINTENANCE_TASK_CREATE`, `MAINTENANCE_TASK_COMPLETE`, `MAINTENANCE_TASK_UPDATE`, `CLAIM_FILE`, `CLAIM_TRANSITION`, `OPERATIONAL_WORK_UPDATE`, `INSPECTION_FINDING_UPDATE`, `RECALL_MATCH_UPDATE`, `DOCUMENT_PROMOTION_CONFIRM`, `REFINANCE_COMMAND`, `PROPERTY_BRIEF_COMMAND`, `ROOM_PLANT_RECOMMENDATIONS`, `HOUSEHOLD_INVITATION`, `GUIDANCE_JOURNEY_CREATE`, `QUOTE_COMPARISON_CREATE`, `RESERVE_FUND_COMMAND`, `SELLER_PREP_ITEM_DECISION`, `HOME_RECORD_EXPORT`, `HVAC_DECISION_ABANDON`, `HVAC_PREFERENCE_SAVE`, `HVAC_PREFERENCE_FORGET`, `HVAC_DECISION_OUTCOME_REPORT`, `HVAC_DECISION_OUTCOME_UNLINK`, `BUYER_TASK_COMPLETE`, `BUYER_TASK_CREATE`, `BUYER_TASK_UPDATE`, `BUYER_FINDING_DISPOSITION`, `BUYER_LIFECYCLE_UPDATE` | 28 |
| **Not labelled `WRITE`, but has a write command** | `REFINANCE_RATE_MONITOR` (`MONITOR`), `HOME_DEADLINE_MONITOR` (`MONITOR`), `HVAC_DECISION_START` (`READ`), `HVAC_DECISION_SCENARIO` (`READ`) | 4 |
| **Labelled `WRITE`, but a read with no command** | `INCIDENT_CONTINUATION` (an incidents-and-claims read), `MAJOR_EVENT_ENTRY` (a guided capability read) | 2 |

So the FRD's "30 operations … are writes" (§2.4, §11.1) was a count of the label. **The real set is 28 + 4 = 32**, and any invariant defined by `effect === 'WRITE'` (wrong-write routing, FR-EVAL-6b) would both miss four writes and test two reads. Code-traced for the two reads: `majorEventEntryResult` builds a capability read; `incidentClaimStatusResult` lists claims.

## 4. Message-time reach of the user's intended mutation

**[Executed, static]** For 30 of the 34 operations the propose-time handler reaches **no** non-plumbing database write at all (`propose-models = 0` after removing `HouseholdMember`), and none reaches a queue, email or S3 sink. The directly read propose result builder `maintenanceTaskCreateResult` returns only `BLOCKED`, `NEEDS_CONTEXT` or `NEEDS_CONFIRMATION`. **[Code-traced]** The 20 direct Prisma writes in handler files are in `*Confirm.handler.ts` functions named `confirm…` or in Ask's own execution bookkeeping (editing a pending confirmation); every mutating service call in the five files that register both a propose and a confirm handler sits inside a `confirm…` function.

**Four operations overlap** with what their confirm handler writes. For each, the path and the judgement:

| Operation | Reachable at message time | Judgement |
|---|---|---|
| `RESERVE_FUND_COMMAND` | `reserveFundCommandResult` → `getOrCreateFund` → upsert `HomeReserveFund` | **A default row is created at message time** if none exists. Lazy materialisation, not the user's contribution or allocation. Low risk |
| `SELLER_PREP_ITEM_DECISION` | `sellerPrepItemDecisionResult` → `getCase` → `syncReadinessItems` → `reconcileSaleReadinessItemResolved` → `transitionWorkItem` → (`OperationalWorkItem` update, `reopenLinkedDomainRecords` updating `ProjectRecord`, `PropertyMaintenanceTask`, `GuidanceJourney`, `OperationalWorkExecution`) and `emitPropertyChange` | **A "read" of the sale case can synchronise readiness items and, when an underlying source has resolved, transition work items and reopen linked records.** Static reachability over-approximates (the transitions are conditional on data), but the path is real. **Needs an owner decision** (§8) |
| `HVAC_DECISION_START` (also reached directly from `REPLACEMENT_GUIDANCE` for any HVAC item) | `hvacDecisionStartResult` → `continueHvacDecisionThread` → `DecisionThread` / `DecisionThreadExecutionLink` / `DecisionThreadHomeActionLink` / `DecisionThreadPreferenceReference`, `RecommendationSnapshot` create, `PropertyChange` upsert | **Decision-thread bookkeeping is written at message time.** The matrix records a materiality carve-out ("DecisionThread bookkeeping is reversible at zero cost, never confirmation-gated"), so this is **intended**; it still means the operation is not read-only |
| `HVAC_DECISION_OUTCOME_UNLINK` | `hvacDecisionOutcomeUnlinkResult` → `getOutcomeSummaryForThread` → `recordCompletedMaintenanceOutcome` → `OutcomeObservation` create, `RecommendationAttribution` createMany | **A summary call records system-derived outcome rows.** Not the user's unlink (that is confirm-gated) |

`HOME_DEADLINE_MONITOR` and `REFINANCE_RATE_MONITOR`, the operations a typo or a polite opener misrouted 32 prompts to (reliability FRD §2.3), are **clean**: their propose handlers reach no write, so a misroute there produces at most a confirmation card.

## 5. Reads that write

**[Executed, static]** Of 229 propose-time handlers, **199 reach no non-plumbing database write**; **30 do**. Plumbing: `HouseholdMember` is upserted by the property-access check (`propertyAccess.service.ts:61`) for pre-household properties — reachable from 196 of 229 handlers; **[Code-traced]** it creates the primary-owner membership row when the user owns the property and none exists.

The 30 fall into four classes. **None is the user's intended mutation.**

| Class | Examples (operation → write) |
|---|---|
| **Telemetry** | `diy.template-browse`, `savings.opportunities`, `home-event-radar.state` → `ProductAnalyticsEvent`, `DomainEvent` |
| **Derived-data materialisation and defaults** | `maintenance.forecast` → `MaintenancePrediction` (regenerate: deleteMany + create); `capital-reserve.plan`, `capital-item-funding.goal`, `break-even.analysis`, `sale-case.analysis`, `refinance.analysis` → `AssumptionSet`, `HomeCapitalTimelineAnalysis`, `SellHoldRentAnalysis`, `RefinanceScenarioSnapshot`; `inventory.replacement` → `ReplaceRepairAnalysis`; `seasonal.checklist-setup` → `PropertyClimateSetting`; `home-briefing.view` → `HomeBriefingPreference`; `status-board.read` → `HomeItemStatus`, `Signal`; `home-actions.feed` → `DerivedTrait` |
| **Profile caching** | `environment-report.read` / `.command` → `Property` update (`resolvePropertyGeo`, `environmentReport.service.ts:181`) |
| **Lifecycle reconciliation on read** | `home-actions.feed` and `home-change.summary` → `ensureRecurringHandoff` → `HomeEvent` create, `HomeBuyerTask` update, `InspectionFinding` updateMany, `NewHomeSetupPlan` update; `seller-prep.checklist`, `seller-prep-case.command`, `seller-prep.item-decision` → work-item transitions and `reopenLinkedDomainRecords` (§4); `guidance-overview.*` → `GuidanceJourney`, `OperationalWork*` |

**Two read roots can enqueue a notification** (`capital-reserve.plan`, `capital-item-funding.goal` → `Queue.add`, `notification.service.ts:232`). **No write-capable operation's propose handler reaches a queue, email or S3 sink.** Confirm handlers do (14 of 126), as expected for exports and invitations.

## 6. Consequence for composition: `REPLACEMENT_GUIDANCE` is not read-only

**[Executed, static + Code-traced]** The `inventory.replacement` handler reaches `ReplaceRepairAnalysis` (via `runItemAnalysis`), and, for any HVAC item, delegates to `hvacDecisionStartResult` and therefore to the decision-thread writes of §4. The Composition FRD's FR-ELG-9 requires a `composableDecision` operation to be **read-only** (no write, confirmation, capture, proposal, transmission, workflow, journey, decision thread or specialist engagement). **As implemented, `REPLACEMENT_GUIDANCE` does not meet it.** `item-replacement-cost.read` does (no reachable write), consistent with its `composableRead` admission.

This does not invalidate D14; it means certifying the repair-or-replace facet needs one of: a read-only variant of the operation (persist nothing, start no thread), or an owner-approved definition of "read-only" that separates **derived caches and bookkeeping** from **user-visible record changes** (§8, D15).

## 7. Limits of this evidence (adversarial pass, `AUDIT_METHODOLOGY.md` §7)

- **Static reachability over-approximates.** A reachable write may be conditional or dead at runtime; every overlap in §4 should be read as "can write", not "does write". It was **not** exercised against data.
- **Static analysis under-approximates dynamic dispatch.** The analyzer follows resolved references, not calls through registries and maps (`capabilityInvoke`, handler tables, callbacks stored in objects). The two confirm handlers with no detected write show that blind spot exists. The positive control (124 of 126) bounds it for writes that are reachable by ordinary calls; it **does not prove absence**.
- **Sinks covered:** Prisma delegate writes, raw execute, and `Queue`/S3/mailer calls typed as such. **Not covered:** writes through other clients, in-memory or filesystem side effects, outbound HTTP, and database triggers.
- **Entry points covered:** the 229 registered propose handlers and 126 confirm handlers. **Capture-submit** (`submitAskCapture`) was characterised by reading, not by reachability (its reach is too broad to be informative): it writes **directly** at form submit through `captureFeatureContext` (10 call sites), `capturePropertyFact` and `saveActivationContextAnswer` (`PropertyOnboarding`). That is an **explicit form submission through the capture API, not a message-routed turn**, and has no second confirmation card by design (the form is the entry). It is a separate class to rule on (§8).
- **Verified [Code-traced]:** the confirm route is behind `authenticate` (`router.use('/ask', authenticate, …)`); `confirmAskExecution` loads the execution with `findFirst({ where: { id, userId } })`, so another user's execution id is not found; it then re-checks property access and requires status `NEEDS_CONFIRMATION` (or a recovering claim). **Not verified:** that the client renders every `NEEDS_CONFIRMATION` result as a card and never calls the confirm route automatically (a frontend question; no frontend code was read).
- **The matrix is not independent evidence.** Its header says its classifications are static and "not yet product-reviewed"; its claims agreed with the call graph for 30 of 34 operations and disagreed on labels (§3).

## 8. Decisions for the owner — **decided 2026-11-11**

| ID | Decision | Outcome |
|---|---|---|
| **D15** | The write-safety invariant and the permitted classes of automatic writes on read paths | **Approved with amendment (not as written).** Invariant approved. **Automatically permitted:** telemetry, immutable audit events, non-semantic caches, reproducible derived materialisation. **Individually reviewed:** defaults that become homeowner-visible, lifecycle reconciliation on read, task or event creation, decision-thread bookkeeping. **Confirmation required:** any user-intended record, workflow, task, journey or decision-state mutation. So §5's lifecycle reconciliation on read (seller-prep, `ensureRecurringHandoff`) is **not** blanket-authorised: each occurrence is reviewed |
| **D16** | The capture-submit direct write | **Approved with safeguards.** The final submission is the confirmation only if it states the mutation and performs authorisation, context-version, payload-validation and idempotency checks; opening a form is not confirmation |
| **D17** | How `REPLACEMENT_GUIDANCE` becomes certifiable as `composableDecision` | **A pure, deterministic, non-persisting calculation path**, used inside composites; saving the analysis or starting a decision plan needs an explicit action unless D15 separately approves that automatic write. The current standalone persistence is not automatically preserved |

## 9. What this changes in the FRDs

1. **Define write-capable operations by the presence of a domain command**, not `effect === 'WRITE'`; fix the six mislabels; add a registry consistency check that fails CI when `effect` disagrees with command presence (reliability FRD FR-WRT-1 closed; new FR-WRT-4).
2. The **"30 writes"** figure in the reliability FRD is **32 write-capable operations** (28 + 4), with two operations that are reads.
3. Composition FRD §4.3b: `REPLACEMENT_GUIDANCE` cannot be certified as is (D17).
4. The write-safety evaluation invariants (FR-EVAL-6b) must be defined over the 32.

## 10. Reproduction

The analysis scripts are in the session scratchpad (not in the repository): `callgraph.js` (TypeScript compiler API call graph; ~20 s over 3,651 files with `NODE_OPTIONS=--max-old-space-size=10240`), a registry cross-check probe, and a comparison script. If the owner wants this as a repeatable CI check, the call-graph script is the natural starting point (§9 item 1).

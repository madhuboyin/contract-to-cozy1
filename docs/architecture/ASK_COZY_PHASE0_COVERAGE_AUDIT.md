# Ask Cozy Cross-Domain Interaction Rollout — Phase 0 Coverage Audit

**Status: Stage 1 AND Stage 2 both complete — all 77 registered operations classified and traced, 0 `PENDING`.** Every track: Records and capture (10/10), Financial and ownership (6/6), Home intelligence and work's read-only Phase 5 scope (5/8 — the 3 mutating operations were traced too, see §4.15), Buyer journey (18/18), Decisions and projects (18/18), Protection and claims (6/6), Household utilities/Discovery/Boundaries (6/6), and the Completed-reference baseline (4/4). **The §4.8 decision is now decided AND implemented** (Option B, read-attach only, 2026-09-17) — statically verified only, not yet DB/browser-verified. Everything else Stage 2 was scoped to trace is done; §6 lists the real engineering/product follow-ups the tracing surfaced.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §21 Phases 0 and 2–8, and §22 (open decisions).
**Generated artifact:** [`askInteractionCoverageMatrix.ts`](../../apps/backend/src/services/ask/askInteractionCoverageMatrix.ts), mechanically checked by [`askInteractionCoverageMatrix.test.js`](../../apps/backend/tests/ask/askInteractionCoverageMatrix.test.js) (11/11 green).
**Verification level of everything in this document: STATIC.** Every claim below is derived from reading `askOperationRegistry.ts`, `askDomainCommandRegistry.ts`, `capabilityHandlerRegistry.ts`, `confirmCapabilityHandlerRegistry.ts`, `interactionDispatch.ts`, `askAnswerTrustPolicy.ts`, and the relevant handler bodies in `askOrchestrator.service.ts` directly, plus passing test runs (`node --test`) and a clean `tsc --noEmit` this session. Nothing here is database- or browser-verified, and nothing is inferred from a handler's mere existence (ROLL-010).

## 1. Methodology

Per the FRD's Phase 0 instruction ("generate or mechanically verify a coverage matrix from the live `AskOperationId` registry rather than maintaining a document-only inventory"), the matrix in `askInteractionCoverageMatrix.ts` is:

1. **Extracted programmatically**, not transcribed by hand, from `ASK_OPERATION_DEFINITIONS` (77 entries) and `ASK_DOMAIN_COMMAND_REGISTRY` (30 entries) via a regex-based parser run against the source files, to eliminate hand-transcription error across 77 rows.
2. **Type-checked for completeness**: `ASK_INTERACTION_COVERAGE_MATRIX` is declared `Record<AskOperationId, AskInteractionCoverageEntry>`. A newly registered `AskOperationId` with no corresponding entry fails `tsc` — this is the FRD's own drift-check requirement ("a newly registered user-visible operation cannot remain unclassified silently"), enforced at compile time rather than by a runtime script someone has to remember to run.
3. **Runtime-cross-checked** by `validateAskInteractionCoverageMatrix()` (called from the governance test) for semantic drift a type can't express — e.g. an operation gaining a domain-command entry later without its `rollClass` being revisited.

### ROLL-001 classification priority

Several operations are true of more than one fact simultaneously (e.g. non-message-routable *and* confirmation-gated). The classifier applies, in order:

`BOUNDARY_RESPONSE` (safetyClass ends `_BOUNDARY`) → `CONFIRMED_MUTATION` (a domain-command entry exists) → `INTERNAL_CAPTURE` (not message-routable) → `NAVIGATION_HANDOFF` (`CAPABILITY_DISCOVERY` family) → `CONVERSATIONAL_CONTINUATION` (`GENERAL_HOME_GUIDANCE` family) → explicit per-operation overrides (below) → `WORKFLOW_CONTINUATION` (bound to a `decision-platform.*` DecisionThread, or `WORKFLOW_GUIDANCE` family) → `PROACTIVE_INSIGHT` (Track 6's own attention/forecast surfaces) → `READ_RESULT` (default).

Confirmation-gated is checked **before** non-routable, not after, because of a genuine finding (below): the four `CAPTURE_*_CONFIRM` operations are both. Getting this order backwards was this audit's own first mistake — caught by the governance test itself failing on the first run, not by manual review. That failure is left visible in this document because it's evidence the mechanical check works, not because the mistake matters on its own.

## 2. Key findings

1. **The FRD's §7 operation-family table and the live registry are in perfect agreement.** Cross-referencing all 77 `AskOperationId`s against the FRD's own capability-family inventory found zero operations present in the registry but absent from the FRD table, and zero rows in the FRD table referencing an operation no longer in the registry. No drift to resolve before Phase 0 can proceed (the FRD's own §21 instruction: "resolve conflicts between current code, domain FRDs and this document before implementation" — none found at this level).

2. **`CAPTURE_FACT_CONFIRM` / `CAPTURE_EVENT_CONFIRM` / `CAPTURE_WARRANTY_CONFIRM` / `CAPTURE_EVIDENCE_CONFIRM` are a genuine ROLL-001 edge case, not a misclassification.** Each is simultaneously non-message-routable (the propose-time `AskOperationId` returns a boundary explaining it can't be reached from a raw message) and confirmation-gated (the real work happens confirm-time, through `confirmCapabilityHandlerRegistry.ts`, governed by `ASK_DOMAIN_COMMAND_REGISTRY`). ROLL-001 assumes one interaction class per operation; this pattern has two, split across propose-time and confirm-time dispatch of the *same* `operationId`. Classified `CONFIRMED_MUTATION` here (the real outcome), but this is worth a product decision on whether ROLL-001's vocabulary needs a distinct "internal proposal → confirmed mutation" compound class before Phase 2 is called complete.

3. **`DOCUMENT_PROMOTION_REVIEW` is classified `PROPOSAL`, not `READ_RESULT`** — it's the review surface for pending extraction candidates that a separate, domain-command-governed operation (`DOCUMENT_PROMOTION_CONFIRM`) then confirms. Same propose/confirm shape as finding 2, but split across two independently message-routable operations instead of one internal one. `PROPOSAL` is currently the *only* operation carrying that classification — worth checking in Stage 2 whether other REVIEW-shaped reads (`BUYER_INSPECTION_REVIEW`, `QUOTE_COMPARISON_REVIEW`) should also qualify, or whether they're correctly `READ_RESULT` because BUY-004 explicitly treats informational review and disposition as separate.

4. **Item-action typed dispatch (Phase 0.5's concern, found while reading Phase 0's own dependencies) currently supports only 4 of 9 declared `AskItemActionInteractionType` values.** `interactionDispatch.ts`'s `resolveItemActionDispatch()` gives `CONVERSATION_CONTINUE`/`MUTATE_RECORD` → `ASK_WITH_ENTITY_CONTEXT`, `FILTER_RESULT` → `ASK_FILTER_ONLY`, and `REFRESH` → `REFRESH` real dispatch outcomes; `DISMISS`/`REMIND_LATER` (no domain policy yet — correctly matches FRD §22/Phase 9 gating), `CONFIRM`/`EDIT_PROPOSAL` (belong to `ConfirmationCard`'s own execution path, not item actions), and `NAVIGATE` (no `href` field exists yet on `AskGroupedListItemAction`) all resolve to `UNSUPPORTED` with an explicit reason string — matching ACT-003's "fails visibly and safely," not a silent no-op. This is accurate current behavior, not a gap introduced by this audit, and is directly relevant evidence for whichever track's Stage 2 trace needs a `NAVIGATE`-typed row action (Track 6 attention items, most likely).

5. **`REFINANCE_RATE_MONITOR` and `HOME_DEADLINE_MONITOR`** (the two `MONITOR`-family operations) are classified `CONFIRMED_MUTATION` for their creation action, but the same `operationId` plausibly also serves a read/status role once a monitor exists. Whether the adapter itself distinguishes a create-view from a status-view, or conflates them into one response shape, is a Stage 2 question — flagged, not resolved, here.

6. **`SELL_HOLD_RENT_ANALYSIS`** is classified `READ_RESULT` (its current, code-observed behavior — a `DECISION_ANALYSIS` read with no domain-command entry), deliberately *not* `WORKFLOW_CONTINUATION`, because the FRD's own §22 lists "whether direct `SELL_HOLD_RENT_ANALYSIS` attaches to an existing family thread" as an open product decision gating Phase 4. Per the agreed §22 process, this classification stays as coded until that decision is made — it is not this audit's place to upgrade it preemptively.

## 2.5 Shared infrastructure found while tracing Stage 2 (applies platform-wide, not just to Records and capture)

Tracing Records and capture surfaced five shared mechanisms that every other track's Stage 2 pass will hit again. Recording them once here so later tracks cite them instead of re-deriving:

- **UI surface:** all block types (`SUMMARY`, `WORKFLOW_PROGRESS`, `GROUPED_LIST`, `EVIDENCE`, `EMPTY_STATE`, etc.) render through one shared generic renderer in `apps/frontend/src/components/ask/AskWorkspace.tsx` (2264 lines, `block.type === '...'` branches). The only bespoke exception found anywhere in that file is a special case keyed on `block.id === 'maintenance-groups'`. Every other operation, in every track, should be assumed to render through the generic path unless a track's Stage 2 trace finds another `block.id`-keyed exception.
- **Freshness (baseline layer):** every successful result (`ANSWERED`/`COMPLETED`/`READY_WITH_LIMITATIONS`/etc., per `ASK_AUTHORITATIVE_EVIDENCE_STATUSES` in `askAnswerTrustPolicy.ts`) gets a uniform `answerTrustEvidence.sources[]` array attached by `attachAskAuthoritativeSourceEvidence`/`canonicalAdapterSourceEvidence`, carrying `status`/`scope`/`freshness`/`observedAt` per source. This is necessary but not sufficient for XRES-003: it records *when the read ran*, not necessarily whether the underlying data changed (see `DOCUMENT_LOOKUP` below, which has no content-based version at all).
- **Idempotency (confirmation-gated writes):** all 30 confirmation-gated operations share one mechanism — `AskConfirmationReceipt` (unique on `executionId`), with `inputHash`, a 60-second `leaseExpiresAt`, `attemptCount`, and a `CLAIMED → COMPLETED/FAILED` status machine, all inside `confirmAskExecution` (`askOrchestrator.service.ts:11063`). A concurrent claim on a stale lease is recovered (`recoveringClaim`); a genuinely different input on an already-claimed execution is rejected as `ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT`. Several operations layer a second, domain-specific idempotency key on top of this (e.g. `captureExecutionId`/`sourceExecutionId` params, or a `[eventId, evidenceKey]` DB unique constraint) — that second layer is what actually needs per-operation tracing; the receipt layer itself does not.
- **Reconciliation is opt-in per handler, not automatic — and mostly unused.** `ConfirmCapabilityResult.refreshedExecutions` is the only reconciliation mechanism (passed through as `childExecutions`). Grepping every call site that actually populates it found exactly one consumer: `refreshMaintenanceSourceExecution`, used only by `confirmMaintenanceTaskComplete`/`confirmMaintenanceTaskUpdate` (the Completed-reference track). **None of Records and capture's 5 confirmation-gated operations populate it.** Until each track's Stage 2 pass proves otherwise, assume XREC-001 is unmet everywhere outside maintenance.
- **Item-action typed dispatch** (`interactionDispatch.ts`, noted in Stage 1) supports only 4 of 9 declared interaction types; `NAVIGATE` specifically is blocked platform-wide on a missing `href` field on `AskGroupedListItemAction`, not on any track-specific gap.

## 3. Coverage stats

- **77 total registered `AskOperationId`s**, 100% classified, 0 unclassified (FRD §21 exit criterion met for classification completeness).
- **ROLL-001 class distribution (updated as Stage 2 corrects Stage 1's static guesses — see §4.5 and §4.12):** `READ_RESULT` 32, `CONFIRMED_MUTATION` 30, `PROACTIVE_INSIGHT` 4, `WORKFLOW_CONTINUATION` 3, `BOUNDARY_RESPONSE` 3, `NAVIGATION_HANDOFF` 2, `PROPOSAL` 1, `INTERNAL_CAPTURE` 1, `CONVERSATIONAL_CONTINUATION` 1. (Stage 1 originally read `WORKFLOW_CONTINUATION` 5 before `MAJOR_EVENT_ENTRY` and `INCIDENT_CONTINUATION` were each independently found, on reading their actual handlers, to not bind to any durable workflow — both were `WORKFLOW_GUIDANCE`-family operations misclassified by the same Stage 1 default rule.)
- **Confirmation-gated (has a domain-command entry): 30 of 77.** All 30 pass the domain command registry's own `validateAskDomainCommandRegistry()` (material commands all support cancel-before-execution; no duplicate operation bindings).
- **Non-message-routable (internal-only): 5 of 77** — the 4 `CAPTURE_*_CONFIRM` operations plus `SELL_HOLD_RENT_GOAL_CAPTURE`.

## 4. Per-track breakdown


### Completed reference (4 operations)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `MAINTENANCE_STATUS` | READ_RESULT | `maintenance.status` | VIEWER | Y | N | — |
| `MAINTENANCE_TASK_COMPLETE` | CONFIRMED_MUTATION | `maintenance.complete` | CONTRIBUTOR | Y | Y | REOPEN |
| `MAINTENANCE_TASK_CREATE` | CONFIRMED_MUTATION | `maintenance.create` | CONTRIBUTOR | Y | Y | EDIT, STOP |
| `MAINTENANCE_TASK_UPDATE` | CONFIRMED_MUTATION | `maintenance.update` | CONTRIBUTOR | Y | Y | EDIT, REOPEN, STOP |

### Records and capture (10 operations)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `CAPTURE_EVENT_CONFIRM` | CONFIRMED_MUTATION | `capture.event.confirm` | CONTRIBUTOR | N | Y | EDIT |
| `CAPTURE_EVIDENCE_CONFIRM` | CONFIRMED_MUTATION | `capture.evidence.confirm` | CONTRIBUTOR | N | Y | EDIT |
| `CAPTURE_FACT_CONFIRM` | CONFIRMED_MUTATION | `capture.fact.confirm` | CONTRIBUTOR | N | Y | EDIT |
| `CAPTURE_WARRANTY_CONFIRM` | CONFIRMED_MUTATION | `capture.warranty.confirm` | CONTRIBUTOR | N | Y | EDIT |
| `DOCUMENT_LOOKUP` | READ_RESULT | `documents.lookup` | VIEWER | Y | N | — |
| `DOCUMENT_PROMOTION_CONFIRM` | CONFIRMED_MUTATION | `document-promotion.confirm` | CONTRIBUTOR | Y | Y | EDIT |
| `DOCUMENT_PROMOTION_REVIEW` | PROPOSAL | `document-promotion.review` | VIEWER | Y | N | — |
| `INVENTORY_LOOKUP` | READ_RESULT | `inventory.lookup` | VIEWER | Y | N | — |
| `MAJOR_EVENT_ENTRY` | WORKFLOW_CONTINUATION | `major-event.entry` | VIEWER | Y | N | — |
| `PROPERTY_SUMMARY` | READ_RESULT | `property.summary` | VIEWER | Y | N | — |

- **`CAPTURE_EVENT_CONFIRM`:** Not message-routable at propose-time (returns a boundary explaining that, not a confirmation card); classified by its real confirm-time outcome, which IS a domain-command-governed confirmed mutation (confirmCapabilityHandlerRegistry.ts). The propose-time AskOperationId and the confirm-time execution share one operationId but two different dispatch paths -- worth flagging to product as a genuine ROLL-001 edge case, not a misclassification.
- **`CAPTURE_EVIDENCE_CONFIRM`:** Not message-routable at propose-time (returns a boundary explaining that, not a confirmation card); classified by its real confirm-time outcome, which IS a domain-command-governed confirmed mutation (confirmCapabilityHandlerRegistry.ts). The propose-time AskOperationId and the confirm-time execution share one operationId but two different dispatch paths -- worth flagging to product as a genuine ROLL-001 edge case, not a misclassification.
- **`CAPTURE_FACT_CONFIRM`:** Not message-routable at propose-time (returns a boundary explaining that, not a confirmation card); classified by its real confirm-time outcome, which IS a domain-command-governed confirmed mutation (confirmCapabilityHandlerRegistry.ts). The propose-time AskOperationId and the confirm-time execution share one operationId but two different dispatch paths -- worth flagging to product as a genuine ROLL-001 edge case, not a misclassification.
- **`CAPTURE_WARRANTY_CONFIRM`:** Not message-routable at propose-time (returns a boundary explaining that, not a confirmation card); classified by its real confirm-time outcome, which IS a domain-command-governed confirmed mutation (confirmCapabilityHandlerRegistry.ts). The propose-time AskOperationId and the confirm-time execution share one operationId but two different dispatch paths -- worth flagging to product as a genuine ROLL-001 edge case, not a misclassification.
- **`DOCUMENT_PROMOTION_REVIEW`:** Classified PROPOSAL rather than plain READ_RESULT: this is the review surface for pending extraction candidates that DOCUMENT_PROMOTION_CONFIRM (a separate, domain-command-governed operation) then confirms -- the same propose/confirm shape as the CAPTURE_* pair, but split across two routable operationIds instead of one internal one.

### Buyer journey (18 operations)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `BUYER_CLOSING_DAY_READINESS` | READ_RESULT | `buyer.closing-day-readiness` | VIEWER | Y | N | — |
| `BUYER_CONTRACT_TIMELINE` | READ_RESULT | `buyer.contract-timeline` | VIEWER | Y | N | — |
| `BUYER_COST_READINESS` | READ_RESULT | `buyer.cost-readiness` | VIEWER | Y | N | — |
| `BUYER_DEADLINES` | READ_RESULT | `buyer.deadlines` | VIEWER | Y | N | — |
| `BUYER_DISCLOSURE_FUNDS_READINESS` | READ_RESULT | `buyer.disclosure-funds-readiness` | VIEWER | Y | N | — |
| `BUYER_DOCUMENT_READINESS` | READ_RESULT | `buyer.document-readiness` | VIEWER | Y | N | — |
| `BUYER_FINANCING_READINESS` | READ_RESULT | `buyer.financing-readiness` | VIEWER | Y | N | — |
| `BUYER_FINDING_DISPOSITION` | CONFIRMED_MUTATION | `buyer.finding.disposition` | CONTRIBUTOR | Y | Y | EDIT |
| `BUYER_INSPECTION_REVIEW` | READ_RESULT | `buyer.inspection-review` | VIEWER | Y | N | — |
| `BUYER_LIFECYCLE_UPDATE` | CONFIRMED_MUTATION | `buyer.lifecycle.update` | CONTRIBUTOR | Y | Y | EDIT |
| `BUYER_MOVE_STATUS` | READ_RESULT | `buyer.move-status` | VIEWER | Y | N | — |
| `BUYER_NEGOTIATION_READINESS` | READ_RESULT | `buyer.negotiation-readiness` | VIEWER | Y | N | — |
| `BUYER_PLAN_STATUS` | READ_RESULT | `buyer.plan.status` | VIEWER | Y | N | — |
| `BUYER_TASK_COMPLETE` | CONFIRMED_MUTATION | `buyer.task.complete` | CONTRIBUTOR | Y | Y | REOPEN |
| `BUYER_TASK_CREATE` | CONFIRMED_MUTATION | `buyer.task.create` | CONTRIBUTOR | Y | Y | EDIT, STOP |
| `BUYER_TASK_UPDATE` | CONFIRMED_MUTATION | `buyer.task.update` | CONTRIBUTOR | Y | Y | EDIT, STOP |
| `BUYER_TITLE_ESCROW_READINESS` | READ_RESULT | `buyer.title-escrow-readiness` | VIEWER | Y | N | — |
| `BUYER_WALKTHROUGH_READINESS` | READ_RESULT | `buyer.walkthrough-readiness` | VIEWER | Y | N | — |

### Financial and ownership (6 operations)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `CAPITAL_RESERVE_PLAN` | READ_RESULT | `capital-reserve.plan` | VIEWER | Y | N | — |
| `OWNERSHIP_COSTS` | READ_RESULT | `ownership.costs` | VIEWER | Y | N | — |
| `PROPERTY_TAX_APPEAL_READINESS` | READ_RESULT | `property-tax.appeal-readiness` | VIEWER | Y | N | — |
| `REFINANCE_ANALYSIS` | READ_RESULT | `refinance.analysis` | VIEWER | Y | N | — |
| `REFINANCE_RATE_MONITOR` | CONFIRMED_MUTATION | `refinance.monitor` | CONTRIBUTOR | Y | Y | EDIT, PAUSE, RESUME, STOP |
| `SAVINGS_OPPORTUNITIES` | READ_RESULT | `savings.opportunities` | VIEWER | Y | N | — |

- **`REFINANCE_RATE_MONITOR`:** MONITOR family: classified CONFIRMED_MUTATION for the monitor-creation action (the domain-command-governed write), but the same operationId also serves a read/status role when a monitor already exists -- Stage 2 trace should confirm whether the adapter itself distinguishes create-view from status-view or conflates them.

### Protection and claims (6 operations)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `CLAIM_FILE` | CONFIRMED_MUTATION | `incident-claim.file` | CONTRIBUTOR | Y | Y | EDIT, STOP |
| `CLAIM_TRANSITION` | CONFIRMED_MUTATION | `incident-claim.transition` | CONTRIBUTOR | Y | Y | EDIT, REOPEN |
| `COVERAGE_COMPARISON_STATUS` | READ_RESULT | `coverage.comparison-status` | VIEWER | Y | N | — |
| `COVERAGE_GAPS` | READ_RESULT | `coverage.review` | VIEWER | Y | N | — |
| `INCIDENT_CLAIM_STATUS` | READ_RESULT | `incident-claim.status` | VIEWER | Y | N | — |
| `INCIDENT_CONTINUATION` | WORKFLOW_CONTINUATION | `incident-claim.continuation` | VIEWER | Y | N | — |

### Decisions and projects (18 operations)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `GUIDANCE_JOURNEY_CREATE` | CONFIRMED_MUTATION | `guidance.journey.create` | CONTRIBUTOR | Y | Y | STOP |
| `HVAC_DECISION_ABANDON` | CONFIRMED_MUTATION | `decision-platform.hvac.abandon` | CONTRIBUTOR | Y | Y | REOPEN |
| `HVAC_DECISION_CONTINUE` | WORKFLOW_CONTINUATION | `decision-platform.hvac.continue` | VIEWER | Y | N | — |
| `HVAC_DECISION_OUTCOME_REPORT` | CONFIRMED_MUTATION | `decision-platform.hvac.outcome.report` | CONTRIBUTOR | Y | Y | EDIT |
| `HVAC_DECISION_OUTCOME_UNLINK` | CONFIRMED_MUTATION | `decision-platform.hvac.outcome.unlink` | CONTRIBUTOR | Y | Y | REOPEN |
| `HVAC_DECISION_OUTCOME_VIEW` | WORKFLOW_CONTINUATION | `decision-platform.hvac.outcome.view` | VIEWER | Y | N | — |
| `HVAC_DECISION_SCENARIO` | CONFIRMED_MUTATION | `decision-platform.hvac.scenario` | CONTRIBUTOR | Y | Y | STOP |
| `HVAC_DECISION_START` | CONFIRMED_MUTATION | `decision-platform.hvac.start` | CONTRIBUTOR | Y | Y | STOP |
| `HVAC_PREFERENCE_FORGET` | CONFIRMED_MUTATION | `decision-platform.hvac.preference.forget` | CONTRIBUTOR | Y | Y | REOPEN |
| `HVAC_PREFERENCE_SAVE` | CONFIRMED_MUTATION | `decision-platform.hvac.preference.save` | CONTRIBUTOR | Y | Y | EDIT, REVOKE |
| `HVAC_SPECIALIST_ENGAGE` | WORKFLOW_CONTINUATION | `decision-platform.hvac.specialist-engage` | CONTRIBUTOR | Y | N | — |
| `QUOTE_COMPARISON_CREATE` | CONFIRMED_MUTATION | `quote-comparison.create` | CONTRIBUTOR | Y | Y | EDIT, STOP |
| `QUOTE_COMPARISON_REVIEW` | READ_RESULT | `quote-comparison.review` | VIEWER | Y | N | — |
| `RENOVATION_PERMIT_READINESS` | READ_RESULT | `renovation-permit.readiness` | VIEWER | Y | N | — |
| `REPLACEMENT_GUIDANCE` | READ_RESULT | `inventory.replacement` | VIEWER | Y | N | — |
| `SELLER_PREP_CHECKLIST` | READ_RESULT | `seller-prep.checklist` | VIEWER | Y | N | — |
| `SELLER_PREP_ITEM_DECISION` | CONFIRMED_MUTATION | `seller-prep.item-decision` | CONTRIBUTOR | Y | Y | REOPEN |
| `SELL_HOLD_RENT_ANALYSIS` | READ_RESULT | `sale-case.analysis` | VIEWER | Y | N | — |

- **`SELL_HOLD_RENT_ANALYSIS`:** FRD §22 open decision: whether direct SELL_HOLD_RENT_ANALYSIS attaches to an existing SELL_HOLD_RENT_GOAL_CAPTURE thread is unresolved. Classified READ_RESULT (its current code-observed behavior, a DECISION_ANALYSIS read with no domain command), not WORKFLOW_CONTINUATION -- do not upgrade this classification until that decision is made (Phase 4 exit).

### Home intelligence and work (8 operations)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `HOME_ACTIONS` | PROACTIVE_INSIGHT | `home-actions.feed` | VIEWER | Y | N | — |
| `HOME_CHANGE_SUMMARY` | PROACTIVE_INSIGHT | `home-change.summary` | VIEWER | Y | N | — |
| `HOME_DEADLINE_MONITOR` | CONFIRMED_MUTATION | `home-deadline.monitor` | CONTRIBUTOR | Y | Y | EDIT, STOP, REOPEN |
| `INSPECTION_FINDINGS` | READ_RESULT | `inspection-findings.review` | VIEWER | Y | N | — |
| `INSPECTION_FINDING_UPDATE` | CONFIRMED_MUTATION | `inspection-findings.update` | CONTRIBUTOR | Y | Y | EDIT, REOPEN |
| `INTELLIGENCE_ENVELOPE_QUERY` | PROACTIVE_INSIGHT | `intelligence-envelope.query` | VIEWER | Y | N | — |
| `MAINTENANCE_FORECAST` | PROACTIVE_INSIGHT | `maintenance.forecast` | VIEWER | Y | N | — |
| `OPERATIONAL_WORK_UPDATE` | CONFIRMED_MUTATION | `home-operations.update` | CONTRIBUTOR | Y | Y | EDIT, REOPEN, STOP |

- **`HOME_DEADLINE_MONITOR`:** MONITOR family: classified CONFIRMED_MUTATION for the monitor-creation action (the domain-command-governed write), but the same operationId also serves a read/status role when a monitor already exists -- Stage 2 trace should confirm whether the adapter itself distinguishes create-view from status-view or conflates them.

### Household/action utilities (1 operation)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `HOUSEHOLD_INVITATION` | CONFIRMED_MUTATION | `household.invitation` | OWNER | Y | Y | REVOKE |

### Persistent goals (1 operation)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `SELL_HOLD_RENT_GOAL_CAPTURE` | INTERNAL_CAPTURE | `sell-hold-rent.goal-capture` | CONTRIBUTOR | N | N | — |

- **`SELL_HOLD_RENT_GOAL_CAPTURE`:** Not message-routable and deliberately has no domain-command entry (materiality carve-out: DecisionThread bookkeeping is reversible at zero cost, never confirmation-gated). Unlike the CAPTURE_* operations, there is no confirm-time mutation to reclassify around -- INTERNAL_CAPTURE is this operation's true, single behavior.

### Discovery and guidance (2 operations)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `CAPABILITY_DISCOVERY` | NAVIGATION_HANDOFF | `capability.discovery` | — | Y | N | — |
| `GROUNDED_GUIDANCE` | CONVERSATIONAL_CONTINUATION | `grounded.guidance` | — | Y | N | — |

### Boundaries (3 operations)

| Operation | ROLL-001 class | Canonical owner (adapterKey) | Role floor | Msg-routable | Confirmation-gated | Correction modes |
| --- | --- | --- | --- | --- | --- | --- |
| `EMERGENCY_BOUNDARY` | BOUNDARY_RESPONSE | `boundary.emergency` | — | Y | N | — |
| `OUT_OF_SCOPE_BOUNDARY` | BOUNDARY_RESPONSE | `boundary.out-of-scope` | — | Y | N | — |
| `UNSAFE_RESTRICTED_BOUNDARY` | BOUNDARY_RESPONSE | `boundary.unsafe-restricted` | — | Y | N | — |

## 4.5 Stage 2 — Records and capture (10/10 TRACED)

Full evidence lives in `askInteractionCoverageMatrix.ts`'s per-operation `uiSurface`/`freshnessSource`/`idempotency`/`reconciliation`/`handoff` fields (each with a source citation). Summary:

- **`INVENTORY_LOOKUP`:** real per-read `contextVersion` (sha256 of all items' `{id,updatedAt}`); filtering is message-text-derived server-side (category/specific-item/token search), not a structured, round-trippable filter — a handoff to `/inventory` loses that filter context.
- **`DOCUMENT_LOOKUP`:** **no `contextVersion` at all** — relies solely on the shared `observedAt` wrapper, which can't detect that documents actually changed. `GROUPED_LIST` declares `filters: []`. Each type-group is capped at 20 items (`docs.slice(0, 20)`) with no truncation disclosure.
- **`PROPERTY_SUMMARY`:** the strongest freshness signal in the track — `evaluation.contextVersion` from the governed Property Context Platform evaluator, not a hand-rolled hash. Also emits its own `captureRequests`, a **second, independent fact-capture entry point** distinct from `CAPTURE_FACT_CONFIRM` — not a bug, but worth knowing before assuming one canonical capture path.
- **`DOCUMENT_PROMOTION_REVIEW`:** `GROUPED_LIST` (`filters: []`) + one point-in-time `EVIDENCE` provenance item; no candidate-specific version (unlike its sibling confirm operation, below).
- **`DOCUMENT_PROMOTION_CONFIRM`:** real per-candidate `contextVersion = sha256(kind:id:updatedAt)`, 30-minute expiry — one of the more rigorous freshness implementations found. **Confirmed reconciliation gap:** no `refreshedExecutions`, so `DOCUMENT_PROMOTION_REVIEW`'s own still-visible pending list doesn't refresh after a sibling candidate resolves.
- **`MAJOR_EVENT_ENTRY`:** **reclassified NAVIGATION_HANDOFF** (Stage 1 had guessed `WORKFLOW_CONTINUATION` from its `WORKFLOW_GUIDANCE` family, per the default rule, without reading the handler). It turns out to delegate to the *exact same* `capabilityResult()` function that backs `CAPABILITY_DISCOVERY`, decorated with a life-event SUMMARY/BOUNDARY — no durable entity, no DecisionThread. This is the kind of correction the default-rule approach is expected to need; **`INCIDENT_CONTINUATION` (Protection and claims) carries the same `WORKFLOW_GUIDANCE`-family default and has not yet been read** — treat its Stage 1 classification as equally provisional until that track's Stage 2 pass.
- **`CAPTURE_FACT_CONFIRM` / `CAPTURE_EVENT_CONFIRM` / `CAPTURE_WARRANTY_CONFIRM` / `CAPTURE_EVIDENCE_CONFIRM`:** all four share the platform idempotency/UI/freshness layers above, plus real per-operation specifics: `CAPTURE_EVENT_CONFIRM`'s correction path adds a bespoke `ask-correction:{executionId}` key guarding `updateHomeEvent` (which has no idempotency of its own); `CAPTURE_EVIDENCE_CONFIRM` delegates to `HomeEventsService.attachDocument` (upsert-idempotent on `[eventId, evidenceKey]`) and enforces a real ordering constraint — it fails clearly with `EVIDENCE_SIBLING_EVENT_NOT_CONFIRMED` if its paired `CAPTURE_EVENT_CONFIRM` hasn't completed yet. **All four confirmed to have the reconciliation gap** from §2.5 — none populate `refreshedExecutions`. All four hand off via a bare `href` (`/edit` or `/timeline`) with no return-anchor or field-level target — none would pass FRD §17's "no handoff completion from `href` alone" on their own.

**Track-level assessment:** UI surface and idempotency are solid (shared, well-tested platform mechanisms). Freshness is inconsistent — `PROPERTY_SUMMARY`/`DOCUMENT_PROMOTION_CONFIRM`/`INVENTORY_LOOKUP` have real version sources, `DOCUMENT_PROMOTION_REVIEW`/`DOCUMENT_LOOKUP` don't. **Reconciliation is the track's biggest gap**: 5 of 5 confirmation-gated operations in this track fail XREC-001 as currently implemented. Handoff exists everywhere as a bare `href` but nowhere carries return context, which the FRD explicitly says doesn't count as complete.

## 4.6 Stage 2 — `REFINANCE_ANALYSIS` (Financial and ownership, Phase 3 scope)

Per the FRD's own sequencing, only `REFINANCE_ANALYSIS` from this track is in scope now — the rest of Financial and ownership (Phase 7) and all of Buyer (Phase 6) come later.

- **Freshness is the strongest part of this operation** and a genuine counter-example to the Records-and-capture gaps: it carries **two distinct, well-separated freshness axes**, both cited with their own `observedAt` in its `EVIDENCE` block — the homeowner's own mortgage profile (`financialContext.contextVersion`) and the external market-rate benchmark (`marketSnapshot.date`). Neither is cached; both are re-read live on every call, so there is no stale-cache risk the way `DOCUMENT_LOOKUP` has. This is a real, working XRES-004 ("heterogeneous sources report coverage per source") implementation, not a gap.
- **One real gap**: the `NOT_APPLICABLE` branch (no mortgage recorded) returns no `contextVersion` at all — every other branch of the same handler sets one. Small, but inconsistent.
- **FIN-005 verified true by reading the code, not just the registry**: creating a rate monitor is architecturally a separate operation (`REFINANCE_RATE_MONITOR`) with its own `confirmationVersion`/`expiresAt`/`refinanceMonitorContextVersion` — viewing this analysis cannot itself enable monitoring. FIN-001 (facts/assumptions/estimates/recommendations kept separate) also holds up: the `TABLE` block's own `meaning` column distinguishes recorded rate, market benchmark, and modeled target row by row.
- **A third independent inline-capture path found**: missing mortgage-profile fields route through `captureRequests` (same shape `PROPERTY_SUMMARY` uses, `expectedContextVersion`-gated), targeting `PropertyFinancingProfile` — a different canonical owner from both `CAPTURE_FACT_CONFIRM` and `PROPERTY_SUMMARY`'s own capture. Three independent capture entry points now confirmed in this codebase; worth keeping in mind before Phase 2's "general editable proposal fields" work assumes one unified capture path.
- **Idempotency/reconciliation:** N/A — pure read, no domain command, not cached (so nothing to reconcile as a source either).
- **Handoff:** bare hrefs only (`/tools/mortgage-refinance-radar`, `/tools/financing/profile`), same no-query-param pattern as every other operation traced so far.

## 4.7 Stage 2 — `SELL_HOLD_RENT_ANALYSIS` / `SELL_HOLD_RENT_GOAL_CAPTURE` (Phase 4 prep, for the §22 decision below)

Traced ahead of the rest of Phase 4 specifically to answer §22's open question with real evidence instead of guessing. Full citations in the matrix; summary:

- **`SELL_HOLD_RENT_GOAL_CAPTURE`'s creation path explicitly depends on `SELL_HOLD_RENT_ANALYSIS`'s own computation.** Before calling `sellHoldRentDecisionFamilyAdapter.createOrResumeThread`, it calls `ensureCanonicalSellHoldRentAnalysis(propertyId, userId)` — which is *the exact same* `sellHoldRentService.estimate()` function `SELL_HOLD_RENT_ANALYSIS`'s own handler calls. The call site's own comment states the reason verbatim: it "guarantees the generic adapter's `loadSourceState` has something to snapshot... otherwise `createOrResumeThread` throws 'No current recommendation available' for a property with no prior analysis." The codebase's own authors already treat `SELL_HOLD_RENT_ANALYSIS`'s computation as this thread's canonical source of truth.
- **Every canonical `SELL_HOLD_RENT_ANALYSIS` call persists a `SellHoldRentAnalysis` row** (`sellHoldRent.service.ts:656-674`, gated on `isCanonicalRequest` — true for every plain, non-scenario-override call, which is what Ask always sends). `sellHoldRentDecisionFamilyAdapter.loadSourceState` reads the *newest* such row by `computedAt` as the DecisionThread's snapshot source (`domainSnapshotAdapters.ts:263-271`).
- **But `SELL_HOLD_RENT_ANALYSIS`'s own response never reflects any of this.** Directly confirmed by reading the full handler (`askOrchestrator.service.ts:5555-5688`): zero references to `Thread`, `selectThread`, `decisionThreadId`, `DECISION_PROGRESS`, or `WHY_NOW` anywhere in the function. It doesn't declare `DECISION_PROGRESS`/`WHY_NOW` in its `allowedBlockTypes` either. A homeowner with an active, tracked sell/hold/rent goal who asks "should I sell?" gets a generic, disconnected-feeling answer — even though their question just refreshed the very data their tracked plan depends on.

**In one sentence: the two operations are DATA-linked (one feeds the other's snapshot) but RESPONSE-unlinked (the read never checks for or surfaces the thread it's quietly keeping fresh).**

## 4.8 §22 decision: does `SELL_HOLD_RENT_ANALYSIS` attach to an existing thread? — **DECIDED and IMPLEMENTED: Option B, 2026-09-17**

Per the agreed process for FRD §22 gates: evidence, options, and a recommendation were prepared and presented; the user then explicitly directed the decision be made, then explicitly directed it be implemented. **Option B (read-attach only) is both decided and implemented.**

**Option A — Leave as-is.** No response-side change. The data link (§4.7) continues invisibly; the Ask response for a plain analysis question stays identical whether or not an active goal thread exists.
- *For:* zero implementation risk; doesn't touch `GOAL-003`'s "low-confidence statements do not create a thread silently" guardrail at all, since nothing changes.
- *Against:* leaves `DEC-001` ("Decision surfaces bind to a canonical DecisionThread... when one exists") unmet for this operation specifically, and is the least coherent experience of the three — the thread visibly exists (a homeowner can see it in the SHR workspace) but Ask never acknowledges it.

**Option B — Read-attach only (recommended).** `sellHoldRentAnalysisResult` calls `sellHoldRentDecisionFamilyAdapter.selectThread(propertyId, propertyId)` — the same read-only lookup `fetchActiveDecisionThreadContext` already uses elsewhere — before building its response. If an active thread exists, the response adds a `DECISION_PROGRESS`/`WHY_NOW` block (reusing the existing `decisionProgressBlock`/`whyNowBlock` helpers `SELL_HOLD_RENT_GOAL_CAPTURE` already built) and frames the link as continuing the plan rather than a generic "explore scenarios" prompt. If no thread exists, output is unchanged from today. `SELL_HOLD_RENT_ANALYSIS` still never calls `createOrResumeThread` itself — creation stays exclusively `SELL_HOLD_RENT_GOAL_CAPTURE`'s job, gated by its own `MIN_GOAL_EXTRACTION_CONFIDENCE` bar.
- *For:* closes the `DEC-001` gap using infrastructure that already exists and is already proven (same `selectThread` call, same block-building helpers); doesn't touch `GOAL-003`/`GOAL-004` at all — no new thread is ever created by a passive read, and thread identity stays independent of session.
- *Against:* real, bounded implementation work — `SELL_HOLD_RENT_ANALYSIS`'s `allowedBlockTypes` needs `DECISION_PROGRESS`/`WHY_NOW` added in the registry (mechanical, but a registry change, not just a handler edit).

**Option C — Full attach.** `sellHoldRentAnalysisResult` itself calls `createOrResumeThread`, so every plain "should I sell?" question also creates or resumes the durable thread, same as a stated goal does today.
- *For:* implementation-trivial (reuses the exact call `SELL_HOLD_RENT_GOAL_CAPTURE` already makes); maximally consistent — the two operations converge to always sharing one thread.
- *Against:* directly conflicts with `GOAL-003` and the FRD's own Test E framing (a *stated* intention like "I'm thinking about selling next year" is what should create durable state — not an idle "what would I get if I sold?" question). Risks quietly turning a curiosity question into what looks, to the homeowner, like the start of a tracked plan they never asked to track.

**Decided and implemented: Option B.** It is the only option that actually satisfies `DEC-001` without weakening `GOAL-003`'s silent-creation guardrail, and it reuses code that already exists for exactly this read-only purpose rather than inventing a new mechanism.

**Implementation, 2026-09-17 (`apps/backend/src/services/ask/askOrchestrator.service.ts`, `apps/backend/src/services/ask/askOperationRegistry.ts`):**
- `sellHoldRentAnalysisResult` now fetches `sellHoldRentDecisionFamilyAdapter.selectThread(propertyId, propertyId)` in parallel with its existing reads. On `UNIQUE`, it re-fetches the full `DecisionThread` + `currentRecommendationSnapshot` (the same two-query pattern `conversationalCapture.ts`'s `processGoalCandidate` already established, needed because the adapter's own lineage type only carries a snapshot id) and inserts a `decisionProgressBlock` right after the `SUMMARY` block, plus a `whyNowBlock` when a snapshot exists. `AMBIGUOUS` is treated the same as `NONE` — no progress block, rather than guessing which thread to show.
- The `SUMMARY` block's own call-to-action is reframed from "Explore and adjust scenarios" to "Continue your plan" when an active thread exists.
- `SELL_HOLD_RENT_ANALYSIS`'s `allowedBlockTypes` in the registry now includes `DECISION_PROGRESS`/`WHY_NOW`.
- `sellHoldRentAnalysisResult` still never calls `createOrResumeThread` — creation stays exclusively `SELL_HOLD_RENT_GOAL_CAPTURE`'s job, unchanged.

**Verification: STATIC only.** `tsc --noEmit` clean; 35 relevant tests green (`askGovernance.test.js`, `capabilityHandlerRegistry.test.js`, `askInteractionCoverageMatrix.test.js`), including the platform's own "every material Ask command has governed confirmation/authorization" and "every operation resolves to a registered capability handler" checks. **Not DB- or browser-verified this session** — a dedicated DB-gated certification test exists (`apps/backend/tests/integration/askSellHoldRentGoalCertification.db.test.js`) but requires `ASK_CAPTURE_CERTIFICATION_DATABASE_URL`, which wasn't configured/run here; no live property with an active sell/hold/rent thread was exercised end to end.

- `SELL_HOLD_RENT_ANALYSIS`'s `rollClass` stays `READ_RESULT` — Option B never calls `createOrResumeThread`, so the operation's fundamental interaction type is unchanged even after implementation; it's a read that also surfaces thread progress when one exists, not a workflow continuation.
- Phase 4's D01/D05/D07 and G02/G04/G07 acceptance scenarios can now be evaluated for this operation for the first time (statically) — DB/browser evidence for them is still open, tracked in §6.

## 4.9 Stage 2 — Phase 5 read-only attention MVP (Home intelligence and work, 5/8 operations)

Phase 5 scopes only the non-mutating portion of §14 — the read-only "what needs my attention" experience, no `DISMISS`/`ALREADY_HANDLED`/`REMIND_LATER`. That's `HOME_ACTIONS`, `MAINTENANCE_FORECAST`, `INTELLIGENCE_ENVELOPE_QUERY`, `HOME_CHANGE_SUMMARY`, and `INSPECTION_FINDINGS`; the track's 3 mutating operations (`OPERATIONAL_WORK_UPDATE`, `INSPECTION_FINDING_UPDATE`, `HOME_DEADLINE_MONITOR`) stay out of scope for this phase.

**`HOME_ACTIONS` (the flagship operation):**
- Branches on buyer-vs-homeowner context *first* (`buyerPlanContextProvider`) — a buyer property gets a completely different result; everything below applies only to homeowner properties.
- **ATT-102 and ATT-103 verified true by direct code/copy reading, not assumed:** every action item carries `source.kind`/`confidence.label`/`ranking.explanation`/`timing.dueAt` (ATT-102's full required set), and the UI copy literally states "Priority and order come from the canonical Home Action feed. Ask does not independently rerank them" (ATT-103).
- **Important disambiguation:** the `PRIORITY_LIST` block reads `getSuppressedHomeActionIds` — this is **not** the FRD's `ATT-106 DISMISS` control. It's a pre-existing, Ask-independent "not useful" feedback cooldown (14 days) that only sets a display flag and explicitly "never removes an item from the governed feed." Reading it in Phase 5 is fine; don't mistake it for dismiss already being wired through Ask.
- Single-action focus (`focusedActionId`) returns a truthful `NOT_APPLICABLE` — not a stale substitute — when the focused action has left the current feed: a real XREC-004 implementation.

**`INTELLIGENCE_ENVELOPE_QUERY` — the strongest operation found in the entire audit so far on freshness and coverage disclosure:**
- Both a result-level `page.contextVersion` *and* a per-item `item.freshness.currentness` label.
- `page.diagnostics` lists exactly which registered producers were unavailable, surfaced as its own `BOUNDARY` block — the cleanest XRES-004 ("missing sources cannot be interpreted as zero findings") implementation in this codebase.
- Real bounded pagination (`limit:20`, `cursor`/`nextCursor`) — but the only client-facing continuation affordance is a suggestion chip ("Show more intelligence"), not a dedicated control. GROUPED_LIST items carry `href: null` throughout — a disclosed absence of per-item navigation, not an oversight.

**`MAINTENANCE_FORECAST`, `HOME_CHANGE_SUMMARY`, `INSPECTION_FINDINGS` — a recurring cross-track pattern, now confirmed in 4 separate operations across 2 tracks:** an undisclosed item cap (`slice(0, 20)`, `MAX_ITEMS`, `take: 50`) with the section `count` shown but no truncation/"showing X of Y" disclosure. `HOME_CHANGE_SUMMARY` and `INSPECTION_FINDINGS` also have **no `contextVersion` at all on either branch** — the same "empty/terminal branch skips freshness" pattern already seen in `REFINANCE_ANALYSIS`'s `NOT_APPLICABLE` case, but here it's the *substantive* branch missing it too, not just the empty one. `MAINTENANCE_FORECAST` does set a real contextVersion (a content hash) on its substantive branch, and has a genuine write-on-read side effect: an empty forecast triggers a one-time `generateForecast()` call, guarded by its own in-flight dedup map (not the platform's `AskConfirmationReceipt` mechanism, since this isn't confirmation-gated).

**Correction made while tracing this track:** `REFINANCE_ANALYSIS`'s earlier note overstated its `captureRequests` mechanism as "a third independent capture path." It's actually the same `evaluateFeatureContext()`-driven mechanism `PROPERTY_SUMMARY`, `SELL_HOLD_RENT_ANALYSIS`, and now `HOME_ACTIONS`/`SAVINGS_OPPORTUNITIES` all share, just scoped by a different `featureKey` — one unified capture path, not several. Fixed in the matrix; noted here so the correction itself is visible.

## 4.10 Stage 2 — Buyer journey (Phase 6, 18/18 operations)

Full evidence in the matrix; every one of the 18 Buyer operations was read directly this pass. Summary:

**Shared infrastructure (13 of 18 read operations):** all call `loadBuyerPlanContext` → the same `buyerPlanContextProvider`, giving them one governed `contextVersion` (a hash of the entire `HomeBuyerTaskService.getClosingHomePresentation()` payload) and one shared `buyerNotActiveResult()` fallback. **BUY-001 verified true by code, not assumed**: every one of the 13 checks `presentationMode === 'CANDIDATE'`/`context.status` and refuses to fabricate readiness for a homeowner property or inactive plan. A caveat worth flagging: several "readiness" reads (`BUYER_FINANCING_READINESS`, `BUYER_TITLE_ESCROW_READINESS`, `BUYER_WALKTHROUGH_READINESS`, `BUYER_DISCLOSURE_FUNDS_READINESS`, `BUYER_CLOSING_DAY_READINESS`, `BUYER_CONTRACT_TIMELINE`, `BUYER_NEGOTIATION_READINESS`) pull their actual data from a *different* service (`BuyerPurchaseLenderReadinessService`, `BuyerTitleEscrowService`, etc.) but still report the *shared* plan-level `contextVersion` — whether a change to just that sub-service's data always bumps the shared version wasn't independently verified this session.

**Two real, positive exceptions to the "bare href, no context" pattern found everywhere else in this audit:** `BUYER_PLAN_STATUS`/`BUYER_DEADLINES`/`BUYER_TASK_UPDATE`/`BUYER_FINDING_DISPOSITION`/`BUYER_COST_READINESS` carry real `?taskId=` query params to the exact next task, and `BUYER_MOVE_STATUS` carries a real `?filter=MOVE` — genuine ROLL-007 filter/target preservation, not just a generic link.

**A real safety-critical finding**: `BUYER_DISCLOSURE_FUNDS_READINESS` and `BUYER_CLOSING_DAY_READINESS` both carry a CAUTION-severity wire-fraud-protection `BOUNDARY` on every response ("Never trust changed emailed wire instructions... ContractToCozy never supplies or validates destination account details") — duplicated as identical copy in two places rather than one shared constant (a minor consistency gap, not a safety one).

**The 5 command operations** (`BUYER_TASK_COMPLETE`/`CREATE`/`UPDATE`, `BUYER_FINDING_DISPOSITION`, `BUYER_LIFECYCLE_UPDATE`) all block `VIEWER` role before any lookup, several carry a genuine per-entity freshness check distinct from the shared plan version (`buyerTaskVersion`, `buyerDispositionAt`), and — **confirmed by grepping all 5 `confirmBuyer*` functions directly — none populate `refreshedExecutions`.** Same XREC-001 gap as every other confirmation-gated track so far; now 35 operations total across 3 tracks confirmed missing reconciliation, against the 2 (maintenance) that have it.

**A significant code-vs-comment conflict, surfaced not silently resolved**: `askDomainCommandRegistry.ts`'s own comment for `BUYER_LIFECYCLE_UPDATE` states pause "is not yet backed by a real lifecycle transition in the service layer, so it is intentionally unavailable rather than simulated." Direct reading of `buyerLifecycleUpdateResult`, `confirmBuyerLifecycleUpdate`, and `BuyerAcquisitionService.pauseJourney`/`resumeJourney` shows this is **stale** — pause/resume is fully implemented: a real confirmation flow, `OWNER`-gated, with a race-safe conditional `updateMany` + count check that throws a `409` on a stale transition. This is exactly the kind of conflict FRD §21 Phase 0 asks to be surfaced, not silently resolved — recorded here and tripwired by a governance test; whether to update the stale comment is the user's call.

**The undisclosed-item-cap pattern is now confirmed in 12+ operations across 4 tracks** (`.slice(0, 10)` throughout 8 of the Buyer readiness reads, on top of the earlier Records-and-capture/Home-intelligence instances) — this should be fixed once, platform-wide, not per operation.

## 4.11 Stage 2 — Decisions and projects (Phase 7, 17/17 remaining operations)

`SELL_HOLD_RENT_ANALYSIS`/`SELL_HOLD_RENT_GOAL_CAPTURE` were already traced in §4.7; this closes out the other 17 (11 HVAC + `REPLACEMENT_GUIDANCE` + `GUIDANCE_JOURNEY_CREATE` + `QUOTE_COMPARISON_CREATE`/`REVIEW` + `RENOVATION_PERMIT_READINESS` + `SELLER_PREP_CHECKLIST`/`ITEM_DECISION`).

**A confirmed internal-delegation architecture, verified by direct code read**: `REPLACEMENT_GUIDANCE` doesn't run its own logic for HVAC-category items — it returns `hvacDecisionStartResult(...)` directly (`askOrchestrator.service.ts:2323-2325`). This is the actual enforcement mechanism behind the registry's stated distinction between "generic appliance heuristic" and "registered Decision Platform engine": both operation IDs can be resolved for an HVAC question, but only one code path ever runs for HVAC items.

**The HVAC decision-thread family shares one real, well-engineered infrastructure layer**: `decisionThreadService.selectHvacDecisionThread` returns a `UNIQUE`/`AMBIGUOUS`/`NONE` discriminated union used identically by all 7 thread-bound operations, and `hvacDecisionThreadVersionFingerprint(threadId)` is a real, consistent per-thread freshness source reused by `SCENARIO`/`ABANDON`/`OUTCOME_REPORT`/`OUTCOME_UNLINK`. `hvacDecisionThreadAmbiguousResult` is the one shared disambiguation path — ROLL-006 verified true everywhere, not just claimed.

**A genuinely notable finding**: `HVAC_DECISION_CONTINUE` (and `HVAC_DECISION_START`'s "already active" branch) are **not side-effect-free reads** — both call `continueHvacDecisionThread`, which can trigger a real recompute of the current recommendation snapshot as a byproduct of what looks like a status check. This is properly *disclosed* (a `WHY_NOW`/`RECOMMENDATION_CHANGE` block appears when it happens — matching the registry's own comment requiring those block types be declared), not hidden, but it means "read" and "side-effect-free" aren't synonymous for this pair, and Stage 2 records that explicitly rather than assuming READ_RESULT-style purity.

**`HVAC_SPECIALIST_ENGAGE` uses a genuinely different safety model from the rest of this entire audit**: not `AskConfirmationReceipt` at all. Its underlying Specialist Agent runtime is protected by a compare-and-swap `expectedCasVersion` and a deterministic `engagementNonce`, and its entity resolution explicitly refuses to guess on a scoring tie (`askOrchestrator.service.ts:6836-6840`) — a careful, independently-built ROLL-006 implementation worth knowing is architecturally distinct before assuming every confirmation-adjacent HVAC operation shares the same lease/receipt mechanism.

**Real positive exceptions to the bare-href pattern**: `QUOTE_COMPARISON_REVIEW` (`?workspaceId=`) and `RENOVATION_PERMIT_READINESS` (`?renovationCaseId=`) both carry targeted query params, joining `BUYER_*`'s exceptions from §4.10.

**Two more freshness gaps found, same recurring cross-track pattern**: `SELLER_PREP_CHECKLIST` sets no `contextVersion` anywhere. `HVAC_PREFERENCE_SAVE`/`FORGET` deliberately have none — but that one is a *reasoned* exception (documented in the code itself: there's no mutable external row to check staleness against, since the value being saved is the homeowner's own just-typed statement), not an oversight, and Stage 2 records that distinction rather than flattening both into the same "gap" bucket.

**Reconciliation gap confirmed across every remaining confirmation-gated operation in this track** (`HVAC_DECISION_START`/`SCENARIO`/`ABANDON`/`OUTCOME_REPORT`/`OUTCOME_UNLINK`/`PREFERENCE_SAVE`/`PREFERENCE_FORGET`, `GUIDANCE_JOURNEY_CREATE`, `QUOTE_COMPARISON_CREATE`, `SELLER_PREP_ITEM_DECISION` — 10 operations, grep-verified) — consistent with every other track.

**Genuine positive findings worth recording, not just gaps**: `HVAC_PREFERENCE_SAVE`'s confirmation exceeds the XPROP-002 minimum (discloses who can see it, what it's used for, and when it expires). `QUOTE_COMPARISON_REVIEW` and `RENOVATION_PERMIT_READINESS` both genuinely implement DEC-002/DEC-007's disclosure requirements in code, not just in the registry's stated intent. `SELLER_PREP_ITEM_DECISION`'s action-word parsing deliberately checks "reopen"/"unpursue" patterns before "waive" specifically because "undo the waive" contains the literal word "waive" — a real, deliberate ordering fix.

## 4.12 Stage 2 — Protection and claims (Phase 8, 6/6 operations)

All 6 operations read directly.

**A second Stage-1 default-rule correction, exactly where §4.5/§4.11 flagged it might be needed**: `INCIDENT_CONTINUATION` was classified `WORKFLOW_CONTINUATION` in Stage 1 (the `WORKFLOW_GUIDANCE`-family default, same rule that mis-called `MAJOR_EVENT_ENTRY`). Direct reading shows it's a plain, stateless list of the property's 10 most recent incidents and claims plus a safety boundary — no `DecisionThread`, no durable workflow identity, no resumption logic. **It substantially duplicates `INCIDENT_CLAIM_STATUS`'s own read** (same two Prisma models, same property scope), just with less detail (no active/resolved split, no focus filtering, a tighter `take:10` cap vs. `take:20`) and a safety-framing layer on top. Reclassified `READ_RESULT`, tripwired by a governance test. Two for two now on the `WORKFLOW_GUIDANCE`-family default rule being wrong when actually checked — worth treating any *other* untraced `WORKFLOW_GUIDANCE`-family operation's Stage 1 classification as unverified until read, not just this one family's remaining members (there are none left untraced in this FRD's tracked set, but the pattern itself is the lesson).

**A genuine, well-mitigated security nuance found while tracing `COVERAGE_COMPARISON_STATUS`**: its underlying service (`coverageComparison.service.ts`) authorizes with a raw `homeownerProfile.userId === userId` check — no household-role gradient at all, unlike the platform's normal `resolvePropertyAccess`. The Ask handler compensates by calling `ensurePropertyAccess` first (enforcing the operation's own declared `VIEWER` floor) and disclosing a `BLOCKED` "owner-only for now" result — not a raw 404 — when the narrower service-level check still rejects a legitimate household member. This is careful, deliberate defense, not a live vulnerability, but the underlying service's own authorization stays genuinely weaker than the rest of the platform, worth knowing before anyone refactors this operation's guard.

**PROT-001, PROT-004, and PROT-008 all verified true by direct code reading**, not inferred from safety-class metadata: `COVERAGE_GAPS` genuinely keeps "unknown" separate from "confirmed gap"; `CLAIM_FILE`'s copy repeats, in both propose- and confirm-time text, that nothing is transmitted to a provider; `COVERAGE_COMPARISON_STATUS` models `INDETERMINATE`/`MIXED` equivalence explicitly rather than ever implying two options are equivalent when they aren't.

**Reconciliation gap confirmed for both confirmation-gated operations** (`CLAIM_FILE`, `CLAIM_TRANSITION`) — consistent with every other track. Notably, `CLAIM_TRANSITION`'s own confirm-time copy *promises* "reconcile the linked Operational Work Item and outcome" — that reconciliation is real, but it happens inside the canonical Claims service's own write, not through Ask's `refreshedExecutions` mechanism, so a still-visible `OPERATIONAL_WORK_UPDATE`-sourced Ask result wouldn't itself refresh.

**Two more real positive handoff exceptions**: `INCIDENT_CLAIM_STATUS` and `CLAIM_TRANSITION` both carry real per-record hrefs (not bare listing-page links) — joining the growing list of genuine exceptions to the platform's otherwise-common bare-href pattern.

## 4.13 Stage 2 — Financial and ownership, remaining 5 operations (closes out Phase 7's full scope)

`REFINANCE_ANALYSIS` was already traced in §4.6; this closes the other 5 (`SAVINGS_OPPORTUNITIES`, `OWNERSHIP_COSTS`, `CAPITAL_RESERVE_PLAN`, `PROPERTY_TAX_APPEAL_READINESS`, `REFINANCE_RATE_MONITOR`), which — per the correction in §6 — are genuinely part of the FRD's own Phase 7 scope, not later work.

**The best-engineered UI surface found in this entire audit**: `REFINANCE_RATE_MONITOR`'s confirmation result renders through a real, dedicated `MonitorView` component (`AskWorkspace.tsx:145`) — only the second bespoke rendering exception found anywhere in the shared-renderer codebase (after the `maintenance-groups` special case). It carries structured inline `edit`/`pause`/`stop` actions with real query params, letting a homeowner act on the monitor they just created without leaving the conversation — the richest handoff implementation in this audit.

**A genuine, disclosed exception to the undisclosed-cap pattern**: `CAPITAL_RESERVE_PLAN`'s `TABLE` block carries both a `totalCount` and the displayed count, showing an "Open capital timeline" action only when there's more to see — real truncation disclosure, unlike every `GROUPED_LIST` elsewhere in this audit that silently slices.

**FIN-004 verified true by code, repeatedly and with unusual rigor**: `SAVINGS_OPPORTUNITIES` keeps realized value strictly separate from estimates ("counted only from a recorded RECEIVED outcome") and explicitly attributes related opportunities to their owning domain rather than claiming credit; `OWNERSHIP_COSTS` states twice, in two different branches, that missing categories aren't treated as zero, and shows confirmed vs. estimated totals separately rather than blending them; `PROPERTY_TAX_APPEAL_READINESS` states the same "unknown facts remain unknown" guarantee and renders unconfirmed values as `"Not confirmed"` rather than blank or zero.

**FIN-005/FIN-006 verified true by code**: `REFINANCE_RATE_MONITOR` is reachable only through its own explicit confirmation (never auto-enabled by `REFINANCE_ANALYSIS`, cross-checked against that operation's own handler in §4.6), discloses threshold/channel/cadence/quiet-hours/source-boundary in full before activation, and honestly reports `UNAVAILABLE` — not a silent fake success — when the account isn't yet eligible for delivery.

**Real write-on-read side effects, consistent with `MAINTENANCE_FORECAST`'s pattern**: `CAPITAL_RESERVE_PLAN` generates a live timeline (and synchronously syncs the reserve fund) when none exists yet, rather than answering from a stale or empty state. `OWNERSHIP_COSTS` forces a live recompute (`{refresh: true}`) on every call.

**Reconciliation gap confirmed for the one confirmation-gated operation** (`REFINANCE_RATE_MONITOR` — grep-verified no `refreshedExecutions`), consistent with every other track, though its inline pause/stop/edit actions provide a different, arguably more useful kind of continuity than the platform's `refreshedExecutions` mechanism would.

## 4.14 Stage 2 — Household utilities, Discovery, and Boundaries (6/6 operations)

**The 3 Boundary operations are the simplest in the entire registry**: `EMERGENCY_BOUNDARY`/`UNSAFE_RESTRICTED_BOUNDARY`/`OUT_OF_SCOPE_BOUNDARY` are not even `async` — zero DB access, fully static hardcoded content, no actions, no hrefs, nothing to reconcile. ATT-109/PROT-005 verified true by code: `EMERGENCY_BOUNDARY` uses a dedicated `EMERGENCY` severity found nowhere else, with explicit safety copy and zero action/suggestion surface a generic dismissal control could ever reach.

**`HOUSEHOLD_INVITATION`: HH-001/HH-002/HH-004 all verified true by direct code read.** Recipient identity is validated through a real Zod schema at both propose- and confirm-time (HH-002). The confirm-time result's own status, reason code, and copy are all literally "pending" — "Access is not active until the recipient accepts it" — never claiming delivery, only creation (HH-004, matching the requirement's own wording almost exactly). A dedicated `householdWorkflowVersion` freshness check is re-verified atomically at confirm time, same pattern as `REFINANCE_RATE_MONITOR`.

**`CAPABILITY_DISCOVERY`**: genuinely rich, policy-driven per-card readiness (`READY`/`NEEDS_PROPERTY`/`NEEDS_CONTEXT`/not-ready with specific reasons), each card linking directly to its own destination — a real handoff exception. This is the operation both `MAJOR_EVENT_ENTRY` (§4.5) and `HVAC_SPECIALIST_ENGAGE`'s unavailable/ambiguous branches (§4.11) delegate into; now traced directly rather than only inferred from those callers.

**`GROUNDED_GUIDANCE`**: the platform's only `REMOTE_GENERATION` (Gemini-backed) operation, with real, visible external-review history in its own comments. CTX-001 verified true: a launch-context task reference is resolved and folded into both the question and a dedicated evidence line so near-duplicate task titles aren't confused; a reference that no longer resolves is explicitly disclosed, not silently dropped to an unscoped answer (XREC-004). Low-confidence answers degrade to `READY_WITH_LIMITATIONS`, matching — per the code's own comment — the same convention this audit has now independently observed in `CAPITAL_RESERVE_PLAN`/`REPLACEMENT_GUIDANCE`/`OWNERSHIP_COSTS`/`SELL_HOLD_RENT_ANALYSIS`/`REFINANCE_ANALYSIS`.

## 4.15 Stage 2 — Completed reference and the 3 remaining Phase-5 mutating operations (7/7, closing Stage 2 entirely)

**`MAINTENANCE_STATUS`/`TASK_CREATE`/`TASK_COMPLETE`/`TASK_UPDATE`** — the FRD's own predecessor reference slice — were traced directly rather than left assumed-correct. They hold up: `MAINTENANCE_STATUS`'s `MaintenanceViewState` (a stable `resultId`, minted once and carried across every filter/refresh of the same interactive result, distinct from `executionId`) is the literal architectural ancestor of ROLL-002's "refining one dimension preserves compatible dimensions" requirement. `MAINTENANCE_TASK_UPDATE` is **the only operation in all 77 with a real `editableFields` implementation** — every other confirmation-gated operation traced this session declares it unconditionally empty. `MAINTENANCE_TASK_COMPLETE`/`UPDATE` are **the only two operations in the platform that actually populate `refreshedExecutions`** — the reconciliation mechanism this audit found missing everywhere else is not missing here; it's the one place it was built and wired.

**`OPERATIONAL_WORK_UPDATE`** adds a third independent instance of a real, deliberate platform discipline: refusing to infer a successful outcome from language alone. A `COMPLETE` action requires an explicit observed-result answer before it can even be proposed — matching `HVAC_DECISION_OUTCOME_REPORT`'s own "never derives verificationStatus from the message" guarantee. It also enforces a genuine `BUY-004`-style separation: quick completion is restricted to accepted, maintenance-backed work only; everything else is routed to its own linked workflow.

**`HOME_DEADLINE_MONITOR`** carries three genuinely distinct per-branch freshness sources (maintenance/missing-expiry/warranty-insurance), and explicitly refuses to guess when two coverage records disagree about an expiration date — a real ROLL-006 refusal, not just task-selection ambiguity. It's also honest about scope boundaries with its siblings ("does not create a duplicate task," "does not change maintenance-task email preferences").

**`INSPECTION_FINDING_UPDATE`** is the one operation in this final batch with nothing distinctive beyond the platform baseline — same reconciliation gap, bare-href handoff despite its own copy telling the homeowner to use an exact finding id.

**Reconciliation gap final tally**: of the 30 confirmation-gated operations traced this session, exactly **2** (`MAINTENANCE_TASK_COMPLETE`, `MAINTENANCE_TASK_UPDATE`) populate `refreshedExecutions`. The other 28 do not.

## 5. Cross-cutting findings across all 77 operations (Stage 2 complete)

These patterns recurred enough times, independently, across every track to be platform-level findings rather than per-operation ones:

1. **XREC-001 reconciliation is real but essentially unbuilt.** 2 of 30 confirmation-gated operations use it (both maintenance). The other 28 — across Records and capture, Buyer, Decisions and projects, Protection and claims, and Financial and ownership — leave every other still-visible Ask result unrefreshed after a successful mutation, even when their own confirmation copy sometimes promises reconciliation happens (`CLAIM_TRANSITION`, `BUYER_FINDING_DISPOSITION`) — that reconciliation is real, but happens inside the owning domain service's own write, invisible to Ask's own result surfaces.
2. **The undisclosed item-cap pattern (`slice(0, N)`/`take: N` with count shown, no "showing X of Y" or continuation control) recurred in essentially every list-shaped read across every track.** `CAPITAL_RESERVE_PLAN`'s `TABLE` block (§4.13) and `INTELLIGENCE_ENVELOPE_QUERY`'s cursor pagination (§4.9) are the only two genuine, disclosed exceptions found in 77 operations.
3. **Freshness/`contextVersion` coverage is inconsistent, not absent.** Most operations carry a real, meaningful version (often a content hash or a shared Property Context Platform `contextVersion`); a recurring number of "empty/terminal branch omits it while the substantive branch has one" gaps were found (`REFINANCE_ANALYSIS`'s `NOT_APPLICABLE` branch, `MAINTENANCE_FORECAST`'s empty branch) alongside a smaller number of operations missing it entirely on every branch (`HOME_CHANGE_SUMMARY`, `INSPECTION_FINDINGS`, `INCIDENT_CLAIM_STATUS`, `SELLER_PREP_CHECKLIST`). `HVAC_PREFERENCE_SAVE`'s absence is the one *reasoned* exception, documented in its own code comment.
4. **The bare-href handoff pattern (a generic workspace link, no query params preserving filter/target/return state) is the default, not universal.** Real, targeted exceptions with query params exist and cluster meaningfully: Buyer's `?taskId=`/`?filter=`, `QUOTE_COMPARISON_REVIEW`'s `?workspaceId=`, `RENOVATION_PERMIT_READINESS`'s `?renovationCaseId=`, `COVERAGE_GAPS`'s `?openItemId=`, `SAVINGS_OPPORTUNITIES`'s `?family=&opportunityId=`, and `REFINANCE_RATE_MONITOR`'s structured `?monitorAction=` — the platform clearly *can* do targeted handoff; it's inconsistently applied.
5. **The `WORKFLOW_GUIDANCE`-family-implies-`WORKFLOW_CONTINUATION` Stage 1 default rule was wrong every time it was actually checked against a handler** (`MAJOR_EVENT_ENTRY`, `INCIDENT_CONTINUATION` — both reclassified). No `WORKFLOW_GUIDANCE`-family operations remain untraced, so this specific risk is now fully retired, but the underlying lesson (a family-based classification default is a starting hypothesis, not a fact, until the handler is read) generalizes.
6. **One shared UI renderer (`AskWorkspace.tsx`) handles essentially everything**, with exactly two bespoke exceptions found in the entire codebase: the `maintenance-groups` `GROUPED_LIST` special case, and `REFINANCE_RATE_MONITOR`'s dedicated `MonitorView` component with inline edit/pause/stop actions.
7. **A small number of independently-discovered dynamic/anti-inference disciplines recur by design, not by accident**: self-reported outcomes are never auto-verified (`HVAC_DECISION_OUTCOME_REPORT`, `OPERATIONAL_WORK_UPDATE`); several operations supply their professional/safety boundary copy dynamically from the owning domain service rather than hardcoding it (`PROPERTY_TAX_APPEAL_READINESS`, `GROUNDED_GUIDANCE`); and low-confidence results consistently degrade to `READY_WITH_LIMITATIONS` across at least 6 independently-traced operations.
8. **One genuine, well-mitigated security nuance** (`COVERAGE_COMPARISON_STATUS`'s underlying service having no household-role gradient) and **one confirmed stale governance comment vs. working code** (`BUYER_LIFECYCLE_UPDATE` pause/resume) were the only two code-vs-documentation conflicts found across all 77 operations.

## 6. What remains open — real product/engineering follow-ups, not tracing gaps

Stage 2 tracing itself is done (0/77 `PENDING` in the matrix, enforced by the governance test suite described in §1). What's still open is real work the tracing surfaced:

1. ~~Decide and close the §4.8 decision~~ **Done 2026-09-17** — Option B decided and implemented (§4.8). What remains: DB/browser verification (no live property with an active thread was exercised this session) and evaluating Phase 4's D01/D05/D07/G02/G04/G07 scenarios against the live behavior.
2. **XREC-001 reconciliation**: 28 of 30 confirmation-gated operations don't refresh other still-visible Ask results after a successful mutation. `refreshMaintenanceSourceExecution`/`refreshedExecutions` already exists and works (2 operations use it) — this is a rollout gap, not a missing mechanism.
3. **The undisclosed-cap pattern**: essentially every list-shaped read caps its items with no "showing X of Y" disclosure. `CAPITAL_RESERVE_PLAN` and `INTELLIGENCE_ENVELOPE_QUERY` show the pattern already exists to fix this platform-wide.
4. **Freshness gaps** on operations with no `contextVersion` at all (`HOME_CHANGE_SUMMARY`, `INSPECTION_FINDINGS`, `INCIDENT_CLAIM_STATUS`, `SELLER_PREP_CHECKLIST`) versus the reasoned exception (`HVAC_PREFERENCE_SAVE`) — worth a pass to add real versions to the former.
5. **Handoff context preservation**: extend the real query-param pattern already proven in ~10 operations to the many that still hand off with a bare link.
6. **Two governance items to resolve, not implement**: whether `askDomainCommandRegistry.ts`'s stale `BUYER_LIFECYCLE_UPDATE` comment should be corrected (§4.10), and whether `coverageComparison.service.ts`'s own weaker authorization should be raised to match `resolvePropertyAccess`'s role gradient (§4.12) even though the Ask-layer guard already compensates.
7. **`INCIDENT_CONTINUATION`/`INCIDENT_CLAIM_STATUS` overlap** (§4.12) — a product call on whether these should consolidate.

Everything else in §21's Phase 2–8 scope has real, code-verified interaction-completeness evidence recorded per-operation in the matrix.

## 7. Phase 0 exit-criterion self-check (FRD §21)

| Exit criterion | Status |
| --- | --- |
| Executable or mechanically checked coverage matrix | Done — `Record<AskOperationId, ...>` type + `validateAskInteractionCoverageMatrix()` + governance test, all passing (`tsc --noEmit` clean, 11/11 tests green) |
| No unclassified user-visible operation | Done — 77/77 classified |
| No status inferred solely from presence of a backend handler | Done — all 77 `TRACED` entries cite a real read (function/line), not a handler's mere existence |
| Drift check for newly registered operations | Done — compile-time (`Record<>`) + runtime (`validateAskInteractionCoverageMatrix`) |
| Conflicts between code, domain FRDs and this FRD resolved | No conflicts found at the registry/§7-table level (finding 1); Stage 2 found and corrected TWO Stage-1-vs-code classification conflicts (`MAJOR_EVENT_ENTRY`, `INCIDENT_CONTINUATION` — the same `WORKFLOW_GUIDANCE`-family default rule proven wrong twice), corrected one of its own overstated claims (`REFINANCE_ANALYSIS`, §4.9), surfaced one real product ambiguity (`SELL_HOLD_RENT_ANALYSIS`, §4.8), corrected its own phase-tracking (Financial and ownership belongs to Phase 7), and found one stale governance comment vs. working code (`BUYER_LIFECYCLE_UPDATE` pause/resume, §4.10) |

**Stage 1 and Stage 2 of Phase 0 are both complete: all 77 registered operations are classified and traced.** §4.5–§4.15 record the evidence per track; §5 records the cross-cutting findings; §6 records what's genuinely still open. One §22 decision (§4.8) is awaiting the user before Phase 4 can proceed further.

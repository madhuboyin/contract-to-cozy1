# Ask Cozy — Actionable Result Enrichment FRD

**Status:** Draft v1.4 for owner review

**v1.4 amendment (2026-11-18):** Applies the fourth review: registry rows declare an explicit `effect` (`READ` | `MUTATION`) validated against destination metadata; single-use is defined as one durable write, consistent with existing confirm idempotency; an entity-type mismatch is `BOOT_FATAL`; and warranty date overlap is decided as inclusive.

**v1.3 amendment (2026-11-18):** Applies the third review: `CAPTURE_WARRANTY_CONFIRM` must allow `GROUPED_LIST` for the exact-duplicate block; a changed conflict set at confirm ends in the existing terminal conflict result (no confirmation-engine re-arm in v1); fingerprint revalidation reruns the full classification query; the review-then-confirm rule and the role tests are limited to mutating actions.

**v1.2 amendment (2026-11-18):** Applies the second review: the safety rule now distinguishes mutating from read/analysis actions (so "Review replacement" is legal), the exact-duplicate result is a terminal `ANSWERED` result with a renderer-local disclosure and no server Cancel, classification has explicit precedence, `minRole` is dropped from registry rows, and the advisory lock defines the property-wide (no item) case.

**v1.1 amendment (2026-11-18):** Applies the external review: single-refresh wording (`reconcileAskExecutionSideEffects` already refreshes the source), a non-confirming exact-duplicate surface, typed validation severities, the override's storage and atomic single-use mechanism, role policy derived from the destination operation, a concrete advisory-lock helper, the five-row counting scope, the routing-synonym carve-out for the label migration, v1 scope narrowed to audited rows, and an explicit date-overlap rule.

**Date:** 2026-11-18

**Scope (v1):** The registry rows delivered by build step 5 (section 8), on dedicated, compound and semantic read results that identify a missing record, a risk, an overdue task or an unresolved state. The registry is the framework for later coverage; a read operation not yet in it is **deferred**, not ineligible. Completion of v1 means: every row in section 3 is either implemented and tested or recorded here as deferred with a reason.

**Primary objective:** When a result names a specific item with a problem, that row offers the safest relevant next step, decided by one shared policy, not by per-screen patches

**Does not supersede:** Authentication, property authorisation, role floors, confirmation-gated writes, the answer-trust policy, or "Ask never links to desktop pages"

**Evidence labels used below:** **[verified]** = read in code during this review; **[reported]** = stated by the second reviewer and not yet opened by the author; **[proposed]** = a decision of this FRD.

---

## 1. Problem

A dedicated Warranty result offers an "Add a warranty" action. The same underlying fact ("this appliance has no warranty") shown through a compound or semantic inventory result offers nothing. The user sees the problem and has no next step.

Actions are lost at two independent points:

1. **Presentation.** **[reported]** `semantic/slice/richPresentationAdapter.ts` rebuilds rows without an action field (`SlicePresentationRow` has none, rows reconstructed near line 71, the grouped list always receives `actions: []` near line 84).
2. **Trust validation.** **[verified]** `askAnswerTrustPolicy.ts` rejects any action id not declared in `OPERATION_ACTION_IDS` for the source operation (around lines 116 and 591).

A fix that changes only one gate will still lose actions. Using `trustedDynamicAction` as a blanket bypass is rejected: it weakens the policy.

The existing warranty action is **[verified]** list-level and property-wide (`warranties.handler.ts:232`: id `add-warranty`, operation `CAPTURE_WARRANTY_CONFIRM`, message `WARRANTY_ADD_MESSAGE`). A per-item action does not exist yet. **[reported]** The writer already accepts `inventoryItemId` (`captureWarranty.ts:32`), but the capture form (`conversationalCapture.ts` ~364) neither captures nor preserves it.

## 2. Requirements

### FR-ACT-1 Action registry (single declaration source)

An explicit server-side registry declares every enrichment action. A row is keyed by:

```
source operation
+ semantic jobMatch (when present)
+ predicate / relation state (e.g. warranty absent)
+ entity type
→ action { id, label, destinationOperation, effect: 'READ' | 'MUTATION', placement }
```

The registry is the only place actions are declared. The `OPERATION_ACTION_IDS` entries for these actions are **generated from it**, not maintained in parallel.

### FR-ACT-2 Per-row eligibility

An action is emitted for a row only when **all** hold:

1. The destination operation is registered.
2. The row has a grounded `entityType` and `entityId` taken from the executed result, never inferred from display text.
3. The source operation's allowlist includes the action id (generated per FR-ACT-1).
4. The destination operation supports that entity type.
5. The household role satisfies the **destination operation's own** authorization policy, read from that policy, not copied into the registry (Viewer: no write actions; Contributor/Owner: per the operation's write policy). Registry rows carry **no `minRole`** in v1: eligibility is always derived from the destination policy, so the two cannot drift. Registry eligibility never authorizes a write; confirmation reauthorizes independently. (If a presentation role floor is ever added, a floor weaker than the destination policy is a `BOOT_FATAL` defect.)
6. The result state makes the action meaningful (e.g. warranty absent).

Eligibility is evaluated **per row**. A row that is ambiguous in a compound answer loses its action; clean sibling rows keep theirs. An ambiguous row never receives a mutation action.

### FR-ACT-3 Safety

- Every action starts an existing registered operation. A **mutating** action must target a confirmation-gated command. A read, analysis or inline-detail action may target an existing non-mutating operation (for example `REPLACEMENT_GUIDANCE`, a Viewer-accessible `DECISION_ANALYSIS` read) and is never represented as a write. No new write path is created by this FRD.
- A **mutating** action never mutates on click: collect inputs, show a review, then confirm. A read or analysis action (for example `REPLACEMENT_GUIDANCE`) executes as a read with no confirmation step.
- Prefer item-level actions. A list-level action is allowed only when the workflow is inherently property-wide. A long list does not downgrade targeted actions to a property-wide one.
- Actions are Ask-native. No action navigates to a desktop page.

### FR-ACT-4 Presentation limits

- At most one primary remediation action per row.
- The first five eligible rows **per result block** show inline actions, counted in stable rendered section/row order. Ineligible rows do not count toward the five. A grouped block with several sections still shows at most five inline actions in total.
- Remaining rows: actions inside an **existing** detail surface, only when the presentation declares `supportsDetailPlacement`. **[verified]** the inventory result opens `InventoryItemDetail` from `InventoryResultList.tsx` (~255); initially it is the only presentation that sets the flag.
- Without such a surface, show the exported constant:
  `N more matching items — narrow your question to act on them.`
- No new detail UI is built as part of this work.

### FR-ACT-5 Refresh after completion

After a confirmed write, call `reconcileAskExecutionSideEffects()` **once**. **[verified]** (`execution/executeOperation.ts` ~803) it already refreshes the originating `sourceExecutionId` and the impacted sibling reads per the mutation-impact map. No additional direct source refresh is performed, and the write operation is never replayed (guard around `homeRecordWrites.handler.ts:938`). Acceptance test: exactly one refresh invocation for the source execution.

### FR-ACT-6 Labels

The canonical **user-visible** label, title and workflow copy for recording an existing warranty is **Record warranty**. The workflow records coverage already obtained; it does not purchase or create coverage. Visible copy is migrated in one change (section 6); mixed visible labels are not permitted. "Add a warranty" remains an **accepted routing synonym** in routing examples and skill language, so the migration cannot reduce language understanding.

## 3. Capability audit

**[reported]** by the second reviewer; the author has not independently opened each destination operation.

| Action | Status |
|---|---|
| Record warranty | Property-wide workflow exists; item-targeted capture does not |
| Review replacement | `REPLACEMENT_GUIDANCE` with an inventory-item target |
| Reschedule maintenance | Maintenance update/confirmation flow |
| Mark maintenance complete | Existing confirmation-gated maintenance operation |
| Record permit | `PERMIT_TRACKER_COMMAND`, Contributor+ |
| Attach document | `CAPTURE_EVIDENCE_CONFIRM`, inventory items and warranties |
| Confirm / dismiss recall | `RECALL_MATCH_UPDATE`, Contributor+ |
| Add missing inventory details | Existing inventory correction workflow |
| Set reminder | **Not eligible** (see below) |

Each row is re-verified against its destination operation when its registry row is written. A row whose operation cannot be confirmed is not added.

### Not eligible yet

- **Generic "Set reminder."** Reminder behaviour exists only inside specific domains. No universal reminder operation exists. It becomes eligible only through a domain-specific recipe with its own operation.
- Open claims: view only; status changes only through the existing confirmation flow.

## 4. Registry validation

`validateActionEnrichmentRegistry()` is a pure function returning typed issues, not strings. **[verified]** the existing `validateAskRuntimeRegistration()` returns `string[]` and bootstrap treats every entry as fatal, so a flat list cannot carry the split below.

```ts
type ActionEnrichmentRegistryIssue = {
  severity: 'BOOT_FATAL' | 'TEST_ONLY';
  code: string;
  registryEntryId: string;
  message: string;
};
```

Startup consumes only `BOOT_FATAL` issues. The architecture inventory reports all issues. The unit test asserts there are none of either severity.

**Boot-fatal (structural), consistent with existing Ask registries (`confirmCapabilityHandlerRegistry.ts`):**
- unknown source or destination operation;
- duplicate action id within a source operation;
- a `MUTATION` action whose destination is not a registered, confirmation-gated command;
- a `READ` action whose destination is a mutating operation;
- an `effect` declaration that contradicts the destination's `ASK_OPERATION_DEFINITIONS` / domain-command metadata;
- a destination operation that does not support the row's entity type (the row could never execute correctly).

`effect` is declared explicitly because it states the behavior the action promises; it is never inferred from the action id or label. Read, analysis and inline-detail actions (`READ`) are not subject to the confirmation-gating check.

**Test-only (presentation), never fail boot:**
- detail placement on a presentation without `supportsDetailPlacement`;
- row-action count or placement errors;
- overflow copy not matching the exported constant.

A unit test asserts the function returns no issues, and it is included in the architecture-inventory validation. Production-boot crash-loops from earlier registry gaps (`HOME_HABIT_UPDATE`, `RECALL_*`) are the reason the fatal set is kept narrow.

## 5. Item-level "Record warranty" (first vertical slice)

The review and confirmation path is reused for the no-match and equivalent/conflict outcomes. The exact-duplicate outcome needs its own surface (5.2).

1. The row action launches `CAPTURE_WARRANTY_CONFIRM` carrying `inventoryItemId`.
2. The id is preserved in execution parameters.
3. The form shows the appliance as a **fixed**, non-editable field.
4. The id is passed to the existing canonical writer (`captureWarranty`).
5. The existing review and confirmation path is used for the normal outcome.

This section covers item-targeted capture and the property-wide capture (no `inventoryItemId`) alike; the duplicate rules and lock apply to both, with a null item.

No new write operation.

### 5.1 Shared normalization

One shared function normalizes provider (trim, case-fold, collapse whitespace, strip punctuation) and policy number (trim, case-fold, strip whitespace and punctuation). The checker and the tests both import it.

### 5.2 Duplicate and conflict classification

**Date overlap (decided):** `existing.start <= candidate.expiry AND candidate.start <= existing.expiry`. Expiry is inclusive: the product stores calendar dates, and a warranty expiring on a date ordinarily covers that date, so two warranties sharing one boundary day overlap. Test: a warranty ending on day D and one starting on day D overlap; ending D and starting D+1 do not.

Evaluated for the same property and inventory item, against existing warranties:

- **Exact duplicate:** normalized provider matches; policy numbers match or both are absent; category and canonical scope match; start and expiry dates identical.
- **Equivalent:** normalized provider matches; policy numbers match **or at least one is absent**; date ranges overlap; not an exact duplicate.
- **Overlapping conflict:** dates overlap and provider, category or canonical scope differs.

**Precedence (first match wins):** (1) exact duplicate; (2) overlapping conflict, i.e. dates overlap and provider, category or canonical scope differs; (3) equivalent, i.e. provider, category and scope match, policy numbers match or at least one is absent, and dates overlap; (4) no match. A provider difference alone always yields a conflict. A candidate with the same provider and policy number but a different category or scope is therefore a conflict, not equivalent.

Outcomes:

- **Exact duplicate:** creation is blocked. **[verified]** the shared confirmation card (`CaptureCards.tsx` ~355) always renders a consent checkbox, Cancel and a confirm button, and has no slot for inline record detail, so this outcome cannot use it. It returns a **terminal `ANSWERED` result** (not `NEEDS_CONFIRMATION`) with: a summary stating the warranty is already recorded, and a **single-row existing-warranty results block** rendered by the current warranty inline-detail renderer, carrying the existing warranty's grounded entity id. "View existing warranty" is that row's **renderer-local inline disclosure**, not a navigation and not a server action, so it is outside trust validation. **No confirmation object and no pending capture request are returned; no consent checkbox or confirm button renders; no server-side Cancel action is emitted** because the execution is terminal. Dismissing the editor before this response keeps the existing editor Cancel. This is presentation work and is part of build step 4.

**Block-type contract.** **[verified]** the inline-detail renderer (`GroupedListBlock.tsx` ~1058) requires a `GROUPED_LIST` block with id `warranty-results` or `property-warranties`, while `CAPTURE_WARRANTY_CONFIRM` currently allows only `SUMMARY`, `WORKFLOW_PROGRESS` and `BOUNDARY` (`askOperationRegistry.ts` ~1102). Step 4 therefore adds `GROUPED_LIST` to that operation's `allowedBlockTypes`. This widens the operation's block-type contract and is accepted for that reason. Tests: the exact `warranty-results` block survives trust validation on the duplicate branch; normal confirmation results are unchanged; only the exact-duplicate branch emits a grouped list.
- **Equivalent or overlapping conflict:** the existing confirmation card is used with `confirmLabel: "Record anyway"`, showing the existing coverage, plus **Cancel**.
- **No match:** normal review and confirm.

Multiple coverages on one item (manufacturer, extended, home plan) are legitimate, so mere existence of a warranty never blocks.

### 5.3 Override fingerprint

"Record anyway" creates a new confirmation bound to a fingerprint.

- **Input:** execution id, user id, property id, item id, and the sorted `(recordId, updatedAt)` pairs of the conflicting records.
- **Storage:** the server stores the fingerprint and conflicting-record ids in the same Ask execution's parameters. A client-supplied fingerprint or override flag is never trusted.
- **Single use:** means **one durable write**, not that a safe network retry fails. The confirmation claim is the atomic boundary. A retry of the same execution with the same confirmation version and idempotency input returns the previously completed result. An already claimed or completed execution cannot issue another override, and a completed override cannot authorize a new write.
- **Revalidation:** after acquiring the advisory lock, confirm **reruns the complete duplicate/conflict query** for the property and item (a stored id list alone would miss a newly added record), classifies **all** current matches, computes the fingerprint over that full current set, and compares it with the stored one.
- **If it changed:** **[verified]** the confirmation engine claims `NEEDS_CONFIRMATION` to `RUNNING` and a `CLAIMED` receipt before the domain confirm runs (`askConfirm.ts` ~247), and a domain conflict ends the execution as terminal `EXPIRED` with the receipt `FAILED` and a "This changed before it could be confirmed" block (~365). There is no path that re-arms a claimed confirmation. **v1 decision:** use that existing terminal conflict result; the user starts "Record warranty" again and sees a fresh review. Nothing is written. A governed re-arm (receipt superseded, execution back to `NEEDS_CONFIRMATION`, version incremented, new fingerprint stored, stale confirmation unusable) is a possible later engine change and is **deferred**; it is out of scope for v1.

An override is never a reusable stale bypass.

### 5.4 Concurrency and idempotency

- **[reported]** `@@unique([propertyId, sourceExecutionId])` (`schema.prisma` ~5521) makes retries of the **same** execution return the original row. It does not stop two different executions creating the same warranty.
- The pre-create check and insert run in one transaction holding a transaction-scoped advisory lock. A single helper derives the key; **[verified]** the repo already uses `pg_advisory_xact_lock(hashtextextended(<text>, 0))` (`diy.service.ts:383`), so the helper follows that one-`bigint` form over the text `warranty-create:<propertyId>:<inventoryItemId or PROPERTY>`; property-scoped creation (no `inventoryItemId`) uses the literal sentinel `PROPERTY`, so it is serialized and duplicate-checked the same way. It is deterministic across processes, acquired inside the same transaction **before** reading possible duplicates, and **every** Ask warranty-create path uses it. A hash collision may serialize unrelated items but never weakens correctness.
- No semantic unique index is added: nullable policy numbers and legitimate multiple coverage make a correct one impractical. The remaining limitation (writers that bypass the lock) is documented here.
- **[reported]** Item existence and property membership are already rechecked at confirm (`captureWarranty.ts` ~65).

## 6. Label migration (FR-ACT-12)

Change the **user-visible** "Add a warranty" to "Record warranty" in one dedicated commit, before new actions land. "Add a warranty" is kept as a routing synonym in semantic examples and skill language (the `askOperationSemanticPackages.ts` entry gains the new label as an additional example; it does not lose the old phrasing):

- `modules/propertyContext/catalog/captureRegistry.ts` lines 435 (`title`) and 442 (`createLabel`) **[verified]**
- `services/ask/handlers/warranties.handler.ts:232` **[verified]**
- `services/ask/handlers/homeRecordWrites.handler.ts:560` **[verified]**
- `services/ask/conversationalUnderstanding/conversationalCapture.ts:371` **[verified]**
- `services/ask/askOperationSemanticPackages.ts:513` (semantic examples) **[verified]**
- the canonical workflow message `WARRANTY_ADD_MESSAGE`
- frontend fixtures, E2E assertions, backend runtime and routing tests
- current normative documentation

Historical FRD revision entries that record what the UI said at that revision are **annotated**, not rewritten.

## 7. Test matrix

For every registry row:

| Case | Expected |
|---|---|
| Owner | Action survives `validateAskAnswerTrust` |
| Contributor | Follows the destination operation's write policy |
| Viewer + mutating action | Absent |
| Viewer + destination operation that permits Viewer reads | Action survives trust validation |
| Missing entity id | No action |
| Ambiguous row | No action; clean sibling rows unaffected |
| Unknown / unsupported destination | `validateActionEnrichmentRegistry()` reports an issue |
| Overflow | Detail placement only where supported; otherwise the exported constant |
| After confirmation | Source read runs once; write operation never replayed |

Warranty slice additionally:

- two executions with identical input: second blocked as exact duplicate, no confirm action present;
- overlapping non-identical coverage: review plus "Record anyway";
- same provider, no policy numbers, overlapping non-identical dates: classified **equivalent** (regression for the gap found in review);
- an already-known conflicting record is updated between review and confirm: nothing written, existing terminal conflict result returned;
- an **entirely new** conflicting warranty is inserted after review: nothing written, terminal conflict result returned (a stored-id reread alone would miss this);
- same execution, same confirmation version and idempotency input, retried: returns the previously completed result and never writes twice (**[verified]** existing engine behavior, `askConfirm.ts` ~285);
- same execution with a different input/idempotency hash: rejected as an idempotency conflict;
- override fingerprint copied to a different execution or user: rejected;
- a completed override cannot authorize a new write;
- two separate executions with identical input run concurrently: exactly one creation and one exact-duplicate result (not merely one rejected promise);
- exactly one refresh invocation for the source execution after confirm;
- exact-duplicate result is terminal `ANSWERED`, contains no confirmation object, pending capture request, consent checkbox, confirm button or server Cancel action, and its inline disclosure opens the existing warranty;
- a candidate with same provider and policy number but different scope is classified as a conflict (precedence test);
- a mutating registry action with a non-confirming destination yields a `BOOT_FATAL` issue, while a read action targeting `REPLACEMENT_GUIDANCE` does not;
- a block with several sections shows at most five inline actions, and ineligible rows do not consume the five.

## 8. Build order

1. Registry, allowlist derivation, typed `validateActionEnrichmentRegistry()` and its unit test, with **no new actions**. First confirm that `richPresentationAdapter.ts` is the only presentation path that drops row actions.
2. Label migration (its own commit).
3. Shared normalization, equivalent-coverage check and advisory lock in the warranty confirm path.
4. Item-level "Record warranty" vertical slice with the full matrix, including the non-confirming exact-duplicate block.
5. Remaining rows, each a registry row plus a test: Review replacement, Attach document, maintenance reschedule/complete, then permit, recall and inventory details after each destination is re-verified.

An FRD update is part of each step's definition of done.

## 9. Decisions recorded

- Standardize on "Record warranty"; migrate the dedicated Warranty action in the same change.
- Per-row eligibility; ambiguous rows lose actions without suppressing siblings.
- Registry generates the allowlist; structural defects are boot-fatal, presentation defects are test-only.
- Exact duplicates are blocked with no confirm action; equivalent and conflicting coverage allow a bound, single-use "Record anyway".
- Advisory lock per `(propertyId, inventoryItemId)`; no semantic unique index.
- Generic "Set reminder" is not eligible.
- "View existing warranty" is inline only.

## 10. Open items

- Which presentations beyond inventory should set `supportsDetailPlacement`.
- Confirmation that the capability-audit rows marked **[reported]** match their destination operations.
- Whether the five-row inline limit suits the compact mobile layout (to be checked in a browser; nothing here is browser-verified).

## 11. Verification status

Nothing in this FRD has been implemented, executed or browser-verified. Code references marked **[verified]** were read in this review; those marked **[reported]** come from the second reviewer and must be re-checked at implementation time.

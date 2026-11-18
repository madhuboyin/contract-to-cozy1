# Ask Cozy — Actionable Result Enrichment FRD

**Status:** Draft v1.1 for owner review

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
→ action { id, label, destinationOperation, placement }
```

The registry is the only place actions are declared. The `OPERATION_ACTION_IDS` entries for these actions are **generated from it**, not maintained in parallel.

### FR-ACT-2 Per-row eligibility

An action is emitted for a row only when **all** hold:

1. The destination operation is registered.
2. The row has a grounded `entityType` and `entityId` taken from the executed result, never inferred from display text.
3. The source operation's allowlist includes the action id (generated per FR-ACT-1).
4. The destination operation supports that entity type.
5. The household role satisfies the **destination operation's own** authorization policy, read from that policy, not copied into the registry (Viewer: no write actions; Contributor/Owner: per the operation's write policy). If a registry row carries a presentation-only `minRole` for cheap filtering, validation requires it to be no weaker than the destination policy. Registry eligibility never authorizes a write; confirmation reauthorizes independently.
6. The result state makes the action meaningful (e.g. warranty absent).

Eligibility is evaluated **per row**. A row that is ambiguous in a compound answer loses its action; clean sibling rows keep theirs. An ambiguous row never receives a mutation action.

### FR-ACT-3 Safety

- Actions only start an existing, registered, confirmation-gated operation. No new write path is created by this FRD.
- Nothing mutates on click: collect inputs, show a review, then confirm.
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
- a write action whose destination is not confirmation-gated.

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

No new write operation.

### 5.1 Shared normalization

One shared function normalizes provider (trim, case-fold, collapse whitespace, strip punctuation) and policy number (trim, case-fold, strip whitespace and punctuation). The checker and the tests both import it.

### 5.2 Duplicate and conflict classification

**Date overlap:** `existing.start <= candidate.expiry AND candidate.start <= existing.expiry`. Two warranties sharing one boundary day overlap (expiry is treated as inclusive). Owner to confirm if expiry is semantically exclusive, in which case the comparisons become strict.

Evaluated for the same property and inventory item, against existing warranties:

- **Exact duplicate:** normalized provider matches; policy numbers match or both are absent; category and canonical scope match; start and expiry dates identical.
- **Equivalent:** normalized provider matches; policy numbers match **or at least one is absent**; date ranges overlap; not an exact duplicate.
- **Overlapping conflict:** dates overlap and provider, category or canonical scope differs.

Outcomes:

- **Exact duplicate:** creation is blocked. **[verified]** the shared confirmation card (`CaptureCards.tsx` ~355) always renders a consent checkbox, Cancel and a confirm button, and has no slot for inline record detail, so this outcome cannot use it. It returns a **non-confirming `SUMMARY` / conflict-review block** that carries the existing warranty's grounded entity id, states it is already recorded, and offers **Cancel** (closes the pending capture) and an **inline** "View existing warranty" (opens canonical warranty detail inline). **No confirmation object is returned; no consent checkbox or confirm button renders.** This is presentation work and is part of build step 4.
- **Equivalent or overlapping conflict:** the existing confirmation card is used with `confirmLabel: "Record anyway"`, showing the existing coverage, plus **Cancel**.
- **No match:** normal review and confirm.

Multiple coverages on one item (manufacturer, extended, home plan) are legitimate, so mere existence of a warranty never blocks.

### 5.3 Override fingerprint

"Record anyway" creates a new confirmation bound to a fingerprint.

- **Input:** execution id, user id, property id, item id, and the sorted `(recordId, updatedAt)` pairs of the conflicting records.
- **Storage:** the server stores the fingerprint and conflicting-record ids in the same Ask execution's parameters. A client-supplied fingerprint or override flag is never trusted.
- **Single use:** the confirmation claim is the atomic single-use boundary. An already claimed or completed execution cannot issue another override.
- **Revalidation:** confirm recomputes the fingerprint **after acquiring the item advisory lock**. If it changed, the updated review is returned instead of writing.

An override is never a reusable stale bypass.

### 5.4 Concurrency and idempotency

- **[reported]** `@@unique([propertyId, sourceExecutionId])` (`schema.prisma` ~5521) makes retries of the **same** execution return the original row. It does not stop two different executions creating the same warranty.
- The pre-create check and insert run in one transaction holding a transaction-scoped advisory lock. A single helper derives the key; **[verified]** the repo already uses `pg_advisory_xact_lock(hashtextextended(<text>, 0))` (`diy.service.ts:383`), so the helper follows that one-`bigint` form over the text `warranty-create:<propertyId>:<inventoryItemId>`. It is deterministic across processes, acquired inside the same transaction **before** reading possible duplicates, and **every** Ask warranty-create path uses it. A hash collision may serialize unrelated items but never weakens correctness.
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
| Viewer | No write action |
| Missing entity id | No action |
| Ambiguous row | No action; clean sibling rows unaffected |
| Unknown / unsupported destination | `validateActionEnrichmentRegistry()` reports an issue |
| Overflow | Detail placement only where supported; otherwise the exported constant |
| After confirmation | Source read runs once; write operation never replayed |

Warranty slice additionally:

- repeated confirm of one execution returns the original row;
- two executions with identical input: second blocked as exact duplicate, no confirm action present;
- overlapping non-identical coverage: review plus "Record anyway";
- same provider, no policy numbers, overlapping non-identical dates: classified **equivalent** (regression for the gap found in review);
- conflicting records change between review and confirm: stale override rejected, review regenerated;
- override fingerprint is rejected on a different execution or user and on second use;
- two separate executions with identical input run concurrently: exactly one creation and one exact-duplicate result (not merely one rejected promise);
- exactly one refresh invocation for the source execution after confirm;
- exact-duplicate result contains no confirmation object, consent checkbox or confirm button;
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

# Ask Cozy — Actionable Result Enrichment FRD

**Status:** Draft v1.0 for owner review

**Date:** 2026-11-18

**Scope:** Every Ask Cozy read result (dedicated, compound and semantic) that identifies a missing record, a risk, an overdue task or an unresolved state

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
→ action { id, label, destinationOperation, minRole, placement }
```

The registry is the only place actions are declared. The `OPERATION_ACTION_IDS` entries for these actions are **generated from it**, not maintained in parallel.

### FR-ACT-2 Per-row eligibility

An action is emitted for a row only when **all** hold:

1. The destination operation is registered.
2. The row has a grounded `entityType` and `entityId` taken from the executed result, never inferred from display text.
3. The source operation's allowlist includes the action id (generated per FR-ACT-1).
4. The destination operation supports that entity type.
5. The household role meets the destination operation's role floor (Viewer: no write actions; Contributor/Owner: per the operation's existing write policy).
6. The result state makes the action meaningful (e.g. warranty absent).

Eligibility is evaluated **per row**. A row that is ambiguous in a compound answer loses its action; clean sibling rows keep theirs. An ambiguous row never receives a mutation action.

### FR-ACT-3 Safety

- Actions only start an existing, registered, confirmation-gated operation. No new write path is created by this FRD.
- Nothing mutates on click: collect inputs, show a review, then confirm.
- Prefer item-level actions. A list-level action is allowed only when the workflow is inherently property-wide. A long list does not downgrade targeted actions to a property-wide one.
- Actions are Ask-native. No action navigates to a desktop page.

### FR-ACT-4 Presentation limits

- At most one primary remediation action per row.
- The first five eligible rows show inline actions.
- Remaining rows: actions inside an **existing** detail surface, only when the presentation declares `supportsDetailPlacement`. **[verified]** the inventory result opens `InventoryItemDetail` from `InventoryResultList.tsx` (~255); initially it is the only presentation that sets the flag.
- Without such a surface, show the exported constant:
  `N more matching items — narrow your question to act on them.`
- No new detail UI is built as part of this work.

### FR-ACT-5 Refresh after completion

After a confirmed write: run reconciliation once using the mutation-impact map, then re-run the **originating read** once via `ASK_REFRESH`. The write operation is never replayed. This is an explicit acceptance test (it matches the existing guard around `homeRecordWrites.handler.ts:938`).

### FR-ACT-6 Labels

The canonical label for recording an existing warranty is **Record warranty**. The workflow records coverage already obtained; it does not purchase or create coverage. "Add a warranty" is migrated everywhere in one change (FR-ACT-12). Mixed labels are not permitted.

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

`validateActionEnrichmentRegistry()` is a pure function returning a list of issues.

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

1. The row action launches `CAPTURE_WARRANTY_CONFIRM` carrying `inventoryItemId`.
2. The id is preserved in execution parameters.
3. The form shows the appliance as a **fixed**, non-editable field.
4. The id is passed to the existing canonical writer (`captureWarranty`).
5. The existing review and confirmation path is used unchanged.

No new write operation.

### 5.1 Shared normalization

One shared function normalizes provider (trim, case-fold, collapse whitespace, strip punctuation) and policy number (trim, case-fold, strip whitespace and punctuation). The checker and the tests both import it.

### 5.2 Duplicate and conflict classification

Evaluated for the same property and inventory item, against existing warranties:

- **Exact duplicate:** normalized provider matches; policy numbers match or both are absent; category and canonical scope match; start and expiry dates identical.
- **Equivalent:** normalized provider matches; policy numbers match **or at least one is absent**; date ranges overlap; not an exact duplicate.
- **Overlapping conflict:** dates overlap and provider, category or canonical scope differs.

Outcomes:

- **Exact duplicate:** creation is blocked. The review shows the existing record and states it is already recorded. Actions: **Cancel** and an **inline** "View existing warranty". **No confirm action is emitted.**
- **Equivalent or overlapping conflict:** the review shows the existing coverage and offers **Record anyway** or **Cancel**.
- **No match:** normal review and confirm.

Multiple coverages on one item (manufacturer, extended, home plan) are legitimate, so mere existence of a warranty never blocks.

### 5.3 Override fingerprint

"Record anyway" creates a new confirmation bound to a fingerprint over the conflicting records' **ids and `updatedAt`**. The fingerprint is bound to the execution and the user and is **single-use**. On confirm the conflicting records are re-read; if the fingerprint changed, the updated review is returned instead of writing. An override is never a reusable stale bypass.

### 5.4 Concurrency and idempotency

- **[reported]** `@@unique([propertyId, sourceExecutionId])` (`schema.prisma` ~5521) makes retries of the **same** execution return the original row. It does not stop two different executions creating the same warranty.
- The pre-create check and insert run in one transaction holding a transaction-scoped advisory lock keyed by `(propertyId, inventoryItemId)` (`pg_advisory_xact_lock`). This serializes concurrent warranty writes for one item without a schema change.
- No semantic unique index is added: nullable policy numbers and legitimate multiple coverage make a correct one impractical. The remaining limitation (writers that bypass the lock) is documented here.
- **[reported]** Item existence and property membership are already rechecked at confirm (`captureWarranty.ts` ~65).

## 6. Label migration (FR-ACT-12)

Change "Add a warranty" to "Record warranty" in one dedicated commit, before new actions land:

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
- concurrent confirms for one item: only one write succeeds.

## 8. Build order

1. Registry, allowlist derivation, `validateActionEnrichmentRegistry()` and its unit test, with **no new actions**. First confirm that `richPresentationAdapter.ts` is the only presentation path that drops row actions.
2. Label migration (its own commit).
3. Shared normalization, equivalent-coverage check and advisory lock in the warranty confirm path.
4. Item-level "Record warranty" vertical slice with the full matrix.
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

# Renovation: the project handoff in Ask — design

**Status:** Decisions ruled by the owner on October 13, 2026 (§7, which supersedes §4 and the parts of §3 it amends). Slice 1 (the atomic handoff and replay semantics) is built (FRD v1.371); the repair command, the unknown-amount and funding semantics, and the Ask surface are not.
**Date:** October 13, 2026
**Scope:** What it would take for Ask to create the execution Project from a renovation case ("Create and link Project" on the readiness page), and the defects in the canonical handoff that must be fixed first because Ask would otherwise inherit them.
**Not in scope:** Moving the Project Tracker's own document store to Home Records (a separate design; §1.5 shows why this one must not wait on it), the readiness controls shipped in v1.324 and v1.358, and any change to what a Project is.
**Governing documents read for this design:** `docs/product/RENOVATION_COMPLIANCE_AND_EXECUTION_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md`, `docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.324, v1.357 to v1.359 (the handoff finding in v1.359), `docs/architecture/QUOTE_COMPARISON_HOME_RECORD_IMPORT_DESIGN.md` (the confirmation and atomicity pattern), `docs/architecture/PROPERTY_TAX_EVIDENCE_AND_INTAKE_IN_ASK_DESIGN.md` (the single-transaction ruling D-T6), and `docs/architecture/AUDIT_METHODOLOGY.md`.

## How claims are labelled

Every statement about existing behaviour is **code-traced** (read in the source, function named, not run), **executed** (run, with the command) or **inferred**. Nothing here is executed: no database, browser or live service was available, so the failure-mode findings in §1.2 are code-traced and a reproducing test is part of slice 1. Statements about what the design would do are decisions, not facts.

## 0. Summary

1. **The canonical handoff is not atomic, and a retry cannot repair it** (§1.2). The Project is created in one transaction; the status change, milestone blocking, case link, case lifecycle change, readiness and case events, and the work item are separate later steps. A failure between them leaves a Project with none of the rest, and the next call returns that Project from an early exit without doing the remaining steps. This is a correctness bug on the desktop today, not a design question. Ask must not be built on it.
2. Ask can offer the handoff safely as a **declared action on the readiness answer, owner-only, planned start only**, reusing the canonical function after the §1.2 fix.
3. The "already started" and "historical record" modes **bypass the readiness gate** by design. They are consequential enough that this design asks the owner whether Ask offers them at all (D-H2).
4. The handoff takes `contractDocumentIds` and validates them against the **legacy** `Document` table only. A Home Record id is refused with a scope-mismatch error. Ask offers no document step (D-H4); this does not depend on the Project Tracker document-store design.
5. A Project is created with a **contract amount of zero** when neither the input, the scope nor a selected quote supplies one, with no signal to the person (§1.4). Ask must show the resolved amount before confirming.

## 1. What exists today

### 1.1 The path (code-traced: `renovationReadiness.service.ts` `handoffToProject`, `renovationCase.routes.ts`, `renovationCase.controller.ts`, `renovationReadiness.validators.ts`, `projectTracker.service.ts` `createProject`)

- **Route:** `POST /properties/:propertyId/renovation-cases/:caseId/project-handoff`, `requireHouseholdRole('OWNER')` (the household role, not only the primary account holder), body validated by `HandoffRenovationProjectSchema`.
- **Input:** project type (20 values), fulfillment mode (`PROVIDER` default, or `DIY`), funding mode, optional contractor id, name, licence, phone, email, optional contract amount in cents, optional contract document key and ids (up to 100), a required start date, an optional end date not before it, an intake mode (`PLANNED` default, `ALREADY_STARTED`, `HISTORICAL`), a historical reason of at least 20 characters required for the two non-planned modes, and a required idempotency key. A provider-led handoff requires `contractorName` in the input.
- **Gates:** an existing Project for the case is returned immediately. Otherwise, for `PLANNED` only, readiness must be `READY` or `READY_WITH_ACKNOWLEDGED_OPEN_ITEMS` (else 409 `RENOVATION_PROJECT_NOT_READY`) and the evaluated fulfillment mode must equal the requested one (else 409 `RENOVATION_READINESS_MODE_MISMATCH`). The two other intake modes skip both checks.
- **What it builds:** the Project's name, type, contractor, a description that says readiness does not establish compliance, the source (`RENOVATION_CASE`), the scope version and a snapshot of the scope, the inherited compliance conditions, the open readiness items as inherited dependencies, the evidence requirements, permit and HOA applicability copied from the case's requirements, the contract amount, dates, and one milestone per open condition. Open conditions make every milestone `BLOCKED`.
- **What it changes after:** the Project status (`PLANNING`, or `IN_PROGRESS` for already started), a contributor link of type `PROJECT`, the case lifecycle (`IN_EXECUTION`, or `READY_TO_START` from `PREPARING_TO_START`, unchanged for historical), a `PROJECT_HANDOFF` readiness event and a `PROJECT_HANDOFF_STARTED` case event.
- **Then, best effort:** `ensureProjectWorkItem` creates the Home Operations work item and moves it to `IN_PROJECT`; a failure is logged and swallowed.

### 1.2 Atomicity (code-traced; the finding that gates everything else)

`createProject` runs its checks and writes inside `withSerializableDedupe` and returns. Everything in §1.1's "after" list is a separate statement outside that transaction: `prisma.projectRecord.update` for the status, `projectMilestone.updateMany` for blocking, `linkContributor`, then one `prisma.$transaction([...])` for the case lifecycle and the two events, then `ensureProjectWorkItem`.

Failure scenario: `createProject` commits; the process dies, or `linkContributor` or the final transaction throws. The Project exists with status `DRAFT` (the create default), milestones not blocked, no contributor link, the case lifecycle unchanged, no readiness or case event. The person retries. The function's first statement is `findUnique({ where: { renovationCaseId } })`, which now finds the Project and returns its detail. **None of the remaining steps runs, ever.** The Project stays `DRAFT` and the case never moves to `READY_TO_START`. The desktop shows "Project linked" because `getReadiness` also finds the Project by case id, so the broken state looks successful.

Sibling check: the same early exit means a Project that was handed off correctly and one that was handed off partially are indistinguishable to callers.

Also: the work item step is best effort and is skipped on the early-exit path, so a swallowed failure is never retried.

### 1.3 Idempotency (code-traced)

Replay safety rests on `renovationCaseId` being unique on the Project (a P2002 or `ACTIVE_PROJECT_DUPLICATE` is caught and the existing Project returned) and on the early exit. The idempotency key is embedded in the project's `sourceActionId` and in the events, but is not the lookup key, so a second call with a different key and different values silently returns the first Project. That is acceptable for "one Project per case" but means a replay with changed values is not reported as a conflict. The desktop generates a new random key per attempt when the previous one failed (the key is stored in state only after success).

### 1.4 Defaults a person is not told about (code-traced)

- Contract amount: `input.contractAmountCents ?? scope.contractCostCents ?? (selected quote amount × 100) ?? 0`. With none, a Project with a zero contract amount is created and nothing says so.
- Contractor: `input.contractorName ?? selected quote vendor`. For a provider-led handoff the validator requires `contractorName` in the input, so the quote-vendor fallback is unreachable through the route for that mode; it can only be reached for DIY, where it supplies a vendor name for work the person is doing themselves.
- Funding mode is hard-coded `SELF_PAID` by the desktop.

### 1.5 Documents (code-traced; see also FRD v1.359)

`contractDocumentIds` from the input are counted against `prisma.document` (legacy). A Home Record id fails the count and the whole handoff is refused with 409 `RENOVATION_PROJECT_DOCUMENT_SCOPE_MISMATCH`. Scope documents from the case are carried only when they are legacy Documents; Home Record scope documents stay on the case and are named in the description (v1.359). The desktop form sends no document ids at all. The Project Tracker reads its documents from the legacy table, which is the separate Project Tracker document-store question; this design needs no answer to it because Ask carries no documents.

### 1.6 What Ask has today (code-traced)

`RENOVATION_READINESS_COMMAND` offers refresh, acknowledge, withdraw, reopen and mark-satisfied (v1.324, v1.358); acknowledge and withdraw are owner-only through `readinessKindNeedsOwner`. The readiness answer shows the linked Project when one exists. There is no Ask path to create it.

## 2. Outcomes required, and what is only one way to get there

- **R1.** The household owner can create the execution Project from a ready renovation case in Ask, with the same gates as the desktop.
- **R2.** The action is all-or-nothing: no Project without its link, lifecycle change and events, and a repeat never completes half of it silently.
- **R3.** Nothing a person is not shown is applied: the contract amount, contractor, mode and dates are on the review, including an unknown amount.
- **R4.** A readiness bypass is never accidental.
- **R5.** A replay returns the existing Project and says it already existed.

Mechanisms (candidates, §3): how the canonical function is made atomic, and where Ask puts the action.

## 3. Design

### 3.1 Make the canonical handoff atomic first (R2; a bug fix, not a choice)

Required, whatever Ask does. Two candidate mechanisms:

- **A (recommended): one serializable transaction.** `createProject` gains an optional `inTransaction` hook (or an extracted `createProjectInTx`) so the Project, its milestones, the status, the blocked milestones, the contributor link, the case lifecycle and both events commit together. The work item sync stays after commit, but the early exit is changed to run it (and only it) when the Project exists, because `ensureProjectWorkItem` is idempotent (`resolveAndUpsertWorkItem`, keyed transitions). A Project then either has everything or does not exist.
- **B: make completion re-drivable.** Keep the steps but give the early exit a "complete the handoff" pass that applies whichever of the status, blocking, link, lifecycle and events are missing. Smaller diff, but each step needs its own existence check and the partial state is observable between calls, which is the property R2 forbids.

A is recommended. **A repair is needed for existing partial handoffs** regardless: a read-only query for Projects with a `renovationCaseId`, no `PROJECT` contributor link and a case lifecycle that never moved, plus an owner-run pgAdmin SQL to complete them (D-H6).

### 3.2 The Ask action (R1, R3, R4, R5)

- **Where:** a new kind `HANDOFF` on `RENOVATION_READINESS_COMMAND` (no new operation, as for coverage v1.366 and the tax evidence v1.367 to v1.370), offered as **Create the execution project** on the readiness answer when the case has no Project and readiness is `READY` or `READY_WITH_ACKNOWLEDGED_OPEN_ITEMS`. When readiness is stale or not evaluated, the answer offers the existing **Refresh** instead and says why, rather than failing at confirmation.
- **Who:** household role `OWNER`, matching the route, told before a form for anyone else (the `readinessKindNeedsOwner` pattern).
- **Form:** project type (the 20 values), contractor or company (provider-led; prefilled from the selected quote's vendor when there is one, which is the fallback §1.4 shows the route cannot reach), licence (optional, prefilled from the quote), contract amount (prefilled from the scope or selected quote, with the source named), start date, optional end date. The fulfillment mode is the one readiness evaluated and is shown, not chosen, because a mismatch is refused anyway. Funding mode is `SELF_PAID`, as on the desktop (D-H7 asks whether that stays).
- **Review:** every value above, the resolved contract amount or "not set" (R3; zero is never silent), the number of open conditions that will become blocked milestones, the open dependencies that are inherited, and the sentences "Readiness organizes records and does not establish legal compliance" and "Home Record scope documents stay on the renovation case". It says no contractor is contacted and nothing is booked.
- **Confirmation:** bound to the case's lifecycle and `updatedAt`, the readiness summary state and `scopeVersionId`, and the absence of a Project. It re-runs the canonical function's own gates; a Project that appeared meanwhile is reported as "already created" with a link-free summary (R5). The write is `handoffToProject` after §3.1.
- **Intake modes (R4):** `PLANNED` only in slice 1. D-H2 asks whether Ask ever offers the two bypass modes.

### 3.3 What Ask does not do

No document selection (§1.5), no contractor search or booking, no payment, no funding choice, no change to permit or HOA applicability (copied from the case's requirements as the desktop does), and no Home Operations work item beyond what the canonical function already does.

## 4. Decisions needed from the owner

| ID | Question | Recommendation |
|---|---|---|
| D-H1 | Fix the handoff's atomicity (§3.1, mechanism A) before any Ask surface? | Yes. It is a bug on the desktop today. |
| D-H2 | Does Ask offer `ALREADY_STARTED` and `HISTORICAL` intake, which skip the readiness gate? | No in slice 1. They record work that already happened and set `IN_PROGRESS` or leave the lifecycle; a conversational flow makes the bypass too easy. Revisit with a dedicated review that states the bypass. |
| D-H3 | Is the household `OWNER` role the right floor, as the route has it, or the primary account holder as property tax uses? | Household `OWNER`, matching the route. |
| D-H4 | Ask offers no document step. | Accept. |
| D-H5 | A zero contract amount: refuse, or create with the amount "not set" shown? | Show it on the review and allow it, as the desktop does, but make the stored value distinguishable (a null rather than 0 is a schema change, so for now the review and the Project description say it was not set). |
| D-H6 | Repair existing partial handoffs with an owner-run SQL after §3.1? | Yes; a read-only detection query first. |
| D-H7 | Funding mode: keep `SELF_PAID` as the only Ask value? | Yes, as on the desktop. |
| D-H8 | A replay with different values and a different idempotency key returns the first Project. Report a conflict instead? | Report "already created" with what was created; do not apply the new values. |

## 5. Proposed slices

1. **Atomic handoff** (D-H1, D-H6): the single-transaction change, the early-exit repair for the work item, a detection query and the owner-run repair SQL, and a test that injects a failure after the Project is created and asserts nothing partial remains. No schema change expected.
2. **The Ask action** (§3.2): the `HANDOFF` kind, the form with quote-derived prefills, the review, the confirmation, tests, and the action id allowlist.
3. **Desktop alignment**: show the resolved contract amount before the button and say when it is not set (D-H5); optional.

Each slice carries its own FRD revision. Nothing here is verified against a database or a browser.

## 6. Adversarial pass

Absolute statements were checked before publishing:

- "None of the remaining steps runs, ever" (§1.2): the early exit is the first statement of `handoffToProject` and returns `getProjectDetail`. Grep for `ensureProjectWorkItem` finds only this function (definition and one call). `linkContributor` is also called by the compliance workflow service and exposed by a generic contributor-link route, so a `PROJECT` link can be created by those paths independently; that does not complete the other steps. A scheduled reconciliation job that completes handoffs was not searched for in the workers; if one exists, "ever" is too strong and the repair in D-H6 is smaller.
- "looks successful" (§1.2): `getReadiness` returns `project` from `findUnique({ where: { renovationCaseId } })` in its stale branch; the non-stale branch was not read in full, so the claim is stated for the path read.
- "no other path creates a Project from a case" (implicit in §3.2): `createProject` has callers in the Project Tracker controller, the DIY service, the inspection hub and an Ask handler. The generic `POST …/projects` route validates the body with `CreateProjectSchema`, which has no `renovationCaseId` or scope fields, and `validateBody` replaces `req.body` with the parsed (stripped) result, so that route cannot set the case. The DIY, inspection hub and Ask-handler callers were not read for `renovationCaseId`; none was found by grep for the field name in those files.
- "the desktop sends no document ids" (§1.5): read from `createProject` in the readiness page; grep for `project-handoff` in the frontend finds that page, the API client and one unrelated component test.
- Corrected during drafting: the register described the handoff as "owner-only and creates a project record", which understates it; §1.1 and §1.2 show it also advances the case, links, and writes events.

## 7. Owner rulings (October 13, 2026) and what changed because of them

| Decision | Ruling | Direction |
|---|---|---|
| D-H1 | Accept | Mechanism A, with one qualification: every database-writing helper accepts the same transaction client, and none that opens its own transaction is called from inside the serializable one. The transaction holds the Project and milestones, the final status, milestone blocking, the case contributor link, the case lifecycle update, and the readiness and case events. The work item stays post-commit; the existing-project path always retries it, failure stays observable, and the receipt claims a work item only if synchronization succeeded. Check the workers for reconciliation before keeping "never repaired". |
| D-H2 | Accept | Ask supports `PLANNED` only; the bypass modes stay out pending a dedicated design. |
| D-H3 | Accept | Household `OWNER`. |
| D-H4 | Accept | No document step in Ask for this slice. |
| D-H5 | **Amend** | Allow an unknown amount but persist it as unknown, never as zero. Make `contractAmountCents` and `currentContractAmountCents` (when the base is unknown) nullable and update calculations and presentation to distinguish unknown, known zero, known positive, and known plus approved change orders. If that is too broad for a slice, require an amount in the interim; zero is not an unknown-value sentinel. This replaces D-H5's recommendation in §4. |
| D-H6 | **Amend** | A read-only detection query is approved. Repair through governed application logic, not raw SQL: detection classifies which steps are missing; a one-off idempotent application command invokes the same transaction-aware completion logic; it has a dry run listing intended changes; the owner runs it only if candidates exist; a verification query confirms none remain. If there are no candidates, no mutation. SQL only if the application repair is impractical and every derived value is reconstructible. |
| D-H7 | **Reject the recommendation** | `SELF_PAID` must not be recorded silently. Either add `UNDECIDED` to `ProjectFundingMode` and make it this handoff's default (recommended), or ask during review. The desktop gets the same correction. |
| D-H8 | **Amend** | Three outcomes: same key and same normalized payload is an idempotent success; same key and different payload is an idempotency conflict; a different key after a Project exists is "Project already created", with its summary and a statement that the new values were not applied. The existing-project check runs after authorization and property/case scoping, never as an unconditional first statement. |
| Ask binding | Required | The confirmation binds the case id and `updatedAt`, the scope version, the readiness evaluation or version, the fulfillment mode, the selected quote id and version when prefills came from it, and the absence of a Project. |

**Order, as ruled:** slice 1 fixes the canonical transaction and replay semantics; the Ask surface waits until unknown contract amount and funding semantics are resolved honestly.

### 7.1 Slice 1 as built (FRD v1.371)

- **Workers checked:** `apps/workers/src` has no handoff or case-project reconciliation (its only renovation job is a permit-requirement reminder), so a partial handoff was never repaired by anything outside the request; the "never" in §1.2 stands for workers. It remains unsearched whether an admin script exists.
- **Transaction:** `createProjectInTx(tx, …)` (the body of `createProject`, no transaction of its own) and `afterProjectCreated` were extracted; `createProject` is now those two. `linkProjectToCaseInTx` writes the case link and its `CONTRIBUTOR_LINKED` event on a given client. `handoffToProject` runs the create, the final status, milestone blocking, the link, the lifecycle update and both events in one `withSerializableDedupe`; only the work item synchronizations run after commit, and `afterProjectCreated` failures are logged. `linkContributor`, which opens its own transaction, is no longer called from the handoff.
- **Replay semantics:** the case is scoped to the property first (`loadContext`), then an existing Project is resolved by `existingHandoffResult`: same key and same normalized-payload hash is `IDEMPOTENT_REPLAY`; same key with a different hash is a 409 `RENOVATION_HANDOFF_IDEMPOTENCY_CONFLICT`; a different key is `ALREADY_CREATED` with `appliedSubmittedValues: false`. The hash and key are recorded in the `PROJECT_HANDOFF` readiness event in the same transaction. The response gains a `handoff` object (`outcome`, `projectId`, `appliedSubmittedValues`, `workItemSynced`); the route returns 201 only for `CREATED` and 200 otherwise.
- **Incomplete handoffs:** an existing Project with no recorded `PROJECT_HANDOFF` event (a partial handoff from before this change) now returns a 409 `RENOVATION_HANDOFF_INCOMPLETE` instead of looking like success, and nothing is changed. Completing them is the governed repair (slice 3).
- **Not in this slice:** D-H5 and D-H7 (schema), the detection and repair command (D-H6), and the Ask surface. A handoff request still carries `fundingMode` defaulting to `SELF_PAID` through the validator, and a missing contract amount still persists as zero; both are the next slice.

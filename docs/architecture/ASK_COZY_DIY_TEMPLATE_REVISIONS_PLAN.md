# DIY Template Revisions — Step 1 Implementation Plan (immutable published content)

**Date:** October 6, 2026
**Status:** **Approved October 6, 2026: R1-R10 at the recommended defaults (§11).** All slices (1a-1e) are implemented (§12-§16). **Do not deploy this code before the backfill has been run, in the order in [`DIY_TEMPLATE_REVISIONS_ROLLOUT.md`](../operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md): without it the homeowner library is empty.** The owner runs the schema push, the backfill and the verification; none of it has been run against a development or production database. The schema edit exists in `prisma/schema.prisma` but has **not** been applied to any database.
**Parent design:** [`ASK_COZY_STATEFUL_GUIDE_DESIGN.md`](ASK_COZY_STATEFUL_GUIDE_DESIGN.md) §13, step 1; decision **O2-A** (approved October 6, 2026)
**Why this comes first:** until published content is provably the content that was reviewed, no Ask surface may call a DIY guide "author-reviewed" (design D1).
**Method:** `AUDIT_METHODOLOGY.md` design items 11-20. Labels: **[Code-traced]** read, not run; nothing here was executed. No service, database or browser was run, and **production template contents are unknown** (the repository seeds none).

## 1. Goal and boundary

**Goal.** Make it true, and testable, that every DIY template version a homeowner can see or start a project from is an **approved, frozen revision**, and that every project records which revision it copied.

**In scope for step 1:** the revision model and its immutability; the lifecycle semantics that create, approve, publish and retire revisions; the admin edit behavior; homeowner reads and `createProject` reading the published revision; a backfill for templates that are live today; the admin UI changes needed so editors are not surprised; tests.

**Out of scope (later steps):** attribution columns, `DiyProjectStep.updatedAt` and version-checked transitions (step 2); the completion outbox (step 3); maintenance reconciliation (step 4); any Ask surface (steps 5-6); revision history screens; the AI-guide path (unchanged).

## 2. What exists today

| # | Finding | Label |
| --- | --- | --- |
| C1 | Homeowner reads of template content are only in `diy.service.ts`: `listTemplates`, `getFeaturedTemplates`, `getTemplateDetail`, and `createProject` (template branch). All read the **live template row** with `status: 'ACTIVE'`, plus `safetyLevel: 'LOW'` and a not-required permit for the library lists, then `evaluateDiyEligibility`. Other readers of the template table are the governance queue lists and the admin work-queue counts. | Code-traced |
| C2 | Lifecycle (`adminContentGovernance.service.ts`): `SUBMIT_FOR_REVIEW` DRAFT→REVIEW, `APPROVE` REVIEW→APPROVED (sets `approvedBy`, `approvedAt`), `RETURN_TO_DRAFT` REVIEW→DRAFT, `PUBLISH` APPROVED→ACTIVE, `UNPUBLISH` ACTIVE→APPROVED, `ARCHIVE` ACTIVE or APPROVED→ARCHIVED, `REVIVE_TO_DRAFT` ARCHIVED→DRAFT. Returning to DRAFT clears the approval; HIGH-safety `PUBLISH` needs an actor other than `approvedBy`. | Code-traced |
| C3 | A transition is `findUnique` then `update` with no transaction and no compare-and-set on `status`, then a separate audit write. Two concurrent actions can both pass the `from` check. | Code-traced |
| C4 | `adminUpdateTemplate` (PUT) replaces the row's core fields and deletes and recreates steps, materials and tools **in any status**, without touching `status` or the approval. So content can change under REVIEW or APPROVED, and an ACTIVE template's live content, including `safetyLevel` and `permitRequirement`, can change with no re-review. The admin form (`TemplateForm.tsx`) offers save regardless of status. | Code-traced |
| C5 | Approval is attached to the template (`approvedBy`, `approvedAt`), not to a content snapshot; nothing stores or compares a content hash or revision. | Code-traced |
| C6 | `UNPUBLISH` returns to APPROVED and keeps the approval; because PUT is unrestricted, content can then be edited and republished without review. | Code-traced (consequence of C2, C4) |
| C7 | Existing governance tests use a stubbed Prisma (`tests/integration/adminContentGovernance.integration.test.js`), including the DIY submit, approve, publish, unpublish, archive and revive path and the editorial queues. | Code-traced |
| C8 | Non-content fields on the template: `featuredOrder` (merchandising) and `geminiPromptHint` (an AI prompt hint). `slug` is create-only. | Code-traced |

## 3. Target model (decision O2-A, made concrete)

**Principle:** the template row is the **working copy**; a **revision** is an immutable, hashed snapshot of that copy that went through review; the **published head** is the one revision homeowners see. Status describes the working copy's next revision; "live" is whether a head exists. (Same idea as a published tag versus a working branch.)

### 3.1 New record `DiyTemplateRevision`

| Field | Meaning |
| --- | --- |
| `id`, `templateId`, `revision Int` | `@@unique([templateId, revision])`; the number is allocated inside the creating transaction, and a race fails on the unique key instead of duplicating |
| list and filter columns | `slug`, `title`, `shortDescription`, `category`, `difficultyLevel`, `requiredSkillLevel`, `safetyLevel`, `permitRequirement`, `estimatedMinutes`, the four cost-range columns, `tags` (so homeowner list queries filter and sort on the revision without parsing JSON) |
| `contentJson` | the rest of the snapshot: `longDescription`, `steps[]`, `materials[]`, `tools[]` as authored |
| `contentHash` | SHA-256 over a canonical serialization of all of the above; computed by the application only |
| `provenance` | `GOVERNED` or `LEGACY_BACKFILL` (§6); a legacy revision is never presented as reviewed |
| `submittedBy/At`, `approvedBy/At`, `publishedBy/At` | who and when, per transition |
| `returnedAt` | set when the reviewer returns it to draft |
| `retiredAt`, `retiredReason` | `SUPERSEDED` (a newer revision was published), `UNPUBLISHED`, `ARCHIVED` |

### 3.2 Template and project pointers (both sides, methodology item 20)

- `DiyProjectTemplate.publishedRevisionId String? @unique`, relation to the head revision. A template is **live** when this is non-null.
- `DiyProject.templateRevisionId String?` records the revision a project copied; null means a project from before this change or from an AI guide, and such a project is **not guideable** in Ask.
- `DiyProjectTemplate.approvedBy/approvedAt` stay as a **mirror** of the candidate revision's approval so the existing queue and admin UI keep working; the revision is the source of truth.

### 3.3 Content versus non-content fields

Content (frozen once submitted; changes force a new revision): every field in the admin create schema except the two below. **Non-content** (editable at any time, never part of a revision, never forcing re-review): `featuredOrder` and `geminiPromptHint`. `slug` stays create-only.

### 3.4 Lifecycle semantics

| Action | From | Effect |
| --- | --- | --- |
| Edit content (PUT) | `DRAFT` | Update the working copy in place, as today |
| Edit content (PUT) | `ACTIVE` | Update the working copy **and atomically set `status` to `DRAFT` and clear the approval mirror**; the published head stays live and unchanged |
| Edit content (PUT) | `REVIEW`, `APPROVED`, `ARCHIVED` | **Refused** (`TEMPLATE_CONTENT_FROZEN`): the reviewed content cannot change under the reviewer. Return it to draft first |
| `SUBMIT_FOR_REVIEW` | `DRAFT` | Create candidate revision N+1 from the working copy (hash computed); status `REVIEW` |
| `APPROVE` | `REVIEW` | Record approval on the candidate; status `APPROVED`; mirror the approval onto the template |
| `RETURN_TO_DRAFT` | `REVIEW` or **`APPROVED`** (new) | Mark the candidate returned (kept as history); status `DRAFT`; clear the mirror |
| `PUBLISH` | `APPROVED` | Verify the candidate is approved and its hash still matches the working copy; HIGH-safety separation uses the **revision's** approver; set the template's head to the candidate; retire the previous head as `SUPERSEDED`; status `ACTIVE` |
| `UNPUBLISH` | any status **with a head** | Retire the head (`UNPUBLISHED`), clear the pointer; `ACTIVE` becomes `APPROVED` as today, other statuses are unchanged |
| `ARCHIVE` | `ACTIVE` or `APPROVED`, **or any status with a head** | Retire the head (`ARCHIVED`) if there is one; status `ARCHIVED` |
| `REVIVE_TO_DRAFT` | `ARCHIVED` | As today |

The widened `UNPUBLISH` and `ARCHIVE` matter: a published template whose working copy is being edited (`DRAFT` with a head) must still be withdrawable immediately for a safety correction. Every transition becomes **one transaction with a conditional write on the expected status** (fixing C3); the admin audit record is written after commit as today.

### 3.5 Immutability, honestly

- A revision's content columns and `contentJson` are written once, in one service module that exposes **create and approval-metadata transitions only, with no content update**. A test fails if any other code writes `diyTemplateRevision` content.
- Because Prisma cannot make columns write-once, immutability is **tamper-evident, not tamper-proof**: `contentHash` is recomputed and compared at `PUBLISH` and at every `createProject`; a mismatch refuses the operation.
- An optional database trigger rejecting updates to content columns would add a hard guarantee but is a hand-run SQL artifact outside the schema; deferred (decision R7).

## 4. Code changes by path

| Path | Change |
| --- | --- |
| `adminContentGovernance.service.ts` `transitionDiyTemplate` | Per §3.4; transactional with conditional write; revision create and approval writes inside the same transaction; the HIGH-safety check reads the candidate revision's `approvedBy` |
| `diy.service.ts` `adminUpdateTemplate` | Per the edit rows in §3.4; separate non-content update path for `featuredOrder` and `geminiPromptHint`; no behavior change for `DRAFT` |
| `diy.service.ts` `listTemplates`, `getFeaturedTemplates`, `getTemplateDetail` | Read the **published head revision** (filter and sort on its columns; featured order and head pointer from the template). Response shapes stay as today: `id` is the template id, `steps`, `materials`, `tools` come from `contentJson` with stable synthetic ids; list items carry no new required fields |
| `diy.service.ts` `createProject` (template branch) | Require a head; verify `contentHash`; run eligibility on the **revision's** fields; copy steps, materials and tools from the revision; set `DiyProject.templateRevisionId`; `templateStepId` becomes the synthetic id (it has no reader today) |
| `adminListTemplates`, `adminGetTemplate` | Include the head's revision number, provenance and publish time, and the candidate's state |
| Queues (`getEditorialQueues`, work-queue counts) | Unchanged: they read `status` and the approval mirror |

## 5. Admin UI changes (`TemplateForm`, `TemplateStatusActions`, list)

- `REVIEW` or `APPROVED`: the form is read-only with "Return to draft to edit" and the action available to reviewers.
- `ACTIVE`: a banner, "Saving creates a new draft. The live version (revision N) stays published until you publish the new one."
- List and detail show **Live: revision N (reviewed | legacy)** next to the status badge, so `DRAFT` with a live head is understood.
- `RETURN_TO_DRAFT` appears for `APPROVED`; `UNPUBLISH` and `ARCHIVE` appear whenever a head exists.
- A revision history screen is **not** part of step 1.

## 6. Existing data, rollout and rollback

**Problem.** Templates live today have no revision. If the code that requires a head ships first, the homeowner library is empty and no project can start.

**Backfill.** One idempotent, hand-run `docs`/`prisma` SQL file (the repository's pgAdmin convention: no `ts-node`/`npm` seed) that, for each template with `status = 'ACTIVE'` and no head, inserts revision 1 from the live row and its steps, materials and tools, with `provenance = 'LEGACY_BACKFILL'`, `approvedBy/At` copied from the template, `contentHash` **null**, and sets the head pointer. SQL cannot reproduce the application's canonical hash, so a legacy revision makes **no integrity claim**; `createProject` accepts a null hash only for `LEGACY_BACKFILL` and records that revision, and Ask treats it as not reviewed. A legacy template becomes reviewed only by going through the governed flow again (edit, submit, approve, publish creates a `GOVERNED` revision). This is honest about what the old approval can prove (it was attached to the template, not to the content).

**Order the owner runs:** (1) edit `prisma/schema.prisma` and apply with `npx prisma db push`, then `npx prisma generate` in `apps/backend` and `apps/workers`; (2) run the backfill SQL, then the verification query (no `ACTIVE` template without a head); (3) deploy backend and frontend with a rollout restart. Skipping (2) empties the library, so the plan also adds a startup warning if an `ACTIVE` template has no head.

**Rollback.** The new columns and table are additive. Reverting the code restores reads from the live row, which the backfill never changed; the table can be left in place.

## 7. Tests

1. Revision creation and numbering: submit creates revision N+1 with a hash; concurrent submits yield one revision and one clean failure.
2. Approval binding: approving records the approver on the revision; publish refuses if the working copy's hash no longer matches the approved candidate.
3. Frozen content: PUT in `REVIEW`, `APPROVED` and `ARCHIVED` is refused; PUT in `DRAFT` works; PUT in `ACTIVE` sets `DRAFT`, clears the mirror and leaves the head unchanged.
4. Publish and supersede: the previous head is retired as `SUPERSEDED`; HIGH-safety publish by the approver is refused using the revision's approver.
5. Withdrawal: `UNPUBLISH` and `ARCHIVE` work for a `DRAFT` template that has a head, and the template disappears from the library at once.
6. Atomic transitions: two simultaneous actions yield one success (conditional write), and a failure inside the transaction leaves no half-applied state.
7. Homeowner reads: list, featured and detail return head-revision content and ignore a divergent working copy; response shapes unchanged; a template without a head is not listed.
8. `createProject`: refuses without a head; refuses a `GOVERNED` revision whose hash is missing or does not match; accepts a `LEGACY_BACKFILL` revision with a null hash (§6); copies revision content, sets `templateRevisionId`; eligibility runs on the revision's safety and permit fields (changing them in a draft does not affect live behavior).
9. Immutability guard: a test that no source file other than the revision service writes revision content columns.
10. Backfill: a dry run of the SQL on a scratch Postgres (scratch database only), then re-run to prove idempotency.
11. Existing governance and queue tests updated, not deleted.

**Not tested by these:** the real admin UI in a browser (component tests only), and production data.

## 8. Risks and the adversarial pass

- **Library outage if the order is wrong** (§6): mitigated by the ordering, the verification query and the startup warning.
- **Behavior change for editors:** editing a live template no longer changes what homeowners see until a new revision is published; reviewers must now review before changes go live (intended, per O2 and review finding 1).
- **Larger read refactor:** three homeowner read paths move to revisions; mitigated by unchanged response shapes and tests (§7.7).
- **Two lifecycles on one row (status versus head):** the status badge can mislead; mitigated by the "Live: revision N" indicator and the banner.
- **Methodology items:** *11*, the approval mirror's existing consumers (queues, admin UI) keep their meaning; *14*, publish is idempotent by `(templateId, revision)`, not by "currently active"; *16*, the only new uniqueness is `(templateId, revision)` and `publishedRevisionId`, each at the right grain; *19*, transitions use a conditional write so a stale actor cannot overwrite a newer state; *20*, pointers exist on both sides (`templateId` on the revision, `publishedRevisionId` on the template, `templateRevisionId` on the project).
- **Falsification checks to run before coding:** that no other code path writes template content (searched `apps/backend/src` and `apps/workers/src`: only `diy.service.ts` and the governance service touch the template tables [Code-traced]); that the admin frontend does not depend on PUT working in `REVIEW` or `APPROVED` (to be checked in the form tests); that no seed or script mutates ACTIVE templates (none found in `prisma/*.sql`, `prisma/*.ts`, `src/data`).

## 9. Slices and what I will hand you

| Slice | Deliverable |
| --- | --- |
| 1a | Schema edits and the revision service with tests (1-2, 9). **Done, see §12** |
| 1b | Transaction-safe transitions and the edit semantics (tests 3-6). **Done, see §13** |
| 1c | Homeowner reads and `createProject` on revisions (tests 7-8). **Done, see §14** |
| 1d | Admin UI changes with component tests. **Done, see §15** |
| 1e | Backfill SQL, verification query, startup warning, rollout notes; then the exact `prisma db push` and `prisma generate` commands for you to run. **Done, see §16** |

Each slice is reported with what was run and not run, and none is committed or pushed without your instruction.

## 10. Decisions (all answered at the recommended default; see §11)

| ID | Decision | Recommended |
| --- | --- | --- |
| **R1** | Working-copy model: **E3** (status describes the working copy; "live" is the head pointer; a live template can be edited as a draft while the head stays published) versus **E2** (an edit requires unpublishing first, leaving a gap in the library) | **E3** |
| **R2** | Homeowner list, featured and detail read the published revision's columns | Yes |
| **R3** | Legacy backfill: `LEGACY_BACKFILL` revisions with null hash, accepted by `createProject` so the library keeps working, never presented as reviewed in Ask until re-published through governance | Yes |
| **R4** | Editing an `ACTIVE` template sets it to `DRAFT` automatically (versus an explicit "Start new revision" action first) | Automatic; the banner explains it |
| **R5** | `RETURN_TO_DRAFT` allowed from `APPROVED` (reviewer capability) | Yes |
| **R6** | SHA-256 content hash verified at publish and at every `createProject` | Yes |
| **R7** | Database trigger for write-once revision content | Defer; code, hash and tests for now |
| **R8** | Backfill as a hand-run idempotent SQL file with a verification query and a startup warning, applied before the code deploys | Yes |
| **R9** | `featuredOrder` and `geminiPromptHint` are non-content and never force a new revision | Yes |
| **R10** | Revision history screens in the admin UI | Defer |

## 11. Approval record (October 6, 2026)

The owner approved **R1 through R10 at the recommended defaults**:

| ID | Approved |
| --- | --- |
| R1 | **E3:** status describes the working copy; "live" is the published-head pointer; a live template can be edited as a draft while the head stays published |
| R2 | Homeowner list, featured and detail read the published revision's columns |
| R3 | `LEGACY_BACKFILL` revisions with a null hash, accepted by `createProject` so the library keeps working, never presented as reviewed in Ask until re-published through governance |
| R4 | Editing an `ACTIVE` template sets it to `DRAFT` automatically, with a banner explaining it |
| R5 | `RETURN_TO_DRAFT` allowed from `APPROVED` (reviewer capability) |
| R6 | SHA-256 content hash verified at publish and at every `createProject` |
| R7 | No database trigger for write-once revision content for now; code, hash and tests |
| R8 | Backfill as a hand-run idempotent SQL file with a verification query and a startup warning, applied before the code deploys |
| R9 | `featuredOrder` and `geminiPromptHint` are non-content and never force a new revision |
| R10 | No revision history screens in the admin UI for now |

**Constraints that carry into implementation**

- Each slice (1a-1e) is reported with what was run and not run, and nothing is committed or pushed without an instruction.
- Schema changes are made by editing `prisma/schema.prisma` only; the owner applies them with `prisma db push` and runs `prisma generate` in `apps/backend` and `apps/workers`. No migration scripts. The backfill is the one hand-run SQL artifact.
- The rollout order in §6 is binding: schema, backfill and verification, then the code deploy. A scratch Postgres (never the owner's database) may be used to dry-run the backfill SQL.
- The two checks still to run before coding, from §8, are part of slice 1a: confirm that no other code path writes template content, and that the admin frontend does not depend on PUT working in `REVIEW` or `APPROVED`.

## 12. Slice 1a record (October 6, 2026)

**Pre-coding checks (the two left open in §8)**

- *No other code path writes template content.* Searched the whole repository excluding `node_modules` and docs for writes to the template, step, material and tool tables (and their SQL table names): template content is written only in `diy.service.ts` (`adminCreateTemplate` at lines 583-588, `adminUpdateTemplate` at 599-610), and `adminContentGovernance.service.ts` updates only status and approval (line 166). No script, seed, worker or `database/` file touches them [Code-traced].
- *The admin frontend does not depend on PUT working in `REVIEW` or `APPROVED`.* The edit page renders `TemplateForm` and calls `adminUpdateDiyTemplate` without branching on status, and nothing requires an edit in those states; slice 1d adds the read-only handling [Code-traced].

**Changed**

- `apps/backend/prisma/schema.prisma` (additive; `prisma validate` passes): enums `DiyRevisionProvenance` (`GOVERNED`, `LEGACY_BACKFILL`) and `DiyRevisionRetiredReason`; model `DiyTemplateRevision` (typed list and filter columns, `contentJson`, nullable `contentHash`, lifecycle metadata, `@@unique([templateId, revision])`); `DiyProjectTemplate.publishedRevisionId` (unique) with its relations; `DiyProject.templateRevisionId` with relation and index.
- `apps/backend/src/services/diyTemplateRevision.service.ts` (new, the only writer of revisions): canonical serialization and SHA-256 content hash; `checkRevisionIntegrity` (`VERIFIED`, `LEGACY_UNVERIFIED`, `MISMATCH`); `createCandidateRevision` (one open candidate per template, number allocated at insert, unique-key race becomes `REVISION_CONFLICT`); `approveRevision` and `returnRevision`; `publishRevision` (governed, approved, open, intact, equal to the working copy, HIGH-safety separation by the revision's approver, previous head retired as `SUPERSEDED`); `retireHead`. Every state change is a conditional write; the module has no function that changes revision content.
- `apps/backend/tests/unit/diyTemplateRevision.test.js` (new, 18 tests, database-free fake).

Not wired into anything yet: the governance transitions, the admin PUT, the homeowner reads and `createProject` are unchanged, so **no behavior changes until slices 1b-1c**.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| New test file | 18 pass, 0 fail | Executed |
| Mutation checks: drop the working-copy hash check; drop the open-candidate condition on approve; drop the head-conflict condition on publish; add a rogue `diyTemplateRevision.update` elsewhere in `src` | each caused exactly one test to fail; the restored service passes 18 of 18 | Executed |
| Backend `npm run typecheck` (after regenerating the local Prisma client, no database) | clean | Executed |
| Neighbors: admin content governance integration, DIY route role floor, DIY capability, AI guide, hire-required boundary, Ask DIY projects, startup registry | 68 pass in total with the new file, 0 fail | Executed |

**Not run:** any database, `prisma db push`, or the real Prisma client against Postgres. The fake enforces the unique key and evaluates the same `where` equality the service uses, but it is not Postgres: real behavior of the P2002 mapping, null equality in `updateMany`, and transaction isolation is **not exercised** until a scratch-database run in slice 1e.

**Owner action:** none is required now. The schema change is additive and safe to apply at any time, but it is **required before slice 1b is deployed**. When you want it: `npx prisma db push` in `apps/backend`, then `npx prisma generate` in `apps/backend` and `apps/workers`. I ran `prisma generate` locally (no database) only so the service typechecks.

## 13. Slice 1b record (October 6, 2026)

**Changed**

- `adminContentGovernance.service.ts` `transitionDiyTemplate` rewritten per §3.4: one transaction that first **claims** the template with a conditional write on the expected status (a concurrent action waits for the row, then fails the check), then does the revision work in the same transaction (`SUBMIT_FOR_REVIEW` creates the candidate, `APPROVE` approves it, `RETURN_TO_DRAFT` closes it, `PUBLISH` promotes it, `UNPUBLISH` and `ARCHIVE` retire the head), so a failure rolls the claim back too. `RETURN_TO_DRAFT` is allowed from `APPROVED`. `UNPUBLISH` and `ARCHIVE` work from any status that has a live head. HIGH-safety separation uses the **revision's** approver. The audit record carries the revision number. Revision errors map to client error codes (`REVISION_REQUIRED`, `REVISION_CONFLICT`, `REVISION_NOT_APPROVED`, `INTEGRITY_FAILED`, `WORKING_COPY_CHANGED`), added to the controller's client-error set.
- `diy.service.ts` `adminUpdateTemplate` per §3.4: `DRAFT` edits in place; `ACTIVE` edits atomically become `DRAFT` with approval cleared and the head untouched; `REVIEW`, `APPROVED` and `ARCHIVED` are refused with `409 TEMPLATE_CONTENT_FROZEN`; `featuredOrder` and `geminiPromptHint` change in any status. The claim and the content writes are one transaction.
- `diyTemplateRevision.service.ts`: three additions the transitions needed: `findOpenCandidate`, `findPublishableRevision`, `retireOpenCandidate`, and republishing of an unpublished revision.
- Tests: `tests/helpers/diyTemplateFake.js` (shared transaction-aware fake), `tests/unit/diyTemplateLifecycle.test.js` (new, 20 tests), 4 more revision-service tests (22 in total), and the existing governance integration test moved onto the shared fake (its DIY cases now go through submit, so they exercise the revision path).

**Two things the plan did not spell out, decided while implementing (please confirm)**

1. **Unpublish then publish again.** The plan said `UNPUBLISH` takes an `ACTIVE` template to `APPROVED` "as today", but a published revision is no longer an open candidate, so `PUBLISH` from that `APPROVED` would have had nothing to promote. Rule adopted: an approved, governed revision that was **unpublished** (not superseded or archived) can be **republished without a new review**, and the working copy must still equal it (it is frozen in `APPROVED`, so it does). Republishing clears the retirement and records the new publisher and time; the first publication time is not kept on the revision (the admin audit log keeps every action). A revision that was superseded or archived is closed for good; reviving an archived template needs a new review.
2. **Templates that were already in `REVIEW` or `APPROVED` before revisions exist have no candidate revision.** `APPROVE` on such a template is refused with `REVISION_REQUIRED` ("return it to draft and submit it again"), and `PUBLISH` on an `APPROVED` one is refused the same way, because no one approved this content as a snapshot. `RETURN_TO_DRAFT` works, so these templates are recoverable by an admin in two clicks. A legacy `ACTIVE` template with no head can still be unpublished or archived. This adds a step to the rollout (§6): **before deploying 1b, list templates in `REVIEW` or `APPROVED`**; they will need to be returned and resubmitted, or have finished review first. The slice 1e verification query will include them.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| New and updated tests: lifecycle (20), revision service (22), governance integration (8) | 50 pass, 0 fail | Executed |
| Mutation checks: claim ignores the expected status (4 tests fail); frozen check skipped (3); `ACTIVE` edit does not diverge (4); `UNPUBLISH` of a draft needs no head (1); `ARCHIVE` forgets the open candidate (1); non-content fields forced to re-review (1) | each caught; restored code passes 50 of 50 | Executed |
| Backend `npm run typecheck` | clean | Executed |
| Neighbors (DIY role floor, DIY capability, AI guide, hire-required boundary, Ask DIY projects, startup registry) with the above | 92 pass in total, 0 fail | Executed |

**Not run:** Postgres, so real row-lock timing, `READ COMMITTED` re-evaluation of the conditional claim, and the Prisma error mapping are modeled by the fake, not exercised (a scratch-database run is part of slice 1e). The admin UI still lets an editor click save in a frozen state and show the 409 as an error; the read-only handling is slice 1d. Homeowner reads and `createProject` still read the live row (slice 1c), so **until 1c ships, a live template that an admin edits as a draft still shows the edited content to homeowners**; the head pointer is maintained but not yet read. Deploying 1b without 1c therefore does not yet deliver the guarantee; 1b and 1c should be released together.

## 14. Slice 1c record (October 6, 2026)

**Changed**

- New `apps/backend/src/services/diyPublishedTemplate.ts`: the mappers that turn a template and its published head revision into the homeowner response (summary and detail), plus the synthetic ids for steps, materials and tools (`<revisionId>:step:<n>`, `:material:<i>`, `:tool:<i>`).
- `diy.service.ts`: `listTemplates`, `getFeaturedTemplates` and `getTemplateDetail` read the **published head** and filter, search and sort on the **revision's** columns (`publishedRevision: { is: ... }`, ordered by the revision's title, paged by template id as before); featured order still comes from the template row. A template is live only when it has a head.
- `diy.service.ts` `createProject` (template branch): requires a head; refuses a **governed** revision whose stored content does not match its hash (`409 DIY_TEMPLATE_UNAVAILABLE`, logged) and accepts a **legacy-backfill** revision with no hash (decision R3); runs the eligibility policy on the **revision's** safety, permit and category; copies steps, materials and tools from the revision snapshot; records `DiyProject.templateRevisionId`; `templateStepId` is the synthetic step id.
- Tests: new `tests/unit/diyPublishedTemplateReads.test.js` (14 tests); the shared fake gained nested relation filters, `contains`, `has`, ordering by a relation, cursor paging and project creation.

**Deliberate response-shape tightening (please confirm).** The homeowner template **detail** used to return the whole template row, which included the admin fields `approvedBy` (an admin's user id), `approvedAt`, `status`, `geminiPromptHint` and timestamps. No homeowner page reads them (searched the DIY pages and `TemplateCard`). The detail now returns the fields the pages use, plus an additive `revision` number; list items keep the same fields as before. Children carry synthetic ids instead of database ids (the pages use the ids only as React keys).

**Behavior notes**

- A homeowner now sees what was **published**, not what an admin is editing: editing a live template, even changing its category or safety level, changes nothing homeowners see or can start until a new revision is approved and published. Withdrawing the head removes the template from the list, featured and detail at once.
- The query-level safety and permit filters now keep a not-listable head from taking a slot in a page (a test covers it); the eligibility policy is still applied after the query as before.
- A project started from a legacy-backfill revision records `templateRevisionId`, and the revision's `provenance` says `LEGACY_BACKFILL`, so Ask can treat it as not reviewed.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| New reads and `createProject` tests | 14 pass, 0 fail | Executed |
| Mutation checks: list ignores the head's safety (caught by the new paging test); `createProject` eligibility reads the working copy (1 test); integrity check removed (1); summary reads the working copy's title (3); project does not record the revision (2); detail leaks admin fields (1) | each caught. A seventh, dropping the head requirement from the list query, is an **equivalent mutant**: the relation filter already requires a head, so behavior is unchanged | Executed |
| Backend `npm run typecheck` | clean | Executed |
| All DIY, governance and revision suites together, plus the Ask DIY and startup-registry tests | 106 pass, 0 fail | Executed |

**Not run:** Postgres. In particular the relation filter (`publishedRevision: { is: ... }`), ordering by a relation field, and cursor paging over it are exercised by the fake, not by Prisma against a real database; they are standard Prisma forms but must be confirmed in the slice 1e scratch-database run. The frontend was not touched or run.

**Release constraint.** With 1b and 1c the guarantee is now in the code, but **templates that are live today have no head until the slice 1e backfill is run**, so deploying this code first would show homeowners an empty library and block every template project. The code is safe on `main`; deploying it is not safe until 1e.

## 15. Slice 1d record (October 6, 2026)

**A defect found while building this slice (fixed in the backend).** `TemplateForm` always sends the whole template, so a save that only changed `featuredOrder` still carried every content field. With the 1b edit rules that would have refused the save in review or approved and pushed a live template to draft. `adminUpdateTemplate` now compares the content that would be stored with the content that is stored (the revision content hash) and applies the frozen and divergence rules, and replaces the child rows, **only for a real content change**. A save that repeats the stored content changes only non-content fields, in any status, and leaves a live template live with its rows untouched.

**Changed**

- Backend: `adminListTemplates` and `adminGetTemplate` return `liveRevision` (`revision`, `provenance`, `publishedAt`, or null) and no longer return the nested relation.
- `AdminDiyTemplateSummary` and `AdminDiyTemplateDetail` carry `liveRevision`.
- New `LiveRevisionBadge`: "Live: revision N · reviewed", "Live: revision N · legacy, not re-reviewed" (amber), and a red "Live: no published revision" for an `ACTIVE` template that has none (the state before the backfill runs). Shown next to the status badge in the templates table and on the edit page.
- New `templateAdminActions.actionsForTemplate`, used by the row menu: a reviewer can **Return to draft** an approved template, and a template with a live head always offers **Unpublish** (and **Archive**) whatever its draft's status.
- New `TemplateStateNotice` above the edit form: `ACTIVE` ("Saving creates a new draft. The live version (revision N) stays published until you publish the new one."), a draft with a live version ("This draft is not live until it is reviewed and published."), review and approved (content frozen, how to return it to draft, link to Pending Reviews), archived (revive first).
- `TemplateForm`: in review, approved and archived the reviewed fields (core, difficulty and safety, time and cost, tags, steps, materials, tools) are in disabled fieldsets; featured order and the Gemini hint stay editable and a save sends **only those two fields**.
- The templates list reloads after any lifecycle action (the live revision can change while the status does not).
- Pending Reviews: the DIY "awaiting publish" queue gains **Return to draft**, which also gives a way out for a template that was approved before revisions existed (its publish is refused with "return it to draft and submit it again").

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| Backend lifecycle tests, now 24 (4 new: no-op save keeps a live template live with rows untouched, frozen states accept a non-content save, a real change still diverges, admin list and detail show the live revision) | pass | Executed |
| Backend mutation checks: any save carrying content counts as a content change (2 tests fail), list drops `liveRevision` (1), detail leaks the nested relation (1) | each caught | Executed |
| Frontend component tests (14): action matrix, row menu, badge, table, edit form in review, approved, archived, active, draft-with-live, draft and new | 14 pass | Component-tested |
| Frontend mutation checks: frozen states not locked (3 fail), locked save sends all content (3), approved cannot be returned (2), live draft cannot be unpublished (2) | each caught | Component-tested |
| `next build` | compiled and type-checked | Static |
| Frontend `jest` on `src/components/features`, `src/lib/property`, `src/app` | 260 pass, 1 fail: `propertyContextForm.test.ts`, the same source-text check on unrelated property create and edit pages that fails without this work | Component-tested |
| Backend typecheck; all DIY, governance and revision suites with Ask DIY and startup registry | clean; 110 pass, 0 fail | Executed |

**Not run:** a browser, so the look of the badges, notice and disabled form is unverified. The Pending Reviews page change is one added action in an array (type-checked, no page-level test). Which admin may perform which action is unchanged and still enforced by the server per endpoint; the menu lists every lifecycle action valid for the state, so an admin without the capability sees the server's refusal. Postgres was not run (see §12-14).

**Remaining before release: slice 1e** (the backfill SQL and verification query, the startup warning, a scratch-database dry run, and the exact commands for the owner).

## 16. Slice 1e record (October 6, 2026)

**Delivered**

- `apps/backend/prisma/diy-template-revisions-backfill.pgadmin.sql`: hand-run, one transaction, idempotent. Inserts revision 1 (`LEGACY_BACKFILL`, null hash, approval copied for the record, deterministic id `legacy-<templateId>-1`) for every `ACTIVE` template with no head and no revision, then sets the head. It never changes template content or status and does not touch `DRAFT`, `REVIEW`, `APPROVED` or `ARCHIVED` templates.
- `apps/backend/prisma/diy-template-revisions-verify.pgadmin.sql`: read-only checks (live without head, broken head, snapshot mismatch, templates that must be returned and resubmitted, information).
- `apps/backend/src/services/diyTemplateRevisionStartupCheck.ts`, called when the server starts: **warns, never blocks or writes**, about `ACTIVE` templates without a head and about `REVIEW` or `APPROVED` templates with no open revision.
- `docs/operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md`: the binding order, the exact commands, expected results, rollback, and how to repeat the scratch run.
- `apps/backend/tests/scratch/diyTemplateRevisions.scratch.js`: the real-Postgres run (not part of `npm test`), with hard guards against any non-scratch database.

**The real-Postgres run found a defect that the fakes could not (fixed).** `createProject` created the project inside `prisma.$transaction` and then read it back with `getProjectDetail` through the **global** client. On real Postgres a row inserted in an open transaction is invisible to another connection until commit, so the read returned nothing and the method threw "Project not found", rolling the project back. I reproduced the mechanism on the scratch database (`inside: true, outside: false`), confirmed the same line exists in both branches (template and AI guide) before any of my slices, and fixed it by reading through the transaction client (`getProjectDetail(..., db)`). The shared fake now models that isolation, and a unit test fails without the fix. I have not observed production, so whether project creation was failing there is not established; if it was, it will start working after this deploys.

**Validation**

| Check | Result | Kind |
| --- | --- | --- |
| Real-Postgres scratch run (Postgres 15, full schema generated by `prisma migrate diff`, 18 checks) | 18 pass: outage reproduced before the backfill; backfill correct and idempotent; verification clean afterwards; library filters, search, ordering, cursor paging, featured order on real Postgres; project creation from a legacy revision and from an AI guide; hash round trip through `jsonb`; review and approved templates refused then recovered; edit, withdraw, republish; simultaneous approvals and submissions (real row locking); real unique-key collision mapped to `REVISION_CONFLICT`; tampering detected | Executed (scratch database) |
| First scratch run, before the fix | 4 of 17 failed: three from the `createProject` defect, one from a mistake in my test (it counted the legacy revision's copied approval) | Executed |
| Start-up check unit tests (5) and the new transaction-visibility test | pass; the transaction test fails without the fix | Executed |
| Backend `npm run typecheck`; DIY, governance, revision, Ask DIY and startup-registry suites | clean; see the final run recorded below | Executed |

**Limits.** The scratch copy of the schema replaces two PostGIS `geography` columns in unrelated tables with text and omits their two spatial indexes (PostGIS was not available locally). The database is empty apart from seeded rows, so **performance on production-sized data was not measured**. The audit writer and property applicability are stubbed. No browser, no Pi deployment, and no run against your development or production database.

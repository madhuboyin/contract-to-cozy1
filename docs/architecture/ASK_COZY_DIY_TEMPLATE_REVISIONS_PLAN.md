# DIY Template Revisions — Step 1 Implementation Plan (immutable published content)

**Date:** October 6, 2026
**Status:** **Approved October 6, 2026: R1-R10 at the recommended defaults (§11).** Nothing is built and no schema is changed yet; implementation starts at slice 1a.
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
| 1a | Schema edits and the revision service with tests (1-2, 9) |
| 1b | Transaction-safe transitions and the edit semantics (tests 3-6) |
| 1c | Homeowner reads and `createProject` on revisions (tests 7-8) |
| 1d | Admin UI changes with component tests |
| 1e | Backfill SQL, verification query, startup warning, rollout notes; then the exact `prisma db push` and `prisma generate` commands for you to run |

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

# Read-Only `DIY_PROJECT_GUIDE` and `TASK_GUIDE` Progress — Step 5 Implementation Plan

**Date:** October 6, 2026
**Status:** **Revision 2, after review (October 6, 2026).** The review approved the direction and the start of slice 5a-0, explicitly approved S5-6, S5-12 (as amended) and S5-13, and approved the rest subject to three corrections, all made here (§11): the AI-versus-not-template refusal is split, the step-matching rule is strict, and the progress arithmetic is exact. 5a-0 (a read-only trace) is done and its findings are recorded in §12; 5a does not start until you say so. Nothing else is built. **No schema change.**
**Parent design:** [`ASK_COZY_STATEFUL_GUIDE_DESIGN.md`](ASK_COZY_STATEFUL_GUIDE_DESIGN.md) §13, step 5 (sequencing row "1": decisions O1 and O8, approved October 6, 2026), D1 (canonical step source and the stale-source rule), D2 (where progress lives), D3 (current step and optional-step semantics), D6 (help is a local disclosure), D8 (authorization)
**Follows:** steps 1 to 4, all pushed: [`…TEMPLATE_REVISIONS_PLAN`](ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md), [`…STEP_TRANSITIONS_PLAN`](ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md), [`…COMPLETION_OUTBOX_PLAN`](ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md), [`…TASK_RECONCILIATION_PLAN`](ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md). Their rollouts are yours; this step's code does not depend on them being applied except as §9 states.
**Method:** `AUDIT_METHODOLOGY.md` design items 11-20 and the section 7 adversarial pass (§8). Labels: **[Code-traced]** read, not run; **[Executed]** ran. Nothing in this document was executed.

## 1. Goal and boundary

**Goal.** From a DIY project row in Ask, a homeowner (any household member who can view the property) can open **a read-only, step-by-step guide to that project**: where they are ("Step 2 of 6, 1 done"), the current step's instructions with its safety note always visible, an outline of every step with its state, and an honest statement when the project **cannot** be guided (an AI-generated plan, a project from before revisions existed, content that is no longer eligible) or **should not be followed unchanged** (the guide was withdrawn, or a corrected version exists). The guide reads canonical state on every open and every refresh; it **owns no progress** and **writes nothing**.

**In scope:** the additive `TASK_GUIDE` fields `progress` and `outline` (O1); the read operation `DIY_PROJECT_GUIDE` with its new entity type, its service read, the guideability gate and the disclosures; the entry action on `DIY_PROJECTS` rows; the skill, governance and registry entries (O8); the frontend rendering of the two fields; the tests and the verification gates.

**Out of scope (later steps, per the design):** every command (`DIY_STEP_UPDATE` is step 6); a previous-step view and reopen (design step 3); project completion and abandonment from Ask; the recovery command; help beyond the local tip; creating a project from Ask; the seasonal-to-DIY mapping (O5); **authoring the first production template (O7, still waiting for a named content owner)**.

## 2. What exists today

| # | Finding | Label |
| --- | --- | --- |
| G1 | `TASK_GUIDE` has `eyebrow`, `icon`, `chips`, `tip`, `main` (with `facts`), `history`, `notes` (max 4) and `actions` (max 6); no steps, progress or outline. Every field is producer-declared and the renderer "invents nothing". The frontend mirrors the shape in `features/ask/types.ts` and renders it in `TaskGuideBlock.tsx` (110 lines). Only the home-habit-coach handler emits it today. | Code-traced |
| G2 | `DIY_PROJECTS` is a read-only, skill-backed operation (skill `diy`, autonomy 1, effects `READ`, floor `VIEWER`, adapter `diy.projects`, blocks `SUMMARY`, `GROUPED_LIST`, `LIMITATION`, `BOUNDARY`). Its rows link to the page; they carry no Ask action. `GROUPED_LIST` items can carry declared `actions` (interaction type, operation id, exact message). | Code-traced |
| G3 | Entity-keyed operations resolve their target from the trusted launch context (`launchContext.entityType` and `entityId`) or ask for it; `AskEntityType` is `PROPERTY \| MAINTENANCE_TASK \| INVENTORY_ITEM \| QUOTE \| DECISION_THREAD`, and operations map to a target type in `TARGET_ENTITY`. Other handlers already accept further launch entity types (`GUIDANCE_JOURNEY`, `GUIDANCE_STEP`, `BUYER_TASK`, `INVENTORY_ITEM`). **Resolved by the 5a-0 trace (§12, T1):** a launch-only read's entity type is a plain string the handler checks, with no central allow-list and no change to `AskEntityType`. | Code-traced |
| G4 | A project is guideable only if it came from an approved template revision: `DiyProject.templateRevisionId` (null for every project created before the step 1 release and for AI-guide projects), `templateId` set, `aiGuideId` null, and `DiyProjectStep.templateStepId` set. The revision carries `provenance` (`GOVERNED` or `LEGACY_BACKFILL`, which "is never presented as reviewed"), `contentHash` (checked by `checkRevisionIntegrity`), `retiredAt` with `retiredReason` `SUPERSEDED`, `UNPUBLISHED` or `ARCHIVED`, `safetyLevel` and `permitRequirement`. **A superseded revision is retired with reason `SUPERSEDED`** (it stops being the head when a newer one is published), so "retired" alone must not mean "withdrawn". | Code-traced |
| G5 | `evaluateDiyEligibility` decides the "reviewed, low-risk, non-regulated" boundary from title, summary, category, safety level, permit requirement, verdict and safety warnings. `createProject` and the AI-guide path each call it with inputs mapped from their own source; there is no shared mapping from a stored revision. | Code-traced |
| G6 | The step rules already exist in code: `openStepsForCompletion` (required steps `COMPLETED`; optional `COMPLETED` or `SKIPPED`) and the step transition table; a step's `safetyNote` blocks skipping. The "current step" (first non-terminal step in authored order, required or optional) is defined in the design (D3) and **not yet implemented anywhere**. | Code-traced |
| G7 | `DiyProjectStep` copies `title`, `description`, `estimatedMinutes`, `safetyNote`, `tipNote`, `isOptional`, `status`, `notes`, `templateStepId`; no media. Step notes are DIY-domain data and are **not shown or written from Ask in v1** (D7). | Code-traced |
| G8 | The response-trust layer rejects block types, boundaries and action ids a skill or operation has not declared (`allowedResultBlocks`, `OPERATION_BOUNDARIES`, `OPERATION_ACTION_IDS`), and a new operation touches a long registration chain (the operation union and definition, five semantic-package records, a certification fixture, the audience policy, the interaction coverage matrix, the skill manifest, evaluation suite and `SKILL.md`, the skill adapter registry, the capability bridge, the startup-registry validators, and several hard-coded counts in tests). Earlier operations recorded this chain; slice 5a re-traces it from a recent one rather than relying on that record. | Code-traced (from prior records) |
| G9 | **No production template exists** and every project created before the step 1 release has no revision, so **on the day this ships no real project is guideable** (D1, E1, O7). | Code-traced |

## 3. Target behavior

### 3.1 The entry

The `DIY_PROJECTS` rows gain one declared row action each, "Guide me through this project" (interaction type `CONVERSATION_CONTINUE`, the exact message, the operation `DIY_PROJECT_GUIDE`), with `entityType: 'DIY_PROJECT'` on the row and the project id as the row's id, exactly as the guided-journey list does for `GUIDANCE_JOURNEY_CONTINUE` (§12, T2). The handler checks the launch context's `entityType` literal; `AskEntityType` (the typed-message entity resolver) is **not** extended, because a launch-only read is never resolved from a message. **Typed messages are not routed to the guide** (S5-1): a message like "walk me through my project" continues to resolve as it does today; only the declared action launches it (the same stance the design takes for entity-keyed operations). An entity that does not resolve inside the property (another property's project, a deleted one) answers with a plain "I couldn't find that project" and a link to the list, never with another property's data.

### 3.2 The guideability gate (typed reasons; every refusal links to the page)

A project is guided only if **all** hold. Otherwise the answer is a `LIMITATION` naming the reason and a link to the project page; nothing is invented. (The two origin refusals are separate on purpose: only a project with an `aiGuideId` is said to be AI-written.)

| Reason code | Refusal when | Copy (fixed) |
| --- | --- | --- |
| `AI_GUIDE_PROJECT` | the project has an `aiGuideId` | "This project's steps were written by an AI guide and haven't been reviewed, so I can't walk you through them. They're on the project page." |
| `NOT_TEMPLATE_PROJECT` | no `aiGuideId` **and** no `templateId` (the project's origin is not recorded, so nothing is claimed about who wrote it) | "This project wasn't started from a reviewed guide, so I can't walk you through it. Its steps are on the project page." |
| `NO_REVISION` | `templateRevisionId` is null (created before reviewed revisions existed) | "This project was started before its guide could be checked against a reviewed version, so I can't guide it here. The steps are on the project page." |
| `NOT_REVIEWED` | the revision's provenance is `LEGACY_BACKFILL` | the same promise as above: it makes no review claim, so Ask makes none |
| `REVISION_INTEGRITY` | a governed revision fails its content hash | "This guide is temporarily unavailable." (and the failure is logged, as `createProject` does) |
| `NOT_ELIGIBLE` | the revision content no longer passes `evaluateDiyEligibility` (low risk, no permit or regulated work, none of the five excluded kinds) | "This kind of work isn't covered by guided DIY help. The project page has what you recorded." |
| `STEPS_NOT_FROM_REVISION` | the project's steps are not **exactly** the revision's steps, by the strict rule in §3.2.1 | "I can't confirm these steps match the reviewed guide, so I won't walk you through them." |
| `TOO_MANY_STEPS` | more steps than the outline can carry (S5-5) | "This project has more steps than I can show here. Open it on the project page." |
| `PROJECT_FINISHED` | status `COMPLETED`, `ABANDONED` or `HIRED_OUT` | a `SUMMARY` of how it ended (including "closed because your linked task was completed", from step 4) and the page link; no guide |

#### 3.2.1 The strict step-matching rule (`STEPS_NOT_FROM_REVISION`)

Non-null ids and equal counts do not prove the steps are the reviewed ones, so the guide requires **all** of the following between the project's steps and the revision's steps (the revision's steps are read from its hashed content, which has just passed its integrity check):

1. **One-to-one by id.** Every project step has a `templateStepId`; the set of ids equals, exactly, the set of ids the revision's steps would have been given when the project was created (`stepSnapshotId(revisionId, stepNumber)`, which is deterministic). **No missing id, no duplicate id, no foreign id** (an id belonging to another revision or another template).
2. **Authored order.** Taking the project's steps by `stepNumber` and the revision's steps by `stepNumber`, the two sequences pair up position by position with the same ids, so the order and the numbering match the revision.
3. **Equal instructional content.** For every pair, `title`, `description`, `estimatedMinutes`, `isOptional`, `safetyNote` and `tipNote` are equal to the revision's (null and absent treated as the same, no other normalization, no trimming: a copy that was altered in any way is refused rather than "close enough"). Status and notes are the person's progress and are not compared.

Any failure refuses the whole guide (never a partial one), logs the mismatching field names, not the text, and points to the page. This is a stricter check than the page needs, on purpose: the guide is the one place Ask says "reviewed".

### 3.3 The stale-source rule (D1), made precise by G4

On every open and refresh, with the project's revision and the template's current head:

- **Withdrawn** (the project's revision is retired with reason `UNPUBLISHED` or `ARCHIVED`, or the template is no longer published): a `BOUNDARY` (caution) "This guide has been withdrawn" with the page link. The snapshot **stays readable** so someone mid-job can finish reading, and there is no step-advancing action (none exists in this step anyway).
- **Corrected version available** (the project's revision is `SUPERSEDED`, or the head differs from it): a `BOUNDARY` (info) "A corrected version of this guide is available." It is a **disclosure only**: the project is not migrated and the guide stays usable. A draft under review withdraws nothing.

### 3.4 What the guide shows

All derived from canonical state at read time:

- **Current step** = the first non-terminal step (`PENDING` or `IN_PROGRESS`) in authored order (`stepNumber`), required or optional. If every step is terminal but the project is still open: a `SUMMARY` "Every step is resolved. Finish the project on the project page." with the link (completion from Ask is step 6).
- **`progress`**: `{ current, total, completed, skipped, label, asOf }`, with exact arithmetic over the **sorted outline**, never over raw step numbers (which may be sparse or start anywhere):
  - `total` = the number of steps (the outline's length);
  - `current` = the **one-based position** of the current step in the sorted outline (so a project whose steps are numbered 1, 3, 7 and whose second step is current says "Step 2 of 3", not "Step 3");
  - `completed` = the steps whose status is `COMPLETED`, **only**;
  - `skipped` = the steps whose status is `SKIPPED`, counted separately and **never described as "done"**;
  - `label` in words: "Step 2 of 6, 1 done", and when any are skipped, "Step 3 of 6, 1 done, 1 skipped" (the skipped count is named whenever it is above zero, and omitted otherwise); `asOf` is the read time.
  **A rendered snapshot; the block owns nothing.**
- **`outline[]`**: one entry per step in order, `{ stepId, title, state, optional }` with `state` one of `DONE` (completed), `SKIPPED`, `CURRENT`, `UPCOMING`; the outline's text for a skipped step says "Skipped", not "Done". Not links, not actions.
- **`main`**: the current step's title and description, with facts for its estimated time and whether it is optional. **`tip`**: the step's `tipNote`. **`notes`**: none in v1 (step notes are not shown from Ask).
- **The step's `safetyNote` is always visible, above anything that could advance it.** With no `TASK_GUIDE` field for it, it is emitted as a `BOUNDARY` (caution) block **immediately before** the guide (S5-6). **Adjacency is tested on the final, trust-validated block sequence** (what finalization actually returns after the trust layer has run), not only on the producer's output; step 6 must reconsider this structure before it adds any advancing action. Chips: the step estimate and the revision's safety level; eyebrow: category and "Reviewed guide".
- **`actions`**: only "Open this project" (navigation to the page). Viewers see the same guide (read floor `VIEWER`); there is no write action to hide.
- A **`BOUNDARY`** at the end restates the scope ("reviewed, low-risk projects") as `DIY_PROJECTS` does.

### 3.5 No writes, no inference, no remembered state

A spy over every write method proves a guide read writes nothing (the design's 0d rule). Nothing is remembered between opens: reopening or `ASK_REFRESH` recomputes from the database. A stored execution keeps what it showed; the existing result-revalidation boundary offers a refresh when live state differs (D2).

### 3.6 The contract change (O1)

`TASK_GUIDE` gains two **optional** fields, `progress` and `outline`, bounded (outline at most 40 entries; labels length-limited), declared in the backend contract and mirrored in the frontend types. Absent fields mean today's block, so every stored execution and every existing producer parses unchanged (a test pins this against a stored fixture).

### 3.7 The frontend

`TaskGuideBlock` renders `progress` as words (never only a bar) and `outline` as an ordered list with the state in text (not colour alone), the current entry marked with `aria-current="step"`, and renders the tip behind a local "Show tip" disclosure **only when an outline is present** (guide mode, D6); a block without an outline renders exactly as before. It invents nothing and infers no state. No focus management is needed in this step (nothing advances); reduced motion is honoured by not animating the outline.

## 4. Schema

**None.** Everything this step reads already exists (steps 1 to 4). New code only: the contract fields, the service read, the operation and its registrations, the skill entry and the renderer.

## 5. Slices

| Slice | Content | Gate |
| --- | --- | --- |
| **5a-0** | A trace, no behavior change: the launch-entity allow-list and plumbing; a recent operation's full registration chain (re-derived, not assumed); the hard-coded counts; how `DIY_PROJECTS` rows and the persisted-execution schema treat new item actions and optional block fields | The findings recorded in §12 |
| **5a** | Backend: the optional `progress` and `outline` fields; the read-only service method and the pure `evaluateGuideability` and `buildGuideView`; the shared eligibility mapping (so the page and the guide cannot drift); the operation, its entity type, its adapter and every registration; the skill manifest, evaluation suite and `SKILL.md`; the row action on `DIY_PROJECTS`; tests and mutation checks | Governance, registry, startup-registry and Ask suites; `tsc` |
| **5b** | Frontend: types, `TaskGuideBlock` progress, outline, tip disclosure; tests and mutation checks | `next build`; the frontend Ask suites |
| **5c** | A guarded real-Postgres script reading real revision rows (every refusal reason, the withdrawn and superseded cases, a write spy at the database) and the runbook. **Written, not run, here:** it is an owner-run gate, and no scratch database is provisioned in this slice (S5-12) | Your gate; browser runtime stays unverified |

**5a and 5b ship together** (a guide block with an `outline` the old renderer ignores would show the guide without its outline, which is harmless but incomplete; the reverse is also safe).

## 6. Validation plan

| Check | Kind (when run) |
| --- | --- |
| Each refusal reason of §3.2 with its fixed copy and the page link: AI-guide project (the only one called AI-written), a project with neither `templateId` nor `aiGuideId` (generic copy), no revision, legacy-backfill revision, hash mismatch, ineligible content (each excluded kind, unknown safety or permit), too many steps, finished projects | Test |
| **The strict step rule (§3.2.1), one case each:** a missing `templateStepId`; a duplicate id; a foreign id (another revision's); an id set that equals but pairs in a different order; a missing step; an extra step; and an alteration of each compared field (`title`, `description`, `estimatedMinutes`, `isOptional`, `safetyNote`, `tipNote`) by a single character, each refused as a whole; an untouched copy (including a different progress status and notes) accepted; the refusal logs field names, never text | Test |
| **Progress arithmetic:** sparse step numbers (1, 3, 7) give the one-based position; `completed` counts only `COMPLETED`; skipped steps are counted and named separately and never as done; the label with and without skipped steps; an outline text of "Skipped" for a skipped step | Test |
| The stale-source rule: withdrawn (`UNPUBLISHED`, `ARCHIVED`, template unpublished) shows the boundary and keeps the snapshot readable; superseded or a newer head shows the info disclosure and stays usable; a draft under review changes nothing | Test |
| Current step is derived from state (first non-terminal in authored order, optional included, skipped and completed passed over); the all-resolved summary; the progress label and `asOf`; outline states; reopening a step moves "current" back | Test |
| The safety note is always emitted immediately before the guide and is never absent when the current step has one; a step without one adds none; **adjacency holds in the final, trust-validated block sequence** (run through response finalization and the trust validator, not only the producer) | Test |
| **A guide read writes nothing** (a spy on every write method, in every branch including each refusal) | Test, fake and Postgres |
| A viewer gets the same guide; a stranger and another property's project are refused with no data; an entity id that is not in the property answers "couldn't find" | Test |
| Typed wording never launches the guide; only the declared row action does; the action's message, operation and entity are exact | Test |
| `TASK_GUIDE` old-shape blocks and a stored execution fixture parse unchanged; the new fields are bounded and optional | Test |
| Skill, `allowedResultBlocks` (now including `TASK_GUIDE`), `OPERATION_BOUNDARIES` and `OPERATION_ACTION_IDS` with the exact ids, audience policy, interaction coverage matrix, certification fixture, semantic packages, bridge, startup-registry validators and the counted assertions | Test (the governance, registry and Ask suites) |
| Frontend (jest component tests only; no browser): progress in words, outline order and state text (skipped says "Skipped"), `aria-current="step"` on exactly the current entry, the tip behind a disclosure only with an outline, a block without the new fields unchanged, no inference, the responsive class behavior the component declares | Test, jest |
| Mutation checks: current step ignoring optional steps; a legacy revision treated as reviewed; a superseded revision treated as withdrawn (and the reverse); the safety note dropped; a write added to the read; the guide launched by typed text; progress treated as authoritative; outline state by colour only; tip shown without disclosure in guide mode | Executed in 5a/5b |
| `tsc`, `next build`, the DIY and Ask suites (chunked runner for the full Ask directory) | Each slice |
| Real Postgres: the real revision rows and the real read | 5c: script written, **owner-run, not run here** |

## 7. Rollout

No schema push and no worker. Deploy the backend, then the frontend (the old renderer ignores the new fields). The skill's own enable flag (`ASK_SKILL_DIY_ENABLED`) already exists on the `diy` skill and is not a new control. **Expect nothing visible in production** until a template is authored and published (O7) and a project is started from it after the step 1 release (G9): until then every project answers with a refusal and a link to the page.

## 8. Adversarial pass (methodology section 7) [Code-traced; the answers to be tested]

- **The guide is empty on day one (G9).** The plan says so up front (§7) rather than implying a working feature; the value now is the contract, the refusals and the governance, ready for content.
- **Retired is not withdrawn (G4).** Treating every retired revision as withdrawn would show "withdrawn" on every project whose template has since been republished; the rule uses the retirement reason and a test pins both directions.
- **Provenance honesty.** `LEGACY_BACKFILL` revisions make no review claim, so the guide refuses them with the same promise; a hash mismatch refuses and logs. **Only a project with an `aiGuideId` is called AI-written**; a project with no recorded origin gets generic copy that claims nothing.
- **"Matches the revision" is exact, not approximate.** Equal counts and non-null ids would let an altered or mismatched step list be presented as reviewed, so the rule is the one-to-one, ordered, field-by-field match of §3.2.1.
- **Eligibility drift.** The guide re-evaluates the boundary on every read from the stored revision, through a mapping shared with project creation; a content change that makes a template ineligible takes effect for projects already in flight (they get `NOT_ELIGIBLE`, with their page link), which is the intended safety behavior and is disclosed.
- **Stale snapshot.** `progress` and `outline` are display only and carry `asOf`; nothing in this step acts on them, and step 6 will re-read canonical state on every command (D2, D8).
- **Cross-property or forged entity id.** The read is scoped by `propertyId`; an id outside it is "couldn't find", never a refusal that confirms the project exists elsewhere.
- **Step content is admin-authored, not user input**, and is rendered as text; step notes (user data) are not shown.
- **Count and registry drift.** Hard-coded operation, adapter and skill counts in several tests need hand updates (found only by running the suites); the plan budgets for it and runs the chunked Ask runner.
- **Overclaim check (methodology item 9).** "Read-only" is a claim about this operation, proven by the write spy; it says nothing about step 6, which reverses FRD v1.58's "reads only" note for the `diy` skill and needs its own review.

## 9. Dependencies and risks

1. **Depends on step 1's schema being applied** for any project to carry a revision; without it the guide simply refuses everything (safe). It does not depend on steps 2 to 4 beyond reading their data (the closed-by-task summary uses step 4's `completionBasis`).
2. **No content (O7).** The first production template needs a named owner.
3. **Registry breadth.** The largest source of work and of hidden failures is the registration chain and the counted tests; a missed entry crash-loops the backend at start-up validation (this repository has had that). The startup-registry test and the validators are part of the gate.
4. **Contract strictness.** Adding optional fields to a validated block must not break persisted executions; the fixture test is the control.

## 10. Decisions (each with the recommended default)

| # | Decision | Recommendation |
| --- | --- | --- |
| **S5-1** | `DIY_PROJECT_GUIDE` is entity-keyed (new `DIY_PROJECT` launch entity), `VIEWER` floor, launched **only** by a declared row action on `DIY_PROJECTS`; typed messages are not routed to it | Yes |
| **S5-2** | The guideability gate and its **nine** typed refusals (§3.2, with `AI_GUIDE_PROJECT` and `NOT_TEMPLATE_PROJECT` separate and the strict step rule of §3.2.1), each ending in a page link; nothing is guessed for an unreviewable project | Yes, with the review's corrections |
| **S5-3** | The stale-source rule of §3.3: **withdrawn** = revision retired as `UNPUBLISHED` or `ARCHIVED` (or the template unpublished), keep the snapshot readable; **superseded** or a newer head = disclosure only | Yes |
| **S5-4** | Current step, progress and outline as §3.4 with the exact arithmetic (one-based position in the sorted outline; `completed` counts only `COMPLETED`; `skipped` named separately; the label in words; `asOf`); no previous-step view in this step | Yes, with the review's correction |
| **S5-5** | Outline bounded at 40; a project with more steps is `TOO_MANY_STEPS` (page link) | Yes |
| **S5-6** | **Approved at review.** The step's safety note is emitted as a `BOUNDARY` (caution) block immediately before the guide, with **no new `TASK_GUIDE` field**; adjacency is tested on the final trust-validated sequence; step 6 must reconsider the structure before adding advancing actions | Approved |
| **S5-7** | The tip is behind a local "Show tip" disclosure only when an outline is present; no child help turn (D6) | Yes |
| **S5-8** | Skill and governance entries per O8 for a **read-only** operation: the `diy` skill stays autonomy 1 with effects `READ`, gains the operation, the adapter `diy.project-guide` and `TASK_GUIDE` in its allowed blocks; the move to write effects belongs to step 6 | Yes |
| **S5-9** | One shared mapping from a stored revision to the eligibility input, used by project creation and the guide, so they cannot drift | Yes |
| **S5-10** | No schema change, no worker, no new feature flag; deploy backend then frontend | Yes |
| **S5-11** | The guide reads canonical state on every open and refresh and writes nothing, proven by a write spy in every branch | Yes |
| **S5-12** | **Approved as amended at review.** **No Playwright and no browser infrastructure in this slice.** Jest component tests cover rendering, responsive class behavior, the textual states, the tip disclosure and the accessibility semantics; the backend suites cover the rest. The real-Postgres check (5c) is written but **owner-run, not provisioned or run here**. Browser runtime and the Postgres read are reported as **unverified** | Approved |
| **S5-13** | **Approved at review.** Accept that the feature ships with no production content (O7) and that, until a template is published and a project started from it, every project answers with a refusal and a page link. **The FRD states this plainly, every time it records this step: the step establishes a governed capability and delivers no usable production guide until O7 is resolved** | Approved |

## 11. Where the design's own acceptance row is covered

| Design row "1" criterion | Here |
| --- | --- |
| AI-guide, pre-revision and ineligible projects refused with a page link | §3.2, §6 |
| Retired revision shows the withdrawal and no advancing action; corrected-version disclosure | §3.3, §6 |
| Current step derived from state, not remembered; `progress` a snapshot with `asOf` | §3.4, §3.5 |
| Old stored executions unchanged | §3.6, §6 |
| Viewer sees no write action | §3.4 |
| Skill, allow-list, registry and startup validators pass | §5, §6 |
| Component tests for outline, `aria-current`, focus | §3.7, §6 (focus: not applicable until step 6) |
| Runtime unverified unless a browser run is approved | S5-12 |

## 11. How this revision answers the review

| Review point | Where |
| --- | --- |
| 1. `NOT_TEMPLATE_PROJECT` overclaimed AI authorship | §3.2 (split into `AI_GUIDE_PROJECT` and `NOT_TEMPLATE_PROJECT` with generic copy), S5-2 |
| 2. Stronger step matching | §3.2.1, §6, §8, S5-2 |
| 3. Exact progress arithmetic | §3.4, §6, S5-4 |
| S5-6 approved; adjacency tested on the final trust-validated sequence; step 6 reconsiders | §3.4, §6, S5-6 |
| S5-12: no Playwright; jest component tests; browser and the real-Postgres check reported unverified; 5c owner-run | §5, §6, S5-12 |
| S5-13: the FRD states plainly that there is no usable production guide until O7 | S5-13 |
| Start 5a-0 | §12 |

## 12. Slice 5a-0 record: the trace (October 6, 2026)

No code, schema or behavior changed. This was a read of the code and of git history; nothing was run. The question set came from §2 G3 and G8.

| # | Finding | Label |
| --- | --- | --- |
| T1 | **There is a direct precedent for exactly this shape:** `GUIDANCE_JOURNEY_CONTINUE` (commit `d59b40fe`, "a launch-only read of one guided journey"), a `VIEWER`-floor, skill-backed, non-routable `RECORD_QUERY` read reached only by a launch context naming one record, with a list-row action that launches it. Its launch entity type (`'GUIDANCE_JOURNEY'`) is **a plain string compared in the handler** (`launchContext?.entityType === 'GUIDANCE_JOURNEY' ? launchContext.entityId : null`); it is **not** in `AskEntityType` or `TARGET_ENTITY` and passes **no** allow-list. So the open question in G3 is answered: `DIY_PROJECT` needs no new allow-list entry. | Code-traced |
| T2 | The row action: the list item carries `entityType: 'GUIDANCE_JOURNEY'` and an `actions` entry `{ id, label, message, style, interactionType: 'CONVERSATION_CONTINUE', operationId }`; the item's own id is the entity id. The handler reads the id from the launch context and, when it is missing or does not resolve inside the property, answers with an empty state and a link to the list. **Row-action ids are not allow-listed** (the answer-trust policy lists only block-level boundary and action ids for the operation), so no `OPERATION_ACTION_IDS` entry is needed for the row action; the block-level `Open this project` navigation action and the boundary id do need entries. | Code-traced |
| T3 | The files that commit changed are the real registration checklist for a launch-only read (25 files): `askOperationRegistry.ts` (the operation union, the id in the non-retrievable list, the definition with `RECORD_QUERY`, `VIEWER`, the adapter id and the allowed blocks); `askAnswerTrustPolicy.ts` (the boundary id set and the block action id set); `askAudiencePolicy.ts` (`definePolicy(..., ALL_MODES, ...)`); `askInteractionCoverageMatrix.ts` (**`ASK_LAUNCH_ONLY_READ_OPERATION_IDS`**, a full matrix entry with `messageRoutable: false`, `rollClass: 'READ_RESULT'`, traced notes, and a validator that a launch-only read is non-routable and `READ_RESULT`); `askOperationSemanticPackages.ts`; `askTrustCertificationCorpus.ts`; `askOrchestrator.service.ts` (re-exports); `askFocusedGuidance.ts` (only because a Home Action launched it, **not needed here**); the handler (registers `registerCapabilityHandler('<adapter id>', ...)`); `capabilitySkillGuidanceBridge.registry.ts`; `skillAdapterRegistry.ts` (a new `adapter(...)`); the skill's `skill.manifest.ts` (the operation, `allowedAdapters`, `consumerPolicy`, `supportedGoals`, `allowedResultBlocks`, a dependency on the operation contract), `skill.evaluation.ts` and `SKILL.md`; and the tests below. | Code-traced |
| T4 | **Hard-coded counts today** (each moves by one with a new operation, found only by running the suites): `askGovernance.test.js` operations = **123**; `askInteractionCoverageMatrix.test.js` operation ids = 123 (twice) and `STAGE_2_TRACED_OPERATIONS.size` = 123; `capabilityHandlerRegistry.test.js` operation ids = 123; `skillAdapterRegistry.test.js` adapters = **106**; plus the per-skill operation list in `skillTaxonomyExpansion.test.js` (`'diy': ['DIY_PROJECTS']`) and the `askTrustArchitecture` operation lists. Tests that pin the existing `DIY_PROJECTS` answer will also need updating for the new row action: `diyProjectsCapabilitySlice`, `exactFourStarterPoolMeasurement`, `skillTaxonomyExpansion`, the coverage matrix test, and `projectTrackerProjectsCapabilitySlice` (checked). | Code-traced |
| T5 | **The final, trust-validated block sequence is produced by `validateAskAnswerTrust` / `validateAskAnswerTrustPipeline`** (`askAnswerTrustValidator.ts`), which also filters each block's actions by an applicability check. S5-6's adjacency test (caution boundary immediately before the guide) will run the producer's output **through that pipeline** and assert on what comes out, as the plan requires. | Code-traced |
| T6 | `TASK_GUIDE`'s schema is a plain `z.object` (not `.strict()`): additive optional fields leave old blocks parsing unchanged, and the frontend mirror in `features/ask/types.ts` is a hand-written type that must gain the two fields. Block-level action ids on `SUMMARY`, `BOUNDARY` and the like **are** filtered by the allow-list (memory of an earlier silent-strip bug applies), so the `TASK_GUIDE`'s `Open this project` action and any boundary ids need entries and a trust-pipeline test, not a schema test alone. | Code-traced |
| T7 | The `diy` skill is `autonomyLevel: 1`, effects `['READ']`, flag `ASK_SKILL_DIY_ENABLED`; `TASK_GUIDE` is not in its `allowedResultBlocks` (`SUMMARY`, `GROUPED_LIST`, `LIMITATION`, `BOUNDARY`); only `home-habit-coach` allows it today. Adding `TASK_GUIDE` and `EMPTY_STATE` (if the not-found answer uses it) is a manifest change that the startup-registry validators and `skillTaxonomyExpansion` check. | Code-traced |
| T8 | The shared step-copy identity is deterministic: `stepSnapshotId(revisionId, stepNumber)` = `` `${revisionId}:step:${stepNumber}` `` (in `diyPublishedTemplate.ts`), and `createProject` copies `title`, `description`, `estimatedMinutes`, `safetyNote`, `tipNote`, `isOptional` (and `imageUrl` is not copied). The strict matching rule of §3.2.1 is therefore **checkable exactly**, with the revision's steps read from its hashed `contentJson`. | Code-traced |

**What this changes in the plan.**

1. **G3 and §3.1** are corrected as above: no `AskEntityType` change, no launch allow-list; a row action with `entityType: 'DIY_PROJECT'` on the item.
2. **The row action id needs no allow-list entry; the block-level ids do** (T2, T6): the plan's validation row on `OPERATION_BOUNDARIES` and `OPERATION_ACTION_IDS` covers the block ones, with a trust-pipeline test.
3. **Slice 5a's file list** is now the T3 checklist, minus `askFocusedGuidance.ts` (no Home Action launches this guide) and with the extra DIY-specific items: the `DIY_PROJECTS` handler (row actions and `entityType`), the shared eligibility mapping (S5-9), the revision-matching functions, the contract and the new service read.
4. **Expected count changes** for 5a: operations 123 to 124, adapters 106 to 107, and the per-skill lists; budgeted rather than discovered.
5. **No other surprise**: nothing in the trace contradicts S5-1 to S5-13 or the three review corrections.

**Not done in 5a-0:** any change to code, and any run of the registry or startup validators (they run in 5a, where the count tests change).

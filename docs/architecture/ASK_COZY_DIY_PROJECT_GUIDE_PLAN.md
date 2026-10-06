# Read-Only `DIY_PROJECT_GUIDE` and `TASK_GUIDE` Progress — Step 5 Implementation Plan

**Date:** October 6, 2026
**Status:** **Draft, awaiting approval of S5-1 to S5-13 (§10).** Nothing in this plan is built. **It needs no schema change.**
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
| G3 | Entity-keyed operations resolve their target from the trusted launch context (`launchContext.entityType` and `entityId`) or ask for it; `AskEntityType` is `PROPERTY \| MAINTENANCE_TASK \| INVENTORY_ITEM \| QUOTE \| DECISION_THREAD`, and operations map to a target type in `TARGET_ENTITY`. Other handlers already accept further launch entity types (`GUIDANCE_JOURNEY`, `GUIDANCE_STEP`, `BUYER_TASK`, `INVENTORY_ITEM`). Which allow-list a launch entity type must pass before it reaches a handler has **not** been traced and is the first task of slice 5a. | Code-traced (the last point open) |
| G4 | A project is guideable only if it came from an approved template revision: `DiyProject.templateRevisionId` (null for every project created before the step 1 release and for AI-guide projects), `templateId` set, `aiGuideId` null, and `DiyProjectStep.templateStepId` set. The revision carries `provenance` (`GOVERNED` or `LEGACY_BACKFILL`, which "is never presented as reviewed"), `contentHash` (checked by `checkRevisionIntegrity`), `retiredAt` with `retiredReason` `SUPERSEDED`, `UNPUBLISHED` or `ARCHIVED`, `safetyLevel` and `permitRequirement`. **A superseded revision is retired with reason `SUPERSEDED`** (it stops being the head when a newer one is published), so "retired" alone must not mean "withdrawn". | Code-traced |
| G5 | `evaluateDiyEligibility` decides the "reviewed, low-risk, non-regulated" boundary from title, summary, category, safety level, permit requirement, verdict and safety warnings. `createProject` and the AI-guide path each call it with inputs mapped from their own source; there is no shared mapping from a stored revision. | Code-traced |
| G6 | The step rules already exist in code: `openStepsForCompletion` (required steps `COMPLETED`; optional `COMPLETED` or `SKIPPED`) and the step transition table; a step's `safetyNote` blocks skipping. The "current step" (first non-terminal step in authored order, required or optional) is defined in the design (D3) and **not yet implemented anywhere**. | Code-traced |
| G7 | `DiyProjectStep` copies `title`, `description`, `estimatedMinutes`, `safetyNote`, `tipNote`, `isOptional`, `status`, `notes`, `templateStepId`; no media. Step notes are DIY-domain data and are **not shown or written from Ask in v1** (D7). | Code-traced |
| G8 | The response-trust layer rejects block types, boundaries and action ids a skill or operation has not declared (`allowedResultBlocks`, `OPERATION_BOUNDARIES`, `OPERATION_ACTION_IDS`), and a new operation touches a long registration chain (the operation union and definition, five semantic-package records, a certification fixture, the audience policy, the interaction coverage matrix, the skill manifest, evaluation suite and `SKILL.md`, the skill adapter registry, the capability bridge, the startup-registry validators, and several hard-coded counts in tests). Earlier operations recorded this chain; slice 5a re-traces it from a recent one rather than relying on that record. | Code-traced (from prior records) |
| G9 | **No production template exists** and every project created before the step 1 release has no revision, so **on the day this ships no real project is guideable** (D1, E1, O7). | Code-traced |

## 3. Target behavior

### 3.1 The entry

The `DIY_PROJECTS` rows gain one declared action each, "Guide me through this project", carrying the exact message and the launch entity (`DIY_PROJECT`, the project id) for `DIY_PROJECT_GUIDE`. **Typed messages are not routed to the guide** (S5-1): a message like "walk me through my project" continues to resolve as it does today; only the declared action launches it (the same stance the design takes for entity-keyed operations). An entity that does not resolve inside the property (another property's project, a deleted one) answers with a plain "I couldn't find that project" and a link to the list, never with another property's data.

### 3.2 The guideability gate (typed reasons; every refusal links to the page)

A project is guided only if **all** hold. Otherwise the answer is a `LIMITATION` naming the reason and a link to the project page; nothing is invented:

| Reason code | Refusal when | Copy (fixed) |
| --- | --- | --- |
| `NOT_TEMPLATE_PROJECT` | no `templateId`, or an `aiGuideId` | "This project's steps were written by an AI guide and haven't been reviewed, so I can't walk you through them. They're on the project page." |
| `NO_REVISION` | `templateRevisionId` is null (created before reviewed revisions existed) | "This project was started before its guide could be checked against a reviewed version, so I can't guide it here. The steps are on the project page." |
| `NOT_REVIEWED` | the revision's provenance is `LEGACY_BACKFILL` | the same promise as above: it makes no review claim, so Ask makes none |
| `REVISION_INTEGRITY` | a governed revision fails its content hash | "This guide is temporarily unavailable." (and the failure is logged, as `createProject` does) |
| `NOT_ELIGIBLE` | the revision content no longer passes `evaluateDiyEligibility` (low risk, no permit or regulated work, none of the five excluded kinds) | "This kind of work isn't covered by guided DIY help. The project page has what you recorded." |
| `STEPS_NOT_FROM_REVISION` | any step lacks `templateStepId`, or the step count does not match the revision | "I can't confirm these steps match the reviewed guide, so I won't walk you through them." |
| `TOO_MANY_STEPS` | more steps than the outline can carry (S5-5) | "This project has more steps than I can show here. Open it on the project page." |
| `PROJECT_FINISHED` | status `COMPLETED`, `ABANDONED` or `HIRED_OUT` | a `SUMMARY` of how it ended (including "closed because your linked task was completed", from step 4) and the page link; no guide |

### 3.3 The stale-source rule (D1), made precise by G4

On every open and refresh, with the project's revision and the template's current head:

- **Withdrawn** (the project's revision is retired with reason `UNPUBLISHED` or `ARCHIVED`, or the template is no longer published): a `BOUNDARY` (caution) "This guide has been withdrawn" with the page link. The snapshot **stays readable** so someone mid-job can finish reading, and there is no step-advancing action (none exists in this step anyway).
- **Corrected version available** (the project's revision is `SUPERSEDED`, or the head differs from it): a `BOUNDARY` (info) "A corrected version of this guide is available." It is a **disclosure only**: the project is not migrated and the guide stays usable. A draft under review withdraws nothing.

### 3.4 What the guide shows

All derived from canonical state at read time:

- **Current step** = the first non-terminal step (`PENDING` or `IN_PROGRESS`) in authored order (`stepNumber`), required or optional. If every step is terminal but the project is still open: a `SUMMARY` "Every step is resolved. Finish the project on the project page." with the link (completion from Ask is step 6).
- **`progress`**: `{ current, total, completed, label, asOf }` with `label` in words ("Step 2 of 6, 1 done", plus how many are optional when relevant); `asOf` the read time. **A rendered snapshot; the block owns nothing.**
- **`outline[]`**: one entry per step in order, `{ stepId, title, state, optional }` with `state` one of `DONE`, `SKIPPED`, `CURRENT`, `UPCOMING`. Not links, not actions.
- **`main`**: the current step's title and description, with facts for its estimated time and whether it is optional. **`tip`**: the step's `tipNote`. **`notes`**: none in v1 (step notes are not shown from Ask).
- **The step's `safetyNote` is always visible, above anything that could advance it.** With no `TASK_GUIDE` field for it, it is emitted as a `BOUNDARY` (caution) block **immediately before** the guide (S5-6). Chips: the step estimate and the revision's safety level; eyebrow: category and "Reviewed guide".
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
| **5c** | A guarded real-Postgres read of real revision rows (every refusal reason, the withdrawn and superseded cases, a write spy at the database), and the runbook; **optionally** one Playwright fixture scenario (S5-12) | Your gate; runtime in a browser stays unverified unless you approve a run |

**5a and 5b ship together** (a guide block with an `outline` the old renderer ignores would show the guide without its outline, which is harmless but incomplete; the reverse is also safe).

## 6. Validation plan

| Check | Kind (when run) |
| --- | --- |
| Each refusal reason of §3.2 with its fixed copy and the page link: AI-guide project, no revision, legacy-backfill revision, hash mismatch, ineligible content (each excluded kind, unknown safety or permit), a step without `templateStepId`, a step count that differs from the revision, too many steps, finished projects | Test |
| The stale-source rule: withdrawn (`UNPUBLISHED`, `ARCHIVED`, template unpublished) shows the boundary and keeps the snapshot readable; superseded or a newer head shows the info disclosure and stays usable; a draft under review changes nothing | Test |
| Current step is derived from state (first non-terminal in authored order, optional included, skipped and completed passed over); the all-resolved summary; the progress label and `asOf`; outline states; reopening a step moves "current" back | Test |
| The safety note is always emitted immediately before the guide and is never absent when the current step has one; a step without one adds none | Test |
| **A guide read writes nothing** (a spy on every write method, in every branch including each refusal) | Test, fake and Postgres |
| A viewer gets the same guide; a stranger and another property's project are refused with no data; an entity id that is not in the property answers "couldn't find" | Test |
| Typed wording never launches the guide; only the declared row action does; the action's message, operation and entity are exact | Test |
| `TASK_GUIDE` old-shape blocks and a stored execution fixture parse unchanged; the new fields are bounded and optional | Test |
| Skill, `allowedResultBlocks` (now including `TASK_GUIDE`), `OPERATION_BOUNDARIES` and `OPERATION_ACTION_IDS` with the exact ids, audience policy, interaction coverage matrix, certification fixture, semantic packages, bridge, startup-registry validators and the counted assertions | Test (the governance, registry and Ask suites) |
| Frontend: progress in words, outline order and state text, `aria-current="step"` on exactly the current entry, tip disclosure only with an outline, a block without the new fields unchanged, no inference | Test, jest |
| Mutation checks: current step ignoring optional steps; a legacy revision treated as reviewed; a superseded revision treated as withdrawn (and the reverse); the safety note dropped; a write added to the read; the guide launched by typed text; progress treated as authoritative; outline state by colour only; tip shown without disclosure in guide mode | Executed in 5a/5b |
| `tsc`, `next build`, the DIY and Ask suites (chunked runner for the full Ask directory) | Each slice |
| Real Postgres: the real revision rows and the real read | 5c |

## 7. Rollout

No schema push and no worker. Deploy the backend, then the frontend (the old renderer ignores the new fields). The skill's own enable flag (`ASK_SKILL_DIY_ENABLED`) already exists on the `diy` skill and is not a new control. **Expect nothing visible in production** until a template is authored and published (O7) and a project is started from it after the step 1 release (G9): until then every project answers with a refusal and a link to the page.

## 8. Adversarial pass (methodology section 7) [Code-traced; the answers to be tested]

- **The guide is empty on day one (G9).** The plan says so up front (§7) rather than implying a working feature; the value now is the contract, the refusals and the governance, ready for content.
- **Retired is not withdrawn (G4).** Treating every retired revision as withdrawn would show "withdrawn" on every project whose template has since been republished; the rule uses the retirement reason and a test pins both directions.
- **Provenance honesty.** `LEGACY_BACKFILL` revisions make no review claim, so the guide refuses them with the same promise; a hash mismatch refuses and logs.
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
| **S5-2** | The guideability gate and its eight typed refusals (§3.2), each ending in a page link; nothing is guessed for an unreviewable project | Yes |
| **S5-3** | The stale-source rule of §3.3: **withdrawn** = revision retired as `UNPUBLISHED` or `ARCHIVED` (or the template unpublished), keep the snapshot readable; **superseded** or a newer head = disclosure only | Yes |
| **S5-4** | Current step, progress and outline as §3.4 (first non-terminal step in authored order, optional included; the label in words; `asOf`); no previous-step view in this step | Yes |
| **S5-5** | Outline bounded at 40; a project with more steps is `TOO_MANY_STEPS` (page link) | Yes |
| **S5-6** | The step's safety note is emitted as a `BOUNDARY` (caution) block immediately before the guide, with **no new `TASK_GUIDE` field**; revisit when step 6 adds actions that must sit below it | Yes |
| **S5-7** | The tip is behind a local "Show tip" disclosure only when an outline is present; no child help turn (D6) | Yes |
| **S5-8** | Skill and governance entries per O8 for a **read-only** operation: the `diy` skill stays autonomy 1 with effects `READ`, gains the operation, the adapter `diy.project-guide` and `TASK_GUIDE` in its allowed blocks; the move to write effects belongs to step 6 | Yes |
| **S5-9** | One shared mapping from a stored revision to the eligibility input, used by project creation and the guide, so they cannot drift | Yes |
| **S5-10** | No schema change, no worker, no new feature flag; deploy backend then frontend | Yes |
| **S5-11** | The guide reads canonical state on every open and refresh and writes nothing, proven by a write spy in every branch | Yes |
| **S5-12** | Verification: jest component tests and the backend suites now; a real-Postgres read (5c); **one Playwright fixture scenario is optional and needs your separate approval** (the design leaves browser runtime unverified otherwise) | Jest and Postgres now; Playwright only if you ask |
| **S5-13** | Accept that the feature ships with no production content (O7) and that, until a template is published and a project started from it, every project answers with a refusal and a page link | Yes |

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

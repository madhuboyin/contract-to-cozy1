# Start a DIY Project From Ask — Step 8 Implementation Plan

**Date:** October 7, 2026
**Status:** **Approved with four corrections and six edits, now incorporated (§3.2 to §3.6, §4, §7): decisions S8-1 to S8-4 at the owner's calls.** 8A to 8E are built (§11, §12); the Postgres script was run on 2026-10-07 and passes 8/8, and the lock-removal mutation was caught (FRD 1.230). **It needs no schema change.**
**Parent design:** [`ASK_COZY_STATEFUL_GUIDE_DESIGN.md`](ASK_COZY_STATEFUL_GUIDE_DESIGN.md) §13 step 5 ("project creation from Ask", same eligibility and applicability checks as the page), D8 (authorization inside the transaction), O5 (seasonal mapping stays deferred), O7 (no production template yet).
**Follows:** steps 1 to 7, all pushed. Step 7 ([`…PROJECT_COMMANDS_PLAN`](ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md)) supplies the command pattern.
**Labels:** **[Code-traced]** read, not run; **[Executed]** ran. Nothing in this document was executed.

## 1. Goal and boundary

A homeowner can start a project **from a reviewed template** inside Ask, on the same eligibility and applicability rules as the page, and land on the guide with step 1 current.

**In v1:** one read-only template card; one write command `DIY_PROJECT_START`; one shared transactional start authority used by both the page and Ask.

**Out of v1:** AI-guide projects (unreviewed content), `maintenanceTaskId` (deferred, S8-3; only the seasonal mapping O5 would supply it), `incidentId`, `inventoryItemId`, decision verdict and score, a separate "start step" transition, production template content (O7), un-finish or delete of a project.

## 2. What exists today [Code-traced]

- `diyService.createProject` (`diy.service.ts:187`) is reached only by `POST /properties/:id/diy/projects`; the CONTRIBUTOR role is route middleware only.
- The template, its published revision, the integrity check, eligibility, applicability, the skill profile (tool ownership) and the task link are all read **before** `$transaction`. A withdrawal, re-revision, role revocation or tool change between read and create is not seen.
- Nothing prevents two open projects from one template on one property. There is **no uniqueness constraint** over (propertyId, templateId, open status), only separate indexes, and `shareLockGovernanceRows` locks the revision and template rows `FOR SHARE`, which does not serialize two creations.
- `listTemplates` filters published heads on safety and permit and applies eligibility, but does not require `provenance === GOVERNED`, does not run the integrity check, and does not evaluate applicability to a property.
- A new project is `PLANNING`; the first pending step mutation promotes it to `IN_PROGRESS` (`diy.service.ts:775`). Open statuses are exactly `PLANNING` and `IN_PROGRESS` (`OPEN_PROJECT_STATUSES`, `diy.service.ts:45`).
- No transaction-scoped advisory lock exists anywhere in `src/` (searched `pg_advisory`).

## 3. Target behavior

### 3.1 Scope of the command
`DIY_PROJECT_START` takes `{ templateId }` and nothing else. Role CONTRIBUTOR. Artifact type `DIY_PROJECT`. Classified **stoppable, not undoable or deletable** (S8-4): correction mode `STOP`. Confirmation copy: it creates a durable project record that can later be stopped or handed off.

### 3.2 Strict shared template projection (the Ask read)
One shared function, used by the Ask card and by the confirmation, returns a template only if **all** hold: published head revision; `provenance === GOVERNED`; `checkRevisionIntegrity === VERIFIED`; the existing eligibility policy passes; `evaluateDiyApplicability` is `APPLICABLE` for this property. It is **not** `listTemplates`. A legacy-backfill revision is never offered in Ask (consistent with step 5). Until O7 publishes a template the card says there are none.

### 3.3 Duplicate rule and its concurrency mechanism (S8-1)
Open means `PLANNING` or `IN_PROGRESS` only. Inside the start transaction: (1) role check, (2) `pg_advisory_xact_lock(hashtextextended('diy-start:' || propertyId || ':' || templateId, 0))` on the stable (property, template) key, (3) duplicate check for an open project from that template on that property, (4) create. Two simultaneous confirmations serialize on the lock; the second finds the first's committed project and **returns the same winner** as an "already started" result. The lock is released at commit or rollback.
- **Authorization first:** the role check precedes the duplicate lookup, so a revoked member never learns that a project exists.
- **At proposal time** the card may show "you already have this project" with a link to its guide (a courtesy, role-checked). **At confirmation time** the in-transaction result is authoritative.

### 3.4 Confirmation re-checks everything in the write transaction
Inside the transaction, after the lock: re-read the published head revision with `FOR SHARE` on the revision and template rows, governed provenance, integrity, eligibility, applicability (property context read for this property), and the **skill profile** (so copied `userToolAction` reflects confirmation-time ownership). The card may be stale; none of the proposal's findings are trusted.

### 3.5 One authority for the page and Ask (S8-2)
A new typed core `startProjectFromTemplate(tx-owning method)` takes a narrow input `{ propertyId, templateId, actorUserId }`. The page's `createProject` keeps its broad payload and handles the AI-guide, link, verdict and score branches itself; its **template branch** (with its optional task, incident, inventory links and verdict) is routed to the same core through an optional `extras` parameter that Ask never passes. Net effect on the page: the template branch now does its reads, the lock and the duplicate refusal inside the transaction (a deliberate behavior change: a second open project from one template now returns the existing one, status 409 `DIY_PROJECT_ALREADY_OPEN` with the project id, instead of creating a duplicate).

### 3.6 Result
After creation the handler returns the `DIY_PROJECT_GUIDE` card with **step 1 current**. The project stays `PLANNING` until the first step mutation promotes it; no separate start-step transition is added.

## 4. Slices (each with mutation checks, an FRD version bump and a status row in the design doc)

| Slice | Content |
|---|---|
| **8-0** | Read-only trace (§10). Done as code reading; nothing run. |
| **8A** | Backend: strict shared projection (§3.2); `startProjectFromTemplate` with role check, advisory lock, duplicate refusal, in-transaction re-checks and skill-profile read (§3.3-3.5); page template branch moved onto it. Extend `diyTemplateFake.js` to model the advisory lock (a per-key mutex) so the race is testable. |
| **8B** | Ask read-only op `DIY_TEMPLATE_BROWSE`: governed, verified, eligible, applicable templates for the property, with a `START` action per template; empty state. Skill, allow-lists, governance entry. |
| **8C** | Ask write command `DIY_PROJECT_START`: propose and confirm handlers, registry entry (CONTRIBUTOR, `['STOP']`), `OPERATION_ACTION_IDS`, `KNOWN_UNGOVERNED_OPERATIONS` if skill-less, two positive semantic examples, context version, "already started" receipt, best-effort analytics for a newly created project only. |
| **8D** | Frontend: template card and confirmation rendering; calm-shell action visibility (a `TASK_GUIDE`-style card where there are several actions, per the step 7 lesson). |
| **8E** | Owner-run real-Postgres script, read-only queries and runbook (concurrent confirmations, role revocation, template withdrawal between propose and confirm), following the step 5 to 7 pattern. |

## 5. Validation plan

- Unit: projection excludes legacy, hash-mismatch, ineligible and inapplicable templates; start refuses each at confirmation even when the card was fine.
- **Race mutation test:** two concurrent confirmations on the fake produce exactly one project and both callers receive the same project id. **Removing the advisory lock from the code makes this test fail with two open projects** (the mutation is run and its failure recorded). A sequential duplicate check alone is not accepted as proof.
- Authorization: a revoked CONTRIBUTOR gets 403 before any "already exists" detail.
- Page path: template branch now refuses a second open project; AI-guide branch unchanged.
- Governance and startup validators: `startupRegistryValidation.test.js`, `askGovernance` (the six known failures are listed in memory and are not re-attributed to this work).
- Frontend: jest for the card and confirmation; `next build` before pushing.

## 6. Rollout
Backend then frontend. No schema change, so no `prisma db push`. Until O7 publishes a governed template the card shows an empty state and nothing can be started from Ask; the page path is unaffected except for the duplicate refusal.

## 7. Adversarial pass (to be answered by tests) [Code-traced]
1. Two confirmations at once: serialized on the lock, one winner (mutation test). 2. Template withdrawn after the card: refused at confirmation. 3. Role revoked after the card: 403, no existence leak. 4. Stale applicability (property facts changed): refused at confirmation. 5. Tool ownership changed after the card: copied state reflects confirmation time. 6. Replay of the same confirmation: "already started" receipt, same project. 7. Legacy-backfill template: never offered, refused if confirmed directly. 8. A closed project from the same template does not block a new start.

## 8. Risks
- Changing the page's template branch alters deployed behavior (S8-2, approved). A user with a duplicate-open project already can still use it; only new duplicates are refused.
- `hashtextextended` collisions would only cause harmless extra serialization.
- The fake must faithfully model the lock; the owner-run Postgres script (8E) is the real proof and is not run until the owner runs it.

## 9. Decisions
| ID | Decision | Resolution |
|---|---|---|
| S8-1 | Duplicate open project for one template and property | Block; serialize by transaction-scoped advisory lock; confirmation-time result authoritative |
| S8-2 | Page and Ask paths | One transactional template-start authority; narrow typed input |
| S8-3 | `maintenanceTaskId` in v1 | Deferred |
| S8-4 | Classification | Correction mode `STOP`; described as stoppable, not undoable or deletable |

## 10. The 8-0 trace [Code-traced; nothing run]
- Role check pattern: `hasPropertyRoleWithin(tx, actorUserId, propertyId, 'CONTRIBUTOR')` inside `$transaction` (as in `abandonProject`).
- Governance row lock: `shareLockGovernanceRows` (`diyTemplateRevision.service.ts:292`) is `FOR SHARE` on revision then template; reuse it, add the advisory lock before it.
- Command registry shape: `ASK_DOMAIN_COMMAND_REGISTRY` entries via `command(id, op, key, role, artifactType, corrections, cancellation)`; correction modes are `REVERSE | EDIT | REOPEN | STOP`-style arrays; the irreversible list is explicit and `DIY_PROJECT_START` is not on it.
- `evaluateDiyEligibility` and `evaluateDiyApplicability` are pure; applicability needs `getPropertyContext(propertyId, { userId }, { scopes: [...] })`, superseded by §11: it is read on the transaction client.
- Open question for 8A (resolved, see §11): `getPropertyContext` could be given a transaction client with four assemblers changed, so applicability runs inside the transaction. The fallback of reading it before the transaction was NOT taken.

## 11. Record of 8A (backend authority) [Executed where marked; nothing run against Postgres]

Built: `startProjectFromTemplate` (`diy.service.ts`), `services/diy/templateStartPolicy.ts` (the pure revision-level rules, shared by the page and, later, Ask), a `db` argument on `getPropertyContext` (new `PropertyContextTransactionUnsupportedError`) and `transactionAware` on the four assemblers (EXTERIOR, RESPONSIBILITY, SYSTEMS, INVENTORY). Not materially invasive: no other assembler changed.
- Order inside the transaction: role check, advisory lock, duplicate check, task-link check (kept before the template read so a bad link is still reported first), governance share locks in the writers' order then re-read of the head, integrity, eligibility, applicability, skill profile, create.
- The page keeps its broad payload for the AI-guide branch; the template branch passes its links, verdict and score through `extras`. The page's HTTP duplicate outcome is 409 `DIY_PROJECT_ALREADY_OPEN` with `details: { projectId }` only.
- **[Executed]** `tests/unit/diyProjectStart.test.js` (11 tests) and two new tests in `propertyContext.test.js` pass; the existing createProject suites (`diyPublishedTemplateReads`, `diyTaskReconciliation`, `diyHireRequiredBoundary`) pass; `tsc --noEmit` clean. `diyProjectGuide.test.js` had a source-scan pin updated (the eligibility mapping now lives in `templateStartPolicy.ts`).
- **[Executed] mutation:** deleting the `pg_advisory_xact_lock` line from the source makes the race test and the source-scan test fail; the line was restored. The fake gained an `overlap` mode (concurrent transactions, per-transaction row visibility, a modelled advisory lock) because its default serializes every transaction, which would have hidden a missing lock. A hook-level mutation (`skipAdvisoryLock`) is also in the suite.
- Two other tests (`phase4ProjectCompliancePolicy`, `phase8ArchetypeExitGate`) fail on this tree; both fail identically with the 8A tracked edits stashed, so they are not caused by this slice (not investigated).
- **Not proved:** real Postgres lock behavior (8E), the hash of the key in `hashtextextended`, Prisma interactive-transaction timeout under load (set to 15 s).

## 12. Record of 8B to 8E [Executed where marked]

- **Wiring (8B, 8C):** `DIY_TEMPLATE_BROWSE` (read, launch-only) and `DIY_PROJECT_START` (command, CONTRIBUTOR, correction mode STOP) in the operation registry, launch-only list, domain command registry, audience policy, trust policy (block and action ids), impact map (refreshes DIY_PROJECTS and the browse), the `diy` skill (manifest, evaluation, SKILL.md), adapters (`diy.template-browse`, `diy.project-start`), semantic packages (five maps), certification corpus, coverage matrix, and the DIY projects card (declared browse action, first on the empty card). Handlers in `ask/handlers/diyProjectStart.handler.ts`; the strict read is `diyService.listStartableTemplates`; the confirm passes `expectedRevisionId` so a re-revised head is refused (`DIY_TEMPLATE_CHANGED`).
- **Deviation from §3.6:** the receipt carries a one-click "Guide me through this project" action instead of embedding the guide card, because block types and action ids are allow-listed per operation and the guide's own actions belong to other operations.
- **Deviation from §4 (8B):** the browse is launch-only (not routable by text), like the guide, so it does not compete with DIY_PROJECTS; its entry is the action on the DIY projects card. A typed "what DIY projects can I start" therefore does not reach it (not changed: `diyProjectsOtherIntentPattern` already excludes "start").
- **Defect found and fixed during 8E:** `pg_advisory_xact_lock` returns `void`, which Prisma's `$queryRaw` cannot deserialize; the lock now uses `$executeRaw` (the fake models both). The fake could not have caught this; the real-Postgres script is what would.
- **[Executed]** `tests/ask/diyProjectStart.test.js` (15), `tests/unit/diyProjectStart.test.js` (11), frontend `diyProjectStart.test.tsx` (4); governance counts updated (130 operations, 52 commands); `askTrustArchitecture` certification passes after the browse answer was reworded to score above the competing operation. Mutations run: dropping `expectedRevisionId` and setting `requireGoverned: false` each make a test fail; removing the GOVERNED filter from the browse QUERY alone does NOT (the second layer, `evaluateTemplateStart`, still refuses legacy), so the query filter is an optimization, not the control.
- **Not executed:** the Postgres script (8 tests) and `diy-project-start-inflight.pgadmin.sql`; the manual mutation (remove the lock line) is described in the rollout; any browser; the calm shell; the template page redirect.
- **Known unrelated failures** at baseline: `askGovernance` routing, `skillEvaluationRegistry`, `phase4ProjectCompliancePolicy`, `phase8ArchetypeExitGate`.

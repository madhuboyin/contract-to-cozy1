# Maintenance — Phase 10 retirement evidence packet (draft 1)

**Date:** October 20, 2026. **Status:** NOT ready to retire. **Scope:** FRD §16 retirement gate, applied to the maintenance route family (plan §14 step 1-2).
**Method (per `AUDIT_METHODOLOGY.md`):** every row is labelled **[traced]** (read in code, not run), **[run-mocked]** (a test ran against mocked responses or fixtures) or **[run-real]** (ran against a real database or browser with real backend). Nothing below is [run-real] except what the Phase 9 database harness covers, and that harness did not exercise maintenance writes. "Not established" means I did not find evidence either way.

## 1. What the family is

| Route | What it does [traced] | Ask successor |
|---|---|---|
| `/dashboard/properties/[id]/maintenance` | The full page: `MaintenancePageClient` (683 lines) | Work destination + `MAINTENANCE_*` operations |
| `/dashboard/maintenance` | Redirects to the property page, or to the Job Hub when no property is chosen | Same |
| `/dashboard/maintenance-setup` | Template browser/installer (466 lines) | `MAINTENANCE_TEMPLATES_BROWSE` (install parity not established) |
| `/dashboard/properties/[id]/focus/maintenance/[taskId]` | **Not maintenance tasks.** It reads the home-buyer checklist (`getHomeBuyerChecklist`) | Belongs with the buyer family, not this one |

**Registry finding [traced].** `askRouteRetirementRegistry.ts` has no maintenance entry. Property maintenance sits inside `property-work` (with projects, renovations, buyer plan, guidance, new-home plan, seller prep) and top-level maintenance inside `top-level-work` (with diy, bookings, moving concierge, resolution center, modifications). The registry cannot mark maintenance certified or retired without retiring those siblings. **Step zero of Phase 10 is splitting these two entries** so maintenance has its own `routePattern`, state and evidence list. The `focus/maintenance` pattern also currently sits in `property-intelligence`.

## 2. Ask-side inventory [traced]

Operations: `MAINTENANCE_STATUS` (VIEWER), `MAINTENANCE_TASK_CREATE`, `MAINTENANCE_TASK_COMPLETE`, `MAINTENANCE_TASK_UPDATE` (all CONTRIBUTOR), `MAINTENANCE_FORECAST`, `MAINTENANCE_TEMPLATES_BROWSE`, `MAINTENANCE_BUDGET_FORECAST` (OWNER), `SEASONAL_HOME_CARE`. Update actions: EDIT, RESCHEDULE, ASSIGN, UNASSIGN, ARCHIVE, REOPEN, DELETE, SNOOZE, UNSNOOZE. Completion takes cost and outcome health. Tests: 15 backend files (e.g. `askMaintenanceTaskInput`, `maintenanceRemoveAction`, `maintenanceShelves`, `maintenanceViewStateContinuity`) and `e2e/ask/maintenanceJourney.spec.ts` (9 tests, [run-mocked] in an earlier session; not re-run here).

## 3. Legacy page capabilities and parity

| Legacy capability [traced] | Ask parity | Gap |
|---|---|---|
| Open / completed / all views, completed date range | Status answer states counts and hides completed ("N completed tasks are hidden") | **Completed-history browsing and range not established in Ask** |
| Filters: overdue, due soon, seasonal, priority-only, by system | Counts for overdue/due-soon in the headline | **Filter parity not established**, especially seasonal, priority and system scope |
| Create task | `MAINTENANCE_TASK_CREATE` | None found |
| Edit title, priority, category, due date, recurrence | `EDIT` / `RESCHEDULE` with those fields | None found |
| **Edit task notes** (drawer "Notes" saved as the task description) | `MaintenanceTaskUpdateInputSchema` is `.strict()` and has **no notes/description field** | **Legacy-only field (gate item 16)** |
| Complete with cost and outcome health | `MAINTENANCE_TASK_COMPLETE` (cost, outcomeHealth) | None found |
| **Change outcome health after completion** (drawer "How is the completed work performing?") | Outcome is accepted only at completion in the input schema | **Not established / likely legacy-only** |
| Reopen a completed task | `REOPEN` action | Present |
| **Undo toast after complete or delete** | Not found | **Legacy-only affordance**; REOPEN is a separate step |
| Delete with confirmation | `DELETE` (Remove CTA) | Present |
| Assign / unassign | `ASSIGN` / `UNASSIGN` | Present |
| Snooze reminders | `SNOOZE` / `UNSNOOZE` | Present |
| Task stats strip | Counts in headline | Not established as equivalent |
| Personalized maintenance suggestions | Suggested next actions / seasonal care | Not established |
| Template install flow (`maintenance-setup`) | Browse operation | **Install-from-Ask not established** |
| Deep links (`?taskId`, `?filter`, `?view`, `returnTo`, guidance signal params) | Work resume by `workKey`; maintenance deep links to Ask not mapped | **No successor map written** |

## 4. FRD §16 gate, item by item

| # | Gate item | Status |
|---|---|---|
| 1 | Discovery (language, navigation, suggestion, search, notification) | Language, Work and search covered [run-mocked]; notification continuation covered [run-mocked]; a maintenance-specific discovery test was not located |
| 2 | Read and write parity | **Not met**: notes, post-completion outcome, undo, filters, completed history (section 3) |
| 3 | Canonical source and writer reuse | Handlers call the maintenance services (`PropertyMaintenanceTask.service.ts`, `maintenanceTaskContext.provider`) [traced]; not audited line by line |
| 4 | Stable identity and reopen | Work `workItem:` projection and resolve outcomes [run-mocked, real-DB paging]; maintenance-specific reopen not run |
| 5 | Correction and record management | Update/delete/reopen exist; notes gap above |
| 6 | Paging, filter, search parity | **Not met / not established** (filters, completed range) |
| 7 | Retry, cancel, conflict, access loss, unknown outcome | Unknown-outcome and conflict recovery have fixtures [run-mocked] (`maintenanceJourney` ACUI-005); **journey 4 (stale/conflict) still not browser-certified** (Phase 9 follow-up) |
| 8 | Role reauthorization and confirmation | Floors are CONTRIBUTOR for writes, VIEWER for reads [traced]; viewer refusal in a browser for maintenance not run |
| 9 | Source, freshness, assumptions, limitations | Trust line covered in ACUI-001..003 [run-mocked] |
| 10 | Dependent-result reconciliation | Mutation impact registry (Phase 8) lists maintenance writes [traced]; stale banner [run-mocked] on the claims flow, not maintenance |
| 11 | Keyboard, screen reader, zoom certification | Maintenance Ask flow has keyboard/reduced-motion tests [run-mocked]; **screen-reader and real-device passes are the owner's and are not recorded** |
| 12 | Production-like database and browser acceptance | **Not met**: Phase 9 database harness does not exercise maintenance writes; no real-backend browser run |
| 13 | Analytics through verified domain outcome | Not established |
| 14 | Support and audit runbook | `ASK_CERTIFICATION_RUNBOOK.md` is general; no maintenance-specific runbook |
| 15 | Deep-link and bookmark successor map | **Not met** (section 3) |
| 16 | No legacy-only field, action, export, audit or history view | **Not met**: task notes, post-completion outcome, undo, completed-history view |

## 5. Verdict and the smallest path to certification

**Do not retire maintenance now.** Items 2, 6, 12, 15 and 16 fail or are unevidenced. Work, in order:

1. Split the registry entries so maintenance stands alone (move `focus/maintenance` to buyer); keep `PRESERVE_UNTIL_CERTIFIED`.
2. Close the legacy-only gaps, each a product call: add a notes field to the update command (or record that notes are retired), post-completion outcome edit, undo after complete/delete (or accept REOPEN as the successor), completed-history and filter parity (or declare the structured list a **retained surface** inside Ask, which the plan allows for "bulk-management surfaces").
3. Write the successor map for every query parameter above.
4. Add maintenance writes to the real-database harness and a browser journey 4 (create, complete, stale/conflict, retry).
5. Owner steps already open from Phase 9 (manual accessibility pass, Pi budgets, real-file journeys).
6. Only then change the registry state and make the old routes redirect; remove duplicate UI logic after the successor is live and measured (plan §14 step 5).

**Decision for the owner:** retire the structured maintenance list entirely, or keep it as a retained structured surface inside Ask (cheaper, closes items 6 and 16 without new Ask features)? This changes the whole shape of steps 2-3.

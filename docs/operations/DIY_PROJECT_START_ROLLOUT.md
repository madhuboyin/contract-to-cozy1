# DIY project start from Ask: rollout (step 8 of the stateful GUIDE)

Plan: `docs/architecture/ASK_COZY_DIY_PROJECT_START_PLAN.md`. Slices 8A (the transactional start authority), 8B (the read-only template browse), 8C (the confirmation-gated start), 8D (frontend tests) and 8E (this file, the owner-run Postgres script and the read-only queries) are written. **Nothing has been applied to a database or deployed, and the Postgres script and the read-only queries have never been executed by their author.**

> **Update 2026-10-07:** the step 8 scratch script was run in a Claude Code session against a throwaway local Postgres 15 and passes (after script-only fixes to stale assumptions; no product change). The "never executed" wording below is historical. A browser pass, the worker and the Docker/Pi images are still unrun. The lock-removal mutation was run by hand: 8 open projects instead of 1, so the script does prove serialization.

## What ships, and what does not

- **Ask:** a read-only **template browse** (launch-only: from the new "See projects you can start" action on the DIY projects card) and the confirmation-gated **Start this project** (from a browse row only; a contributor or owner). It starts a project **only from a reviewed template**: a published head that is governed, hash-verified, eligible and applicable to the home. The confirmation says it creates a durable project record that can later be **stopped or handed off, but not undone or deleted**, and that nothing is booked, bought or scheduled. The receipt offers "Guide me through this project" (one click to the guide with step 1 current).
- **Changes that also affect the project page (deployed behavior):** the page's `POST /properties/:id/diy/projects` **template branch now goes through the same transactional authority.** A second open project from the **same template on the same property now returns `409 DIY_PROJECT_ALREADY_OPEN` with only `{ projectId }`** instead of creating a duplicate. The role, the published revision, integrity, eligibility, property applicability, the linked-task check and the skill-profile tool ownership are now read **inside the transaction**. The AI-guide branch is unchanged. The task-link check still runs before the template lookup, so a bad link is still reported first.
- **Property context:** `getPropertyContext` can now be given a transaction client; four assemblers (exterior, responsibility, systems, inventory) read through it, and any other scope is refused with a transaction client (never silently read on the shared client).
- **Not in v1:** a linked maintenance task, incident, inventory item, decision verdict or AI guide from Ask; a seasonal-to-DIY mapping (O5); a way to un-start or delete a project; production template content (O7). **Expect nothing visible in production until a governed template is published:** the browse says there are no reviewed projects yet.
- **No schema change, no worker change, no new flag** (`ASK_SKILL_DIY_ENABLED` applies). The `diy` skill gains two operations (the registry validation on first start matters; both are in the skill, so neither needs the ungoverned allowlist).

## The order

1. Backend, then restart (a `:latest` tag does not restart by itself). Watch the first start for a registry-validation failure.
2. Frontend: one small change (the DIY template page redirects to the existing project on `DIY_PROJECT_ALREADY_OPEN`); the generic Ask renderer carries the new actions with no frontend change. An old frontend shows the 409 message on the template page and renders the Ask actions as ordinary declared actions.

## The real-Postgres script (owner-run)

`apps/backend/tests/scratch/diyProjectStart.scratch.js` (8 tests). It runs the real handlers, the real `diyService`, the **real property-context assemblers** (not stubbed) and real template governance against an **empty throwaway** Postgres. It refuses any database whose name does not contain `scratch`, any non-local URL and port 5433, truncates the tables it seeds, and creates a `scratch_write_log` table and `scratch_spy` triggers (dropped again).

Set up a scratch cluster and a database with the **current** schema as in `DIY_TASK_RECONCILIATION_ROLLOUT.md` ("Running the real-Postgres acceptance"), named `scratch_c2c_8e`, then, from `apps/backend`:

```bash
SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_8e node --test tests/scratch/diyProjectStart.scratch.js
```

Without the variable it prints a skip line and exits 0; with a non-scratch URL it refuses and exits 1. Both were checked, and the module graph was checked to load (against a closed port all 8 tests fail only with "Can't reach database server"); the database assertions were not run.

**What it is meant to show:**

1. **Browse:** a governed, published template is listed with the start action for a contributor and none for a viewer; a draft and a withdrawn template are not; browsing and proposing write nothing (triggers); the real property context is read.
2. **Start:** writes only the project, its steps (and materials and tools when present) and nothing in tasks, home events, incidents or the outbox; **every property-context read inside the start used the transaction client**; analytics once; the project is `PLANNING` with its steps `PENDING`.
3. **Real race:** eight simultaneous confirmations leave exactly **one** open project, one `STARTED` and seven `ALREADY_STARTED` receipts, one winner, one analytics event; two different templates are independent.
4. **Real race on the page path:** five simultaneous page creations produce one project and four `409 DIY_PROJECT_ALREADY_OPEN` carrying only the winner's id; an Ask start against it is "already started".
5. **The advisory lock** held by another transaction (the same key the service computes) makes a start **wait**, then proceed. This also proves `SELECT pg_advisory_xact_lock(...)` runs through `$executeRaw` (its `void` result breaks `$queryRaw`).
6. **Role inside the transaction:** a member demoted in the database after the proposal is refused; a viewer or a stranger is refused with 403 **before** any "already exists" answer.
7. **The share lock:** a withdrawal that starts first makes a start wait and then refuse; a held share lock makes a withdrawal wait.
8. **Re-revised after review:** a re-published template refuses the old proposal; a stopped project does not block a new start.

**The mutation check (run BY HAND, once).** In `src/services/diy.service.ts`, comment out the `pg_advisory_xact_lock` line in `startProjectFromTemplate`, run the script, and expect the **REAL RACE** test (and probably the page-path race) to **fail with more than one open project**. Restore the line. If the race tests still pass with the lock removed, the script is not proving serialization (the project row has no uniqueness constraint) and must be fixed before it is believed. The same mutation was run against the fake in the unit tests and failed as expected; that does not prove Postgres behavior.

**How to read a failure.** Because the database assertions have never run, a first failure may be a mistake in the script (a column, a role row, a timing assumption, the exact set of tables written, how `UNPUBLISH` then `PUBLISH` creates a new revision) as well as a product problem. Read the failing assertion first. The lock tests are **timing-based** (a call still unresolved after 1.5 seconds counts as "waiting").

## Read-only queries

`apps/backend/prisma/diy-project-start-inflight.pgadmin.sql` (also never executed; fix a query if it errors). 1: **open duplicates per property and template (expect 0 rows after the release; older rows may exist)**. 2: projects with no steps (expect 0). 3: starts by day and revision provenance. 4: open projects whose revision was withdrawn. 5: projects started by someone no longer a contributor or owner. 6: waiting advisory locks and long-held transactions. **The project row does not record the surface, so Ask starts cannot be counted separately from page starts.**

## Checks after deploy (manual, in a browser; none has been run)

- With no published governed template: "Show my DIY projects" (or a card with none) offers "See projects you can start"; the browse says there are no reviewed projects yet, with the page link.
- After a governed template is published (O7): the DIY projects card, then "See projects you can start": the template appears with its steps and time. As a viewer: no Start button. As a contributor: press "Start this project", read the confirmation (stoppable, **cannot be undone or deleted**, nothing booked or bought), confirm, and check the receipt, then "Guide me through this project" lands on step 1 with focus and announced position behaving.
- Press the start twice quickly, and from two tabs: one project only; the second shows "Already started". The template page's own "Start project" for the same template should take you to the existing project (the template page now redirects on `DIY_PROJECT_ALREADY_OPEN`; **this one small frontend change has not been seen in a browser**, and it only applies to the template page, the one page call that starts from a template).
- Withdraw the template between the card and the confirmation: the confirmation is refused with a plain message; nothing is created.
- Demote or remove a member while they have the confirmation open, then confirm: refused.
- In the calm shell, the empty DIY projects card shows "See projects you can start" as its first action (a SUMMARY shows only its first action there).
- Keyboard and screen-reader pass; a narrow phone width.

## What none of this covers

A real browser, the template page redirect, the Docker and Raspberry Pi images, production-sized data and real concurrent load, the worker, and the step 5, 6 and 7 scratch scripts (still unrun).

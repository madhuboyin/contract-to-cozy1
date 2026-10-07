# DIY step commands: rollout (step 6 of the stateful GUIDE)

Plan: `docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md`. Slices 6a (backend) and the 6b frontend change are pushed. 6c (this file, the owner-run Postgres script and the read-only queries) is written. **Nothing has been applied to a database or deployed, and the Postgres script and the read-only queries have never been executed by their author.**

> **Update 2026-10-07:** the step 6 scratch script was run in a Claude Code session against a throwaway local Postgres 15 and passes (after script-only fixes to stale assumptions; no product change). The "never executed" wording below is historical. A browser pass, the worker and the Docker/Pi images are still unrun.

## What ships, and what does not

- **Ask's first write for DIY.** The operation `DIY_STEP_UPDATE`: on the project guide card, a contributor or owner can press **Mark this step done** (current step) or **Skip this step** (only an optional step with no safety note), review a confirmation that repeats the step's safety note, and confirm. The receipt says "Marked done by you" / "Skipped by you" and that Cozy does not check the work.
- **One change to a shared service that also affects the project page:** `diyService.updateStep` now checks the actor's CONTRIBUTOR access **inside its own transaction**, for every caller. A viewer, a removed member, or someone demoted after the page loaded now gets a 403 `DIY_ACCESS_REVOKED` from the step endpoints even if a route check was passed a moment earlier. Expect no change for people who legitimately can edit.
- **No schema change, no worker, no new flag.** The `diy` skill's existing flag (`ASK_SKILL_DIY_ENABLED`) applies. The skill now declares write effects (autonomy 2), so **the start-up registry validation matters on the first start: a missing registration would stop the backend from starting, so watch it.**
- **Expect nothing visible in production yet** (decision O7: no published production template, and every earlier project has no recorded revision). The step is reachable only for a project started from a reviewed, published template.
- Still on the project page, not in Ask: starting a step, reopening, notes, photos, completing or abandoning a project, and recovery of a stuck completion (step 7).

## The order

1. Backend, then restart (a `:latest` tag does not restart by itself). Watch the first start for a registry-validation failure.
2. Frontend. An old frontend still renders the new actions as buttons (they are ordinary declared actions); a new frontend before the backend shows nothing new.
3. Steps 1 to 5 of the stateful GUIDE have their own rollouts and are what make a project guideable.

## The real-Postgres script (owner-run)

`apps/backend/tests/scratch/diyStepUpdate.scratch.js` (8 tests). It runs the real propose and confirm handlers, the real `updateStep` with its in-transaction role check and Ask policy, real template governance and the real guide handler against an **empty throwaway** Postgres. It refuses any database whose name does not contain `scratch`, any non-local URL and port 5433, truncates the tables it seeds, and creates a `scratch_write_log` table and `scratch_spy` triggers (which it drops again). It needs no `psql`.

Set up a scratch cluster and a database with the **current** schema as in `DIY_TASK_RECONCILIATION_ROLLOUT.md` ("Running the real-Postgres acceptance"), named `scratch_c2c_6c`, then, from `apps/backend`:

```bash
SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_6c node --test tests/scratch/diyStepUpdate.scratch.js
```

Without the variable it prints a skip line and exits 0; with a non-scratch URL it refuses and exits 1. Both were checked, and the module graph was checked to load; the database assertions were not run (against a closed port every test fails only with "Can't reach database server").

**What it is meant to show:**

1. A real proposal and confirmation: the safety note repeats in the confirmation; the step is done as the actor; exactly one ledger row; the project starts; the real guide then shows the next step with the next step's actions (and no Skip for a required step).
2. **What a command writes, by database triggers:** a proposal and a guide read write nothing; a confirmed command writes only the step, the project and one ledger row (plus, on first use, possibly a household membership row for a pre-household owner), and no outbox event, task, home event or template row.
3. The Ask policy inside the real transaction: not the current step, a required skip, an unlisted target and a withdrawn guide each refuse and change nothing; the page path still works out of order and on a withdrawn guide.
4. **The role is checked inside the transaction against the real table:** a viewer, an unknown user, a member demoted after the handler's check and a removed member are refused, with nothing changed.
5. **The share locks with real concurrent transactions:** a withdrawal that starts first makes the step command wait and then refuse; a step command holding the lock makes a withdrawal wait. This is the one thing the database-free tests cannot show.
6. Two concurrent confirmations of one step: exactly one ledger row.
7. The page finishing a later step after a proposal: the early check refuses; the transaction alone still allows the step while it is the current one.
8. A withdrawn guide offers no advancing action to anyone.

**How to read a failure.** Because the database assertions have never run, a first failure may be a mistake in the script (a column, a role row, a timing assumption) as well as a product problem. Read the failing assertion first. Points that need care: the lock test is **timing-based** (it treats a call still unresolved after 1.5 seconds as "waiting"; on a very slow machine raise the wait); the script inserts `household_members` rows and changes a role in the middle of a test; and test 2 allows a first-use `household_members` insert.

## Read-only queries

`apps/backend/prisma/diy-step-update-inflight.pgadmin.sql` (also never executed; fix a query if it errors). 1: what Ask would offer per open project (the current step, and whether Skip would be offered). 2: out-of-order progress (informational). 3 to 5: invariants that should return no rows after this release (a finished step without its ledger row, a completed step without an actor, a skipped required or safety step). 6 and 7: step changes by non-members and by viewers, to look for the revocation window (older rows may appear; compare dates). 8: long-held transactions, for a stuck lock. **The ledger does not record the surface, so Ask commands cannot be counted separately from page changes.**

## Checks after deploy (manual, in a browser; none has been run)

- On a project started from a published reviewed template, as a contributor: open the guide in Ask, press **Mark this step done**, read the confirmation (safety note repeated), confirm, and check: the receipt wording, the guide refreshing to the next step, focus landing on the guide heading and the new position being read out.
- The Skip button appears only on an optional step with no safety note.
- As a viewer: no step buttons on the card; the page buttons are unaffected for contributors.
- Change the same step on the project page between opening the confirmation and confirming: a plain "changed, review it" answer.
- Unpublish the template and reopen the guide: "withdrawn", no step buttons.
- Remove or demote a member while they have a confirmation open, then confirm: refused.
- Keyboard and screen-reader pass over the card and the confirmation; a narrow phone width.

## What none of this covers

A real browser, the Docker and Raspberry Pi images, production-sized data and concurrent real load, the built-worker smoke, and everything about project completion, abandonment, reopening and recovery from Ask, which is step 7.

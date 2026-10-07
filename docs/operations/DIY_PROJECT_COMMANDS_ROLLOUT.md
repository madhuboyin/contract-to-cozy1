# DIY project commands: rollout (step 7 of the stateful GUIDE)

Plan: `docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md`. Tracks 7A (previous-step view and Reopen), 7B (Finish, Stop, Hand off) and 7C (the finished-project view and recovery) are pushed. 7D (this file, the owner-run Postgres script and the read-only queries) is written. **Nothing has been applied to a database or deployed, and the Postgres script and the read-only queries have never been executed by their author.**

## What ships, and what does not

- **Ask commands, all from the project guide, all confirmation-gated, all the person's own report (nothing is verified):**
  - **Reopen** a finished step (a third action of the step operation), offered from a read-only previous-step view ("Previous step" on the card, and "Review last step" when every step is resolved).
  - **Finish this project** once every step is resolved. **Cannot be undone in Cozy.** It queues a home-history record and, when a valid linked task exists, queues it to be marked done as DIY work; it never changes an incident; the receipt says the records are being recorded, never that they exist.
  - **Stop this project** and **Hand this off to a pro**, behind a separate read-only "Stop or hand off" card. **Cannot be undone in Cozy.** Neither touches a linked task or an incident; a hand-off books and contacts nobody.
  - **Record my completion again** (on a finished project's view) and **Update my linked task again** (on an open project's guide), each only when its own status says the earlier request was dead-lettered; they only queue the same request again and never say it worked.
- **Changes that also affect the project page:** `abandonProject` now checks the person's CONTRIBUTOR access **inside its transaction** (a viewer or removed member gets a 403 `DIY_ACCESS_REVOKED`), and the two retry endpoints (`completion-effects/retry`, `task-reconciliation/retry`) now run their role check, lookups, eligibility check and re-queue as **one transaction**. Expect no change for people who legitimately can edit.
- **The `diy` skill is now declared `IRREVERSIBLE`** (the first skill that is) and carries seven operations. **The start-up registry validation matters on the first start: a missing registration would stop the backend from starting, so watch it.**
- **No schema change, no worker change, no new flag** (`ASK_SKILL_DIY_ENABLED` applies). **Expect nothing visible in production yet** (decision O7: no published production template; earlier projects have no recorded revision).
- Still on the project page, not in Ask: starting a step, notes and photos, actual time, cost and notes at completion, un-finishing or un-stopping a project (no such operation exists anywhere), and incident changes.

## The order

1. Backend, then restart (a `:latest` tag does not restart by itself). Watch the first start for a registry-validation failure. The worker needs **no** change: it already handles the completion and reconciliation events.
2. Frontend. An old frontend still renders the new actions as buttons (they are ordinary declared actions); a new frontend before the backend shows nothing new.
3. Steps 1 to 6 of the stateful GUIDE have their own rollouts and are what make a project guideable.

## The real-Postgres script (owner-run)

`apps/backend/tests/scratch/diyProjectCommands.scratch.js` (10 tests). It runs the real propose and confirm handlers, the real `diyService` (with its in-transaction role checks and Ask policies), real template governance and the real guide handler against an **empty throwaway** Postgres. It refuses any database whose name does not contain `scratch`, any non-local URL and port 5433, truncates the tables it seeds, and creates a `scratch_write_log` table and `scratch_spy` triggers (which it drops again). It needs no `psql`. **The worker does not run: nothing here proves that a home-history record or a task completion is ever created.**

Set up a scratch cluster and a database with the **current** schema as in `DIY_TASK_RECONCILIATION_ROLLOUT.md` ("Running the real-Postgres acceptance"), named `scratch_c2c_7d`, then, from `apps/backend`:

```bash
SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_7d node --test tests/scratch/diyProjectCommands.scratch.js
```

Without the variable it prints a skip line and exits 0; with a non-scratch URL it refuses and exits 1. Both were checked, and the module graph was checked to load; the database assertions were not run (against a closed port every test fails only with "Can't reach database server").

**What it is meant to show:**

1. **7A:** a view and a proposal write nothing (triggers); Reopen writes only the step, the project row and one `STEP_REOPENED` ledger row, clears the completion fields and returns the guide to that step; with every step resolved "Review last step" still reaches Reopen; an unfinished step, a withdrawn guide and a role changed in the database after the handler's check are refused.
2. **7B Finish:** the project row, one ledger row and **one** outbox row, and nothing in tasks, home events or incidents; the outbox row stays `PENDING`; analytics once; a replay is "already" with no second row.
3. **7B Finish with a linked task:** the Ask command leaves the task row byte-for-byte unchanged.
4. **7B Stop and Hand off:** the project row and one ledger row only; a linked task untouched; nothing in the outbox; closed projects refused; a viewer and a stranger refused **inside** the service transaction (the page path).
5. **7C Recovery:** only a dead letter is re-queued, once, with who and how many times recorded; the finished view offers it only then; a project, a task and an incident are untouched; statuses that are not dead letters are left alone; two recoveries at once re-queue exactly once; a viewer and a removed member are refused inside the transaction.
6. **7C Task-link recovery on an open project**, and a project closed from its linked task showing no action.
7. **Real concurrency:** Finish racing a step reopen (four rounds) never leaves a `COMPLETED` project with an unfinished step and writes the outbox row exactly when the project completed; Finish against a withdrawal waits for the share lock and then refuses; a held lock makes a withdrawal wait.

**How to read a failure.** Because the database assertions have never run, a first failure may be a mistake in the script (a column, a minimal row such as the maintenance task, a role row, a timing assumption) as well as a product problem. Read the failing assertion first. Points that need care: the lock and race tests are **timing-based** (a call still unresolved after 1.5 seconds counts as "waiting"); the script inserts `household_members` rows and changes a role in the middle of a test; the minimal `property_maintenance_tasks` and `domain_events` rows it creates may need a column added if the schema requires one; and the "a project closed from its linked task" check sets that state with raw SQL.

## Read-only queries

`apps/backend/prisma/diy-project-commands-inflight.pgadmin.sql` (also never executed; fix a query if it errors). 1: where the records after completions stand, by outbox status. 2 to 4: invariants that should return no rows (a normally completed project with no outbox row, with an unfinished step, or missing the fields its status implies). 5 and 6: dead-lettered DIY requests waiting to be queued again, and requests recovered more than once. 7: reopened steps. 8: project-level changes by non-members or viewers (compare with removal dates). 9: stopped or handed-off projects whose linked task is still open (expected). 10: long-held transactions. **The ledger does not record the surface, so Ask commands cannot be counted separately from page changes.**

## Checks after deploy (manual, in a browser; none has been run)

- On a project started from a published reviewed template, as a contributor: finish steps through Ask, press "Previous step", read the earlier step (its own safety note above it), press "Reopen this step", read the confirmation, confirm, and check the guide returns to it and that focus and the announced position behave.
- Resolve every step: the card says so and offers "Finish this project", "Review last step" and the page link (all three must be visible in the calm shell).
- Press "Finish this project": read the confirmation (queue wording, cannot be undone), confirm, and check the receipt says "Recording your completion". After the worker runs, check the page for the home-history record and any linked task.
- Press "Stop or hand off": the options card shows both choices and Back (all three visible); each confirmation says it cannot be undone; neither changes a linked task.
- With a dead-lettered event, check the recovery action appears only then, and that after it the status reads "Recording your completion" again.
- As a viewer: no step, finish, stop or recovery buttons; the read-only navigation (Previous step, Review last step, Back) still works.
- Withdraw the template and reopen the guide: no step, reopen or finish buttons; "Stop or hand off" is still offered.
- Remove or demote a member while they have a confirmation open, then confirm: refused.
- Keyboard and screen-reader pass; a narrow phone width.

## What none of this covers

A real browser, the Docker and Raspberry Pi images, production-sized data and real concurrent load, the worker's side of the completion (the home-history record and the task completion), the built-worker smoke, and the step 5 and step 6 scratch scripts (still unrun).

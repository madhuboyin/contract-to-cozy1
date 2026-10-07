# DIY project guide: rollout (step 5 of the stateful GUIDE)

Plan: `docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md`. Slices 5a (backend) and 5b (frontend) are pushed. 5c (this file, the owner-run Postgres script and the read-only queries) is written. **Nothing has been applied to a database or deployed, and the Postgres script and the read-only queries have never been executed by their author.**

> **Update 2026-10-07:** the step 5 scratch script was run in a Claude Code session against a throwaway local Postgres 15 and passes (after script-only fixes to stale assumptions; no product change). The "never executed" wording below is historical. A browser pass, the worker and the Docker/Pi images are still unrun.

## What ships, and what does not

- A **read-only** Ask operation, `DIY_PROJECT_GUIDE`, launched only by the row action "Guide me through this project" on a DIY projects list row. It writes nothing; every step is marked done on the project page.
- **No schema change, no worker, no new flag.** The `diy` skill's existing enable flag (`ASK_SKILL_DIY_ENABLED`) applies unchanged.
- **Expect nothing visible in production yet.** There is no production template (decision O7, waiting for a named content owner) and every project created before the template-revisions release has no recorded revision, so every project answers with a refusal and a link to the project page, and the list rows offer no guide action. This release **establishes a governed capability; it delivers no usable production guide until the first template is authored, reviewed and published and a project is started from it.**

## The order

1. Backend, then restart (a `:latest` tag does not restart by itself). It registers the new operation at start-up; the start-up registry validation runs then, and a missing registration would stop the backend from starting, so watch the first start.
2. Frontend. (An old frontend simply ignores the two new optional fields, so the order is not critical; a new frontend before the backend renders nothing new.)
3. Steps 1 to 4 of the stateful GUIDE (template revisions, transitions, completion outbox, reverse reconciliation) have their own rollouts and are what make a project guideable; this release does not depend on them being applied, it simply refuses until they are.

## The real-Postgres script (owner-run)

`apps/backend/tests/scratch/diyProjectGuide.scratch.js` (9 tests). It runs the real handler and read, the real template governance, `createProject` and step transitions against an **empty throwaway** Postgres. It refuses any database whose name does not contain `scratch`, any non-local URL and port 5433, truncates the tables it seeds, and creates a `scratch_write_log` table and `scratch_spy` triggers (which it drops again). It needs `psql` (`PSQL_BIN`) for the legacy-revision backfill step.

Set up a scratch cluster and a database with the **current** schema as in `DIY_TASK_RECONCILIATION_ROLLOUT.md` ("Running the real-Postgres acceptance"), with a database named `scratch_c2c_5c`, then, from `apps/backend`:

```bash
PSQL_BIN=/usr/local/opt/postgresql@15/bin/psql SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_5c node --test tests/scratch/diyProjectGuide.scratch.js
```

**What it is meant to show:**

1. A project copied by the real `createProject` from a really published revision is guided: the strict step rule holds after jsonb and text columns (non-ASCII text, a trailing space, absent versus null fields, sparse step numbers 1, 3, 7, 9).
2. The real step transitions move the progress as the plan defines it (one-based position, `completed` counting only completed steps, skipped steps named separately, reopening moving "current" back).
3. Every refusal on real rows (AI guide, no template, no revision, a legacy revision from the real backfill, a tampered hash, ineligible content, too many steps, finished projects) and nine individual alterations of a project's steps, each refused.
4. Withdrawn (unpublish) and superseded (a corrected revision published) on real revisions.
5. Another property's project, an unknown id and a wrong entity type all answer "couldn't find".
6. The real list and the row action.
7. **A guide read performs no write**, measured by database triggers on every DIY table, the outbox, tasks and home events, not by a spy in JavaScript.

**How to read a failure.** Because the database assertions have never run, a first failure may be a mistake in the script (an assumption about a column or about what template governance allows) as well as a product problem. Read the failing assertion first. Two points are expected to need care: template governance may refuse to publish a high-risk or a 41-step template (the script then reports that and skips those sub-checks, it does not fail), and the script assumes a partial `adminUpdateTemplate({ title })` on a live template saves a draft that can be resubmitted.

## Read-only queries

`apps/backend/prisma/diy-project-guide-inflight.pgadmin.sql` (also never executed; fix a query if it errors). 1: open projects by origin (only a reviewed template revision can be guided). 2: where those revisions stand (current, superseded, withdrawn). 3: how many published, reviewed templates exist (expected 0 until O7). 4: an approximate pre-check of the step match (the guide's own check is stricter).

## Checks after deploy (manual, in a browser; none has been run)

- On a project started from a published reviewed template: open the DIY projects list in Ask, press "Guide me through this project", and read the card: progress in words, the safety note directly above the card, the outline with the current step marked, the tip behind "Show tip".
- Mark a step done on the project page, then refresh the guide answer: "current" moves on.
- A project from an AI guide, and one started before revisions existed: no guide action on the row; if you launch one by other means, a plain refusal with the page link.
- Unpublish the template and reopen the guide: "withdrawn", with the steps still readable.
- Screen-reader and keyboard pass over the card (the state text, `aria-current`, the tip button), and a narrow phone width (the outline should be one column).

## What none of this covers

A real browser (layout, focus rings, screen-reader output), the Docker and Raspberry Pi images, production-sized data, and any command from Ask: **step 6** (`DIY_STEP_UPDATE`, completion, abandonment) is where Ask first writes, reverses the `diy` skill's read-only stance, and must reconsider how the safety note and an advancing action sit together.

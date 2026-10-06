# DIY template revisions — rollout runbook

**Status:** ready for the owner to run. Written October 6, 2026 with slice 1e of
[`ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md`](../architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md). **Nothing in this runbook has been run against your
development or production database.** Everything below was exercised on a throwaway local Postgres (section 6).

## 1. What changes, and why the order matters

Homeowners now see each DIY template's **published revision**, not the editable template row, and a project records which revision it copied. Templates
that are live today have no revision, so **if the new code runs before the backfill, the homeowner DIY library is empty and no template project can be
started.** The order is binding:

1. back up, then look at the current state;
2. apply the schema (additive);
3. run the backfill, then the verification;
4. deploy the backend and frontend, and restart them.

## 2. Before you start

- Take a backup the way you normally do (`infrastructure/scripts/backup/pg_backup.sh` exists for the cluster).
- Run `apps/backend/prisma/diy-template-revisions-verify.pgadmin.sql` (read-only) **now** and note the result of check 4: the templates in `REVIEW` or
  `APPROVED`. They were sent for review before revisions existed, so after the deploy an admin must **return each to draft and submit it again** before it
  can be approved or published (approve and publish are refused with "return it to draft and submit it again"; Return to draft works, including from
  Pending Reviews for approved ones). If you would rather avoid that, let those reviews finish before the deploy.

## 3. Steps

### 3.1 Schema (additive)

Edit nothing: `apps/backend/prisma/schema.prisma` already contains the change. Against the target database:

```bash
cd apps/backend
npx prisma db push          # adds diy_template_revisions, diy_project_templates."publishedRevisionId", diy_projects."templateRevisionId" and two enums
npx prisma generate
cd ../workers && npx prisma generate
```

Read the `db push` output: it should list only additions. If it asks to drop or alter existing data, stop and do not accept.

### 3.2 Backfill (hand-run SQL, idempotent, one transaction)

Run `apps/backend/prisma/diy-template-revisions-backfill.pgadmin.sql` in pgAdmin. It inserts revision 1 (provenance `LEGACY_BACKFILL`, no hash) for every
`ACTIVE` template and points the template's published head at it. It changes no template content or status and touches no `DRAFT`, `REVIEW`, `APPROVED`
or `ARCHIVED` template. The final query lists the live templates with their head; every row should show a revision and `LEGACY_BACKFILL`. Running it
again inserts and updates nothing.

### 3.3 Verify

Run `apps/backend/prisma/diy-template-revisions-verify.pgadmin.sql` (read-only):

| Check | Expected |
| --- | --- |
| 1. `ACTIVE` templates without a head | **0 rows** |
| 2. a head that is missing or belongs to another template | **0 rows** |
| 3. a backfilled revision that differs from its template row (step count, headline fields) | **0 rows** (until someone edits the template) |
| 4. templates in `REVIEW` or `APPROVED` with no open revision | the list from section 2; **each needs return to draft and resubmit** |
| 5, 6. information | revisions by provenance; existing projects have no revision and are not offered as reviewed guides in Ask |

Do not deploy until checks 1 to 3 are clean.

### 3.4 Deploy

Build and deploy the backend and frontend with your usual process, then **restart the pods explicitly** (a new `:latest` image does not restart them on its
own). Rebuild workers only if you rebuild everything; they do not use the revision code.

### 3.5 After the deploy

- Backend start-up logs: there should be **no** `[DIY] templates are ACTIVE with no published revision` warning. A second warning, about templates in `REVIEW`
  or `APPROVED` that predate revisions, is expected until you have returned and resubmitted them.
- The homeowner DIY library lists the same templates as before. Start a project from one.
- Admin: the DIY templates list shows **Live: revision 1 · legacy, not re-reviewed** beside each backfilled template. That is accurate: they were live and
  approved before revisions existed, and are not treated as reviewed in Ask. To replace one with a reviewed revision, edit it, submit it for review, and
  approve and publish it; the new governed revision supersedes the legacy one.

## 4. What homeowners and admins will notice

- **Homeowners:** nothing changes on day one. After that, an admin editing a live template no longer changes what they see until a new revision is
  published; withdrawing a template removes it at once.
- **Admins:** reviewed content is frozen in review, approved and archived (only featured order and the Gemini hint can still be saved); editing a live
  template saves a draft while the published version stays live; Return to draft is available for approved templates; Unpublish and Archive are available
  for any template with a live version.
- **A fix that ships with this (found by the scratch run):** starting a DIY project, from a template or from an AI guide, read the new project back through the
  global database client inside its own transaction. On the scratch Postgres the old code threw "Project not found" and rolled the project back. It now reads
  through the transaction. I have not observed production, so I cannot say whether starting a project was failing there; if it was, it will start working.

## 5. Rollback

All schema changes are additive and the backfill only adds rows. To go back, redeploy the previous backend and frontend: reads return to the template row,
and the new table, columns and rows are ignored. Nothing needs to be dropped. (Do not run the backfill again after a rollback and an edit session: it is
safe, but a legacy snapshot of a template edited since is then a snapshot of the edit.)

## 6. What was tested, and how to repeat it

A throwaway Postgres 15 (the same major version as production) with its own data directory and port, loaded with the full schema generated by
`prisma migrate diff --from-empty`, **never your database** (the project `.env` points at a local dev database on port 5433, which the script refuses to use).
`tests/scratch/diyTemplateRevisions.scratch.js` runs the real services, the real Prisma client and the real SQL files against it: 18 checks, all passing on
the final run:

- before the backfill the library is empty, a project cannot start, and the start-up check reports the right counts (this reproduces the outage the order
  above prevents); the verification SQL finds the problems;
- the backfill creates one legacy revision per live template with the right content, sets the heads, changes nothing else, and is idempotent; verification is
  then clean apart from the templates to resubmit;
- library filters, search, tag search, title ordering through the revision, cursor paging and featured order work on real Postgres; draft, review and
  archived templates stay invisible;
- a project can be started from a legacy revision and from an AI guide, with the revision recorded and the foreign keys holding;
- a governed revision's hash still verifies after a round trip through Postgres `jsonb`;
- templates sent for review before revisions existed are refused on approve and publish (the refusal rolls back) and recover by return and resubmit;
- editing a live template saves a draft while the head keeps serving; a save that repeats the content changes nothing reviewed; unpublish, archive and
  republish behave; a template in review refuses a content edit;
- simultaneous approvals and simultaneous submissions yield exactly one success (real row locking); a real unique-key collision on the revision number maps to
  a clean `REVISION_CONFLICT`; an edit racing a submission is either in the revision or refused;
- tampering with a published governed revision in the database is caught when a project is started.

**Deviations and limits (read these):** the schema has two PostGIS `geography` columns in unrelated tables and PostGIS was not available locally, so the
scratch copy of the schema uses plain text for those two columns and omits their two spatial indexes. Nothing in the DIY tables is affected. The scratch
database is empty apart from the rows the script seeds, so **performance on production-sized data was not measured**. The audit-log writer and the property
facts behind project applicability were replaced by stubs, because they are not what is under test. Nothing here exercised the browser, the Raspberry Pi
deployment, or your data.

To repeat it (the scratch data directory lives under any directory you choose; the socket directory is disabled because macOS limits socket paths):

```bash
PGBIN=/usr/local/opt/postgresql@15/bin; D=<some scratch dir>
$PGBIN/initdb -D $D/data -U scratch --auth=trust
$PGBIN/pg_ctl -D $D/data -o "-p 54391 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l $D/pg.log -w start
$PGBIN/createdb -h 127.0.0.1 -p 54391 -U scratch scratch_c2c_1e
cd apps/backend
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > $D/ddl.sql
sed -e 's/geography(Point, 4326)/TEXT/; s/geography(Geometry, 4326)/TEXT/' -e '/USING GIST ("locationPoint")/d' -e '/USING GIST ("geometry")/d' $D/ddl.sql > $D/ddl.scratch.sql
$PGBIN/psql -h 127.0.0.1 -p 54391 -U scratch -d scratch_c2c_1e -v ON_ERROR_STOP=1 -q -f $D/ddl.scratch.sql
PSQL_BIN=$PGBIN/psql SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_1e node --test tests/scratch/diyTemplateRevisions.scratch.js
$PGBIN/pg_ctl -D $D/data stop
```

The script refuses any database whose name does not contain `scratch`, any port 5433, and anything that is not a local URL, and it checks the connected
server's database name and port before it truncates anything.

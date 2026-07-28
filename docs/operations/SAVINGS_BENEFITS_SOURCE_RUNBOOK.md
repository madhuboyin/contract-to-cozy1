# Savings and Benefits Source Runbook

**Status:** Active runbook
**Last reconciled:** July 28, 2026
**Product contract:** [Hidden Savings and Benefits Capability Audit and Implementation Plan](../product/HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md)

## 1. Scope and owners

This runbook governs the reviewed benefit-program source registry
(`HiddenAssetSource` / `HiddenAssetProgram`) behind the Savings and Benefits
capability: source onboarding, the DRAFT → IN_REVIEW → APPROVED → PUBLISHED
editorial workflow, staleness handling, program correction, and retirement.

| Concern | Accountable owner |
|---|---|
| Source vetting and coverage claims | Data/source operations (`SAVINGS_BENEFITS_AUTHOR`) |
| Eligibility-criteria review and accuracy | Reviewer (`SAVINGS_BENEFITS_REVIEW`) |
| Publish/unpublish/archive decisions | Publisher (`SAVINGS_BENEFITS_PUBLISH`) |
| Coverage-registry schema | Backend engineering |
| Homeowner issue triage (incorrect program, denied claim) | Support |

No role may publish a program whose eligibility criteria have not been
independently reviewed against the official source, and no role may widen a
program's stated region/category coverage beyond what was actually verified.

## 2. Reviewed source and program lifecycle

Every program is owned by exactly one `HiddenAssetSource`. Only programs at
`reviewStatus: PUBLISHED` (and `isActive: true`, not expired) are ever
evaluated against a homeowner's property — see `fetchCandidatePrograms` in
`apps/backend/src/services/hiddenAssets.service.ts`. This is enforced in
code, not by convention: a DRAFT/IN_REVIEW/APPROVED program simply never
appears in a scan result.

The pilot source (New Jersey Division of Taxation) and its two seeded
programs (Senior Freeze, ANCHOR) live in
`apps/backend/prisma/seedSavingsBenefitsPilot.ts`. Running
`npm run seed:savings-benefits-pilot` is idempotent and drives each program
through the real governance transitions rather than inserting `PUBLISHED`
directly.

### Onboarding a new source

1. Verify the publisher and official URL directly (not from a search result
   summary).
2. In the admin console (`/dashboard/admin/savings-benefits`, Sources tab),
   record the source's kind, official URL, and review SLA (how often it must
   be re-reviewed).
3. Add each program under **Programs**: category, region, benefit type, the
   machine-evaluable rule(s) the rule engine can actually check today
   (property-level attributes only — state/city/zip; **not** income, age,
   or residency duration, which the rule engine does not model as of this
   writing), and `eligibilityNotes` spelling out every criterion the rule
   engine cannot evaluate, for the homeowner to verify themselves.
4. Submit the program for review (`SUBMIT_FOR_REVIEW`), have a different
   admin approve it (`APPROVE`) after independently checking the official
   source, then publish (`PUBLISH`).
5. Confirm it now appears in a scan for a matching test property, and that
   the coverage banner on the Savings and Benefits workspace lists the new
   source.

### Handling a stale or failed source

A source is `DEGRADED` once its `lastReviewedAt` passes its own
`reviewSlaDays` (shown in the admin console's Sources tab). A stale source's
published programs remain visible to homeowners (there is no automatic
un-publish on staleness in this slice) — an admin must actively re-review
and re-save the source (which stamps a fresh `lastReviewedAt`), or
`UNPUBLISH`/`ARCHIVE` its programs if the underlying program details are no
longer trustworthy.

### Correcting an incorrect program

Editing a program's fields (admin console → Programs → Edit) never changes
its `reviewStatus` — a live `PUBLISHED` program can be corrected in place
without an unpublish/republish round-trip, but the edit is not itself
reviewed. For any correction that changes eligibility criteria, benefit
amount, or region, the safer path is: `UNPUBLISH` → edit → `SUBMIT_FOR_REVIEW`
→ `APPROVE` (by someone other than the editor) → `PUBLISH` again, so every
live program's current content has been reviewed by someone other than its
author.

### Retiring a program

Use `ARCHIVE` (from `PUBLISHED` or `APPROVED`). An archived program is
immediately excluded from `fetchCandidatePrograms`. It can be brought back
via `REVIVE_TO_DRAFT` if it needs to be reinstated later — this does not
restore its old review, it starts the DRAFT → PUBLISHED cycle over.

## 3. Known limitations (by design, not oversight)

- Coverage is New Jersey-only today. Every other state/region correctly
  shows as "not covered" in the homeowner-facing coverage statement — this
  is the honest state of the registry, not a bug.
- No live external data feed. All ingestion is hand-curated through the
  admin console or the pilot seed script; see the audit's Slice 2 write-up
  for why (recall ingestion's zero-review model was explicitly rejected as
  the wrong precedent here).
- No income/age/household eligibility modeling yet — those criteria live in
  `eligibilityNotes` as homeowner-facing text, not machine-evaluated rules,
  until Slice 3 (eligibility expression and context) is implemented.

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
`apps/backend/src/scripts/seedSavingsBenefitsPilot.ts`. Running
`npm run seed:savings-benefits-pilot` (local dev, via `ts-node`) is
idempotent and drives each program through the real governance transitions
rather than inserting `PUBLISHED` directly. In a deployed environment
without `npm`/`ts-node` available, run it as a one-off Kubernetes Job via
`./run-savings-benefits-seed-job.sh` (mirrors `run-property-tax-seed-job.sh`;
invokes the already-compiled `dist/scripts/seedSavingsBenefitsPilot.js`
from the backend image).

### Onboarding a new source

1. Verify the publisher and official URL directly (not from a search result
   summary).
2. In the admin console (`/dashboard/admin/savings-benefits`, Sources tab),
   record the source's kind, official URL, and review SLA (how often it must
   be re-reviewed).
3. Add each program under **Programs**: category, region, benefit type, the
   machine-evaluable rule(s) the rule engine can actually check today
   (property-level attributes only — state/city/county/zip; **not** income,
   age, or residency duration, which the rule engine does not model as of
   this writing), and `eligibilityNotes` spelling out every criterion the
   rule engine cannot evaluate, for the homeowner to verify themselves. The
   admin console currently authors a single MANDATORY, EQUALS-only rule per
   program; `HiddenAssetProgramRuleInput.kind` (MANDATORY/OPTIONAL/
   DISQUALIFYING) and `groupKey` (OR-grouping rules that share a key) exist
   in the service layer for richer programs but have no console UI yet —
   use `savingsBenefitsAdminService.createProgram`/`updateProgram` directly
   for those until the console catches up. See
   `apps/backend/src/services/hiddenAssets/ruleEngine.ts` for exactly how a
   program's groups are combined into a match decision and confidence
   level. Also set `benefitPeriod` (ONE_TIME/MONTHLY/ANNUAL, default
   UNKNOWN) — the admin console doesn't expose this yet either. Getting it
   right matters once a homeowner records a RECEIVED outcome (section 3):
   a one-time rebate must never be read as an ongoing annual value.
4. Submit the program for review (`SUBMIT_FOR_REVIEW`), have a different
   admin approve it (`APPROVE`) after independently checking the official
   source, then publish (`PUBLISH`).
5. Confirm it now appears in a scan for a matching test property, and that
   the coverage banner on the Savings and Benefits workspace lists the new
   source.

### Funding and application-window state

Every program has a `fundingStatus` (`UNKNOWN` / `OPEN` / `CLOSED`, default
`UNKNOWN`) and optional `applicationWindowOpensAt` / `applicationWindowClosesAt`
dates — separate from `expiresAt`, which governs whether the program still
exists at all. A program can remain generally in effect while a specific
year's application cycle hasn't opened yet or has already closed.

This is fail-closed in one direction only: an admin setting `fundingStatus:
CLOSED`, or an application window that has passed or not yet started,
immediately excludes the program from matching (`fetchCandidatePrograms` in
`hiddenAssets.service.ts`; the underlying rule lives in
`hiddenAssets/fundingWindow.ts`). Leaving `fundingStatus` at `UNKNOWN` or the
window fields unset never excludes a program by itself — there is no
requirement to track funding for every program, only a requirement not to
keep recommending one once you know its funding is exhausted or its
application window has closed. The admin console does not expose these
fields yet — set them via `savingsBenefitsAdminService.createProgram`/
`updateProgram` directly until it does.

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

## 3. Outcome trail and realized-value ledger

Marking a benefit match `PURSUING` or a recurring-cost opportunity
`APPLIED`/`SWITCHED` is homeowner intent, not a confirmed result. Both sides
now have a real application/award trail (`savingsOutcome.service.ts`,
Slice 7) instead of stopping there:

`SUBMITTED → APPROVED → RECEIVED`, or `→ DENIED` / `→ WITHDRAWN` at any
non-terminal point. Each stage is its own append-only row (
`HiddenAssetMatchOutcome` / `HomeSavingsOpportunityOutcome`) so the full
history is preserved, not overwritten. `RECEIVED` requires an amount/observed
value and an `evidenceNote` — there is no way to record realized value
without stating what backs it. The first outcome ever recorded for a match
or opportunity may be any stage (a homeowner catching up on real history
isn't forced to fabricate a `SUBMITTED` entry first); after that, transitions
are enforced (`isValidOutcomeTransition`).

API: `POST`/`GET /api/property-hidden-asset-matches/:matchId/outcome` and
`POST`/`GET /api/home-savings/opportunities/:id/outcome`. No homeowner or
admin UI exists for these yet — this slice is backend + tests only.

A `RECEIVED` outcome on the recurring-cost side is the only thing that
publishes a real `SAVINGS_REALIZATION` signal (`signal.service.ts`); marking
`APPLIED`/`SWITCHED` alone no longer does (it still refreshes
`FINANCIAL_DISCIPLINE`, a separate pattern about savings-action behavior).
A `RECEIVED` outcome on the benefits side does **not** publish that signal —
`SAVINGS_REALIZATION`'s ownership is pinned to `HomeSavingsService`
(`SIGNAL_OWNER_BY_KEY`) and existing downstream consumers
(`financialAssumption.service.ts`, `doNothingSimulator.service.ts`) were
built assuming that ownership. Widening it to cover benefit outcomes too is
a deliberate future change, not something this slice does as a side effect.

## 4. Known limitations (by design, not oversight)

- Coverage is New Jersey-only today. Every other state/region correctly
  shows as "not covered" in the homeowner-facing coverage statement — this
  is the honest state of the registry, not a bug.
- No live external data feed. All ingestion is hand-curated through the
  admin console or the pilot seed script; see the audit's Slice 2 write-up
  for why (recall ingestion's zero-review model was explicitly rejected as
  the wrong precedent here).
- No income/age/household eligibility modeling yet. The rule engine now
  distinguishes mandatory, optional, and disqualifying criteria and supports
  OR expression groups (Slice 3), but sensitive facts like income, age,
  disability, and veteran status still have no consented capture path —
  those criteria live in `eligibilityNotes` as homeowner-facing text, not
  machine-evaluated rules, until a dedicated consented eligibility-fact
  store is built (see section 9.6 of the audit).
- County is resolvable (`Property.county` feeds both region matching and the
  rule engine's `county` attribute), but utility, hazard-zone, and
  historic-district geography still resolve to `null` — `Property` has no
  fields for them yet.

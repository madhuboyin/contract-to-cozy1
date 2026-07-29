# Savings and Benefits Source Runbook

**Status:** Active runbook
**Last reconciled:** July 29, 2026
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
3. Add each program under **Programs**: category, region, benefit type, and
   every reviewed criterion. The admin console supports multiple mandatory,
   optional, and disqualifying rules, OR groups, explicit unknown handling,
   sensitive-data classification, external-verification requirements,
   evidence requirements, and homeowner explanations. See
   `apps/backend/src/services/hiddenAssets/ruleEngine.ts` for exactly how a
   program's groups are combined into a match decision and confidence
   level. Also set `benefitPeriod` (ONE_TIME/MONTHLY/ANNUAL, default
   UNKNOWN). Getting it right matters once a homeowner records a RECEIVED outcome (section 3):
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
application window has closed. The admin console exposes funding status,
application opening/deadline, and program expiration and rejects internally
inconsistent date ranges.

### Handling a stale or failed source

A source is `DEGRADED` once its `lastReviewedAt` passes its own
`reviewSlaDays` (shown in the admin console's Sources tab). Stale, paused,
retired, or never-reviewed sources fail closed: their programs are excluded
from scans, coverage claims, action transitions, and Home promotion. Re-review
and save the source, then independently review the affected program before
making it actionable again.

The hourly `savings-benefits-source-health-audit` worker evaluates every
source without mutating its review state. It publishes:

- `savings_benefits_sources{health="HEALTHY|DEGRADED|CRITICAL"}`;
- `savings_benefits_source_oldest_overdue_seconds`;
- the generic `cron_job_last_success_timestamp_seconds` heartbeat.

Prometheus rules live in
`infrastructure/kubernetes/monitoring/prometheus/savings-benefits-alert-rules.yaml`.
A critical source, an overdue active source, or a missing audit heartbeat
alerts Platform Operations. The structured worker warning contains the exact
source ID/name; source identifiers are intentionally excluded from Prometheus
labels to keep metric cardinality bounded.

### Correcting an incorrect program

Published programs are immutable. To correct one, use `UNPUBLISH`, return it
to `DRAFT`, edit it, then complete `SUBMIT_FOR_REVIEW` → `APPROVE` →
`PUBLISH` again. Approval stamps a new program verification time, and publish
is rejected unless the owning source and program verification are current.

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

`SUBMITTED → APPROVED → RECEIVED`, or `→ DENIED` / `→ WITHDRAWN` /
`→ EXPIRED` / `→ NO_ACTION` at a valid non-terminal point. `EXPIRED` and
`NO_ACTION` may also be recorded before submission when the homeowner never
applied. Every closed-without-value stage records a reason. Each stage is its
own append-only row (
`HiddenAssetMatchOutcome` / `HomeSavingsOpportunityOutcome`) so the full
history is preserved, not overwritten.
`RECEIVED` requires an amount/observed value and evidence; recurring value
also requires an observation window of at least 28 days.

API: `POST`/`GET /api/property-hidden-asset-matches/:matchId/outcome` and
`POST`/`GET /api/home-savings/opportunities/:id/outcome`. The canonical
workspace exposes this trail, evidence attachment, and revocation/correction
controls.

Attached evidence is accepted only when the Document Vault row belongs to the
authenticated user and the same property as the opportunity. This prevents a
document from another home from being silently included in an application or
outcome packet.

Homeowner entries are explicitly `SELF_REPORTED` or `EVIDENCE_ATTACHED`.
Neither state publishes the platform's verified `SAVINGS_REALIZATION`
signal. Only a separate verification workflow may mark an entry `VERIFIED`
and project it into verified downstream totals.

## 4. Reminder and partner controls

Savings deadline reminders are explicit opt-in under Notification preferences.
The homeowner chooses email cadence, a 1–90 day lead time, and a minimum
estimated match value. The worker scans a bounded 90-day window, then applies
the property-specific preference (falling back only to a Savings & Benefits
global preference) before creating any reminder. Suppressed or failed
notifications remain retryable.

Partner handoffs fail closed unless `SAVINGS_BENEFITS_APPROVED_PARTNERS`
contains the requested partner ID. The recorded consent contract must identify
that partner, acknowledge the disclosure, state whether compensation or
ranking influence exists, list the selection criteria and non-commercial
alternative, and exactly match the fields previewed for sharing. The full
contract is retained on `SavingsBenefitAction.consentJson` for audit.

## 5. Known limitations (by design, not oversight)

- Coverage is New Jersey-only today. Every other state/region correctly
  shows as "not covered" in the homeowner-facing coverage statement — this
  is the honest state of the registry, not a bug.
- No live external data feed. All ingestion is hand-curated through the
  admin console or the pilot seed script; see the audit's Slice 2 write-up
  for why (recall ingestion's zero-review model was explicitly rejected as
  the wrong precedent here).
- Sensitive income/age/household criteria are captured only through the
  consented, opportunity-scoped fact API. They are never inferred from broad
  profile data.
- County, utility, hazard-zone, and historic-district geography resolve from
  explicit Property fields; unknown values remain unknown.

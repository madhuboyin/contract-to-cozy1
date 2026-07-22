# ContractToCozy W6 — Smoke Validation Runbook

This is the operator runbook for items 5 and 6 of the Worker Module Audit's
W6 increment ("Controlled single-environment smoke validation"). It is
deliberately **not** something an agent runs autonomously: this repo has
only one environment (production, on the Raspberry Pi ARM k3s cluster) — no
staging — so exercising a job "for real" here means touching real
production infrastructure. Run each step yourself, in order, and record the
evidence as you go.

The code this runbook exercises (dry-run support, the property/recipient
allowlists, correlation-ID tagging, and the Admin UI smoke checklist) shipped
in the W6 code slice — see `apps/frontend/src/app/(dashboard)/dashboard/worker-jobs/page.tsx`'s
"Smoke checklist" panel, gated to 4 representative jobs (one per
`customerJob` domain):

| Domain | Job | Creates |
|---|---|---|
| STAY_AHEAD | `permit-inspection-reminders` | `Notification` rows |
| MAJOR_MOMENT | `new-home-warranty-deadlines` | `Notification` + `PropertyMaintenanceTask` rows |
| DECIDE | `mortgage-rate-ingest` | `MortgageRateSnapshot` rows |
| PLATFORM_OPERATIONS | `shared-data-consistency-audit` | nothing (READ_ONLY) |

## 1. Preconditions

- [ ] The W6 code slice is deployed and the Admin Worker Jobs page shows a "Smoke checklist" section on each of the 4 jobs above.
- [ ] `SMOKE_TEST_PROPERTY_ALLOWLIST` is set to exactly one real property ID you own/control and are comfortable creating disposable notifications against.
- [ ] `SMOKE_TEST_RECIPIENT_EMAIL_ALLOWLIST` is set to your own email address.
- [ ] Confirm `WORKER_OUTBOUND_NOTIFICATIONS_ENABLED` and the target job's `WORKER_JOB_<KEY>_ENABLED` override state in the governance panel — decide deliberately whether outbound transport should be on or off for this exercise.

## 2. Per representative job (skip `shared-data-consistency-audit` — already read-only by construction)

For each of `permit-inspection-reminders`, `new-home-warranty-deadlines`, `mortgage-rate-ingest`:

1. **Dry run first.** In the job's smoke checklist, confirm all 3 prerequisite checks pass, then click "Run Job" with the dry-run checkbox on. Record the returned result (examined/notified/created counts) from "Recent runs."
2. **Scoped live run second, only if the dry run's planned effects look right.** For the two property-scoped jobs, enter your allowlisted property ID into "Allowlisted property ID" and click "Run scoped live." For `mortgage-rate-ingest` (not property-scoped), just uncheck dry-run and trigger normally — every manual trigger of this job is already correlation-tagged.
3. **Capture the correlation ID.** The live run's result (shown in "Recent runs" / the smoke checklist's "Last result") includes a `smokeCorrelationId`.
4. **Clean up.** Click "Clean up this run" in the smoke checklist (or run `npx ts-node scripts/smoke-test-cleanup.ts --correlation-id <id> --confirm` from `apps/backend`) and confirm the exact records are removed — never a broader sweep.
5. **Record evidence** in the table below — the actual JSON responses, not a narrative summary.

## 3. Scheduled-execution validation (item 6)

Pick `shared-data-consistency-audit` (READ_ONLY — lowest risk):

1. Set `WORKER_JOB_SHARED_DATA_CONSISTENCY_AUDIT_ENABLED=true`.
2. Wait for one natural cron tick (see its `cronExpression` in the registry), or trigger manually if waiting is impractical.
3. Confirm exactly one new entry appears in its cron run history / recent runs, with `status: completed`.
4. Set the override back to `false` (or remove it, reverting to the registry's `defaultEnabledInBeta`).
5. Confirm via the Admin governance panel that `effectiveEnabled` is now `false` and the next tick is skipped.

## 4. Rollback

If anything unexpected is created outside the allowlist (e.g. a bug lets an unscoped run slip through), use the cleanup endpoint/script by exact ID — never a bulk delete. Document the deviation as an addendum below rather than silently fixing it.

## 5. Evidence log

| Date | Job | Dry-run result | Live result | Correlation ID | Cleanup confirmed |
|---|---|---|---|---|---|
| | | | | | |

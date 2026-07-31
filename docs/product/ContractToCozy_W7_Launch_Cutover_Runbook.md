# ContractToCozy W7 — Real-User Launch Cutover Runbook

Per the audit doc, W7 is **"pre-launch, not a beta implementation gate"** — everything below is an operational/business decision executed by flipping config and reviewing job groups one at a time, not a code change. This repo has only one environment (production, on the Raspberry Pi ARM k3s cluster) — there is no staging/acceptance environment to rehearse this in, so treat every step here as a real, live production change and go slowly, one item at a time, confirming each before moving to the next.

**Do not run this as a single "flip everything" pass.** The whole point of the beta-safe defaults (W0) was to let real usage accumulate before broadening automation — this runbook exists so that broadening happens deliberately, not because a checklist got run end-to-end without pausing.

## Current state (as of this writing — re-check before acting, these may have changed)

| Flag | Current default | File |
|---|---|---|
| `ENFORCE_HUMAN_POLICY_APPROVALS` | Kubernetes `true`; local Compose `false` | `infrastructure/kubernetes/base/configmap.yaml`, `docker-compose.yml` |
| `WORKER_AUTOMATION_ENABLED` | `true` | same files |
| `WORKER_OUTBOUND_NOTIFICATIONS_ENABLED` | `false` | same files |
| `WORKER_EXTERNAL_INGEST_ENABLED` | `false` | same files |
| `WORKER_MUTATING_SWEEPS_ENABLED` | `false` | same files |
| `WORKER_MANUAL_TRIGGERS_ENABLED` | `true` | same files |
| `ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS` | `false` | same files |

## 1. `ENFORCE_HUMAN_POLICY_APPROVALS=true`

This is a backend-and-worker-wide flag (already reaches both, per WKR-005)
requiring human sign-off on policy-driven actions. The tracked Kubernetes
configuration now selects `true`; local Docker Compose intentionally remains
`false` for explicit internal-beta testing. Before deployment, apply the
`CapabilityGovernanceReview` schema change and use Admin Release Gates to
complete current manifest- and policy-version approvals. Do not manufacture
approval rows through seed data or direct SQL.

## 2. `ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS` — read this before touching it

Real enforcement exists today (`workerExecutionPolicy.ts`'s `evaluateWorkerExecution`, precedence step 2): when `true`, **any manual trigger of a `humanApprovalClass: 'HIGH_IMPACT_MANUAL'` job is unconditionally blocked** — there is no approval workflow to grant an exception, so this is a hard block, not a request-and-approve gate. The 4 jobs this currently affects:

- `maintenance-reminders`
- `seasonal-notifications`
- `inventory-draft-cleanup`
- `shared-data-backfill`

**Do not set this to `true` until the Admin UI approval workflow actually exists** (per the audit doc's own instruction) — otherwise you're not adding an approval step, you're just permanently disabling manual triggers for these 4 jobs. If that's an acceptable interim safety posture on its own merits, that's a legitimate reason to flip it early — but do it as a deliberate choice, not a checklist tick.

## 3. Review and explicitly enable each production job group / external provider, one at a time

Beta defaults keep two group-level flags off. Flipping either one turns on *every* job in that group at once — review the job list below and decide per-job overrides (`WORKER_JOB_<KEY>_ENABLED=false`) for any you're not ready for, before flipping the group flag.

**`WORKER_EXTERNAL_INGEST_ENABLED=false` currently blocks 8 external-provider jobs:**

| Job | Provider |
|---|---|
| `recall-ingest` | CPSC |
| `freeze-risk-incidents` | NOAA/NWS (forecast) |
| `severe-weather-alerts` | NOAA/NWS |
| `neighborhood-radar-refresh` | Neighborhood intelligence sources |
| `mortgage-rate-ingest` | FRED (St. Louis Fed) |
| `tax-assessment-ingest` | County Socrata open-data portals |
| `permit-fetch` | Municipal permit-records provider |
| `generate-diy-ai-guide` | Gemini |

For each: confirm the provider's API key/credential is actually configured in prod, confirm rate limits are understood, and — now that W6 shipped dry-run support for `mortgage-rate-ingest` — use its Admin UI smoke checklist to do one dry run before flipping it on for real. The other 7 don't have dry-run support yet (deferred from W6, see `project_worker_module_audit_implementation` memory for the full list) — review their code paths manually before enabling if you want the same confidence.

**`WORKER_MUTATING_SWEEPS_ENABLED=false` currently blocks 10 broad-sweep/destructive jobs:**

`seasonal-checklist-generation`, `inventory-draft-cleanup`, `hidden-asset-refresh`, `provider-missing-credential-sweep`, `reserve-fund-recalculation`, `home-briefing-delivery`, `shared-data-backfill`, `home-habit-generation`, `report-export-cleanup`, `material-spec-export-cleanup`.

`shared-data-backfill` has W6 dry-run + smoke-checklist support — exercise that first. The rest: review manually, or treat this as a prioritized backlog for extending W6's pattern before flipping them on blind.

**`WORKER_OUTBOUND_NOTIFICATIONS_ENABLED=false`** gates every `NotificationService.create()` call's actual email/push/SMS transport (in-app rows still get created either way). Flipping this to `true` is the single highest-blast-radius change in this whole runbook — it's the difference between "the system silently prepares notifications" and "real homeowners start receiving real emails." Do this last, after everything else above is reviewed, and consider a brief internal-recipient-only dry run first (the existing `RETENTION_REPORT_EMAIL` / W6 `SMOKE_TEST_RECIPIENT_EMAIL_ALLOWLIST` pattern) before the general population.

## 4. Push/SMS — confirmed not ready, don't enable

Both `push-notification` and `sms-notification` jobs are genuinely unimplemented today: `sendPushNotificationJob`/`sendSmsNotificationJob` immediately return `'No push provider configured (Firebase/APNs) — push delivery is not implemented yet.'` / `'No SMS provider configured (Twilio) — SMS delivery is not implemented yet.'`. Nothing to flip here — this is a real feature-build item (Firebase/APNs or Twilio integration + consent/preference UI), not a config change, whenever that becomes a priority.

## 5. Isolated acceptance environment

None exists, and the audit doc explicitly says not to retrofit destructive acceptance testing into the only real database. If an acceptance environment becomes available later (a second k3s namespace, a staging Pi, etc.), re-run W6's smoke validation there first before ever touching this runbook's steps against prod. Until then, W6's allowlist/dry-run/correlation-ID machinery *is* the acceptance-testing substitute for this single-environment reality.

## 6. Usage-quality measurements — before broadening further

`NotificationOutcome` (`prisma/schema.prisma`) already exists and records per-notification outcomes (type, category, property) keyed to real user actions — this is existing infrastructure to build on, not something to create from scratch. Before enabling broader automation beyond what's reviewed above, define and check:

- **Notification usefulness/noise**: opt-out rate, mute rate per category.
- **Action resolution**: fraction of `NotificationOutcome` rows indicating a real user action followed the notification within a reasonable window.
- **Verified outcome**: for jobs whose whole point is a homeowner decision (e.g. warranty deadlines, coverage lapse), confirm the decision was actually made, not just that a notification was sent.
- **Provider quality**: for provider-facing jobs (recall/permit/credential), confirm match/data quality holds up against real production data volume, not just the smoke-test allowlisted property.
- **Recurring-care cadence**: for jobs that repeat (seasonal, maintenance reminders), confirm the cadence itself feels right to real users, not just that it fires on schedule.

This step inherently requires real users and real time elapsed — it cannot be front-loaded before launch. Revisit it on a cadence (e.g. monthly) after each round of broadening above, not as a one-time gate.

# Property Context Phase 8 Runtime Acceptance Runbook

Date: 2026-07-17

Purpose: execute the Phase 8 API/UI/worker acceptance gate against ten
UI-created demo properties and write machine-readable evidence. This is a
release-validation procedure; it does not seed, mutate, or delete property
data.

## Prerequisites

- Backend, frontend, and worker services are running from the same release.
- The worker metrics endpoint is reachable from the runner.
- A non-MFA homeowner acceptance account owns or can access all ten demo
  properties.
- The ten properties were created and completed through supported UI flows.
- Playwright Chromium is installed for the backend workspace.

Copy `phase8-archetypes.example.json` outside the repository's tracked files,
replace every placeholder property ID, and adjust expected facts only when the
UI-created archetype intentionally differs from the reference matrix. Never
put credentials in the manifest.

## Execute

From `apps/backend`:

```bash
PHASE8_API_BASE_URL=http://localhost:8080 \
PHASE8_WEB_BASE_URL=http://localhost:3000 \
PHASE8_WORKER_METRICS_URL=http://localhost:9091/metrics \
PHASE8_EMAIL=phase8@example.com \
PHASE8_PASSWORD='use-a-secret-manager-or-shell-variable' \
npm run acceptance:phase8 -- \
  --manifest /secure/path/phase8-archetypes.json \
  --evidence tmp/phase8-runtime-evidence.json
```

For a deployed environment, use its HTTPS API/frontend URLs and the protected
worker metrics URL available to the operator.

## Gate behavior

For each of the ten archetypes, the runner:

1. authenticates using the normal cookie-backed API session;
2. retrieves the canonical Property Context snapshot;
3. verifies the property ID, context version, and manifest fact assertions;
4. retrieves the shared Protection, Project/Compliance, Financial, Planning, and
   Aggregation decision matrix at the same context version;
5. verifies any archetype-specific decision-status assertions;
6. opens representative Preventive, Protection, Financial, Planning, and
   Aggregation surfaces in a real headless browser session;
7. rejects login redirects, HTTP failures, and rendered application failures;
8. verifies any archetype-specific UI text assertions.

After all archetypes pass, it verifies that the running worker exposes numeric,
non-negative process, BullMQ, cron-run, and last-success metrics, and requires at
least one positive cron last-success timestamp. The local unit gate separately
executes the worker-owned seasonal and habit context transformations for all
ten archetypes and verifies that they reuse shared applicability behavior.

The runner always writes its evidence record after service execution starts.
A passing record contains ten archetype entries, context versions, assertion
results, decision assertions, per-feature UI URLs, durations, worker metric
checks, and `"passed": true`.

## Failure handling

- Do not edit expected facts merely to make a failure disappear. Confirm the
  UI-created property first, then inspect context fact evidence.
- A login redirect normally means the API/frontend cookie domains or acceptance
  account are misconfigured.
- A missing worker metric means the worker build is stale, its metrics service
  is unavailable, or startup did not complete.
- Preserve the failed evidence JSON with deployment identifiers and logs, fix
  the cause, and rerun all ten archetypes.

## Evidence retention

Attach the JSON evidence to the release record or CI artifact store. Do not
commit environment-specific property IDs, credentials, cookies, or runtime
evidence to the repository.

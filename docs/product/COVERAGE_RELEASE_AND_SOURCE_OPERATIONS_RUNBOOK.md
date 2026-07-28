# Coverage & Premium Review Release and Source Operations Runbook

**Capability:** `coverage-intelligence`
**Launch gate:** `coverage-launch-gate-v1`
**Technical evidence:** `coverage-slice-10-v2`
**Owner:** Product and Coverage Operations
**Last reconciled:** July 27, 2026

## Current release decision

The consolidated capability remains `BETA` and is **not approved for real-user
promotion**. The implementation must report `BLOCKED` until all technical,
operational, governance, and release-stage gates pass.

Do not populate launch evidence environment variables merely to make the gate
green. They attest that the corresponding suite or drill actually completed
against the deployed revision.

## Canonical completion funnel

```text
Eligible → Shown → Opened → Policy facts ready → Review produced
→ Question resolved → Choice compared → Decision recorded
→ Action completed → Outcome observed
```

`DECISION_RECORDED` is the capability completion signal. Later action and
outcome events extend the same lineage; page views and generated analyses are
not completion.

## Automated evidence

Run from the repository root:

```bash
cd apps/backend
npm run test:coverage-launch-gate
npm run drill:coverage-launch
#
# Against a dedicated staging test property and short-lived test-user token:
npm run preflight:coverage-load
# Against disposable staging decision/handoff fixtures:
npm run preflight:coverage-mutations
npx tsc --noEmit
npx prisma validate --schema=prisma/schema.prisma

cd ../frontend
npx tsc --noEmit
npm run test:coverage-launch:e2e
```

The browser suite exercises the canonical policy record, evidence-qualified
questions, non-equivalent choices, durable decision, loss-prevention evidence,
licensed-help consent and withdrawal, market provenance and outage containment,
desktop/mobile layouts, horizontal overflow, and automated WCAG 2.0–2.2 A/AA
checks.

The operational drill emits machine-readable JSON and verifies the real-user
kill switch, contextual-action suppression, unavailable and stale benchmark
containment, partner disablement, incident blocking, configuration restoration,
and a bounded 10,000-iteration evaluator burst. This local deterministic drill
does not replace the production-like concurrency test required before
promotion.

The coverage load preflight exercises only authenticated read-only endpoints
and emits a machine-readable latency, error, response-contract, and peak
concurrency report. It refuses known production hosts, requires the configured
allowlisted hostname to match exactly, and requires HTTPS for staging. The
report excludes authorization values, response bodies, and the property ID.

Only after all commands pass for the deployed revision may CI/deployment set:

```text
COVERAGE_LAUNCH_EVIDENCE_VERSION=coverage-slice-10-v2
```

## Human review gate

The existing capability-governance review API records policy-version-specific
decisions. Because this capability is `REGULATED_COVERAGE`, genuine approvals
are required from:

- `PRODUCT`
- `DOMAIN`
- `TRUST`
- `LEGAL_COMPLIANCE`

Security/privacy review must also confirm the existing `SENSITIVE` data
classification and sharing boundary. Commercial-integrity review becomes
mandatory before any partner or compensated action is enabled, even though the
canonical capability definition currently has no general commercial action.

Before real-user launch:

1. Set `ENFORCE_HUMAN_POLICY_APPROVALS=true`.
2. Record reviews through the protected Admin Release Gates workflow.
3. Confirm the launch endpoint reports no missing or rejected roles.
4. Promote the capability from `BETA` to `ACTIVE` only through a reviewed code
   change.

No automated process may impersonate or seed a reviewer approval.

## Rollback and kill-switch drill

The real-user gate requires `COVERAGE_REAL_USER_LAUNCH_ENABLED=true`. Setting it
to any other value blocks promotion without deleting policy records, decisions,
or evidence.

Drill procedure:

1. Confirm `/api/admin/coverage-operations/launch-gate` is `READY` in the
   controlled environment.
2. Set `COVERAGE_REAL_USER_LAUNCH_ENABLED=false`.
3. Restart/redeploy the backend configuration.
4. Confirm the launch gate reports
   `REAL_USER_KILL_SWITCH_ACTIVE`.
5. Set `COVERAGE_ACTIONS_ENABLED=false`.
6. Confirm new contextual Coverage Home Actions are suppressed while unrelated
   actions remain visible.
7. Set `COVERAGE_MARKET_CONTEXT_ENABLED=false` and
   `COVERAGE_PARTNER_HANDOFF_ENABLED=false`.
8. Confirm renewal history and saved policy facts remain available, while
   market context and handoff show explicit disabled/unavailable states.
9. Restore the reviewed configuration and verify no duplicate action,
   handoff, decision, or outcome event was created.

After the drill passes on the deployed revision, operations may set:

```text
COVERAGE_ROLLBACK_DRILL_VERSION=coverage-launch-gate-v1
```

## High-risk gap control

Set `COVERAGE_UNCONTAINED_HIGH_RISK_GAP_IDS` to a comma-separated list whenever
a critical/high issue lacks an accepted containment. Any non-empty value blocks
launch. Do not remove an ID until the fix or containment has been reviewed and
linked to evidence.

Examples include unsupported coverage determinations, personal-overpayment
claims, stale benchmark exposure, contact without consent, non-equivalent
premium ranking, sensitive telemetry leakage, and inaccessible decision
controls.

## Incident runbooks

### Document extraction degraded or timed out

Keep the source document and extraction job state. Show processing/retry rather
than an empty policy. Do not auto-verify facts. Retry only through the bounded
processor path; escalate repeated failures to Document Operations.

### Policy parsing error or incorrect coverage statement

Disable affected reviewed rules through the coverage rule-source control,
invalidate generated reviews, preserve confirmed policy facts, and open a
regulated-content incident. Do not edit source documents or silently replace
homeowner confirmations.

### Benchmark stale, unavailable, or incorrect

Deactivate the source or disable `COVERAGE_MARKET_CONTEXT_ENABLED`. The
homeowner API must return `STALE`, `SOURCE_UNAVAILABLE`, or `DISABLED` without a
numeric substitute. Current policy facts and confirmed renewal history remain
unaffected. Re-enable only after rights, domain, geography, coverage-basis,
methodology, retrieval, and expiry checks pass.

### Partner unavailable or quote fulfillment timeout

Disable `COVERAGE_PARTNER_HANDOFF_ENABLED` or the individual recipient. Preserve
self-service review and existing request status. Do not reroute consent to a
different recipient. Notify operations when the recorded SLA is breached.

### Unauthorized contact or consent dispute

Withdraw the handoff request, stop new fulfillment attempts, retain the
versioned consent/audit record under the privacy policy, and escalate to Privacy
and Legal. Never treat withdrawal as deletion of the homeowner's policy facts.

### Sensitive-data exposure

Activate the applicable API/action/partner kill switches, revoke exposed access,
preserve incident evidence, and follow the security incident process. Do not
place policy numbers, documents, contact details, or consent payloads in
analytics or ordinary logs.

### Generated-output suppression

Disable the affected rule, benchmark, partner, or action surface at the
narrowest safe boundary. Mark derived reviews stale when appropriate. Preserve
source documents, confirmed facts, decisions, evidence, and audit history.

## Load and failure criteria

Before promotion, test at expected peak concurrency plus safety margin:

- property authorization remains enforced under load;
- repeated decision and handoff submissions remain idempotent;
- benchmark/source latency does not delay current policy facts;
- source or partner timeouts return bounded unavailable states;
- no retry storm, duplicate Home Action, or duplicate outcome event occurs;
- error responses do not become healthy, zero, uncovered, or no-gap states.

Record test revision, environment, load profile, latency/error results, and
owner in the release evidence. A failed or unrecorded test leaves the technical
evidence variable unset.

Run the bounded read-only preflight from `apps/backend` with a dedicated test
user and property:

```bash
COVERAGE_LOAD_BASE_URL=https://coverage.staging.example.com \
COVERAGE_LOAD_ALLOWED_HOST=coverage.staging.example.com \
COVERAGE_LOAD_TARGET_CLASS=STAGING \
COVERAGE_LOAD_PROPERTY_ID=<dedicated-test-property-id> \
COVERAGE_LOAD_ACCESS_TOKEN=<short-lived-test-user-token> \
COVERAGE_LOAD_REQUESTS=300 \
COVERAGE_LOAD_CONCURRENCY=10 \
COVERAGE_LOAD_TIMEOUT_MS=5000 \
COVERAGE_LOAD_MAX_P95_MS=1500 \
COVERAGE_LOAD_MAX_ERROR_RATE=0 \
npm run preflight:coverage-load
```

Store the JSON output with the release evidence; do not commit it if the target
hostname is considered internal. A nonzero exit, contract error, timeout, HTTP
error, network error, exceeded p95 threshold, or exceeded error-rate threshold
blocks promotion. This preflight does not exercise mutations, so it complements
rather than replaces the decision/handoff concurrency and idempotency checks
above.

Run the mutation preflight only against disposable staging fixtures. The
comparison must be dedicated to this drill, the unauthorized property must be a
real property the test user cannot access, and the recipient must be a reviewed
non-delivering staging sink:

```bash
COVERAGE_MUTATION_BASE_URL=https://coverage.staging.example.com \
COVERAGE_MUTATION_ALLOWED_HOST=coverage.staging.example.com \
COVERAGE_MUTATION_TARGET_CLASS=STAGING \
COVERAGE_MUTATION_ACCESS_TOKEN=<short-lived-test-user-token> \
COVERAGE_MUTATION_PROPERTY_ID=<owned-disposable-property-id> \
COVERAGE_MUTATION_UNAUTHORIZED_PROPERTY_ID=<foreign-property-id> \
COVERAGE_MUTATION_COMPARISON_ID=<disposable-draft-comparison-id> \
COVERAGE_MUTATION_HANDOFF_REQUEST_ID=<stable-random-uuid> \
COVERAGE_MUTATION_RECIPIENT_ID=<non-delivering-staging-recipient-id> \
COVERAGE_MUTATION_DISCLOSURE_VERSION=<current-staging-disclosure-version> \
COVERAGE_MUTATION_CONTACT_EMAIL=<staging-sink-address> \
COVERAGE_MUTATION_CONCURRENCY=5 \
COVERAGE_MUTATION_TIMEOUT_MS=10000 \
npm run preflight:coverage-mutations
```

The mutation report contains no token, property ID, contact value, or response
body. It passes only when the foreign property is denied, concurrent decision
retries return one decision and one Home Event, concurrent help-request retries
return the caller-supplied request ID, and that staging request is withdrawn
after the check. Never point this command at a real recipient or homeowner.

Coverage decision persistence uses an atomic `DRAFT` → `DECIDED` claim.
Identical retries return the recorded decision as an idempotent replay and do
not emit duplicate Home Action, Guidance, completion, or analytics hooks.
Conflicting retries fail with `COVERAGE_DECISION_CONFLICT`.

## Final promotion checklist

- Automated backend, frontend, browser, accessibility, and failure suites pass.
- Desktop and mobile screenshots are reviewed by Design/Content.
- Product, Domain, Trust, and Legal/Compliance reviews are approved for the
  current manifest and policy versions.
- Privacy/Security review is recorded.
- Commercial Integrity approves any enabled commercial handoff.
- No critical/high gap lacks reviewed containment.
- Rollback drill passes and its exact version is recorded.
- Incident gate is clear.
- Capability promotion from `BETA` to `ACTIVE` is explicitly reviewed.
- `ENFORCE_HUMAN_POLICY_APPROVALS=true`.
- `COVERAGE_REAL_USER_LAUNCH_ENABLED=true` only after every prior item passes.

If any item is missing, the correct release decision is **blocked**, not
conditionally ready.

# Capability Discovery and Recommendation Platform Runbook

Date: July 24, 2026

Purpose: detect, contain, diagnose, recover, and verify incidents affecting
capability discovery, contextual recommendations, launch attribution, and
lifecycle analytics. This runbook applies to all canonical capabilities and
uses the existing Product Analytics store and canonical Home Action authority.

## 1. Safety rules

- Preserve canonical Home Actions. Disabling capability discovery must not
  delete, dismiss, supersede, or resolve the underlying Home Action.
- Use the narrowest safe containment. Disable one capability before using the
  global switch unless privacy, safety, governance, or systemic integrity is
  at risk.
- Treat unauthorized evidence and material-governance bypass as security or
  safety incidents. Disable globally first, then investigate.
- Do not delete or rewrite raw Product Analytics events during an incident.
  Record the affected time range and correct downstream interpretation.
- Never place user IDs, property IDs, raw evidence, credentials, or access
  tokens in tickets, chat, or committed evidence. Use approved restricted
  incident storage.
- Configuration changes do not affect running API pods until the deployment is
  restarted or replaced.

## 2. Operator surfaces and evidence

| Surface | Use |
|---|---|
| `/dashboard/admin/release-gates` | Global status, rollout parity, registry/manifest pins, broken-route suppression, release blocks, and incident gates |
| `/dashboard/analytics-admin` | Eligible homes, actual-view coverage, feedback, repetition, readiness, reasons, source mix, and lifecycle funnel |
| `GET /api/admin/release-gates` | Machine-readable release and operational-control status |
| `GET /api/admin/analytics/tool-lifecycle` | Machine-readable capability funnel |
| `GET /api/tool-capabilities?propertyId=<authorized-property>` | Effective canonical catalog for an authorized user/property |
| API logs | Registry startup failures, recommendation source failures, and lifecycle persistence warnings |

For a recommendation incident, preserve these bounded fields when available:

- canonical capability ID and manifest version;
- registry, recommendation, and context versions;
- surface and reason code;
- source kind and bounded source ID;
- readiness and rollout cohort;
- lifecycle stage and occurrence time; and
- deployment image/tag and current ConfigMap revision.

Do not copy the recommendation's raw property evidence. The canonical envelope
is sufficient for first-line correlation.

## 3. Severity and response targets

| Severity | Examples | Initial containment |
|---|---|---|
| SEV-1 | Unauthorized evidence, material-governance bypass, systemic incorrect recommendations, registry integrity failure | Set `TOOL_DISCOVERY_ENABLED=false`, restart API, notify security/product/safety owners |
| SEV-2 | Broken high-traffic destination, severe overexposure, incorrect match affecting one capability, lifecycle corruption affecting decisions | Disable the affected capability or route and restart API |
| SEV-3 | Isolated incorrect match, analytics discrepancy without user harm, rollout parity warning caught before exposure | Hold rollout, preserve evidence, correct before expansion |

Escalate a SEV-2 to SEV-1 when regulated coverage, material financial action,
emergency/safety guidance, cross-property data, or unauthorized household
evidence may be involved.

## 4. Standard response sequence

1. **Declare and identify.** Record severity, incident owner, start time,
   affected capability/surface, deployment, and the bounded lineage fields.
2. **Contain.** Use the controls in section 5. Prefer a capability-specific
   control; use the global switch for SEV-1 or uncertain blast radius.
3. **Confirm containment.** Restart API pods, wait for rollout completion, and
   verify the Admin Release Gates view reports the intended control.
4. **Verify user behavior.** Confirm the capability is absent from the
   authorized catalog and recommendation response. Confirm the underlying Home
   Action remains available through its canonical workflow when applicable.
5. **Diagnose.** Determine whether the fault is route, source matching,
   readiness, governance, rollout, registry, telemetry, or deployment drift.
6. **Correct and validate.** Run the focused tests and parity checks in section
   8 before removing containment.
7. **Restore gradually.** Clear the narrow control, use an internal/beta
   rollout first, and monitor actual-view coverage, feedback, and repetition.
8. **Close.** Record the affected period, root cause, corrective change,
   verification evidence, and any analytics caveat. Remove temporary runtime
   changes from the cluster or reconcile them into tracked configuration.

## 5. Containment controls

The tracked defaults live in
`infrastructure/kubernetes/base/configmap.yaml`. The current deployment remains
in `INTERNAL_BETA` with human attestations disabled because no external users
are admitted. Moving to `REAL_USER_LAUNCH` and enabling human attestations
requires an explicit launch decision and current approvals. Lists contain
comma-separated canonical capability IDs. When changing a list, preserve every
existing entry; do not overwrite another active incident's containment.

| Control | Effect |
|---|---|
| `TOOL_DISCOVERY_RELEASE_MODE=REAL_USER_LAUNCH` | Launch mode. Fails closed when policy is unavailable, invalid, or release-gate enforcement is off |
| `TOOL_DISCOVERY_RELEASE_MODE=INTERNAL_BETA` | Current internal/test-only mode that preserves beta fail-open behavior |
| `TOOL_DISCOVERY_ENABLED=false` | Globally removes capabilities from catalog and recommendation availability |
| `TOOL_DISCOVERY_DISABLED_IDS` | Disables specific capabilities without changing Home Actions |
| `TOOL_DISCOVERY_BROKEN_ROUTE_IDS` | Suppresses capabilities with known-broken destinations |
| `TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS` | Holds capabilities at the release-policy boundary when enforcement is enabled |
| `ENFORCE_TOOL_DISCOVERY_RELEASE_GATES=true` | Enforces rollout cohorts and explicit release blocks |
| `TOOL_DISCOVERY_EXPECTED_REGISTRY_VERSION` | Fails closed when the deployed registry hash differs |
| `TOOL_DISCOVERY_MANIFEST_VERSIONS` | Pins `capability-id:version` pairs; mismatches are suppressed |

The authenticated availability endpoint and Admin Release Gates report
`releaseReady` plus stable `releaseBlockers`. A deployment must not admit real
users unless the effective mode is `REAL_USER_LAUNCH`, `releaseReady` is true,
and the remaining WS9 launch gates have independently passed.

Admin Release Gates also assigns every canonical capability a `READY`, `HELD`,
or `BLOCKED` state. `HELD` is an intentional operator decision
(`TOOL_DISCOVERY_DISABLED_IDS` or a zero-percent rollout); `BLOCKED` indicates
a policy, configuration, route, manifest, rollout mapping, or incident failure
that requires resolution. Review all rows before launch—an aggregate count is
not a substitute for reviewing the blocker codes.

Containment values must be canonical capability IDs. Unknown values in
`TOOL_DISCOVERY_DISABLED_IDS`, `TOOL_DISCOVERY_BROKEN_ROUTE_IDS`, or
`TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS` invalidate the configuration and
fail closed. Copy IDs from Admin Release Gates or the canonical capability
registry rather than entering route names or rollout keys.

## 5.0 Internal beta and production cutover

The tracked ConfigMap is the source of truth for the intended environment
mode. Use the following matrix; do not infer the mode from traffic, DNS, or the
presence of production infrastructure.

| Setting | Internal beta (current) | Production cutover | External-user incident |
|---|---|---|---|
| `TOOL_DISCOVERY_RELEASE_MODE` | `INTERNAL_BETA` | `REAL_USER_LAUNCH` | Keep `REAL_USER_LAUNCH` |
| `ENFORCE_HUMAN_POLICY_APPROVALS` | `false` | `true` | Keep `true` |
| `TOOL_DISCOVERY_ENABLED` | `true` | `true` | Set `false` only for a global discovery shutdown |
| `CAPABILITY_RECOMMENDATIONS_ENABLED` | `true` | `true` | Set `false` for catalog-only containment |
| `ENFORCE_TOOL_DISCOVERY_RELEASE_GATES` | `true` | `true` | Keep `true` |

The remaining containment lists and version pins are not environment-mode
switches. Keep their intentional values through cutover:

- `TOOL_DISCOVERY_DISABLED_IDS`, `TOOL_DISCOVERY_BROKEN_ROUTE_IDS`, and
  `TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS` contain active holds only and are
  normally empty;
- `TOOL_DISCOVERY_EXPECTED_REGISTRY_VERSION` and
  `TOOL_DISCOVERY_MANIFEST_VERSIONS` pin the approved release when the launch
  decision requires immutable version pins; copy values from the candidate's
  Admin Release Gates output and never invent them; and
- an intentionally held capability may remain `HELD`, but every unexpected
  `BLOCKED` capability must be resolved before launch-owner sign-off.

### Production-cutover prerequisites

Before changing either mode switch:

1. Deploy the exact candidate build and apply the database schema containing
   `capability_governance_reviews`.
2. Confirm Admin Release Gates can load all canonical capabilities and that
   every capability intended for launch has current approvals for its displayed
   manifest and policy versions.
3. Review every `READY`, `HELD`, and `BLOCKED` row. Record the reason and owner
   for each intentional hold. Do not create fictitious commercial facts or
   attestations to clear a gate; Financing remains held until its real
   relationship and compensation terms are recorded.
4. Confirm `releaseReady=true` for the launch scope and complete the
   representative-property smoke, authorization, browser/PWA, analytics,
   accessibility, privacy, and containment drills in this runbook.
5. Record the launch owner, approved candidate identifier, effective
   configuration, evidence links, and rollback owner.

### Apply the production mode

In `infrastructure/kubernetes/base/configmap.yaml`, change the first two values
and confirm all five values match the following production state:

```yaml
ENFORCE_HUMAN_POLICY_APPROVALS: "true"
TOOL_DISCOVERY_RELEASE_MODE: "REAL_USER_LAUNCH"
TOOL_DISCOVERY_ENABLED: "true"
CAPABILITY_RECOMMENDATIONS_ENABLED: "true"
ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: "true"
```

Do not edit the API or worker Deployment YAML for this cutover. Both
deployments already consume the relevant ConfigMap value.

Apply the tracked ConfigMap and restart both API and worker deployments. A
ConfigMap-only change does not currently alter the pod template, so applying it
does not automatically restart existing pods.

```bash
kubectl apply -f infrastructure/kubernetes/base/configmap.yaml
kubectl rollout restart deployment/api-deployment -n production
kubectl rollout restart deployment/worker-deployment -n production
kubectl rollout status deployment/api-deployment -n production
kubectl rollout status deployment/worker-deployment -n production
```

Verify the effective API values:

```bash
kubectl exec -n production deployment/api-deployment -- \
  printenv TOOL_DISCOVERY_RELEASE_MODE \
    ENFORCE_HUMAN_POLICY_APPROVALS \
    TOOL_DISCOVERY_ENABLED \
    CAPABILITY_RECOMMENDATIONS_ENABLED \
    ENFORCE_TOOL_DISCOVERY_RELEASE_GATES
```

The output must be, in order:

```text
REAL_USER_LAUNCH
true
true
true
true
```

Re-open Admin Release Gates against the deployed environment, confirm
`releaseReady=true`, rerun the representative-property smoke, and verify one
eligible contextual recommendation plus one intentionally ineligible case
before admitting external users.

### Rollback after cutover

Do not switch an environment with external users back to `INTERNAL_BETA` or
turn human approvals off. That would restore beta fail-open behavior. Instead:

1. Set `CAPABILITY_RECOMMENDATIONS_ENABLED=false` to retain Explore Tools while
   removing contextual promotion.
2. Add specific canonical IDs to the appropriate containment list for a narrow
   incident.
3. Set `TOOL_DISCOVERY_ENABLED=false` only when all capability discovery must
   be removed.
4. Restart the API deployment and verify the effective value and user-visible
   behavior. Restart workers as well whenever
   `ENFORCE_HUMAN_POLICY_APPROVALS` changes.

Reverting to `INTERNAL_BETA` and
`ENFORCE_HUMAN_POLICY_APPROVALS=false` is permitted only after external access
has been removed and the environment has formally returned to internal testing.

For an emergency global shutdown:

```bash
kubectl patch configmap app-config \
  -n production \
  --type merge \
  -p '{"data":{"TOOL_DISCOVERY_ENABLED":"false"}}'
kubectl rollout restart deployment/api-deployment -n production
kubectl rollout status deployment/api-deployment -n production
```

For a narrow runtime control, patch the appropriate key with the complete
comma-separated list, restart the API deployment, and immediately reconcile
the intended value into the tracked ConfigMap:

```bash
kubectl patch configmap app-config \
  -n production \
  --type merge \
  -p '{"data":{"TOOL_DISCOVERY_DISABLED_IDS":"coverage-options,example-capability"}}'
kubectl rollout restart deployment/api-deployment -n production
kubectl rollout status deployment/api-deployment -n production
```

Verify the effective values without printing secrets:

```bash
kubectl get configmap app-config -n production \
  -o jsonpath='{.data.TOOL_DISCOVERY_ENABLED}{"\n"}{.data.TOOL_DISCOVERY_DISABLED_IDS}{"\n"}{.data.TOOL_DISCOVERY_BROKEN_ROUTE_IDS}{"\n"}{.data.TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS}{"\n"}'
kubectl get pods -n production -l app=api
```

## 5.1 Capability governance reviews

Real-user configuration sets `ENFORCE_HUMAN_POLICY_APPROVALS=true`.
Admin Release Gates lists the current approval status for every capability:

- `LOW_CONSEQUENCE` requires `PRODUCT`;
- `MATERIAL_FINANCIAL` requires `PRODUCT`, `DOMAIN`, and `TRUST`;
- `REGULATED_COVERAGE` and `SAFETY_EMERGENCY` additionally require
  `LEGAL_COMPLIANCE`; and
- a commercial action also requires `COMMERCIAL_INTEGRITY`.

Review decisions require an authenticated admin session with MFA,
`RELEASE_GATE_VIEW`, and `SYSTEM_SETTINGS_MANAGE`. A rejection must include a
reason. Decisions apply only to the displayed manifest and policy versions.
Any later version change returns the capability to missing-approval status.

Do not seed approval rows or copy them between environments. They are human
attestations. Before deploying this slice, apply the Prisma schema change that
creates `capability_governance_reviews`; no repository migration script is
provided. If the table or database is unavailable, runtime contextual
recommendations and the Admin real-user launch gate fail closed.

Approval completion does not replace the technical tests or drills elsewhere
in WS9. An approved capability remains blocked by rollout, route, manifest,
incident, privacy, authorization, or telemetry failures.

## 5.2 Governance definition review

Before recording role attestations, review the structured definition shown in
Admin Release Gates:

- material and regulated capabilities must state a professional boundary;
- regulated capabilities must state how jurisdiction is verified;
- safety capabilities must state both conservative fallback and emergency
  escalation;
- commercial actions must record the actual relationship, possible
  compensation, ranking influence, disclosure, and a non-commercial
  alternative; and
- privacy classification and purpose/sharing/retention boundaries must match
  the declared records handled by the capability.

`DEFINITION_GOVERNANCE_INVALID` cannot be overridden by a human approval. Fix
the canonical manifest, advance its policy or manifest version, deploy it, and
repeat the required reviews. The current policy version is
`capability-governance-v2`; earlier capability attestations are stale.

Financing is intentionally blocked until accountable owners replace
`NOT_RECORDED` with the actual commercial relationship and verify the
compensation disclosure. Do not guess these terms merely to clear the gate.

## 5.3 Authenticated representative-property smoke

CAP-904 provides a read-only smoke runner. Run it after deploying the exact
candidate build and applying tracked configuration, before admitting real
users.

Choose at least three test properties owned by the same non-admin smoke
account. The set should exercise materially different structured states, for
example a sparse/new home, an established home with systems and documents, and
an active decision or project. Do not place addresses, property facts,
document text, or bearer tokens in the scenario file.

Before deploying, ensure the smoke account already has explicit
`HouseholdMember` access to each representative property and place all three
IDs in `SMOKE_TEST_PROPERTY_ALLOWLIST`. Do not allowlist the unauthorized probe
property. The runner sends a bounded `X-Capability-Smoke-Run` correlation
header; the API accepts it only for an allowlisted authorized property and
suppresses the normal server-owned eligibility event. A missing allowlist or
forged smoke scope fails with `403` rather than silently polluting analytics.

Create a temporary JSON file outside the repository:

```json
{
  "contractVersion": "capability-smoke-v1",
  "unauthorizedPropertyId": "property-not-owned-by-smoke-account",
  "requireRealUserLaunchMode": true,
  "requireReleaseReady": true,
  "scenarios": [
    {
      "name": "sparse new home",
      "propertyId": "authorized-property-1",
      "expectedCapabilityIds": [],
      "forbiddenCapabilityIds": [],
      "minimumHomeSuggestions": 0,
      "minimumPropertySuggestions": 0
    },
    {
      "name": "established home",
      "propertyId": "authorized-property-2",
      "expectedCapabilityIds": ["material-specs"],
      "forbiddenCapabilityIds": [],
      "minimumHomeSuggestions": 1,
      "minimumPropertySuggestions": 1
    },
    {
      "name": "active seller decision",
      "propertyId": "authorized-property-3",
      "expectedCapabilityIds": ["seller-prep"],
      "forbiddenCapabilityIds": ["financing"],
      "minimumHomeSuggestions": 1,
      "minimumPropertySuggestions": 1
    }
  ]
}
```

Expected and forbidden IDs must reflect reviewed structured state in the
target environment. An empty expectation is valid for a deliberately sparse
property; do not add facts merely to make a smoke case pass.

Run from `apps/backend`, placing the opaque bearer token only in the process
environment:

```bash
CAPABILITY_SMOKE_BASE_URL=https://api.contracttocozy.com \
CAPABILITY_SMOKE_TOKEN='<opaque-smoke-account-token>' \
CAPABILITY_SMOKE_SCENARIOS_FILE=/absolute/path/to/capability-smoke.json \
npm run smoke:capability-discovery
```

The runner allows plain HTTP only for `localhost` and loopback addresses. It
uses GET requests exclusively. A pass report includes scenario names,
property IDs, bounded capability IDs/counts, registry version, request count,
smoke correlation ID, and check time; it never includes the token or property
evidence.

A failure is blocking when it indicates:

- authentication or authorization drift;
- an unauthorized property returning anything other than `404`;
- launch mode, release readiness, configuration, or rollout parity failure;
- deployed registry or manifest drift;
- a stale, unknown, unavailable, duplicate, or workflow-only capability;
- missing expected or present forbidden capability;
- broken property launch context or mixed context versions; or
- missing private/no-store cache isolation.

Preserve the pass report with the deployment evidence. Do not treat it as proof
that human governance reviews, accessibility, supported-browser telemetry,
analytics denominators, kill switches, rollback, or the incident drill passed.
Do not store the bearer token with the report.

## 5.4 Supported-browser and mobile-PWA telemetry gate

CAP-905 makes the actual-view check a blocking production-build acceptance
matrix:

```bash
cd apps/frontend
npx playwright install chromium firefox webkit
npm run test:tool-discovery:e2e
```

The command builds with `TOOL_DISCOVERY_ACCEPTANCE_FIXTURE=1` and runs desktop
Chromium, Firefox, WebKit, mobile Chrome, and standalone-mode mobile Safari.
CI installs the same engines with their Linux system dependencies.

Required evidence is a complete pass with:

- no lifecycle event while rendered cards remain below the viewport;
- `DISCOVERED` only for cards at least 50% visible for 750 continuous
  milliseconds in the active document;
- correct property, registry, context, source, and surface lineage;
- no bulk Explore Tools impressions;
- no repeated event after returning to the tile or reloading the session;
- functioning catalog search in every engine; and
- a valid standalone PWA manifest plus actual-view event in the mobile Safari
  project.

The acceptance build diverts lifecycle payloads to an in-page capture sink and
does not post Product Analytics. The sink is unavailable in normal builds.
Acceptance pages remain `404` unless their explicit fixture flag is enabled.
The CSP exception removes `upgrade-insecure-requests` only for the enabled
local HTTP acceptance document; never copy that exception to homeowner or
deployed production routes.

If WebKit renders server HTML but does not hydrate, inspect its trace for local
assets rewritten from HTTP to HTTPS before changing observer timeouts. If a
mobile comparison observes an adjacent stacked card, allow the full exposure
window before comparing the viewport with emitted events.

## 5.5 Admin Analytics population gate

CAP-906 changes the Tool Discovery Funnel contract to
`capability-funnel-v3`. Before using the funnel as launch evidence, open Admin
Analytics for the review window and record:

- the displayed `REAL_USER` included-home and included-event population;
- excluded synthetic-QA events and homes;
- eligible and actual-view unique-home counts;
- actual-view coverage and click-through rates; and
- the readiness, reason-code, source, and repetition projections.

All funnel projections use the same exclusion predicate. Canonical lifecycle
events default to `REAL_USER`; only internal server callers can select
`SYNTHETIC_QA`. The authenticated homeowner ingestion contract strips that
field, and the canonical envelope overwrites reserved QA markers from arbitrary
client metadata. Historical rows carrying `syntheticQa`, `qaRunId`, or
`smokeCorrelationId` remain excluded.

The browser acceptance matrix should produce no database events, and the
representative-property smoke suppresses eligibility writes. A non-zero
excluded count therefore requires identifying the controlled emitter and
matching its run evidence. Do not delete Product Analytics rows to make the
count zero. Investigate an unexplained increase before launch.

Run the focused contract checks with:

```bash
cd apps/backend
node --test \
  tests/unit/toolLifecycleAnalytics.test.js \
  tests/unit/adminToolLifecycleMetrics.test.js
```

## 5.6 Per-capability and global kill-switch drill

Run the read-only registry-wide drill against the exact artifact intended for
deployment:

```bash
npm -C apps/backend run drill:capability-kill-switches \
  > capability-kill-switch-drill.json
```

The command exits non-zero unless:

- release-mode configuration, registry/manifest pins, and rollout-key parity
  are launch-ready;
- every current canonical capability resolves as `CAPABILITY_DISABLED` when it
  is the sole disabled ID;
- the selected capability disappears from the workflow-inclusive catalog
  without changing any other capability decision;
- global disable resolves every capability as `DISCOVERY_DISABLED` and leaves
  the catalog empty; and
- restoring the baseline reproduces the original decisions and catalog.

Review `capabilityCount`, every `perCapability[].passed`, `global.passed`,
`restoration.passed`, and the top-level `passed`. Preserve the JSON with the
artifact digest. Because the drill reads the canonical registry, future tools
inherit it without being added to a separate checklist.

Before real-user launch, an authorized operator must also perform one
controlled deployed exercise during a maintenance window:

1. Record the existing complete containment values and baseline authenticated
   catalog, suggestion, Home Action, availability, and Admin Release Gates
   responses.
2. Add one reviewed low-consequence capability to the complete
   `TOOL_DISCOVERY_DISABLED_IDS` list, restart the API, and verify that only
   that capability is absent from catalog and suggestions while Home Actions
   continue.
3. Restore the exact prior disabled list, restart, and verify the baseline
   projection returns.
4. Set `TOOL_DISCOVERY_ENABLED=false`, restart, and verify the authenticated
   catalog and capability suggestions are empty, availability reports
   `DISCOVERY_DISABLED`, and canonical Home Actions continue.
5. Restore the exact prior global value, restart, and verify catalog,
   suggestions, and Admin Release Gates return to baseline.

Do not let the repository drill patch Kubernetes, and do not run the deployed
exercise without change authority. Preserve existing incident entries in every
comma-separated list. A timeout, partial restart, unexpected Home Action
change, isolation failure, or incomplete restoration fails the launch gate and
requires containment under the incident playbook.

## 5.7 Catalog-only rollback drill

Run:

```bash
npm -C apps/backend run drill:capability-catalog-only
```

The report must show all five promotion surfaces suppressed, the canonical
catalog unchanged, and restoration exact. In a deployed exercise, set
`CAPABILITY_RECOMMENDATIONS_ENABLED=false`, restart the API, verify HOME,
PROPERTY, WORKFLOW, RELATED, and COMPLETION return empty suggestion envelopes,
and verify Explore Tools and Home Actions remain available. Restore the prior
value and repeat the checks.

## 5.8 Capability copy review

Run:

```bash
npm -C apps/backend run review:capability-copy
```

Preserve the passing report with product review evidence. Automated policy
rejects promotional claims, pressure language, exclamation urgency, all-caps
copy, excessive length, and unapproved template parameters across every
manifest. It does not authorize material or regulated claims; those still
require the role attestations in section 5.1.

## 5.9 Accessibility acceptance

Run the production-build browser matrix from section 5.4. The same command now
includes axe WCAG A/AA, heading-order, keyboard, live-region, search,
feedback-control, and minimum-target checks across all five browser projects.
Do not suppress a serious axe violation merely because it originates in a
shared global component; correct the shared component and rerun the matrix.

## 5.10 Support and incident drill

Run:

```bash
npm -C apps/backend run drill:capability-incident
```

The report must pass broken-destination, unauthorized-evidence, systemic-match,
and lifecycle-overcount scenarios from detection through closure. Preserve it
with the kill-switch and catalog-only reports. Before launch, an authorized
operator must repeat one SEV-1 and one SEV-2 scenario against the candidate
deployment, without introducing real user/property evidence, and record
response timestamps, owners, containment confirmation, restoration, and any
analytics caveat.

## 6. Incident playbooks

### 6.1 Broken destination

**Signals:** launch produces a 404/500, redirect loop, unresolved route
parameter, authorization error for an otherwise authorized property, or the
route inventory check fails.

**Contain:** add the canonical capability ID to
`TOOL_DISCOVERY_BROKEN_ROUTE_IDS`. Use `TOOL_DISCOVERY_DISABLED_IDS` if the
destination may expose data or perform an unsafe action.

**Diagnose:**

- compare the manifest `destination.routeTemplate` with the current Next.js
  page route;
- reproduce with an authorized test property and the server-issued launch URL;
- check whether the failure is route deployment drift, context parameter
  resolution, middleware authorization, or the destination itself; and
- run `npm -C apps/frontend run qa:product-framework:capabilities`.

**Recover:** deploy the corrected route or manifest, pass the route inventory
and production build, remove the ID from the broken-route list, restart, and
perform one authorized launch from each affected surface.

### 6.2 Incorrect contextual match

**Signals:** high not-relevant feedback, a reason code unsupported by the
source, wrong source entity, a recommendation after the source became
terminal, or a support report that the tool is unrelated.

**Contain:** if the match came from a personalization definition, pause that
definition in Admin Personalization. Otherwise disable the affected capability.
Use the global switch when the matcher or context boundary is systemically
wrong.

**Diagnose:**

- correlate capability, source kind/ID, context version, reason code, and
  recommendation version;
- confirm the source was current and authorized;
- inspect reviewed trigger families, jobs, definition codes, readiness rules,
  and suppression diagnostics;
- compare with the deterministic golden-home fixture for that capability; and
- verify free text or raw evidence did not become eligibility input.

**Recover:** correct reviewed structured matching or readiness metadata, add a
regression fixture, pass CAP-401 through CAP-408 tests, then restore to an
internal cohort and monitor not-relevant feedback.

### 6.3 Overexposure or repetition

**Signals:** repetition rate increases, the same recommendation appears beyond
its 30-day cap, dismissal cooldown is ignored, or multiple surfaces emit
duplicate actual-view impressions.

**Contain:** disable the affected capability if exposure is ongoing. For a
systemic impression or context-version fault, disable discovery globally.

**Diagnose:**

- distinguish eligibility events from viewport-qualified `TOOL_DISCOVERED`;
- group by property, capability, source ID, and context version;
- check observer deduplication, source/context stability, dismissal,
  not-relevant, snooze, and completion timestamps; and
- confirm renewed evidence is newer than the prior feedback/completion.

**Recover:** fix the emitter or frequency policy, add a repeated-request test,
restore narrowly, and monitor repetition and actual-view coverage for at least
one full normal usage cycle.

### 6.4 Lifecycle overcount

**Signals:** impossible conversion rates, multiple completion events for one
idempotency scope, total events grow while unique homes do not, or the same
interaction is attributed to multiple surfaces.

**Contain:** stop the faulty emitter by disabling the affected capability or
global discovery. Do not delete Product Analytics rows.

**Diagnose:**

- verify `capability-lifecycle-v2`, canonical ID, manifest, surface, source,
  context, completion kind, and session/idempotency metadata;
- separate server-owned eligibility from client-owned actual-view/click
  events;
- identify the exact deployment and affected time interval; and
- confirm retries are not rebuilding a new idempotency key.

**Recover:** correct the emitter or idempotency boundary, add a contract test,
and annotate the affected analytics interval. If reporting correction is
required, implement it as a reviewed query/window rule while preserving the
append-only event store.

### 6.5 Unauthorized evidence

**Signals:** a suggestion contains raw property values, correction paths,
unapproved household facts, evidence from another property/user, or evidence
despite restricted access.

**Contain:** treat as SEV-1. Disable discovery globally, preserve restricted
evidence, revoke any exposed share/session path if applicable, and notify the
security/privacy owner.

**Diagnose:**

- verify property access resolution and authorized user ownership;
- inspect the normalized context adapter and evidence mode;
- confirm optional household scope was excluded;
- check for cross-property cache keys or reused source objects; and
- do not paste exposed values into ordinary logs or tickets.

**Recover:** fix the authorization/context boundary, run cross-property and
evidence-omission tests, complete the privacy/security review, rotate affected
credentials or links when necessary, and restore only after approval.

### 6.6 Material-governance bypass

**Signals:** material financial, regulated coverage, or safety guidance is
promoted without the allowed safety tier, approval, evidence restriction,
professional boundary, or material-action gate.

**Contain:** treat as SEV-1. Disable globally and notify product safety,
compliance, and the domain owner. Do not use a rollout exception to bypass the
block.

**Diagnose:** preserve capability/manifest/policy versions and governance
diagnostics; verify safety tier, approvals, context freshness, source response,
commercial disclosure, and `materialActionAllowed`.

**Recover:** correct the canonical manifest or governance policy, add a
blocked-path regression test, obtain the required review, and restore through
internal then beta cohorts.

### 6.7 Rollout misconfiguration

**Signals:** Admin Release Gates reports invalid configuration, rollout-key
parity failure, missing cohort, unexpected disabled cohort, malformed manifest
pin, registry mismatch, or inconsistent behavior between users.

**Contain:** do not turn enforcement off to make a mismatch disappear. Restore
the last known-good ConfigMap or disable the affected capability/global
discovery.

**Diagnose:**

- compare all 52 canonical rollout keys with `TOOL_FLAGS`;
- inspect the expected/current registry hashes and manifest pin diagnostics;
- confirm percentage values are between 0 and 100;
- verify deterministic user bucketing uses the intended user ID; and
- check for untracked runtime ConfigMap edits.

**Recover:** correct tracked configuration, apply it, restart all API replicas,
and require valid parity and pins before expanding the cohort.

### 6.8 Registry startup failure

**Signals:** API pods crash-loop after deployment; logs report duplicate IDs,
routes, rollout keys, invalid manifests, unknown relationships, or startup
schema errors.

**Contain:** keep the failed release out of service and roll back to the last
known-good immutable backend image. Do not weaken registry validation.

**Diagnose:**

```bash
kubectl get pods -n production -l app=api
kubectl logs deployment/api-deployment -n production --tail=300
kubectl rollout history deployment/api-deployment -n production
```

Run the registry and completeness checks locally. Correct the canonical
manifest rather than adding a runtime alias or duplicate registration.

**Recover:** deploy a validated immutable image, wait for every replica, check
the health endpoint, and confirm Admin Release Gates reports registry and
rollout parity.

### 6.9 Emergency disable and rollback

Use the global shutdown command in section 5 when blast radius is unknown,
privacy/safety/governance is implicated, or multiple capabilities fail.

Capture the current and prior deployment before changing it:

```bash
kubectl get deployment api-deployment -n production \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}{"\n"}'
kubectl rollout history deployment/api-deployment -n production
```

Prefer an immutable known-good image:

```bash
kubectl set image deployment/api-deployment \
  api=ghcr.io/madhuboyin/contract-to-cozy/backend:<known-good-tag> \
  -n production
kubectl rollout status deployment/api-deployment -n production
```

Restore the matching
`TOOL_DISCOVERY_EXPECTED_REGISTRY_VERSION` and
`TOOL_DISCOVERY_MANIFEST_VERSIONS` values with the artifact. Code and pins
must agree before discovery can become available. Keep global discovery off
until sections 7 and 8 pass, then restore an internal cohort first.

## 7. Post-containment verification

Confirm:

- API pods are healthy and all replicas run the intended image;
- Admin Release Gates shows the expected global state, suppression list,
  registry match, manifest pins, and rollout parity;
- the effective catalog excludes contained capabilities;
- contextual endpoints return no contained suggestion;
- canonical Home Actions remain present and actionable through their original
  workflow;
- no new lifecycle events are arriving for the contained discovery path; and
- unrelated capabilities still respect their existing cohort and governance
  gates.

## 8. Local release gate

From the repository root, run backend checks inside the backend workspace so
`ts-node/register` resolves from the package that owns it:

```bash
cd apps/backend
GEMINI_API_KEY=test-key node --test \
  tests/unit/toolDiscoveryAvailability.test.js \
  tests/unit/toolCapabilityContracts.test.js \
  tests/unit/toolCapabilityRecommendation.test.js \
  tests/unit/toolLifecycleAnalytics.test.js \
  tests/unit/adminToolLifecycleMetrics.test.js
npm run build
cd ../..
npm -C apps/frontend test -- --runInBand toolDiscoveryRegistry
npm -C apps/frontend run build
npm -C apps/frontend run qa:product-framework:capabilities
git diff --check
```

Do not clear containment when a relevant check is skipped or failing. Record
why an unrelated failure is non-blocking and obtain the incident owner's
approval.

## 9. Closure record

The incident record must include:

- severity, owner, timeline, and affected capability/surfaces;
- bounded lineage and deployment/configuration versions;
- containment control and time it became effective;
- root cause and affected user/time scope;
- whether analytics for the interval requires an annotation;
- code/configuration changes and validation results;
- privacy, safety, compliance, or domain approvals when applicable; and
- restoration cohort, monitoring window, and final outcome.

Temporary cluster edits must be reconciled into tracked configuration or
explicitly reverted before closure.

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
`infrastructure/kubernetes/base/configmap.yaml`. Lists contain comma-separated
canonical capability IDs. When changing a list, preserve every existing entry;
do not overwrite another active incident's containment.

| Control | Effect |
|---|---|
| `TOOL_DISCOVERY_RELEASE_MODE=REAL_USER_LAUNCH` | Default mode. Fails closed when policy is unavailable, invalid, or release-gate enforcement is off |
| `TOOL_DISCOVERY_RELEASE_MODE=INTERNAL_BETA` | Explicit internal/test-only mode that preserves beta fail-open behavior |
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

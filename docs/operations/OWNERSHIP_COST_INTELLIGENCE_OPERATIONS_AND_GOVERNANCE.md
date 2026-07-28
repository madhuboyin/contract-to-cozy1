# Ownership Cost Intelligence Operations and Governance

**Status:** Active runbook
**Last reconciled:** July 28, 2026
**Capability:** `ownership-costs`
**Safety tier:** Material financial

## 1. Ownership and access

| Concern | Accountable owner |
|---|---|
| Canonical source adapters and coverage | Data operations |
| Calculation, replay, and version contracts | Ownership Cost engineering |
| Content and financial-claim review | Product and trust/safety |
| Commercial-integrity review | Legal/compliance |
| Runtime health and containment | Platform operations |
| Homeowner-visible issue triage | Support |

The operations endpoints require authenticated Admin access with MFA.
`ANALYTICS_VIEW` permits the aggregate operations report, `AUDIT_VIEW` permits
read-only fingerprint replay, and `RELEASE_GATE_VIEW` permits launch-gate
inspection. Replay never writes observations, snapshots, forecasts, or
decisions.

## 2. Operations report

Read `GET /api/admin/ownership-costs/operations?windowDays=30`.

Review:

- expected adapter coverage and latest adapter outcomes;
- source and observation counts;
- snapshot coverage and staleness;
- persisted adapter failures and definition mismatches;
- category-jump alerts;
- decisions, engagement, planning handoffs, and resolved outcomes.

Engagement (`ACCEPTED`, `SAVED`, or `SNOOZED`) is not a resolved outcome.
Only explicit resolution is counted as resolved, and outcome verification
remains a later lifecycle state. Never combine these measures into an inflated
completion rate.

The report contains internal property and artifact identifiers needed for
diagnosis. It must not expose addresses, user identifiers, source fact values,
documents, or raw decision reasons.

## 3. Alert response

| Alert | First response |
|---|---|
| Missing canonical adapter | Confirm the adapter registry and the latest property refresh; do not treat the category as zero |
| Adapter failure | Preserve the latest snapshot as last-known-good; inspect the bounded adapter error and source health |
| Stale snapshot | Check source availability and refresh history; disclose staleness rather than silently recalculating with defaults |
| Definition mismatch | Stop promotion of the mismatched result and replay using its retained method version |
| Category jump | Compare the two retained periods and source evidence; the alert is not proof the source is wrong |

Critical alerts block real-user promotion until contained or explicitly
reviewed. Do not delete or edit historical snapshots to clear an alert.

## 4. Reproducing a material result

Send the retained property ID, 64-character input fingerprint, and exact method
version to `POST /api/admin/ownership-costs/replay`.

A valid replay:

1. loads the immutable snapshot and its source-observation references;
2. requires the requested method to equal the retained method;
3. rebuilds the snapshot in memory;
4. compares the input fingerprint, method, category definition, coverage,
   applicable and missing categories, and lens totals; and
5. returns `mutationPerformed: false`.

If replay reports drift, preserve the response, snapshot ID, versions, and
deployment identifier. Do not run an unversioned replacement calculation and
present it as the historical result.

## 5. Failure and containment

The homeowner read path preserves the latest persisted snapshot when a source
refresh fails and labels it last-known-good. During an incident:

1. preserve the affected fingerprint, snapshot, forecast, and adapter runs;
2. contain only the affected adapter or capability rollout;
3. verify the last-known-good disclosure;
4. identify downstream decisions carrying the affected versions;
5. replay a representative affected result;
6. fix forward with a new method or adapter version when semantics change; and
7. record re-enable criteria and evidence.

Never overwrite a retained snapshot, silently change a cost lens, recast
missing as zero, or use a forecast as observed history.

## 6. Support triage

Collect only the property ID, visible view and lens, snapshot or forecast ID,
calculation time, coverage state, and exact error wording. Do not request
financial documents through email or copy raw household facts into tickets.
Support may explain evidence states and correction paths, but must not promise
savings, appreciation, tax outcomes, insurance outcomes, or future costs.

## 7. Launch gate

Read `GET /api/admin/ownership-costs/launch-gate`. Real-user launch remains
blocked unless:

- the capability is active, enabled, and incident-safe;
- Slice 9 technical evidence and the matching operational drill versions are
  recorded;
- accessibility and responsive reviews are approved;
- content/safety and commercial-integrity owners approve the claims;
- required governance reviews are approved and enforced; and
- no uncontained high-risk gap is recorded.

Run `npm run drill:ownership-costs` from `apps/backend`. Record
`ownership-cost-operational-drill-v1` only after the drill passes in the target
release environment. Environment flags are evidence pointers, not substitutes
for review artifacts.

## 8. Release evidence

Attach:

- backend and frontend typechecks;
- Slice 0–9 focused test results;
- representative credible, partial, and estimate-only fixture results;
- fingerprint replay evidence;
- operations report and anomaly review;
- accessibility and responsive evidence;
- content/safety and commercial-integrity approvals;
- operational drill output;
- named on-call and rollback owners; and
- database reconciliation evidence for the canonical ownership-cost models.

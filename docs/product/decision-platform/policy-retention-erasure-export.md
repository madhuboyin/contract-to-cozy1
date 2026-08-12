# Decision Platform — Retention, Erasure, and Export Policy

**Status:** Proposed — concrete durations below require Privacy, Security, and Domain approval
per FRD §8.4 before any real-user data is collected against them.

This policy implements
[`AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md`](../AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md)
§8's artifact matrix for the models Phase 7A actually schemas (see
[`adr-0002`](./adr-0002-preference-registry-and-schema.md) and
[`adr-0003`](./adr-0003-decision-thread-and-scenario-schema.md)). It follows the same durable
policy-plus-cron-job shape already used for Ask itself
(`docs/operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md` §"Retention and deletion" —
Ask sessions/executions expire after 30 days, feedback after 365, enforced by the production
`ask-retention-cleanup` CronJob).

## Concrete proposed durations

| Artifact | Active retention | Terminal retention | Deletion trigger |
| --- | --- | --- | --- |
| `DecisionThread` (`OPEN`…`ACTION_IN_PROGRESS`, `DECIDED`) | Indefinite while non-terminal | — | N/A while active |
| `DecisionThread` (`ABANDONED`) | — | 180 days, then eligible for `ARCHIVED` | Auto-archival job (not built this phase) |
| `DecisionThread` (`ARCHIVED`) | — | 24 months from `archivedAt`, then hard-delete unless separately confirmed as a durable artifact (FRD §8.1) | `decision-platform-retention-cleanup` (future job, see below) |
| `Scenario` | Same as owning thread | Same as owning thread | Cascades with `DecisionThread` deletion (`onDelete: Cascade` in schema) |
| `RecommendationSnapshot` | 24 months from `generatedAt` | Indefinite, minimized, if the owning decision reached `DECIDED`/`COMPLETED` (FRD §8.1: "may retain minimized immutable lineage if durable decision was confirmed") | `decision-platform-retention-cleanup`, minimization pass on confirmation |
| `DecisionPreferenceValue` | Per its definition's `defaultValidityMonths` (FRD §11.2: 12 months for `OWNERSHIP_HORIZON`/`REPAIR_REPLACE_APPROACH`; until changed for `DECISION_DETAIL_LEVEL`) | — | Expiry sets `status = EXPIRED`; explicit revoke sets `status = REVOKED` synchronously, before the API returns success (FRD §7.5) |
| `HomeChangeView` cache | Not modeled this phase (FRD §16.1: disposable, non-authoritative — no durable retention applies) | — | N/A — deferred to Phase 9A |
| `OutcomeObservation` / `RecommendationAttribution` | Not modeled this phase | — | N/A — deferred to Phase 10A, per its own approved policy |

## Deletion cascades already enforced by schema

- Deleting a `DecisionThread` row cascades to every child model
  (`DecisionThreadParticipant`, `FactReference`, `PreferenceReference`, `Assumption`, `Option`,
  `Question`, `ExecutionLink`, `Scenario`) via `onDelete: Cascade`.
- Deleting a `RecommendationSnapshot` referenced as a thread's
  `currentRecommendationSnapshotId` is blocked by the schema's FK unless the thread is updated
  first — this is intentional: a thread must never point at a deleted "current" snapshot.
- Deleting a `Property` cascades to its `DecisionThread`, `DecisionPreferenceValue`, and
  `RecommendationSnapshot` rows, matching FRD §8.1's "Delete" disposition for property/account
  deletion.

## Reproducibility with deletion (FRD §8.2)

`RecommendationSnapshot` retains `recommendationDefinitionVersion`, `operationVersion`,
`engineVersion`, and `contextContractVersion` permanently as part of its own immutable row — these
survive even when a referenced `DecisionPreferenceValue` is later deleted. A deleted preference
referenced by `preferenceReferenceIds` is **not** re-fetched or reconstructed; the historical
snapshot is expected to disclose (at presentation time, in Phase 8B) that a referenced input was
removed and exact reconstruction is no longer available, per FRD §8.2 — this policy does not
retain the erased value merely to reproduce a historic answer.

## Export

`DecisionPreferenceValue` export (FRD §8.3: "active reusable preference values and their source,
scope, confirmation date, expiry, and affected operation families") and `DecisionThread` export
("omit data the requester is not authorized to see") are Phase 8A/8B API surface, not a Phase 7A
schema concern — this policy records the retained fields (`consentPolicyVersion`, `consentedAt`,
`purposeCode`, `eligibleDecisionDefinitionIds` via the registry) needed to satisfy that export
requirement once built.

## Future operational job (not built this phase)

A `decision-platform-retention-cleanup` job, mirroring the production `ask-retention-cleanup`
CronJob, is the intended enforcement mechanism for the durations above. It is explicitly deferred
to Phase 8A+, since there is no real-user data yet for it to act on and Phase 7A's own gate (FRD
§5.1) does not require production enforcement infrastructure before real-user collection is
itself approved.

## Approval gate

Per FRD §8.4 (as clarified by ADR-0001): these durations, and the artifact-by-artifact deletion
behavior above, must be approved by Product, the owning Domain, Architecture, Privacy, Security,
Trust, and Operations before any real-user `DecisionPreferenceValue`, `DecisionThread`, or
`RecommendationSnapshot` row is written. This approval is the real-user-data-collection portion of
the broader Phase 7A exit gate; it does not by itself authorize production launch of any Ask
Intelligence feature.

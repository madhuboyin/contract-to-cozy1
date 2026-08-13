# Decision Platform — Phase 7A (P0 Contract Closure)

**Status:** These artifacts self-describe as "Proposed — pending Product, Domain, Architecture,
Privacy, Security, Trust, and Operations approval" per the FRD's Phase 7A gate (§5.1, §25). **That
gate was never implemented as a code-level control** — Phase 8A (HVAC Decision Thread foundation),
8B (preference reuse), 8C (cross-domain composition), and 9A–9C (Change Intelligence, Priority
Intelligence, external delivery) are all built and live in the codebase's production Ask dispatch
path, with no feature flag or marker recording that the named approvals were formally obtained. See
[`docs/operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md`](../../operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md)
for what's actually implemented, phase by phase. Treat this ADR set as the historical
contract-closure record, not as an accurate statement of current build status.

This directory holds the P0 contract-closure artifacts for
[`AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md`](../AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md)
§25 "Phase 7A — P0 contract closure." Phase 7A's objective was to approve ownership, authorization,
privacy, retention, schema, and evaluation definitions before P1 feature behavior (Decision
Threads, preference reuse, priority intelligence) was built — in practice, that P1 behavior was
built directly on top of these artifacts without a recorded approval step.

## Contents

| Artifact | Closes |
| --- | --- |
| [`adr-0001-ownership-and-scope.md`](./adr-0001-ownership-and-scope.md) | FRD §6 canonical ownership/disposition matrix; the `subjectType: HOUSEHOLD` binding decision; Phase 7A scope |
| [`adr-0002-preference-registry-and-schema.md`](./adr-0002-preference-registry-and-schema.md) | FRD §7, §11 — `DecisionPreferenceDefinition` registry and `DecisionPreferenceValue` schema |
| [`adr-0003-decision-thread-and-scenario-schema.md`](./adr-0003-decision-thread-and-scenario-schema.md) | FRD §9, §10, §13, §14 — `DecisionThread` family, `Scenario`, `RecommendationSnapshot` schema and the lifecycle/context-health transition contract |
| [`policy-retention-erasure-export.md`](./policy-retention-erasure-export.md) | FRD §8 — artifact-by-artifact retention, deletion, export, and lineage policy with concrete proposed durations |
| [`policy-threat-model-and-privacy-review.md`](./policy-threat-model-and-privacy-review.md) | FRD §25 Phase 7A deliverable — threat model and privacy review |
| [`metrics-dictionary.md`](./metrics-dictionary.md) | FRD §22 — metrics dictionary and zero-tolerance gates |

## What Phase 7A built, and what was built on top of it since

Per the FRD's own gate (§5.1): Phase 7A "blocks production implementation that establishes
canonical behavior and all real-user collection; permits ADRs, fixtures, prototypes, and
non-production evaluation." As written, Phase 7A itself delivered only:

- the code-based typed registries (`apps/backend/src/services/decisionPlatform/`) for
  `DecisionPreferenceDefinition`, `DecisionContextContract`, and the decision-family catalog;
- the `DecisionThread` lifecycle/context-health transition contract
  (`decisionThreadTransitions.ts`) as pure, DB-free, unit-tested logic;
- the Prisma schema for durable instance/value records (`DecisionPreferenceValue`,
  `DecisionThread` and its child models, `Scenario`, `RecommendationSnapshot`) — schema only, no
  migration applied (the user applies schema changes to their own database); and
- this policy/ADR set.

**That is no longer the current state of the repository.** Phase 8A built the Ask-facing routing,
orchestration, and business logic that acts on these models (`HVAC_DECISION_*`/
`HVAC_PREFERENCE_*` operations); Phase 8B built preference save/reuse/revoke; Phase 8C built the
cross-domain context contract and graph-read layer. All of it is live — see
[`docs/operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md`](../../operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md)
for the accurate, current description of what each phase actually built, including specific known
gaps (an unused preference definition, declared-but-nonexistent settings routes, passive-only
expiry enforcement, an unwired graph-read module). `OutcomeObservation`, `RecommendationAttribution`,
and `DecisionOutcomeLink` (Phase 10A) remain unbuilt. `HomeChangeView` (Phase 9A) is now built, as
the FRD requires: a disposable, non-authoritative read projection, never a durable model.

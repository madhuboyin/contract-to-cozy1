# Decision Platform — Phase 7A (P0 Contract Closure)

**Status:** Proposed — pending Product, Domain, Architecture, Privacy, Security, Trust, and
Operations approval. No real-user decision preferences, threads, or outcomes may be collected
until that approval is recorded (see [`adr-0001-ownership-and-scope.md`](./adr-0001-ownership-and-scope.md)).

This directory holds the P0 contract-closure artifacts for
[`AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md`](../AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md)
§25 "Phase 7A — P0 contract closure." Phase 7A's objective is to approve ownership, authorization,
privacy, retention, schema, and evaluation definitions **before** any P1 feature behavior
(Decision Threads, preference reuse, priority intelligence, etc.) is built in Phase 8A onward.

## Contents

| Artifact | Closes |
| --- | --- |
| [`adr-0001-ownership-and-scope.md`](./adr-0001-ownership-and-scope.md) | FRD §6 canonical ownership/disposition matrix; the `subjectType: HOUSEHOLD` binding decision; Phase 7A scope |
| [`adr-0002-preference-registry-and-schema.md`](./adr-0002-preference-registry-and-schema.md) | FRD §7, §11 — `DecisionPreferenceDefinition` registry and `DecisionPreferenceValue` schema |
| [`adr-0003-decision-thread-and-scenario-schema.md`](./adr-0003-decision-thread-and-scenario-schema.md) | FRD §9, §10, §13, §14 — `DecisionThread` family, `Scenario`, `RecommendationSnapshot` schema and the lifecycle/context-health transition contract |
| [`policy-retention-erasure-export.md`](./policy-retention-erasure-export.md) | FRD §8 — artifact-by-artifact retention, deletion, export, and lineage policy with concrete proposed durations |
| [`policy-threat-model-and-privacy-review.md`](./policy-threat-model-and-privacy-review.md) | FRD §25 Phase 7A deliverable — threat model and privacy review |
| [`metrics-dictionary.md`](./metrics-dictionary.md) | FRD §22 — metrics dictionary and zero-tolerance gates |

## What Phase 7A does and does not build

Per the FRD's own gate (§5.1): Phase 7A "blocks production implementation that establishes
canonical behavior and all real-user collection; permits ADRs, fixtures, prototypes, and
non-production evaluation." Concretely, this phase delivers:

- the code-based typed registries (`apps/backend/src/services/decisionPlatform/`) for
  `DecisionPreferenceDefinition`, `DecisionContextContract`, and the decision-family catalog;
- the `DecisionThread` lifecycle/context-health transition contract
  (`decisionThreadTransitions.ts`) as pure, DB-free, unit-tested logic;
- the Prisma schema for durable instance/value records (`DecisionPreferenceValue`,
  `DecisionThread` and its child models, `Scenario`, `RecommendationSnapshot`) — schema only, no
  migration applied (the user applies schema changes to their own database); and
- this policy/ADR set.

It does **not** build: any Ask-facing routing, orchestration, API endpoints, or business logic
that acts on these models (that is Phase 8A+); `OutcomeObservation`, `RecommendationAttribution`,
or `DecisionOutcomeLink` (Phase 10A); or `HomeChangeView` (Phase 9A, and the FRD requires it stay
a disposable, non-authoritative cache — not a durable model — even then).

# ADR-0003 — Decision Thread, Scenario, and Recommendation Snapshot Schema

## Status

Proposed — pending approval alongside ADR-0001. FRD §25 Phase 7A explicitly lists "Decision
Thread transition contract" as a P0 deliverable even though the `DecisionThread` *feature*
(routing, orchestration, actual continuation logic) is P1/Phase 8A — this ADR closes the schema
and transition contract only.

## Date

August 11, 2026

## Context

FRD §9, §10, §13, and §14 require: (a) every extensible intelligence object to declare a stable
schema version, provenance, freshness/expiry policy, and optimistic-concurrency version; (b) a
`DecisionThread` with independent `lifecycleStatus` and `contextStatus` fields governed by
separate transition tables (§10.2/§10.3, added in FRD v1.2–v1.3 after two rounds of review found
the original single `status` field ambiguous); (c) a `Scenario` isolated from canonical facts and
preferences (§13.3); and (d) an immutable `RecommendationSnapshot` per material recommendation
(§14.1). The FRD gives full field-level schemas for `DecisionThread`, `Scenario`, and
`RecommendationSnapshot`, but only *names* seven related child models
(`DecisionThreadParticipant`, `FactReference`, `PreferenceReference`, `Assumption`, `Option`,
`Question`, `ExecutionLink`) without specifying their fields.

## Decision

1. **The lifecycle/context-health transition contract is pure, DB-free TypeScript**
   (`apps/backend/src/services/decisionPlatform/decisionThreadTransitions.ts`): the FRD's two
   transition tables are represented as explicit `{from, to, trigger}` arrays (wildcard rules like
   "any state → `ARCHIVED`" are expanded into concrete pairs at module-load time, not resolved by
   wildcard-matching logic at read time, so the full legal-transition set is directly enumerable
   and testable), plus `computeContextStatus()` as the single function permitted to decide
   `contextStatus`, implementing FRD §10.3's coexistence rule: conflicted-and-stale together is
   externally `CONFLICTED`; resolving the conflict with a stale reason still outstanding lands on
   `STALE`, not `CURRENT`. Centralizing this in one function is deliberate — the FRD's own review
   history shows this exact rule needed two rounds of clarification, so it must not be
   reimplemented ad hoc at each call site in Phase 8A.

2. **`DecisionThread.lifecycleStatus` and `contextStatus` are separate Prisma enum-typed columns**
   (`DecisionThreadLifecycleStatus`, `DecisionThreadContextStatus`), not a single combined status,
   matching the FRD's own v1.2 correction. `contextIssueCodes String[]` holds the reason codes
   backing `computeContextStatus()`'s inputs.

3. **The seven underspecified child models get FRD-grounded but Phase-7A-proposed field shapes**,
   open for review rather than presented as final:
   - `DecisionThreadParticipant` — `userId`, reuses the existing `HouseholdRole` enum for `role`
     rather than inventing a duplicate, since a thread participant's role is the same
     OWNER/CONTRIBUTOR/VIEWER vocabulary as property access.
   - `DecisionThreadFactReference` — polymorphic (`canonicalEntityType`, `canonicalEntityId`,
     `canonicalFieldPath`), no database foreign key, mirroring the existing
     `Signal.sourceModel`/`sourceId` pattern (FRD §15: this is a typed read abstraction over
     relational identifiers, not a graph database, and the referenced entities span many unrelated
     domain tables).
   - `DecisionThreadPreferenceReference` — a real FK to `DecisionPreferenceValue` (not
     polymorphic; unlike facts, preferences have one canonical owner table).
   - `DecisionThreadAssumption` — thread-level baseline assumptions/limitations (e.g. "no
     technician assessment on file"), explicitly **distinct** from `Scenario.assumptionsJson`,
     which holds isolated counterfactual assumptions for a specific what-if branch (FRD §13.3
     isolation rule — conflating the two would let a scenario assumption leak into the baseline
     thread's facts).
   - `DecisionThreadOption` — candidate options being compared (e.g. "repair" vs. "replace"), with
     a nullable `selectedAt` tying to the `DECIDED` lifecycle trigger ("Homeowner records selected
     option").
   - `DecisionThreadQuestion` — unresolved clarification codes, with an `OPEN`/`RESOLVED` status,
     feeding the `DECISION_PROGRESS` block's "missing required context and unresolved question
     codes" requirement (FRD §21.4).
   - `DecisionThreadExecutionLink` — links `AskExecution` rows to a thread with a `CREATED` |
     `CONTINUED` role, the mechanism by which "durable authorized Decision Threads across
     executions and sessions" (FRD ASK-INT-007) is actually reconstructed.

4. **`DecisionThread.currentRecommendationSnapshotId` and `RecommendationSnapshot.decisionThreadId`
   form a genuine circular foreign-key pair** between the two tables — modeled as two separately
   named Prisma relations (`DecisionThreadCurrentSnapshot` for the one-to-one "current" pointer,
   `DecisionThreadSnapshots` for the one-to-many historical list). This is valid in Postgres (two
   independent FK constraints) and required because a thread's "current" recommendation is a
   single pointer into its own append-only snapshot history, not a separate concept.

5. **`RecommendationSnapshot.canonicalFactReferences`, `signalReferences`, and
   `evidenceReferences` are stored as `Json`, not child tables**, unlike
   `DecisionThreadFactReference`. A snapshot is immutable once created (FRD §14.1); an immutable,
   point-in-time array of `{entityType, entityId, fieldPath, version}` references is simpler than a
   mutable child table for data that, by definition, never changes after insert.

## Consequences

### Positive

- Because the transition tables are enumerable data (not wildcard logic), the "P0 negative tests
  designed" exit criterion (FRD §25 Phase 7A) is satisfiable without a database: illegal
  transitions and the coexistence precedence rule are asserted directly against the exported
  arrays and `computeContextStatus()` (see Verification).
- Reusing `HouseholdRole` on `DecisionThreadParticipant` avoids a fourth role vocabulary in the
  codebase.

### Costs

- The seven child model field shapes are this ADR's proposal, not FRD-specified — Phase 8A
  implementation may need a follow-up schema change if the actual HVAC decision-thread UX reveals
  a gap (e.g. a field `DecisionThreadOption` needs that this ADR didn't anticipate).
- The circular FK pair adds a small amount of insert-ordering complexity: a `RecommendationSnapshot`
  row must exist before `DecisionThread.currentRecommendationSnapshotId` can point to it, so
  callers must create the snapshot first, then update the thread — not enforced by the schema
  itself, only by insert order discipline in Phase 8A service code.

### Rejected alternatives

- **A single combined `status` field**: rejected — this is exactly what the FRD's own v1.1→v1.2
  revision replaced, after finding it created ambiguity for states like `ACTION_IN_PROGRESS` +
  stale context.
- **`DecisionThreadFactReference` as a typed FK per fact domain** (e.g. separate columns for HVAC
  vs. insurance vs. mortgage references): rejected — would require a schema migration every time a
  new domain becomes fact-referenceable; the polymorphic pattern is the existing precedent
  (`Signal`) for exactly this problem.
- **Storing `RecommendationSnapshot` references as child tables instead of `Json`**: rejected for
  this phase — adds write complexity with no benefit for immutable, write-once data; can be
  revisited if a future phase needs to query into individual reference rows.

## Verification

- `npx prisma validate` and `npx prisma generate` succeed against the full schema, including the
  circular FK pair.
- `validateDecisionThreadTransitionContract()` returns `[]`
  (`tests/decisionPlatform/decisionPlatformGovernance.test.js`).
- `tests/unit/decisionPlatform/decisionThreadTransitions.test.js` asserts: every FRD §10.2 legal
  transition is allowed; representative illegal transitions are rejected (`OPEN → COMPLETED`,
  `COMPLETED → ABANDONED`, self-loops); every FRD §10.3 legal context transition is allowed;
  self-loops are rejected; and `computeContextStatus()` implements the coexistence precedence rule
  exactly, including the specific case the FRD calls out — resolving a conflict with a stale
  reason still outstanding lands on `STALE`, not `CURRENT`.

## Operations

None yet — see ADR-0001 Decision 4. Reproducibility and deletion behavior for these models is
specified in [`policy-retention-erasure-export.md`](./policy-retention-erasure-export.md), not
here.

# ADR-0001 — Decision Platform Ownership and Phase 7A Scope

## Status

Proposed — pending Product, Domain, Architecture, Privacy, Security, Trust, and Operations
approval per FRD §8.4 and §25 Phase 7A exit criteria. **Note (Phase 9C update):** no record of
that approval being obtained exists in this repository, and the decisions below were built on
directly by Phase 8A–9C regardless — see the "Governance status" note at the top of
[`docs/operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md`](../../operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md)'s
Phase 7A–8C section. This ADR's ownership decisions remain an accurate description of the
implemented schema and registries; only the "pending approval, blocking" framing is stale.

## Date

August 11, 2026

## Context

[`AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md`](../AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md)
§6 defines a canonical ownership/disposition matrix and rejects three originally-proposed
independent stores (`HomeownerDecisionProfile`, `HomeSignal`, `HomePriorityScore`) in favor of
extending existing canonical owners. Phase 7A's job (§25) is to close that ownership question in
an implementable, reviewable form before any Decision Thread, preference, or recommendation
behavior is built.

One concrete ambiguity surfaced during schema design: `DecisionPreferenceValue.subjectType` can be
`USER` or `HOUSEHOLD` (FRD §7.1), but this codebase already has **two** distinct "household"
concepts:

- `Household` (`apps/backend/prisma/schema.prisma`, table `personalization_households`) — the
  opt-in Personalization profile/consent aggregate (`ownerUserId`, `consentVersion`,
  `consentedAt`), created lazily only when an owner enables optional profile collection; and
- `HouseholdMember`/`HouseholdRole` (`OWNER | CONTRIBUTOR | VIEWER`) — the existing
  property-access ACL, unrelated to consent or profile state.

The FRD does not name which one `subjectType: HOUSEHOLD` refers to, and getting this wrong would
recreate exactly the kind of duplicate-ownership problem Phase 7A exists to close.

## Decision

1. **Ownership matrix (FRD §6) is adopted as written**, with `DecisionThread`, `Scenario`,
   `RecommendationSnapshot`, and normalized outcome records confirmed as new concepts (§6.1), and
   `HomeownerDecisionProfile`, `HomeSignal`, and `HomePriorityScore` confirmed as **not**
   implemented as independent stores.

2. **`DecisionPreferenceValue.subjectType = HOUSEHOLD` binds to `Household.id`** (the
   consent-gated Personalization profile), never to `HouseholdMember`. Role-based write permission
   (FRD §7.2 — who may create, propose, or activate a preference) is a **separate** check against
   the requesting user's `HouseholdMember.role` on the target property. This keeps "who can see or
   use a shared plan" (a `Household`-scoped consent question) distinct from "who can write on this
   property" (a `HouseholdMember`-scoped ACL question), matching FRD principle 2 ("one concept,
   one canonical owner") instead of inventing a third household concept.
   `DecisionThread.subjectHouseholdId` follows the same binding and is a real, non-polymorphic
   foreign key to `Household`.

3. **`DecisionPreferenceValue.subjectId` has no database-level foreign key.** It is polymorphic —
   `User.id` when `subjectType = USER`, `Household.id` when `subjectType = HOUSEHOLD` — and is
   validated at the application layer against `subjectType`, mirroring the existing
   `Signal.sourceModel`/`Signal.sourceId` polymorphic-reference pattern already used elsewhere in
   this schema for the same reason (a single physical FK cannot target two different tables).

4. **Registry vs. instance split.** Definition/registry objects (`DecisionPreferenceDefinition`,
   `DecisionContextContract`, the `decisionDefinitionId` catalog) are code-based TypeScript
   registries under `apps/backend/src/services/decisionPlatform/`, mirroring the existing
   `askOperationRegistry.ts` pattern (frozen map + `definition()` factory + `validate*()` startup
   check). Durable instance/value records (`DecisionPreferenceValue`, `DecisionThread` and its
   children, `Scenario`, `RecommendationSnapshot`) are real Prisma models. No kill-switch/pause
   fields are added to the registries in this phase — there are no real users yet, so a runtime
   pause mechanism is not a P0 blocker; it can be added before any external-delivery phase
   (Phase 9C) without a breaking schema change if the need arises.

5. **Phase 7A scope is limited to what FRD §25 Phase 7A actually lists as deliverables.**
   `OutcomeObservation`, `RecommendationAttribution`, and `DecisionOutcomeLink` (Phase 10A
   deliverables) and `HomeChangeView` (a Phase 9A deliverable, and one the FRD requires stay a
   disposable non-authoritative cache even then, per §16.1) get no schema in this phase. They are
   referenced by name only, as forward declarations, so later phases do not have to re-litigate
   ownership.

## Consequences

### Positive

- The `HOUSEHOLD` subject-binding ambiguity is resolved once, in writing, instead of being
  guessed differently by each future contributor touching this schema.
- Consent state (`Household`) and property-access role (`HouseholdMember`) remain independently
  correct: revoking property access does not silently revoke profile consent, and disabling the
  optional profile does not silently strip a homeowner's property role.
- The registry/instance split means Phase 7A ships zero new operational surface area (no pause
  dashboards, no kill-switch endpoints) while still satisfying FRD §9's requirement that every
  extensible object declare a rollout/kill-switch *policy* — the policy is "not needed until
  Phase 9C," recorded here rather than silently absent.

### Costs

- Any future feature that needs to pause a specific `DecisionPreferenceDefinition` or
  `DecisionContextContract` independently (without a full redeploy) will need a follow-up ADR
  adding a DB-backed operational-state table, since the current registries have no such field.
- `subjectId`'s lack of a DB-level FK means referential integrity for that column is
  application-enforced only; a bug in application code could write an orphaned or wrong-type
  `subjectId`. This is the same tradeoff already accepted for `Signal.sourceModel`/`sourceId`.

### Rejected alternatives

- **A third `DecisionHousehold` concept**, distinct from both `Household` and `HouseholdMember`:
  rejected — directly contradicts FRD principle 2 ("one concept, one canonical owner") and §6's
  explicit prohibition on inventing parallel owners.
- **Bind `subjectType: HOUSEHOLD` to `HouseholdMember` instead of `Household`**: rejected —
  `HouseholdMember` has no consent or profile-enablement state, so a preference "belonging to the
  household" would have no way to express whether the household has opted into shared profile
  collection at all (FRD §7.2: "Sharing a property shall not imply membership in the optional
  Personalization household profile").
- **DB-backed registries with kill-switch fields from day one** (mirroring
  `RadarSourceDefinition`): deferred, not rejected outright — there are no real users to protect
  yet, so the added operational surface area is pure cost right now; revisit before Phase 9C.

## Verification

- `apps/backend/prisma/schema.prisma` has no `subjectId` foreign key on `DecisionPreferenceValue`
  and no `HouseholdMember` relation anywhere in the Decision Platform schema section.
- `apps/backend/src/services/decisionPlatform/*.ts` registries contain no `isEnabled`,
  `pausedAt`, `pausedBy`, or `pausedReason` fields.
- `validateDecisionPreferenceRegistry()`, `validateDecisionContextContracts()`,
  `validateDecisionDefinitionRegistry()`, and `validateDecisionThreadTransitionContract()` all
  return `[]` and are wired into `apps/backend/src/index.ts` startup, failing fast on any
  registry defect (`tests/decisionPlatform/decisionPlatformGovernance.test.js`).

## Operations

No new operational surface area ships in this phase (see Decision 4). Operational controls
(independent pause of a decision/preference/enhancer definition per FRD §24.3) are deferred to the
phase that first requires them and will get their own ADR at that time.

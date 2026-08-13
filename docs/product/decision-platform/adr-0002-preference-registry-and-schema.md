# ADR-0002 — Decision Preference Registry and Schema

## Status

Proposed — pending approval alongside ADR-0001. **Note (Phase 9C update):** the registry and
schema below match what's implemented exactly, and Phase 8B built the read/write services against
them — but two of the three registered definitions have a gap worth knowing: `DECISION_DETAIL_LEVEL`
is registered and validated, yet has no save/read/parse path anywhere in the codebase, and none of
the three definitions' `correctionRoute` values resolve to a real frontend route or backend
endpoint. See the Phase 8B write-up in
[`docs/operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md`](../../operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md).

## Date

August 11, 2026

## Context

FRD §7.1 and §11 require a typed decision-preference registry with three **independent** axes per
value — `provenanceType` (how a candidate value originated), `storageClass` (where and how long an
approved value may persist), and `status` (whether the value may currently be used) — plus an
initial registry limited to exactly three keys (§11.2): `OWNERSHIP_HORIZON`,
`REPAIR_REPLACE_APPROACH`, `DECISION_DETAIL_LEVEL`.

## Decision

1. **`DecisionPreferenceDefinition` is a code-based registry**
   (`apps/backend/src/services/decisionPlatform/decisionPreferenceRegistry.ts`), mirroring
   `askOperationRegistry.ts`. Each of the three initial keys declares: value schema description,
   storage class, allowed subject types, allowed provenance types, which provenance types force
   `PENDING_CONFIRMATION`, sensitivity class, default visibility, default validity, reconfirmation
   policy, eligible decision definitions, correction route, whether a shared explanation is
   permitted, and — critically — `materialForRanking`.

2. **`materialForRanking` is a new, explicit field** not literally named in the FRD text but
   required to make §11.2's prose rule enforceable in code: `DECISION_DETAIL_LEVEL` is
   "presentation only; never material ranking." `validateDecisionPreferenceRegistry()` asserts
   that a presentation-only definition (`materialForRanking: false`) cannot simultaneously claim a
   shared material explanation is permitted — a concrete, testable proxy for the zero-tolerance
   gate "unconfirmed preference affecting a material result" (FRD §22.2).

3. **`allowedProvenanceTypes` includes all four provenance types for all three initial keys**,
   even though the only capture UX that exists today (§11.3's confirmation dialog) produces
   `USER_ENTERED` values. The FRD's own text (§11.1: "a definition whose candidate value *may*
   originate from `SYSTEM_DERIVED`, `DOCUMENT_EXTRACTED`, or `IMPORTED_REVIEWED` shall separately
   declare whether confirmation is required") frames these as future-permitted origins requiring
   review, not disallowed origins — so the registry declares the general policy
   (`confirmationRequiredForProvenance: [SYSTEM_DERIVED, DOCUMENT_EXTRACTED, IMPORTED_REVIEWED]`)
   even though only `USER_ENTERED` is exercised in the first release.

4. **`OWNERSHIP_HORIZON.eligibleDecisionDefinitionIds` includes `'SELL_PREP'`**, a decision family
   with no registered `DecisionDefinition` yet (only `HVAC_REPAIR_REPLACE` exists — see ADR-0003).
   This is a deliberate forward reference matching FRD §11.2's own table ("Initial consumers: HVAC
   repair/replace; sell-prep"); the preference registry validator does **not** require
   `eligibleDecisionDefinitionIds` entries to resolve to a currently-registered decision
   definition, precisely so this forward reference does not fail startup validation. (The reverse
   direction — a `DecisionContextContract`/`DecisionDefinition`'s `allowedPreferenceDefinitions`
   must reference a real, currently-registered preference key — *is* validated, since that
   direction has no legitimate forward-reference case.)

5. **`DecisionPreferenceValue` (Prisma model)** implements FRD §7.1's field list exactly, with
   `provenanceType: DecisionPreferenceProvenanceType`, `storageClass: DecisionPreferenceStorageClass`
   (only the two classes that ever produce a row — see below), `visibility`, `status`, and a
   self-referential `supersedesId`/`supersededBy` pair for the append-only supersession chain FRD
   §9 requires ("stale writes shall fail closed rather than overwrite a newer preference").

6. **Only `DURABLE_PROFILE` and `TEMPORARY_PROFILE` are Prisma enum values on
   `DecisionPreferenceStorageClass`.** FRD §11.1 actually defines five storage/usage classes
   (`DURABLE_PROFILE`, `TEMPORARY_PROFILE`, `SCENARIO_ONLY`, `SESSION_ONLY`, `PROHIBITED`), but
   only the first two ever produce a `DecisionPreferenceValue` row — `SCENARIO_ONLY` values live in
   `Scenario.assumptionsJson` (ADR-0003), `SESSION_ONLY` values are never persisted, and
   `PROHIBITED` values are never persisted anywhere. Modeling all five as a Prisma enum on this
   table would let a `SCENARIO_ONLY` or `PROHIBITED` row be inserted, which is exactly the
   violation FRD §11.1 forbids ("must not be persisted... must not be stored in profile,
   scenario, conversation telemetry, or generic execution logs"). The broader five-value union
   (`DecisionPreferenceUsageClass`) exists only in
   `decisionPlatform.contract.ts` as a TypeScript-level type, for code that reasons about
   definitions before they've been routed to a storage location.

## Consequences

### Positive

- The `materialForRanking` flag turns a prose rule into a startup-time assertion, so a future
  contributor cannot accidentally make a presentation-only preference material without the
  registry validator catching it immediately.
- Restricting the Prisma enum to two values makes "a `SCENARIO_ONLY` value leaked into the profile
  table" a schema-level impossibility rather than an application-logic invariant someone has to
  remember to check.

### Costs

- `DecisionPreferenceUsageClass` (five values) and `DecisionPreferenceStorageClass` (two values)
  are two related-but-different types that a future contributor could confuse; the naming
  (`UsageClass` vs. `StorageClass`) and the comment on the Prisma enum are the mitigation, not a
  compiler-enforced one.

### Rejected alternatives

- **A five-value Prisma enum matching FRD §11.1 exactly:** rejected — see Decision 6.
- **Restrict `allowedProvenanceTypes` to only `USER_ENTERED` for the first release:** rejected —
  this would make `confirmationRequiredForProvenance`'s declared provenance types unreachable,
  which the registry validator flags as an inconsistency (a definition cannot require confirmation
  for a provenance it doesn't allow).

## Verification

- `validateDecisionPreferenceRegistry()` returns `[]`
  (`tests/decisionPlatform/decisionPlatformGovernance.test.js`), and specifically asserts
  `DECISION_DETAIL_LEVEL.materialForRanking === false` while the other two keys are `true`.
- `apps/backend/prisma/schema.prisma`'s `DecisionPreferenceStorageClass` enum has exactly two
  values.
- `npx prisma generate` and `npm run build` (in `apps/backend`) both succeed with the new schema
  and registry in place.

## Operations

Preference values do not appear in URLs, logs, metrics, traces, or ordinary analytics (FRD §7.5)
— this is an application-layer requirement for the services that read/write
`DecisionPreferenceValue.valueJson`. Phase 8B built those services
(`decisionPreferenceService.ts`); by inspection, the emitter functions that bridge preference
saves/revocations into the change ledger (`decisionPlatformChangeEmitter.ts`) carry structural
metadata only, never the value itself. This has not been independently governance-tested (no test
asserts a preference value never appears in a log line), so treat it as true-by-inspection, not
verified.

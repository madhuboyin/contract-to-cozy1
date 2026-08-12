# Decision Platform — Threat Model and Privacy Review

**Status:** Proposed. This document originates the threat-model/privacy-review artifact type for
this codebase — no existing document of this exact shape exists to copy (`docs/` was searched;
the closest precedent, `docs/functional/PROPERTY_INTELLIGENCE_LAUNCH_GOVERNANCE.md`'s "Safety and
privacy review" gate, covers a different feature and is used here only as a structural template).

Before any family can pass this gate, the FRD requires (§8.4, as clarified by
[ADR-0001](./adr-0001-ownership-and-scope.md)): Product, Domain, Architecture, Privacy, Security,
Trust, and Operations approval, recorded against this document and
[`policy-retention-erasure-export.md`](./policy-retention-erasure-export.md).

## Scope

Covers the schema and registries closed in Phase 7A: `DecisionPreferenceValue`, `DecisionThread`
and its children, `Scenario`, `RecommendationSnapshot`, and the code-based
`DecisionPreferenceDefinition`/`DecisionContextContract`/decision-definition registries. Excludes
any Ask-facing routing, orchestration, or API endpoint — none exists yet (Phase 8A+).

## Data flows and sensitivity

| Data | Where it lives | Sensitivity | Notes |
| --- | --- | --- | --- |
| Preference value payload (`valueJson`) | `DecisionPreferenceValue` | Up to `SENSITIVE` (e.g. `OWNERSHIP_HORIZON` — a household's plan to sell) | Registry-declared per-key `sensitivityClass` |
| Decision goal/title | `DecisionThread.title`, `goalCode` | Standard | Free-text `title` is homeowner-authored; must not be echoed into shared/household-summary surfaces without the same visibility check as the preferences it references |
| Fact/evidence references | `DecisionThreadFactReference` (polymorphic) | Inherits the sensitivity of the referenced canonical entity | No PII is duplicated into this table — only entity type/ID/field-path pointers |
| Scenario assumptions | `Scenario.assumptionsJson` | Up to `SENSITIVE` if a monetary/household assumption | Isolated from canonical facts per FRD §13.3 |
| Recommendation lineage | `RecommendationSnapshot` | Standard, with minimized references only | Explicitly excludes "hidden chain-of-thought, unrestricted prompt, raw document" (FRD §14.1) |

## Threat catalog

Grounded in FRD §27's risk table, expanded with schema-specific analysis:

| # | Threat | FRD risk reference | Mitigation in this schema | Residual risk / follow-up |
| --- | --- | --- | --- | --- |
| T1 | A `Household`-scoped preference leaks to a `HouseholdMember` who lacks `HouseholdRole` visibility for it | Sensitive household-plan leakage (P0) | `visibility` enum (`PRIVATE`/`OWNER_ONLY`/`HOUSEHOLD_SUMMARY`/`HOUSEHOLD_DETAIL`) is a required field on every `DecisionPreferenceValue`; enforcement is application-layer (Phase 8B) | Schema declares the control point; Phase 8B must actually check it on every read path before this risk is closed |
| T2 | A deleted/revoked `DecisionPreferenceValue` is reconstructed from `RecommendationSnapshot` lineage after erasure | Deleted preference retained in lineage (P0) | Snapshots store `preferenceReferenceIds` (IDs only, not values) and `inputDigest`; no snapshot field stores a copy of `valueJson` | Phase 8B presentation logic must render a "redacted dependency" state rather than attempting a join that would 404/error |
| T3 | A `Scenario.assumptionsJson` value is silently promoted to a canonical fact or durable preference without separate confirmation | Scenario contaminates Living Home Record (P0) | No code path in this phase writes from `Scenario` to `DecisionPreferenceValue` or any canonical table — Phase 7A ships no such write path at all | Phase 8B must implement the "separate registered capture, authorization, and confirmation flow" (FRD §13.3) explicitly, not as a byproduct of scenario evaluation |
| T4 | `subjectId`'s lack of a DB-level FK (ADR-0001 Decision 3) allows a wrong-type or cross-tenant ID to be written | Cross-property or cross-role sensitive disclosure (zero-tolerance, FRD §22.2) | `subjectType` + `subjectId` are validated together at the application layer (Phase 8B); the polymorphic design is the same accepted tradeoff as `Signal.sourceModel`/`sourceId` | Phase 8B must add an application-level check that `subjectId` resolves to a row of the type `subjectType` declares, on every write |
| T5 | Uploaded evidence referenced by `DecisionThreadFactReference` contains prompt-injection text aimed at a future Phase 8B LLM-assisted step | Not in FRD §27 directly; covered by parent Ask FRD §18/Appendix B adversarial-input requirements | `DecisionThreadFactReference` stores only `canonicalEntityType`/`canonicalEntityId`/`canonicalFieldPath` pointers — no raw evidence text is stored in this table | Whichever canonical evidence store is pointed to (outside this schema) remains responsible for its own injection handling; this table adds no new attack surface itself |
| T6 | A stale write overwrites a newer `DecisionPreferenceValue`/`DecisionThread`/`Scenario` row (concurrent household members editing) | Wrong thread/entity resumed (P1); FRD §9 "stale writes shall fail closed" | Every mutable model in this schema carries a `version Int @default(1)` column for optimistic concurrency | Phase 8A write paths must actually check-and-increment `version`; the column existing is necessary but not sufficient |
| T7 | The `CONFLICTED`+`STALE` coexistence rule (FRD §10.3) is reimplemented incorrectly at a future call site, silently understating a thread's problems | Opaque priority rank / stale preference changes advice (P1) | `computeContextStatus()` is the single function permitted to decide `contextStatus` (ADR-0003 Decision 1), unit-tested for the exact coexistence case | Phase 8A code review must ensure no call site sets `contextStatus` directly, bypassing this function |

## Privacy review checklist

- **Geography/household context:** `DecisionPreferenceValue.propertyId` is nullable (a
  household-scoped `OWNERSHIP_HORIZON` may apply across properties); this is intentional per FRD
  §11.2's "Household plus property override" scope for that key, not an oversight.
- **Sharing:** `visibility` is a required field with no default that implies broader-than-private
  sharing (see T1); the Prisma schema does not set a `@default` on this column, forcing every
  write path to make an explicit choice.
- **Retention:** see [`policy-retention-erasure-export.md`](./policy-retention-erasure-export.md).
- **Access behavior:** every read/write must recheck current property and profile authorization at
  request time — "authorization cached at capture time is insufficient" (FRD §7.2). This is a
  Phase 8A+ enforcement requirement; Phase 7A's schema does not itself cache authorization
  anywhere that would need invalidation.
- **Subject rights:** revocation of a `DecisionPreferenceValue` must take effect
  "synchronous[ly] before success response" (FRD §24.1) once the write endpoint exists — recorded
  here as a requirement on the future Phase 8B implementation, not something Phase 7A's schema
  alone can guarantee.

## Hazard-language review

Not applicable to this phase — no presentation surface exists yet that could mischaracterize a
recommendation as a professional assessment. This section will be populated when Phase 8B builds
the `PREFERENCE_REFERENCE`/`WHY_NOW`/`RECOMMENDATION_CHANGE` presentation blocks, which must
comply with FRD §26 (parent Ask FRD) professional-boundary requirements.

## Review record

| Reviewer role | Decision | Date | Notes |
| --- | --- | --- | --- |
| Product | Pending | — | — |
| Domain | Pending | — | — |
| Architecture | Pending | — | — |
| Privacy | Pending | — | — |
| Security | Pending | — | — |
| Trust | Pending | — | — |
| Operations | Pending | — | — |

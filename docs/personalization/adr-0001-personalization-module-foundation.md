# ADR-0001: Personalization module foundation (Phase 0 "first implementation step")

Status: **Accepted** (thin vertical proof only — see Scope)
Date: 2026-07-13

## Context

`09-implementation-roadmap.md`'s Phase 0 names a final deliverable before any
real personalization content is built: "Write an Architecture Decision
Record and a thin vertical proof behind a disabled flag: a property
capability policy, module skeleton, typed rule validator/evaluator, one
non-sensitive property trait, one inactive HVAC-filter definition, an
evaluation run/snapshot, and golden tests. It proves boundaries and
operations without collecting household data or changing UI behavior."

Everything else named as a Phase 0 blocker is already done: cron
double-execution lease, property-authorization consistency across Seller
Prep/Seasonal Checklist/Home Digital Will, the account-deletion cascade,
per-consumer rollout flags + a system-wide emergency kill switch, audit/
redaction plumbing, and the catalog content plan + schema baseline (27
`DRAFT` definitions, seeded live in production, no rule logic attached).
This ADR covers the one remaining piece.

## Decision

Build the module at `apps/backend/src/modules/personalization/`, matching
the layered structure `04-target-architecture.md` prescribes for this
module specifically (deliberately not the flatter `controllers/services/`
convention `modules/gazette/` uses — the personalization docs are explicit
that "Dependencies point inward... No feature imports Prisma personalization
tables directly," which calls for the stricter layering below):

```text
apps/backend/src/modules/personalization/
  domain/          traits, rule AST/validator/evaluator, capability policy
  application/      evaluation run use case
  catalog/          content plan, schema-backed definitions, golden fixtures
  api/              (empty in this proof — no route exposed yet)
  application/      (evaluation run use case only, in this proof)
  infrastructure/   (empty in this proof — no repository/BullMQ wiring yet)
  adapters/         (empty in this proof — no feature adapters yet)
```

`api/`, `infrastructure/`, and `adapters/` exist as empty directories with a
`.gitkeep` — the roadmap calls for a *skeleton*, and populating them without
a real consumer would be exactly the premature scaffolding this project's
own conventions warn against. `domain/`, `application/`, and `catalog/` have
real, working code because the proof requires exercising them end to end.

## Scope of this proof (what's in, what's deliberately out)

**In scope**, per the roadmap's own list:
- **Property capability policy** (`domain/capabilityPolicy.ts`): a pure
  function mapping `HouseholdRole` → personalization capabilities
  (`canManageSensitiveProfile`, `canViewOrdinaryRecommendations`, `canAct`,
  `canGiveFeedback`, `canViewSensitiveEvidence`), matching the OWNER/
  CONTRIBUTOR/VIEWER matrix `06-api-design.md` and the FRD specify. This is
  a personalization-specific capability layer on top of the already-existing
  `resolvePropertyAccess`/`ROLE_RANK` (built earlier in Phase 0) — it answers
  "what can this role do in personalization," not "does this role have
  property access at all," which the existing service already answers.
- **Typed rule validator/evaluator** (`domain/ruleAst.ts`,
  `domain/evaluator.ts`): the `RuleNode` AST from `04-target-architecture.md`
  as a depth/shape-validated Zod schema, and an evaluator implementing
  three-valued (`TRUE`/`FALSE`/`UNKNOWN`) Kleene logic through `all`/`any`/
  `not`. The `trait` op is fully evaluated (it's the only op this proof's
  one definition needs). `fact`/`history`/`date` ops validate structurally
  (so the AST shape is provably correct for a Phase 1 definition that needs
  them) but evaluate to `UNKNOWN` with an explicit "not implemented in this
  proof" marker — implementing full fact/history/date evaluation requires
  the context-assembler/normalized-fact infrastructure that's genuinely
  Phase 1 scope, and stubbing it silently instead of marking it would be
  worse than not having it.
- **One non-sensitive property trait** (`domain/traits.ts`):
  `hvacFilterReplacementOverdue`, derived purely from `Property`/`HomeAsset`
  data already in the schema — no household/profile/pet data is read or
  collected, satisfying the roadmap's explicit "without collecting
  household data" constraint. (This is deliberately a *different*, simpler
  trait than the `hvac_filter_pet_adjusted` catalog-plan entry, which is
  pet-adjusted by design and therefore needs household data — not usable for
  this constraint.)
- **One inactive HVAC-filter definition** with a real `ruleAst`: a new
  `RecommendationDefinition`/`RecommendationRule` pair,
  `hvac_filter_replacement_check_proof`, `status: DRAFT`. Distinct from the
  27 catalog-plan entries, which remain intentionally rule-less per the
  earlier Phase 0 scope decision — this is the one exception the roadmap
  itself calls for.
- **Evaluation run** (`PersonalizationEvaluationRun`, additive schema): a
  minimal run record (trigger, status, trait/rule versions, compact result
  snapshot) — not the full `TraitSnapshot`/`PersonalizationSnapshot`/
  `Household` apparatus from `05-data-model.md`'s 24-entity sketch, which is
  Phase 1 MVP build-out, not part of this thin proof.
- **Golden tests**: unit tests covering the validator, the evaluator's
  three-valued logic, the trait derivation, and one end-to-end "run an
  evaluation for a property" test using the same golden-fixture format
  already built for the catalog (`positive`/`negative`/`unknown` cases).

**Out of scope, deliberately**:
- No API route or controller. The roadmap says this proof must happen
  "without... changing UI behavior" — the safest way to guarantee that is
  to not expose any new HTTP surface at all yet. Everything here is called
  directly by tests and, if a caller is added later, by a job/use-case, not
  by a route. (If a route is added later it must be gated behind the
  already-existing `PERSONALIZATION_SHADOW` rollout flag, which defaults to
  0% — see `config/featureFlags.ts`.)
- No `Household`, `PetProfile`, `DerivedTrait`, `ProfileQuestion`, or any
  other household-profile table. Those are Phase 1.
- No BullMQ job, no recompute-on-event wiring, no dashboard/Maintenance/
  Health integration. Those are the "Migration order by consumer" steps in
  `09-implementation-roadmap.md`, explicitly listed after this step.
- No authoring of the 26 remaining catalog-plan definitions' rule logic —
  still Phase 1, still needs Product/Content/Legal review per the earlier
  Phase 0 scope decision.

## Alternatives considered

- **Skip the ADR, just build the proof.** Rejected — the roadmap names the
  ADR explicitly as part of this deliverable, and a foundational module
  boundary decision like this is exactly the kind of thing an ADR is for:
  it's expensive to redo later if the layering choice turns out wrong.
- **Follow `modules/gazette/`'s flatter `controllers/services/` convention**
  instead of the layered `domain/application/infrastructure/adapters`
  structure. Rejected — `04-target-architecture.md` is explicit and specific
  about personalization needing stricter inward-pointing dependencies than
  other modules, precisely because it's meant to become the shared
  cross-module ranking/eligibility engine; a flatter structure would make
  that boundary harder to enforce later.
- **Build the full trait/evaluation-run/snapshot data model now** (all 24
  entities from `05-data-model.md`) instead of the minimal one-trait,
  one-definition slice. Rejected — that's explicitly Phase 1 MVP scope, and
  building it disconnected from the migration/backfill/consumer work the
  roadmap sequences around it would be exactly the kind of premature,
  half-connected scaffolding this project's conventions warn against.

## Consequences

- Personalization code now has an owned, isolated home
  (`apps/backend/src/modules/personalization/`) instead of the flatter
  `apps/backend/src/personalization/catalog/` location used in the previous
  Phase 0 step — that catalog work is relocated into this module's `catalog/`
  folder as part of this change, with no functional change to it.
- Nothing in this proof is reachable from any route, job, or UI — it changes
  zero user-facing behavior, and can be deleted or revised freely without a
  migration/rollback concern beyond the additive `PersonalizationEvaluationRun`
  table.
- The next roadmap step ("Migration order by consumer": shadow-only, then
  Maintenance/Health, then Dashboard, etc.) can now build on a real,
  tested evaluator instead of designing one from scratch.

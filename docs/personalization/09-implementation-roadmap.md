# 09 — Phased Implementation Roadmap

No calendar estimates are given because team size, live load, node count and content-review capacity were not verified. Effort is relative and includes engineering, product, privacy/content and QA.

## Phase 0 — Pilot-safe foundation (complete)

**Effort: Medium.** This phase is deliberately smaller while the product has no real users or production data that must survive schema changes.

- **Keep:** bounded personalization module; property capability policy; distinct Household aggregate; typed rule validator/evaluator; audit/redaction; kill switch; definition lifecycle; focused unit and authorization tests.
- **Data:** maintain the Prisma schema as the desired pilot schema. The user applies database changes. Do not create migration scripts or backfill existing properties; create a Household lazily when a pilot homeowner opts in.
- **Catalog:** retain the larger catalog as a future planning artifact, but implement and test only the three-definition pilot set. Definitions remain inactive until their rule and content review is complete.
- **Scheduling:** no database-wide nightly personalization sweep. Recompute for an opted-in property on opt-in, relevant profile/property changes, explicit refresh, or a stale read.
- **Testing:** authorization regression, rule schema/golden fixtures, consent and deletion, idempotency, transaction rollback, kill switch, and telemetry redaction. Migration rehearsal becomes relevant only after a deployed database contains data that must survive a schema change.
- **Exit criteria:** access policy, evaluator, flags/kill switch, audit/redaction and pilot definition fixtures pass. Database migration/backfill gates are not Phase 0 exit criteria during the data-free pilot.

## Phase 1 — Thin deterministic pilot (engineering complete; activation pending)

**Effort: Medium.** The purpose is to learn whether homeowners find the feature useful, not to pre-build the long-term intelligence platform.

- **Scope/deliverables:** explicit opt-in; lazily-created Household; at most five high-value profile questions; three reviewed deterministic definitions; generic evaluation/materialization; structured “why”; top-three read surface; explicit feedback; reset/delete control.
- **Data:** use only existing pilot schema entities and explicit answers. Do not infer sensitive traits. Do not add speculative entities, migrations, backfills, caches, queues, or graph structures.
- **Backend:** authenticated property-scoped APIs; generic definition evaluator; validated and transactional answer writes; read-triggered/manual recompute; recommendation suppression; admin pause/kill switch.
- **Frontend:** one small mobile-accessible pilot surface with opt-in, top-three recommendations, explanations, feedback and reset. Defer a full household settings area and cross-module placements.
- **Pilot catalog:** HVAC filter replacement check, smoke/CO detector battery check and dryer-vent cleaning. Safety-sensitive definitions stay DRAFT until two-person content/rule review; activation is an explicit operational decision.
- **Feature flags:** one pilot exposure flag plus the global kill switch. Remove placement-by-placement flags until multiple consumers exist.
- **Testing:** three golden rule paths (positive/negative/unknown), API authorization, consent, invalid-answer rejection, atomic profile writes, feedback/suppression, reset, empty state and accessibility smoke tests.
- **Exit criteria:** a pilot user can opt in, receive no more than three explainable recommendations, give feedback and reset data; no recommendation is generated from unconsented household data. Catalog expansion and automated sweeping require measured pilot demand.

## Phase 2 — Cross-module personalization

**Effort: Very large.**

- **Scope/deliverables:** Risk, protection/insurance review, Seller Prep, Buyer, Community, Climate, Wellness, Energy, providers, search/assistant and notification policy; life stages; catalog admin UI.
- **Data:** module action adapters, additional reviewed trait definitions/context types, content workflow/approval, notification budget state.
- **Backend:** migrate feature-local eligibility/ranking incrementally; notification candidate gate; admin preview/impact/audit; context adapters and stronger outbox invalidation.
- **Frontend:** module placements consuming same instances, admin authoring/review, notification explanations, broader preference controls.
- **Dependencies:** stable MVP quality metrics, content operations staffing, provider source SLAs.
- **Risks:** migration duplicates, module owners bypassing engine, source staleness, unsafe insurance/legal wording.
- **Testing:** per-module contract/regression, rule impact simulation, notification volume/consent, UC-06/07 plus full weather flows.
- **Exit criteria:** no duplicate business rule for migrated definitions; notification budget holds; admin can pause bad content promptly; quality stable across modules.

## Phase 3 — Learning and optimization

**Effort: Large.**

- **Scope/deliverables:** governed behavioral affinity, deterministic weight tuning, experiments, quality analytics, confirmed low-sensitivity inference, timing optimization, advanced diversity.
- **Data:** experiment assignments, aggregate outcome features, inference consent/confirmation, model/weight version registry.
- **Backend:** offline analysis, bounded parameter selection, guardrails/rollback, sample-size checks; still deterministic online evaluator.
- **Frontend:** inference confirmations, experiment-safe copy, richer feedback reason capture without friction.
- **Dependencies:** sufficient unbiased outcome data, analytics quality, ethics/privacy review.
- **Risks:** optimizing clicks over home value/safety, feedback loops, sparse data, implicit signals misread.
- **Testing:** offline backtests, holdouts, fairness/segment checks, safety floors, rollback and drift alerts.
- **Exit criteria:** predeclared metric improvement without guardrail regression; every inferred trait is inspectable/disableable; no autonomous content/rules.

## Phase 4 — Household Intelligence Graph / Digital Twin evolution

**Effort: Very large.**

- **Scope/deliverables:** temporal household/property relationships, household events, future-plan transitions, longitudinal outcome links, proactive planning and constrained simulations.
- **Data:** typed relational edges with `validFrom/validTo`, event history and scenario provenance. PostgreSQL remains default.
- **Backend:** graph-oriented query facade over relational schema; optional extraction boundary only after measurements.
- **Frontend:** timeline/relationship views only when they clarify decisions; explicit scenario assumptions.
- **Dependencies:** mature governance, high data quality, demonstrated multi-hop use cases.
- **Risks:** surveillance feel, indefinite retention, speculative simulations, graph complexity.
- **Testing:** temporal correctness, provenance, deletion propagation, scenario reproducibility and trust research.
- **Exit criteria:** at least three validated high-value multi-hop journeys; PostgreSQL benchmark evidence before considering graph DB; privacy review approves temporal retention.

## First implementation step

Write an Architecture Decision Record and a thin vertical proof behind a disabled flag: a property capability policy, module skeleton, typed rule validator/evaluator, one non-sensitive property trait, one inactive HVAC-filter definition, an evaluation run/snapshot, and golden tests. It proves boundaries and operations without collecting household data or changing UI behavior.

## Migration order by consumer

1. Shadow only (compare with existing Action Center/Daily Pulse).
2. Maintenance task conversion and Health next action.
3. Dashboard top recommendations.
4. Seller Prep catalog.
5. Risk/climate and notification gating.
6. Remaining modules; retire duplicated local ranks only after parity/quality proof.

## Rollback strategy

Each consumer has a separate flag. Disabling stops reads and new evaluation; existing modules continue current behavior. Pause definitions first for content incidents. Stop queue producers/workers for systemic issues. Additive tables remain for audit; never delete collected profile data as a technical rollback—use approved erasure flows.

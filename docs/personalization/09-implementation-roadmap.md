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

## Phase 2 — Cross-module personalization (greenfield engineering complete; pilot validation pending)

**Effort: Very large.**

The revised greenfield scope proves cross-module reuse with the existing three-definition catalog. No broad catalog, queue, cache or data-model expansion is justified before pilot use.

- **Scope/deliverables:** one shared property/module recommendation contract; Dashboard, Maintenance and Property Health placements; idempotent Maintenance task conversion; controlled catalog review/activation UI; per-definition pause/resume.
- **Data:** reuse existing recommendation, rule, content, question and maintenance-task entities. Module routing and supported actions are code-owned catalog metadata; no migrations or backfills.
- **Backend:** modules request ranked DTOs and never read profile tables or duplicate eligibility rules. Admin activation retires older active versions, records review identity and audit events, and enforces different active ADMIN author/reviewer identities for safety-sensitive rules.
- **Frontend:** three placements consume the same instances; Maintenance can act, Dashboard/Health navigate to the authoritative action surface; admin can review status and activate existing versions/questions.
- **Testing:** shared contract, consent/content gates, capabilities, action deduplication, safety review, admin lifecycle and placement smoke coverage.
- **Exit criteria:** the same reviewed recommendation can appear consistently across Dashboard, Maintenance and Health; supported conversion creates at most one task; admin activation/pause is audited; no module copies household eligibility rules.

Seller Prep, Risk/protection, Buyer, Community, Climate, Wellness, Energy, providers, assistant and notifications become post-pilot catalog expansion. They require relevant reviewed definitions and observed demand; wiring maintenance-only recommendations into them would not constitute valid personalization.

## Phase 3 — Pilot measurement before learning (initial slice implemented)

**Effort: Large.**

The original Phase 3 assumed sufficient real-user outcome data. The product is still a data-free pilot, so experiments, behavioral affinity, inference and weight tuning would create machinery without evidence. Phase 3 therefore starts with measurement only.

- **Implemented initial slice:** richer explicit negative-feedback reasons; temporary `BAD_TIMING` dismissal rather than permanent irrelevance; aggregate 30-day admin quality snapshot; recommendation/status, answer and feedback counts; a 20-decision-event review threshold; automatic tuning hard-disabled.
- **Data:** reuse existing recommendation, feedback, profile-answer and household-consent rows. No experiment-assignment, inference, model-registry or aggregate-feature tables; no migration or backfill.
- **Backend:** ADMIN+MFA aggregate-only quality endpoint. It returns counts and rates, never household answers, comments, property identifiers or recommendation evidence.
- **Frontend:** low-friction reason capture on the pilot recommendation card and a quality snapshot on the existing personalization admin page.
- **Current guardrail:** reaching the sample threshold permits human review only. It never changes rules, weights, content, thresholds or online ranking.
- **Deferred until evidence exists:** experiments, affinity, timing optimization, inference, deterministic weight selection, diversity tuning, offline backtests, holdouts, fairness/segment analysis, drift alerts and a version registry.
- **Dependencies for deferred work:** sufficient unbiased pilot decisions, a predeclared success metric and safety floors, stable analytics definitions, and privacy/ethics approval.
- **Exit criteria:** Phase 3 is not complete during a data-free pilot. Completion requires measured improvement on a predeclared metric without guardrail regression; every future inferred trait must be inspectable, confirmable and disableable; content and rules remain human-governed.

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

The pilot uses one exposure flag plus the independent database-backed global kill switch. Setting `TOOL_ROLLOUT_PERSONALIZATION_PILOT=0` and restarting the backend stops pilot reads and evaluation. Pause one definition first for a content-specific incident; use the global kill switch for a systemic issue. No personalization queue or worker exists in the pilot. Never delete collected profile data as a technical rollback—use the approved reset/erasure flow.

# 09 — Phased Implementation Roadmap

No calendar estimates are given because team size, live load, node count and content-review capacity were not verified. Effort is relative and includes engineering, product, privacy/content and QA.

## Phase 0 — Foundation and refactoring

**Effort: Large.**

- **Scope/deliverables:** personalization taxonomy/module skeleton; property capability policy; distinct Household ownership decision; additive schema baseline; domain-event/invalidation contract; BullMQ/DB-lease scheduling; analytics/audit/redaction; flags/kill switch; 20–40 definition content plan and golden fixtures.
- **Data:** create Household/HouseholdProperty, consent/audit/evaluation foundations; idempotent non-sensitive backfill. Do not collect composition yet.
- **Backend:** extract/reuse pure Decision Engine concepts; build adapters; correct item-by-ID authorization; make worker scheduling single-execution; define action interface.
- **Frontend:** navigation naming prototype, dashboard density baseline, event/privacy contract; no production personalization UI.
- **Dependencies:** Product taxonomy, Privacy classification/retention, Security role matrix, Ops resource baseline.
- **Risks:** scope creep into global auth rewrite; accidental semantic reuse of `HouseholdMember`; cron changes affecting jobs.
- **Testing:** authorization regression, backfill/migration rehearsal, rule schema fuzzing, worker concurrency, telemetry canary leakage.
- **Exit criteria:** property capabilities pass; one queued recompute is single-executed across replicas; flags/kill switch/audit work; schema/backfill checks pass; content owners approve taxonomy.

## Phase 1 — Deterministic personalization MVP

**Effort: Very large.**

- **Scope/deliverables:** household summary, pets, goals/preferences, core traits, catalog/rules/content versions, evaluator/scoring/diversity, structured explanations, instances/snapshot, progressive questions, feedback, controls, Maintenance + Health integration.
- **Data:** all MVP entities in `05-data-model.md`; current plus bounded snapshots; seed inactive definitions; explicit profile only.
- **Backend:** module APIs/repos, context/trait adapters, coalesced BullMQ jobs, cache/ETag, task conversion, erasure/reset job, admin pause API, metrics.
- **Frontend:** household personalization screens, question card, top-3 dashboard list, detail/explanation, traits/controls, task conversion, mobile/accessibility.
- **Initial catalog:** pet-adjusted filters, pet/fence question/inspection, aging-in-place home safety, travel preparation, WFH comfort, budget posture, seasonal/weather preparations, low-cost prevention.
- **Dependencies:** Phase 0, reviewed sources/content, design usability testing.
- **Risks:** collecting too much, profile confusion, duplicate Action Center content, slow recompute, weak explanations.
- **Testing:** golden traits/rules/scores, API/Prisma/auth/privacy, UC-01/02/03/04/05/08/09/10 E2E, load/failure injection, accessibility.
- **Exit criteria:** all Phase 1 Must requirements/FRD acceptance pass; 20–40 active definitions; snapshot/API p95 targets pass; beta relevance/not-relevant guardrails agreed; AI can be off.

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

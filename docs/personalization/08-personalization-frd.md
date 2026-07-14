# 08 — Functional Requirements Document: Personalization Engine

## 1. Document control

| Field | Value |
|---|---|
| Document | ContractToCozy Personalization Engine FRD |
| Version | 1.0 discovery baseline |
| Status | Proposed; implementation not authorized by this document |
| Date | 2026-07-13 |
| Owners | Product, Engineering, Privacy/Security, Content Operations |
| Decision record | [Target architecture](04-target-architecture.md) |

Changes require version history, owner, reviewer and rationale. Safety/privacy requirements require Security/Content approval.

## 2. Executive summary

ContractToCozy will centralize household/property context into deterministic, explainable, ranked guidance consumed across modules. The MVP runs inside the existing backend, persists relational catalog/lifecycle data and JSONB rules/snapshots in PostgreSQL, and recomputes asynchronously through existing workers.

## 3. Product vision

Understand a home, the household context relevant to it, goals, preferences, location, risks and future plans to deliver a small number of timely, explainable homeownership actions.

## 4. Background

Current features independently generate tasks, scores, signals, recommendations and notifications. Existing Decision Engine, Guidance, Signal, Digital Twin and task patterns make centralization feasible, but there is no canonical household profile or recommendation lifecycle.

## 5. Problem statement

Fragmented rules create inconsistent priorities, duplicate cards/notifications, limited explanations, repeated data collection and weak learning. Adding lifestyle/pet/life-stage logic inside each module would multiply that debt and privacy risk.

## 6. Business opportunity

Personalization can shorten time to useful action, improve task completion and trust, connect otherwise isolated modules, and reinforce C2C as household intelligence—not generic family management.

## 7. Product principles

Home-scoped; few high-value actions; deterministic core; explainable/correctable; explicit over inferred; minimum data; safety over engagement; progressive disclosure; domain modules own specialist math; no hidden price discrimination.

## 8. Scope

Household profile summaries, pets, lifestyle/occupancy, goals/preferences/future plans, typed traits, context snapshots, catalog/rules, scoring/diversity/suppression, explanations, profiling questions, feedback, recommendation actions, snapshots, controls, analytics/admin lifecycle, and staged integration.

## 9. Out of scope

Generic family/pet/health management; diagnoses; exact household schedules; autonomous recommendation generation; ad targeting; graph/vector DB; new service/event platform; replacing domain score calculations; automatic financial/legal/insurance decisions.

## 10. Personas

- Busy homeowner seeking one next action.
- Budget-conscious DIY owner.
- Hands-off owner preferring providers.
- Pet household managing property safety/air quality.
- Owner preparing to sell.
- Household prioritizing aging in place.
- Multi-property owner with different occupancy.
- Household collaborator with limited access.
- Content/rule administrator and support/privacy operator.

## 11. User needs

Relevant actions, understandable reasons, low-effort profile setup, control over data/inferences/notifications, correct property scope, credible cost/risk claims, easy task conversion, and confidence that sensitive context is protected.

## 12. User journeys

1. Answer ≤5 onboarding questions → receive first 3 personalized actions → inspect reason → create task.
2. Add pet → traits refresh → HVAC/fence actions appear → correct fence fact → recommendations update.
3. Set sell horizon → Seller Prep reorders → dismiss irrelevant item → reason influences future ranking.
4. Weather event arrives → context refresh → property/household vulnerability evaluated → critical action delivered within notification budget.
5. Review personalization data → disable inferred trait → reset/export/delete profile.

## 13. Use cases

Detailed required use cases appear in §13.1–13.10.

### 13.1 UC-01 Pet-adjusted HVAC maintenance

- **Actors:** OWNER; Maintenance module.
- **Preconditions:** two active high-shedding dogs; air-quality goal; replaceable HVAC filter confirmed.
- **Trigger:** pet/goal/asset update, scheduled refresh, or filter task completion.
- **Main flow:** derive `highSheddingPetLoad` and `hasAirQualityPriority`; catalog rule confirms filter capability; calculate reviewed interval band (e.g. 30–45 days, bounded by manufacturer/safety policy); rank; show structured reasons; user converts to recurring `PropertyMaintenanceTask`.
- **Alternates:** unknown filter type emits one question; existing equivalent task updates/offers adjustment rather than duplicate; low-confidence pet shedding presents general check rather than shortened cadence.
- **Data/traits/rules:** pet count/type/shedding, goal, HVAC asset/filter, completion history; required HVAC filter + pet load, excluded reusable/no-filter configurations.
- **Output/explanation:** interval, effort, “two high-shedding dogs + air-quality goal,” source/limitations.
- **User actions:** create/adjust task, correct pet/filter, snooze/not relevant.
- **Acceptance:** idempotent recurring action; interval within content policy; reason contains only authorized facts.
- **Failure/privacy:** stale/missing manufacturer data falls back safely; no pet names/health data.

### 13.2 UC-02 Pet and fence safety

- **Actors:** OWNER; Risk/property profile.
- **Preconditions:** dog uses yard; fence fact/condition unknown.
- **Trigger:** pet saved or yard safety view.
- **Main flow:** derive uncertain `hasPetEscapeRisk`; question ranking identifies fence status as high-value; ask one question; if fence present but condition/age unknown, recommend visual inspection; explain escape-risk rationale without claiming certainty.
- **Alternates:** no fence + no yard access suppresses; recent inspection suppresses; severe wind may elevate fresh inspection.
- **Data/traits/rules:** dog, yard access, fence presence/condition/history, weather.
- **Output/actions:** question or fence inspection recommendation; create task/correct/snooze.
- **Acceptance:** no recommendation before sufficient relevance; question caps respected; recent completion dedupes.
- **Failure/privacy:** external weather unavailable does not invent urgency; pet detail hidden from unauthorized viewer.

### 13.3 UC-03 Aging-in-place safety

- **Actors:** OWNER; Risk/Home Improvement.
- **Preconditions:** explicit aging-in-place goal; stairs confirmed.
- **Trigger:** goal or property update.
- **Main flow:** generate separate lighting, railings and professional accessibility-assessment candidates; safety policy validates content; diversity/conflict system orders actions; explanation cites goal and stairs.
- **Alternates:** completed railing evidence suppresses; rental occupancy changes CTA to discuss with owner; budget focus elevates low-cost lighting.
- **Data/traits/rules:** explicit goal only, stairs/property ownership, completion, budget/service preference.
- **Output/actions:** prioritized home modifications, tasks/provider search.
- **Acceptance:** no medical inference/claim; user can remove goal; recommendations remain property-specific.
- **Failure/privacy:** contributor sees generalized goal reason per policy; sensitive raw profile OWNER-only.

### 13.4 UC-04 Work-from-home comfort

- **Actors:** OWNER; Wellness/Energy/Maintenance.
- **Preconditions:** WFH days band ≥1.
- **Trigger:** profile answer or seasonal context.
- **Main flow:** derive `worksFromHome`; evaluate indoor air quality, temperature consistency, lighting, noise and energy candidates against actual property facts; rank maximum two comfort items in top dashboard slots.
- **Alternates:** energy goal changes rank; no HVAC data asks a question; repeated dismissal lowers category affinity.
- **Data/traits/rules:** WFH band, room/system facts, goals, season, dismissal history.
- **Output/actions:** home-related improvements/tasks.
- **Acceptance:** no productivity/health promises; category diversity preserved.
- **Failure/privacy:** never infer exact working schedule/location.

### 13.5 UC-05 Frequent travel

- **Actors:** OWNER; Risk/Climate/Notifications.
- **Preconditions:** explicit frequent-travel band.
- **Trigger:** profile change or travel-mode user action; freeze/storm context.
- **Main flow:** rank leak shutoff/check, thermostat/freeze, security, mail and vacation-mode actions; dedupe existing tasks; weather-valid items may notify.
- **Alternates:** occupied secondary property suppresses vacancy assumptions; no smart thermostat recommends manual setting, not purchase by default.
- **Data/traits/rules:** travel band, occupancy, leak/security/HVAC facts, current weather, task history.
- **Output/actions:** checklist/task, optional digest.
- **Acceptance:** no storage of exact trip dates in MVP; non-critical notification budget enforced.
- **Failure/privacy:** never expose routine in notification lock-screen text.

### 13.6 UC-06 Preparing to sell with pets

- **Actors:** OWNER; Seller Prep.
- **Preconditions:** sell horizon ≤12 months; active pets.
- **Trigger:** future plan or Seller Prep entry.
- **Main flow:** central catalog contributes odor, scratch/flooring, yard repair and showing-day home-prep items; Seller Prep displays ordered list and reasons; user creates tasks.
- **Alternates:** no carpet/yard excludes items; completed repair suppresses; low budget reorders low-cost actions.
- **Data/traits/rules:** pet types/home access, property materials/yard, sell horizon, budget, completion.
- **Output/actions:** seller-home checklist only; no pet boarding/management service.
- **Acceptance:** no generic pet-care features; definitions share central feedback/suppression.
- **Failure/privacy:** explanation may say “pet household,” not reveal details to viewers.

### 13.7 UC-07 Sustainability-focused homeowner

- **Actors:** OWNER; Energy/Home Improvement/Community.
- **Preconditions:** explicit energy/sustainability goal.
- **Trigger:** goal, audit, seasonal/local incentive refresh.
- **Main flow:** candidates for insulation, heat pump, solar, water conservation/native landscaping/incentives are filtered by property applicability and provider validity; score includes goal and verified value.
- **Alternates:** renter/HOA restrictions change CTA; expired incentive removed; budget preference elevates rebates/low-cost steps.
- **Data/traits/rules:** goal, systems, climate, HOA/ownership, incentive context, confidence/validity.
- **Output/actions:** audit/task/provider/incentive detail.
- **Acceptance:** no guaranteed savings/eligibility; source and review/expiry shown.
- **Failure/privacy:** provider outage returns stale-marked data or suppresses.

### 13.8 UC-08 Budget-conscious homeowner

- **Actors:** OWNER; all modules.
- **Preconditions:** explicit budget-conscious preference.
- **Trigger:** preference or recommendation refresh.
- **Main flow:** preference adds bounded boosts to preventive, repair, DIY, rebate and lower-cost candidates; safety urgency cannot be demoted below floor; alternatives appear on detail.
- **Alternates:** hands-off preference prevents unsafe DIY boost; repair is excluded when domain rule requires replacement.
- **Data/traits/rules:** budget/service/repair preferences, safety class, costs, domain verdicts.
- **Output/actions:** reordered options with cost confidence.
- **Acceptance:** preference affects rank, not eligibility for safety; no income inference or discriminatory provider pricing.
- **Failure/privacy:** missing cost marked unknown, not zero.

### 13.9 UC-09 Extreme weather context

- **Actors:** system worker; household; Risk/Notifications.
- **Preconditions:** normalized active freeze/heat/storm/pollen context and property location.
- **Trigger:** context adapter update.
- **Main flow:** validate source/freshness; combine hazard with property vulnerability and allowed household priorities; evaluate safety exclusions; rank; critical eligible item bypasses ordinary category diversity but respects channel consent and emergency policy.
- **Alternates:** stale context suppresses urgency; low confidence stays in-app; completed preparation suppresses duplicates.
- **Data/traits/rules:** hazard, validUntil/confidence/provenance, plumbing/HVAC/drainage, pets/air-quality only when relevant.
- **Output/actions:** time-bound recommendation/notification.
- **Acceptance:** expired events removed promptly; no LLM eligibility; end-to-end freshness SLA measured.
- **Failure/privacy:** source failure displays no false “all clear”; logs omit address/traits.

### 13.10 UC-10 Progressive profile question

- **Actors:** OWNER; profile question service.
- **Preconditions:** dog uses yard; fence state unknown; question cooldown permits.
- **Trigger:** relevant screen/session and no urgent competing action.
- **Main flow:** opportunity estimates expected recommendation impact; returns “Is the yard fenced?”, why asked, privacy note, choices, skip/later; answer updates property/profile fact and traits; recompute runs.
- **Alternates:** skip suppresses 90 days; later 14 days; repeated API event uses idempotency key; another source fills fact before answer and question expires.
- **Data/traits/rules:** uncertainty/dependencies, impression history, caps.
- **Output/actions:** one question, affected modules, saved confirmation.
- **Acceptance:** ≤1/session and ≤2/week; skip never creates inference; answer correctable.
- **Failure/privacy:** network failure preserves input locally only until retry; no answer in telemetry.

## 14. Functional requirements

The requirement registry in §14.1 is normative; later sections elaborate it.

### 14.1 Requirement registry

| ID | Requirement | Rationale | Priority | Phase | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|---|
| PER-FR-001 | Maintain a household profile distinct from collaborator ACLs. | represent non-account context safely | Must have | 0–1 | auth/data model | owner with multiple properties can manage one profile; ACL rows unchanged |
| PER-FR-002 | Support composition bands, pets, lifestyle, goals, preferences and future plans with explicit source. | core inputs | Must have | 1 | PER-FR-001 | typed validation, correction and deletion pass |
| PER-FR-003 | Derive versioned traits with source, confidence, evidence, validity and override. | prevent scattered raw-field rules | Must have | 1 | profile/context | golden derivation tests pass; override wins |
| PER-FR-004 | Maintain a centralized versioned catalog and content lifecycle. | consistency/operations | Must have | 1 | admin/audit | only ACTIVE effective reviewed content evaluates |
| PER-FR-005 | Evaluate validated deterministic rules with three-valued unknown handling. | safety/explainability | Must have | 1 | catalog/traits | unsupported path/operator rejected; fixtures deterministic |
| PER-FR-006 | Materialize ranked recommendation instances and household intelligence snapshot. | fast reads/audit | Must have | 1 | workers/database | repeated evaluation idempotent; snapshot version advances |
| PER-FR-007 | Dedupe, conflict-resolve, diversify, suppress and expire across modules. | prevent noise | Must have | 1 | history/actions | top five contain ≤2/category except safety; duplicate fixture yields one |
| PER-FR-008 | Produce structured explanation and correction links for every surfaced item. | trust | Must have | 1 | traits/content | detail answers why/data/benefit/urgency/confidence/correction |
| PER-FR-009 | Convert supported recommendations through existing task/Guidance action adapters. | execution | Must have | 1 | task APIs | idempotency yields one action/task |
| PER-FR-010 | Offer one ranked progressive question with skip/later/caps. | reduce onboarding friction | Must have | 1 | question catalog | caps and cooldown fixtures pass |
| PER-FR-011 | Capture explicit and implicit feedback separately. | safe learning | Must have | 1 | analytics | explicit flag required; duplicate eventId ignored |
| PER-FR-012 | Support multiple properties, occupancy and property-level overrides. | real ownership model | Must have | 1 | HouseholdProperty | same household produces different applicable results per property |
| PER-FR-013 | Integrate Maintenance and Health first; expose stable cross-module contract. | valuable MVP | Must have | 1 | APIs/flags | modules contain no copied household eligibility rules |
| PER-FR-014 | Integrate Risk, Seller Prep, climate/community, protection and notifications. | cross-module vision | Should have | 2 | MVP quality | contract tests per module pass |
| PER-FR-015 | Provide user personalization controls, inference disable, export and reset. | control | Must have | 1 | privacy jobs | requested operation is visible/auditable/completes |
| PER-FR-016 | Keep pet capabilities strictly home-related. | scope guardrail | Must have | all | content review | catalog lint rejects prohibited generic pet categories |
| PER-FR-017 | Permit bounded deterministic weight tuning/experiments, never autonomous rules. | learning safely | Could have | 3 | analytics/approval | experiment version/audience/rollback recorded |
| PER-FR-018 | Support temporal graph-like relationships over relational IDs. | future twin | Future | 4 | mature data | no new DB until query evidence supports it |
| PER-RULE-001 | Rule AST shall allow only approved typed paths/operators/depth. | prevent executable/unsafe logic | Must have | 1 | schema validator | malicious/oversized AST rejected |
| PER-SCORE-001 | Score shall persist model version and component breakdown. | audit/tuning | Must have | 1 | evaluator | same context/version reproduces score |
| PER-SCORE-002 | Safety floors and channel-specific thresholds override affinity. | protect users | Must have | 1 | safety class | low engagement cannot suppress critical eligible item in-app |
| PER-EXPL-001 | Explanation templates shall use matched rule/evidence codes, not raw LLM generation. | fidelity | Must have | 1 | content/traits | explanation tokens map to evaluation trace |
| PER-PROF-001 | Question priority shall use value/effort/uncertainty with frequency caps. | useful low-friction asks | Must have | 1 | profiling events | ranking/cap tests pass |
| PER-FDBK-001 | Explicit negative feedback shall affect suppression more than implicit non-engagement. | avoid false learning | Must have | 1 | suppression policy | policy unit test demonstrates ordering |
| PER-NOTIF-001 | Central notification policy shall enforce consent, urgency, fatigue and dedupe. | prevent spam | Must have | 2 | notification integration | default non-critical budgets hold across modules |
| PER-ADMIN-001 | Admin can review/version/activate/pause definitions with immutable audit. | operational safety | Must have | 1 (API), 2 (UI) | MFA/admin/audit | pause removes new eligibility within SLA |
| PER-AI-001 | AI may paraphrase/extract/assist authoring but cannot decide eligibility, safety, math, authorization or consent. | hallucination control | Must have | all | AI guardrails | system works with AI disabled; output tests verify no decision mutation |

## 15. Non-functional requirements

See registry below and §§33–41.

| ID | Requirement | Rationale | Priority | Phase | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|---|
| PER-NFR-001 | Recommendation GET p95 <200 ms from snapshot at planning load. | responsive UI/Pi fit | Must have | 1 | snapshots/indexes | load test meets target with stated dataset |
| PER-NFR-002 | Typical recompute p95 <2 s; rule CPU target <250 ms for 50 definitions. | queue freshness | Must have | 1 | evaluator/worker | performance suite meets envelope |
| PER-NFR-003 | Evaluation is deterministic, idempotent and replayable by versions/hash. | audit/reliability | Must have | 1 | snapshots/catalog | replay produces same eligibility/score |
| PER-NFR-004 | Service degrades to last safe marked-stale snapshot; no false current hazards. | resilience | Must have | 1 | cache/context | failure injection tests pass |
| PER-NFR-005 | UI meets WCAG 2.2 AA and mobile standards. | inclusive product | Must have | 1 | design system | axe/manual keyboard/contrast checks pass |
| PER-NFR-006 | No new runtime datastore/service/dependency for MVP. | operational constraint | Must have | 0–1 | architecture | deployment remains existing API/worker/PG/Redis |

## 16. Data requirements

Data must be typed, scoped, sourced, time-bound and minimal. Property domain remains source of truth. Snapshot inputs store references/hash and necessary normalized values, not entire external/raw documents. See [data model](05-data-model.md).

## 17. Privacy requirements

| ID | Requirement | Rationale | Priority | Phase | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|---|
| PER-PRIV-001 | Collect only home-relevant minimum granularity; prohibit MVP sensitive fields listed in feasibility. | minimization | Must have | all | schema/content lint | prohibited fields absent/rejected |
| PER-PRIV-002 | Record purpose/versioned consent and allow correction, override, export, reset, deletion. | control | Must have | 1 | profile/audit/jobs | end-to-end privacy tests pass |
| PER-PRIV-003 | Label explicit/inferred/derived/external and never overwrite explicit with inference. | transparency | Must have | 1 | traits | precedence tests pass |
| PER-PRIV-004 | Logs, URLs, analytics and metrics exclude profile values and sensitive explanation text. | prevent leakage | Must have | 0–1 | redaction/telemetry | capture audit finds no seeded canary values |

## 18. Security requirements

| ID | Requirement | Rationale | Priority | Phase | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|---|
| PER-SEC-001 | All public endpoints require auth, CSRF for mutation, Zod validation, rate limits and service-level scope check. | defense in depth | Must have | 0–1 | middleware/policy | route and bypass tests pass |
| PER-SEC-002 | Rule/content publish/pause requires ADMIN, MFA, approval and audit. | safety | Must have | 1 | admin | unauthorized and single-review publish rejected |
| PER-SEC-003 | Rule AST and templates cannot execute code/SQL/URLs outside allowlist. | injection/SSRF prevention | Must have | 1 | validator | adversarial tests pass |

## 19. Authorization requirements

OWNER manages sensitive profile/consent. CONTRIBUTOR may see allowed recommendation summaries, act and give feedback. VIEWER receives property-only recommendations without sensitive evidence. All item-by-ID routes resolve property then apply capability policy. Sharing never implies household-profile membership.

## 20. Recommendation-engine requirements

Candidate generation, eligibility, scoring, dedupe, conflicts, diversity, suppression, expiration, materialization and channel ranking follow [target architecture](04-target-architecture.md). Maximum dashboard results are 5.

## 21. Rule-engine requirements

Rules use validated AST, immutable version, dependencies, effective dates, safety class and golden fixtures. Unknown behavior is explicit. Arbitrary executable database content is prohibited.

## 22. Scoring requirements

Scoring considers base/property/household/goal/preference/season-weather/risk/financial/urgency/confidence/affinity and bounded penalties. Version and breakdown persist. Engagement cannot override safety or consent.

## 23. Explainability requirements

Every surfaced instance answers why, data used, benefit, urgency, confidence/limitations, ignore impact where appropriate, and correction path. Shared roles receive privacy-safe wording.

## 24. Progressive-profiling requirements

Questions are contextual, optional, value-ranked, capped and versioned. Skip/later are non-punitive. No answer appears in telemetry/logs.

## 25. Feedback requirements

Events include idempotent event ID, instance/definition/channel/type, explicit flag and bounded reason code. Free text is optional, sensitive, separately retained and excluded from routine analytics.

## 26. Notification requirements

Notification candidate must be active/fresh, channel-eligible, consented, above threshold, not duplicated/suppressed, and inside fatigue budget. Critical safety policy is reviewed separately. Lock-screen copy must not expose sensitive routines/traits.

## 27. Administrative requirements

MVP supports reviewed code/config authoring plus database lifecycle, validation preview, golden test results, impact count, activate/pause and audit. Phase 2 may add UI. Source/review dates and emergency disable are mandatory.

## 28. AI usage requirements

Allowed: document/inspection extraction, summaries, homeowner Q&A, admin rule-authoring suggestions, classification and reviewed content drafts. Deterministic systems control all consequential decisions. AI-disabled fallbacks are mandatory.

## 29. Integration requirements

Feature modules consume DTOs/instances and contribute facts/actions through adapters. No module reads raw profile tables or duplicates household rules. Existing score formulas and task records remain authoritative.

## 30. API requirements

Normative endpoints, validation, authorization, caching, idempotency, pagination, DTOs and errors are in [API design](06-api-design.md).

| ID | Requirement | Rationale | Priority | Phase | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|---|
| PER-API-001 | Provide property-scoped profile/traits/recommendations/questions/feedback/action APIs using existing conventions. | consistent integration | Must have | 1 | routes/auth | OpenAPI/contract suite passes |
| PER-API-002 | All mutation/action/event endpoints use version or idempotency protection. | retry safety | Must have | 1 | DB constraints | repeated request has one effect |

## 31. Frontend requirements

Normative experience is in [frontend experience](07-frontend-experience.md).

| ID | Requirement | Rationale | Priority | Phase | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|---|
| PER-UX-001 | Dashboard presents 3 default/5 max diverse recommendations with reason and actions. | avoid overload | Must have | 1 | API/components | visual/e2e checks pass |
| PER-UX-002 | Users can inspect/correct/disable data and inferences and delete/reset profile. | trust | Must have | 1 | controls APIs | OWNER flow passes mobile/desktop |
| PER-UX-003 | Profile questions expose why/skip/later/privacy and never block urgent tasks. | consent/friction | Must have | 1 | profiling API | keyboard/mobile e2e passes |

## 32. Analytics requirements

Measure optional question value and recommendation outcomes, not sensitive
values. The current aggregate includes default-guidance property reach,
optional-profile enablement, answers/skips/snoozes, recommendation status,
accepted/negative decisions and bounded reason counts. Add further metrics only
when the corresponding behavior exists.

Quality before learning uses cohort-level relevance rate (`accepted + acted + saved`), not-relevant/correction rates, completion, freshness, diversity, safety review incidents, and sampled content review. No automated tuning until sample-size, guardrail and rollback criteria are approved.

## 33. Observability requirements

Track evaluation count/duration/result, materialized status, suppression reason,
catalog versions, API latency/errors and privacy reset completion. Labels use
stable codes, never profile values or high-cardinality identifiers. Queue,
cache, notification and snapshot metrics become requirements only if those
systems are introduced.

## 34. Accessibility requirements

WCAG 2.2 AA; semantic order, visible focus, 44px targets, reduced motion, contrast, keyboard support, live save/status messages, non-color urgency and screen-reader-friendly explanations.

## 35. Performance requirements

See PER-NFR-001/002. The three-definition property evaluation performs no
external call. Repository queries must remain bounded and avoid N+1 reads.

## 36. Scalability requirements

Keep evaluation property-scoped, rule complexity bounded and active reads
indexed. Introduce queues, caches, partitions or archival only after measured
volume justifies them.

## 37. Reliability requirements

Use idempotent recommendation, feedback, profile and action writes. Definition
pause and the global kill switch are authoritative. No personalization cron,
queue, nightly reconciliation or outbox is required in the current pilot.

## 38. Audit requirements

Audit definition/content/rule activation and pause, consent/profile lifecycle,
explicit feedback/actions where required, sensitive reads and admin/reset/delete
operations. Audit metadata is allowlisted and value-minimized.

## 39. Data-retention requirements

Current property traits remain while the property exists. Evaluation runs,
recommendation/action history and feedback require approved retention windows
before real-user launch. Optional profile answers are erased on profile/account
reset. Free-text feedback receives the shortest practical approved period.

## 40. Schema-application requirements

During the data-free greenfield pilot, the repository defines the desired
schema and the user applies it; the application does not ship migrations or
backfill properties. The idempotent catalog seed creates only DRAFT rows. Once
a deployed database contains data that must survive a schema change, adopt a
conventional reviewed migration for that specific change, including its data
preservation verification and rollback plan. Optional-profile values must
never be inferred during schema work.

## 41. Testing requirements

Normative plan: [testing strategy](10-testing-strategy.md). Golden catalog/trait
datasets, authorization, privacy erasure, schema validation, performance and
AI-disabled tests are release gates. Migration rehearsal is deferred until a
deployed database contains data that must survive schema evolution.

## 42. Acceptance criteria

The greenfield pilot is accepted when the three reviewed definitions produce
deterministic results; default guidance works without a household profile; the
optional owner profile can be enabled, answered and reset; shared module reads
and task conversion are consistent/idempotent; no cross-role sensitive leak
exists; and catalog plus kill-switch controls are demonstrated.

## 43. Dependencies

Current dependencies are schema application by the user, reviewed catalog
content/safety approval, privacy retention decisions before real-user launch,
and working existing property/asset and maintenance-task services. Workers,
notifications and learning infrastructure are not pilot dependencies.

## 44. Risks

Primary risks and owners are in [risks/open questions](11-risks-and-open-questions.md): privacy/intrusiveness, wrong/stale advice, fragmented authorization, worker duplication, rule growth, notification fatigue, LLM overreach, dashboard overload and database complexity.

## 45. Assumptions

PostgreSQL/Redis remain available; property remains primary scope; household data is optional; MVP scale fits planning envelope; content reviewers are assigned; existing domains expose facts/actions; collaboration roles remain.

## 46. Open questions

Defaults are documented in [risks/open questions](11-risks-and-open-questions.md). None blocks the recommended architecture.

## 47. Release strategy

Activate reviewed definitions for internal validation, verify the default
property-guidance path, then validate the shared Dashboard, Maintenance and
Health placements. Basic property personalization is not percentage-enrolled
or profile-consent-gated. Optional household-profile collection remains a
separate owner choice. Use definition lifecycle controls and the global kill
switch for rollback.

## 48. Rollout plan

Phase 0 foundation; Phase 1 deterministic MVP; Phase 2 integrations/admin/notification; Phase 3 bounded learning; Phase 4 relational intelligence graph and only evidence-driven datastore changes. See [roadmap](09-implementation-roadmap.md).

## 49. Success metrics

Primary: time to first personalized value, accepted/acted/completed rate, not-relevant and profile-correction rate, question value yield, notification opt-out, diversity/freshness, and completed risk-reduction actions. Guardrails: safety incidents, sensitive-data events, duplicate rate, stale rate and dashboard density. Avoid raw page views/profile-field count as success.

## 50. Future roadmap

Temporal household state, multi-user household governance, richer property/household edges, longitudinal outcomes, safe simulations, rule authoring UI, causal experimentation and personalized timing. Graph/vector/ML services require demonstrated workloads and governance maturity.

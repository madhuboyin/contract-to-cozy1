# 03 — Feasibility Study

## Rating

**Feasible with moderate refactoring.** No platform rewrite or new datastore is required. Foundational authorization, household ownership semantics, worker coordination, deletion policy, and shared recommendation lifecycle must precede cross-module rollout.

## Technical feasibility

### Stack fit and service boundary

Node/Express/TypeScript, Prisma, PostgreSQL, Next.js, Redis/BullMQ and the current worker deployment are compatible with the engine. A modular monolith is preferable because evaluation needs transactional access to property, asset, task, feedback, and profile data; the team already operates a large monolith; a service would add network consistency, deployment, authentication and observability burden on constrained hardware.

Extract only when independently measured scale or organizational ownership requires it—for example, sustained evaluation volume that cannot be isolated in worker queues, or multiple products needing a stable service contract. Keep module DTOs and repositories clean so extraction is possible.

### Database approach

PostgreSQL is sufficient through at least Phase 3:

- Relational tables for ownership, profiles, goals/preferences, definitions, instances, feedback, suppression, versions and audit.
- A typed attribute table only for sparse extensible lifestyle answers; important high-selectivity fields remain columns.
- JSONB for a validated, bounded rule AST, explanation parameters, score breakdown and immutable input snapshots.
- GIN only where demonstrated; primary evaluation should fetch active definitions by indexed module/category/effective dates and evaluate in TypeScript.
- A precomputed `PersonalizationSnapshot` replaces expensive read-time joins. PostgreSQL materialized views are unnecessary initially because refresh invalidation is domain-event-driven and per property.

A graph database is not needed. The first “intelligence graph” is an application graph over relational IDs and typed edges. Reassess only if multi-hop arbitrary traversal becomes a measured core workload. A vector database/feature store is not needed for deterministic rules.

### Evaluation mode, cache, and freshness

Use both modes:

1. Mutations and domain changes enqueue a coalesced BullMQ job keyed by `propertyId`.
2. Worker derives traits, creates an immutable context snapshot, evaluates active catalog rules, upserts recommendation instances, and writes a compact personalization snapshot.
3. GET endpoints read the snapshot/instances synchronously, target p95 <200 ms at API boundary.
4. If missing or beyond hard TTL, return the last safe snapshot marked stale and enqueue refresh; only small MVP profiles may use a bounded synchronous fallback.

Suggested freshness: profile/property mutation immediate enqueue; task/feedback within 1 minute; weather every 15–60 minutes based on hazard; seasonal daily; full consistency sweep nightly. Safety-critical active alerts can bypass ordinary suppression but not consent/channel policies.

Redis can cache serialized read DTOs for 5–15 minutes, but PostgreSQL snapshots remain authoritative. Cache keys include snapshot version. In-memory caching is unsafe across five API replicas.

### Rules technology

Implement a small custom evaluator over a discriminated JSON AST (`all`, `any`, `not`, typed predicates). Benefits: no new dependency, auditable supported operators, direct TypeScript typing, domain-specific dates/seasons/history, and stable explanations. Do not store JavaScript/SQL or unrestricted JSONPath.

JSON Logic is compact but weakly typed and hard to explain/administer. An open-source general rules engine adds dependency/DSL surface without removing catalog/version work. Code rules remain appropriate for safety-critical algorithms and complex domain calculations; they should emit normalized facts/candidates, not bypass the engine. Recommended model: relational catalog + validated JSON rules + code adapters/guardrails.

### Events and queues

No Kafka/event bus. Reuse `DomainEvent`/BullMQ patterns and an outbox-style transaction where a domain mutation and invalidation event must be atomic. Message queues are useful now for recompute and notification dispatch, but simple read APIs remain synchronous. Fix multi-replica `node-cron` coordination before adding schedules.

### Environmental/local context

Normalize provider outputs into `ContextSnapshot` facts: key, scope, value, unit, observed/valid times, source, confidence, provenance. Existing weather incidents/signals, property geocode cache, climate setting, neighborhood property matches and community providers feed adapters. Never allow raw external provider payloads into rules.

## Product feasibility

Homeowners are unlikely to complete a deep upfront household questionnaire. The highest value/effort inputs are: pets and shedding/yard access, occupancy/work-from-home, travel frequency, top goals, DIY/service posture, notification cadence, sell horizon, aging-in-place priority, and confirmation of critical property features. Ask 3–5 high-value questions during onboarding, then one contextual question at a time.

Explicit settings: household composition bands, pets, goals, budget/service posture, notification/channel choices, accessibility/aging-in-place priority, future plans, and consent to inference categories. Infer only low-sensitivity operational facts from actions (e.g., DIY affinity after repeated DIY task completions), label them inferred, attach confidence, and allow override/disable. Avoid names/birthdates, exact child ages, health diagnoses, mobility diagnoses, income/net worth, precise routine schedules, or pet medical data.

Credible initial recommendations have strong observable home links: filter cadence, smoke/CO tests, leak/freeze/travel preparation, fence inspection, seasonal tasks, warranty/insurance review prompts, low-cost maintenance, and seller-prep adjustments. Credibility requires evidence, bounded claims, reviewed sources, confidence, and a correction path. Limit dashboard to 3 primary recommendations plus optional “more”; cap category repetition.

## Operational feasibility

MVP catalog management should be code-reviewed seed/config content validated in CI, with database activation/version state and an admin emergency disable endpoint. A full editor is Phase 2 after operator workflows are understood.

Every rule/content change needs an immutable version, rationale, effective/review dates, source references, safety class, test fixtures and an audit record. During internal validation, code-owned seeded content is activated by one MFA-authenticated admin whose identity is recorded as reviewer. A true two-session author/reviewer workflow is deferred until operators can author content in the UI or real-user risk justifies it. The kill switch disables a definition without deleting historical instances. Quality dashboards track eligibility volume, suppression reasons, stale context, acceptance/completion/not-relevant, corrections and adverse reports.

Operational burden is manageable for an initial 20–40 reviewed definitions; it becomes high past roughly 100 active definitions without taxonomy ownership, regression fixtures and authoring tools.

## Privacy, security, and trust feasibility

Classify data:

| Class | Examples | Control |
|---|---|---|
| Operational | property/asset/task facts | normal property ACL, retention by domain |
| Personal | goals, pets, work/travel bands | explicit purpose, correction/deletion, restricted logs |
| Sensitive | children/senior presence, accessibility/aging priority, financial posture, precise location/behavior | opt-in, minimum granularity, no ad targeting, tighter audit/redaction |
| Prohibited for MVP | diagnoses, exact schedules, exact child DOB, income/credit, pet health | do not collect |

Authorization must separate household-profile management from recommendation viewing. Default: OWNER manages sensitive household data; CONTRIBUTOR may view ordinary recommendations and submit personal feedback; VIEWER sees only property recommendations explicitly allowed, not raw household evidence. Explanations should say “household settings indicate…” where revealing a member-specific fact would be inappropriate.

Consent records include purpose/version/time/source. Explicit and inferred traits never overwrite one another; an override blocks re-inference until revoked. Export/deletion must cover raw answers, traits, snapshots, feedback, and explanation evidence while retaining only de-identified aggregate analytics when lawful.

Current account deletion is not enough: it anonymizes user/address but retains property domain records. Personalization needs its own cascade/anonymization plan. Logs and metrics must use IDs, categories, counts and reason codes—not profile values, rule input snapshots, child/pet details, addresses, or explanation text.

Advice guardrails: no medical claims, insurance coverage conclusions, legal compliance assurances, or guaranteed savings. Safety recommendations use reviewed deterministic content, source/review dates and escalation language. LLM text is optional presentation and may not change eligibility, urgency, numbers or calls to action.

## Cost and performance feasibility

### Planning envelope (assumptions, not production measurements)

At 10,000 properties, 50 active definitions, 30 materialized recommendation instances/property/year, 100 feedback events/property/year, and four 10–30 KiB snapshots/property:

- catalog evaluation: 500,000 predicate sets per full sweep; easy to partition, but event-driven refresh avoids sweeps;
- instances: ~300,000 rows/year; feedback ~1 million rows/year;
- snapshot payloads: approximately 0.4–1.2 GiB before indexes/TOAST and history retention;
- trait snapshots: keep current plus bounded history; otherwise high-churn rows dominate.

Evaluate only definitions prefiltered by status/module/context. A typical recompute of 20–50 definitions should target <250 ms CPU and <500 ms end-to-end worker time excluding external calls. Never call weather/LLMs inside the evaluation transaction. API snapshot read p95 target is <200 ms; mutation enqueue response <300 ms.

LLM cost for MVP eligibility is $0. Optional summaries should be generated only on user request or cached per recommendation content/profile hash, with monthly budget and fallback templates. Notifications should be a small subset: default at most one non-critical digest/day and 2 proactive non-critical pushes/week, user configurable.

### Raspberry Pi fit and thresholds

The deterministic workload is light enough if it is event-driven, batched, indexed and precomputed. Constraints are PostgreSQL I/O, total pod memory, duplicated cron, and external-call concurrency—not rule arithmetic. Do not add a service/graph DB.

Reassess infrastructure when one or more persists: evaluation queue age >5 minutes, recompute p95 >2 seconds, API snapshot read p95 >300 ms, PostgreSQL CPU >70% or I/O saturation during normal load, active data >50 GiB with poor vacuum/index performance, or worker memory/CPU throttling. First responses are index/query tuning, history partition/retention, worker concurrency control and moving PostgreSQL to stronger storage; service extraction is later.

## Build-vs-buy decision table

| Option | Benefit | Drawback/operations | Pi fit | Decision/migration |
|---|---|---|---|---|
| Custom typed evaluator | Small, explainable, domain-aware | Must own tests/operators | Excellent | **Choose**; version AST |
| Open-source rules engine | General constructs | dependency/DSL/admin burden | Fair | Reject now; adapter possible later |
| JSON Logic | Portable | weak typing/explanations | Good | Reject as primary |
| DB decision tables | Admin-friendly simple cases | awkward nesting/history | Good | Use relational preconditions/metadata, not sole engine |
| Code-only rules | type-safe | deploy for content change, scattered | Excellent | Only safety algorithms/adapters |
| PostgreSQL + JSONB | existing transactional store | needs index discipline | Excellent | **Choose** |
| Redis cache/BullMQ | existing, coalescing | invalidation/ops | Good | **Reuse selectively** |
| Event bus/Kafka | high-scale decoupling | excessive burden | Poor | Reject |
| Graph DB | natural arbitrary traversal | another store/consistency | Poor | Reject through Phase 3 |
| Vector DB | semantic retrieval | irrelevant to deterministic eligibility | Poor | Reject |
| Feature store | ML feature governance | premature | Poor | Reject |
| LLM recommendations | flexible prose | cost, hallucination, audit failure | External but risky | Assist only, reviewed/cached |

## Feasibility gates

Proceed when Phase 0 proves: canonical owner/member authorization, queue-safe recomputation, deletion/export semantics, 20–40 catalog definitions with golden tests, snapshot latency within target, and dashboard density testing. None requires a stack change.

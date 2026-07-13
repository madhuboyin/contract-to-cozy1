# 10 — Testing Strategy

## Quality model

Test deterministic logic as pure functions, database behavior against PostgreSQL, route/service authorization independently, and user journeys end to end. A reviewed golden household/property dataset is the regression contract for every rule/catalog version.

## Test layers

| Layer | Coverage | Release gate |
|---|---|---|
| Unit | trait precedence/confidence/expiry; AST validation/evaluation; unknown semantics; scoring/breakdown; dedupe/conflicts/diversity; explanations; profiling value/caps; suppression; safety floors | 100% branch coverage for safety/rule operators; mutation testing considered |
| Catalog lint/golden | codes/taxonomy/source/review dates, prohibited pet/medical/legal claims, dependency keys, sample eligibility/rank/explanation | every active definition has positive, negative, unknown and suppression fixture |
| Prisma integration | constraints/indexed query shapes, transactions/outbox, idempotent upserts, cascades, soft-delete/current-row uniqueness, concurrent jobs | real PostgreSQL, not SQLite mocks |
| API contract | DTO/OpenAPI, validation/errors, ETag/cursors, idempotency/version conflicts, stale response | consumer/provider contract suite |
| Authorization/security | OWNER/contributor/viewer/admin/MFA; item-ID scope; CSRF/rate limit; AST injection/SSRF; tenant enumeration | deny-by-default matrix passes |
| Migration | empty/partial/production-like data, repeat backfill, counts/hashes, old app compatibility, rollback flags | rehearsal report approved |
| Frontend component | question/explanation/cards/controls, loading/stale/error, optimistic rollback, reduced motion | Jest/Testing Library + axe |
| E2E | onboarding → result → detail → correction → recompute → task; privacy controls; notifications | desktop/mobile, keyboard critical path |
| Performance | snapshot GET, recompute, queue bursts, DB query plans, cache invalidation | PER-NFR targets under Pi limits |
| Reliability | duplicate delivery, retries, worker restart, provider outage, stale cache, definition pause, DB/Redis interruption | no duplicate actions/false-current hazard |
| Privacy | telemetry canaries, export/reset/delete, consent withdrawal, viewer redaction, retention jobs | no canary values in log/metric/URL/analytics |
| AI | AI disabled, schema validation, prompt injection, unsupported claims, deterministic payload unchanged | AI never changes eligibility/score/action |

## Golden dataset

Store versioned, synthetic fixtures: household, property/assets, context, history, expected traits, eligible/suppressed definitions, rank bands, explanation reason codes and actions. Never copy production household data. A catalog PR prints impact diff: newly eligible/ineligible, rank changes, suppression changes and notification volume estimate.

## Required scenario matrix

| Scenario | Expected assertions |
|---|---|
| No profile data | property-only safe results; no sensitive inference; top question optional |
| Partial profile | unknown rules behave per policy; confidence reduced; no false exclusion |
| Conflicting answers | latest valid explicit version wins; conflict surfaced for correction; audit retained |
| Multiple properties | occupancy/property facts produce distinct results; no cross-property task/evidence leak |
| Multiple pets | aggregated trait threshold deterministic; explanation minimizes detail |
| Pet removed | pet traits expire; future pet items withdrawn; historical action remains audited |
| Goal changed | affected rank/eligibility recomputed only; model version recorded |
| Dismissed | correct definition/instance/category scope suppresses until policy permits |
| Snoozed | hidden from ordinary channel until time; critical safety override policy tested |
| Duplicate recommendation | strongest instance remains; evidence merged; one action/notification |
| Stale context | hazard urgency suppressed/marked stale; refresh enqueued; no all-clear claim |
| Weather event | valid source+vulnerability yields time-bound item and channel policy decision |
| Sensitive trait disabled | override/disable blocks inference and dependent explanation promptly |
| Unauthorized property | 404/403 policy response with no existence/detail leakage |
| Rule version updated | old instance reproducible; new evaluation references new immutable version |
| Definition disabled | no new instances; active affected instances withdrawn within SLA; history retained |
| Existing task | recommendation acted/suppressed; conversion returns existing idempotent action |
| Notification fatigue | cross-module budget suppresses lower-ranked item with reason |
| Worker duplicate/retry | one current snapshot/action; run diagnostics record retry |
| Profile deletion | profile/traits/snapshots/explanations erased; domain property retained per policy |

## Representative unit cases

```ts
it('explicit override beats inferred trait until revoked');
it('UNKNOWN fence state emits a question opportunity, not a fence assertion');
it('critical safety floor is not reduced by dismissal affinity');
it('top five contain at most two per category when no critical exception exists');
it('explanation reason codes are a subset of matched rule trace');
it('same context hash and versions reproduce score and occurrence key');
```

## API and authorization matrix

For every endpoint test: unauthenticated, wrong property, owner, contributor, viewer, suspended/unverified account where relevant, malformed UUID/body, stale version, repeated idempotency key and cross-household ID. Service tests bypass routes to prove checks are not middleware-only.

## Notification testing

Test candidate threshold, consent/channel, quiet hours/cadence, cross-feature budget, sensitive lock-screen copy, dedupe, digest grouping, provider failure/retry, delivered status, definition pause and expired context. Use fake delivery adapters; no real email/SMS.

## Performance plan

Datasets: 10k properties planning envelope, 50/100/250 definitions, 25/100 traits, 100k/1m feedback rows. Measure explain-analyze query plans, API p50/p95/p99, worker CPU/memory/duration, queue age, DB connections and cache hit rate. Run with manifest-equivalent CPU/memory. Reject unbounded JSON scans and N+1 queries.

## Migration and rollback tests

Snapshot a production-shaped anonymized schema, run additive change/backfill twice, compare counts/uniques/orphans, run old backend binary/read paths, enable shadow evaluation, disable flags/jobs and confirm old behavior. Verify no sensitive traits were inferred/backfilled.

## Accessibility and visual QA

Automated axe plus manual keyboard/screen-reader checks for profile/question/detail/control flows at 320, 375, 768 and desktop widths; zoom 200%; reduced motion; high contrast; long localization strings; status/error announcements; no color-only confidence/urgency.

## Quality measurement before learning

Review a stratified sample by definition/property completeness. Compare expert relevance labels to eligibility/rank bands; track not-relevant/correction and completion; require minimum sample size; inspect notification opt-out and safety reports. Do not tune on click-through alone.

## CI evolution

Add backend personalization unit/catalog/contract suites to existing backend gate, Prisma integration job with PostgreSQL, full frontend Jest/accessibility suite, migration rehearsal on schema PRs, and artifacted catalog impact report. Preserve current security/secret scans.

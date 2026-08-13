# Decision Platform — Metrics Dictionary and Zero-Tolerance Gates

**Status:** Proposed. Formalizes
[`AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md`](../AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md)
§22 as a reference table. No event codes are wired into
`apps/backend/src/services/analytics/taxonomy.ts` or the `ProductAnalyticsEventType` Prisma enum
in this phase — that happens when the Phase 8A/8B features that actually emit these events are
built. This document exists so those future emitters implement against an already-agreed
denominator/numerator/target, not an improvised one.

## Quality metrics (FRD §22.1)

| Metric | Eligible denominator | Numerator | Initial release target | First measurable in |
| --- | --- | --- | --- | --- |
| Decision continuation success | Valid continuation attempts with one adjudicated target and authorized current access | Correct thread/entity/scenario resumed without repeat capture | ≥99% over ≥1,000 fixture/production-like attempts; zero material misattributions | Phase 8A |
| Repeated-known-question rate | Required-field prompts where a usable authorized value existed at evaluation time | Prompts unnecessarily requesting that value | <1% over ≥1,000 eligible prompts | Phase 8B |
| Preference reuse correctness | Recommendations eligible to use one active registered preference | Correct use with accurate disclosure and no out-of-scope use | ≥99%; zero unconfirmed material uses | Phase 8B |
| Change deduplication precision | Adjudicated duplicate/superseded change pairs | Pairs correctly collapsed/superseded | ≥99.9% over ≥10,000 replayed revisions; zero cross-entity merges | Phase 9A |
| Change recall | Adjudicated material changes | Material changes appearing within source SLA | ≥99% by certified source family | Phase 9A |
| Recommendation reproducibility | Retained snapshots with all permitted dependencies available | Replayed verdict/reasons equal stored result | 100%; redacted dependencies reported separately | Phase 8A (schema supports it; replay tooling is Phase 8A) |
| Proactive usefulness | Explicitly rated eligible proactive items | `USEFUL` or resulting governed action | Baseline first; threshold approved before external delivery | Phase 9B |
| External fatigue guardrail | Users receiving external proactive messages | Category mute, channel opt-out, or "too many" response within seven days | Rollback threshold approved before launch | Phase 9C |
| Outcome coverage | Eligible completed supported decisions | Outcome observation linked within attribution window | Baseline first; never used as a quality proxy alone | Phase 10A |
| Calibration improvement | Approved holdout predictions | Error improvement versus current production baseline | Positive material improvement with no safety/segment regression | Phase 10B |

Only two of these ten metrics have any schema support in Phase 7A (**Decision continuation
success** and **Recommendation reproducibility**, via `DecisionThread`/`RecommendationSnapshot`
versioning and lineage fields) — the rest are listed here for completeness and to fix their
definitions before the phases that implement them begin.

As of the Phase 9A–9C implementation (see the "Phase 9A–9C" section of
[`AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md`](../../operations/AI_HOME_CONCIERGE_ASK_OPERATIONS_AND_GOVERNANCE.md)):
**Change deduplication precision** and **Change recall** have real data behind them (the
`PropertyChange` ledger's dedupe key, supersession rule, and materiality fields), but no
aggregation job computes either metric yet. **Proactive usefulness** has raw per-item
`USEFUL`/`NOT_USEFUL` ratings captured (`homeActionUsefulnessFeedback.service.ts`, reusing the
generic `Feedback` model), but nothing rolls them up into this metric's eligible-denominator/
numerator shape. **External fatigue guardrail** has no data captured at all yet — Phase 9C's
consent revocation and email cadence changes are adjacent signals, not this metric's numerator,
and no "too many" response mechanism exists. None of the three is wired into
`ProductAnalyticsEventType` or a dashboard.

## Zero-tolerance gates (FRD §22.2)

The following targets are zero, at every phase from Phase 8A onward:

- cross-property or cross-role sensitive disclosure;
- unconfirmed preference affecting a material result;
- scenario assumption written as a canonical fact without separate confirmation;
- unregistered signal triggering external delivery;
- deleted/revoked preference used after successful revocation;
- model-generated authoritative graph edge, score, or outcome;
- external notification without applicable consent;
- silent material thread/entity misattribution; and
- material recommendation without a reproducible or explicitly redacted lineage state.

### Phase 7A schema-level proxies for these gates

Full enforcement of each gate requires application logic that does not exist until Phase 8A+, but
Phase 7A's schema and registries already make several of these gates **structurally** harder to
violate, which the governance test suite asserts today:

| Gate | Phase 7A structural proxy | Test |
| --- | --- | --- |
| Unconfirmed preference affecting a material result | `DecisionPreferenceDefinition.materialForRanking` + registry validator rejects a presentation-only definition claiming a shared material explanation | `tests/decisionPlatform/decisionPlatformGovernance.test.js` |
| Scenario assumption written as a canonical fact without confirmation | No write path from `Scenario` to any canonical or preference table exists in this phase's code at all | Absence is verified by there being no such service file under `apps/backend/src/services/decisionPlatform/` |
| Model-generated authoritative graph edge, score, or outcome | `DecisionThreadFactReference` origin is always an explicit application write of a canonical entity pointer — no LLM-authored edge type exists in this schema | N/A this phase (no graph edge registry built yet — FRD §15 first-release queries are Phase 8C) |
| Material recommendation without reproducible/redacted lineage | `RecommendationSnapshot` requires `canonicalFactReferences`, `preferenceReferenceIds`, `inputDigest`, and version fields on every row (`NOT NULL` in schema, no default) | `npx prisma validate` (schema-level; no code writes this table yet to exercise a runtime test) |

## North star (FRD §22.3)

**Useful Home Outcomes per Active Household** remains the long-term north star, counting only
deduplicated, attributed outcomes from an approved taxonomy — not conversation volume or page
views. No taxonomy or counting logic exists yet; this phase only records that conversation
volume/page views must not be substituted for it when Phase 10A/10B build outcome counting.

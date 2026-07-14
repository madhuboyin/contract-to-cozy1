# Phase 1 completion audit — default personalization

This audit applies the revised no-real-user scope in `09-implementation-roadmap.md`. Database migrations, backfills, production-data compatibility, broad catalog expansion, queues and real-user outcome targets are intentionally excluded.

## Engineering status

| Deliverable | Status | Evidence |
|---|---|---|
| Default property guidance | Complete | Reviewed property-only recommendations do not require a Household or consent gate |
| Optional profile and lazy Household | Complete | Owner choice creates and consents a Household only when enhanced profile questions are enabled |
| Profile-scoped API | Complete | Enable uses `POST /personalization/profile/enable`; removal uses `DELETE /personalization/profile` |
| Five-question progressive profile | Complete | Active PILOT questions are ranked, capped, validated and written transactionally |
| Three deterministic definitions | Complete in code | HVAC, smoke/CO and dryer-vent rules have TRUE/FALSE/UNKNOWN coverage |
| Reviewed/versioned content gate | Complete in code | Materialization requires an ACTIVE `RecommendationContentVersion`; seeds remain DRAFT |
| Generic evaluation/materialization | Complete | One pipeline evaluates all three definitions and persists rule/content versions |
| Structured explanation | Complete | Versioned title/body populate explanation headline and reason parameters |
| Top-three read surface | Complete | Authenticated property-scoped API and mobile UI limit results to three |
| Authorization | Complete | VIEWER reads summaries; CONTRIBUTOR refreshes/feedback; OWNER manages consent/profile/reset; non-owner evidence is redacted |
| Feedback and suppression | Complete | Explicit negative feedback is idempotent and suppresses/dismisses according to policy |
| Reset/delete | Complete | Owner reset removes the optional household profile and household-bound outputs; property traits and guidance remain property-owned and available |
| Recompute | Complete | Opt-in/read recompute plus explicit contributor refresh; no broad sweep |
| Operational controls | Complete | ACTIVE catalog gates, global kill switch and per-definition lifecycle hide stored outputs at read time; no percentage enrollment |
| Focused tests | Complete | Capability, rules, content gate, materialization, profile validation, feedback, reset and UI accessibility smoke coverage |
| PostgreSQL rollback test | Harness complete | Runs only with explicit `PERSONALIZATION_TEST_DATABASE_URL`; never targets the default/production database |

Schema pruning removed the unused `TraitDefinition`, `RuleVersion`, and
`TraitSnapshot` models. `DerivedTrait` is property-only; evaluation input and
evidence are retained once in `PersonalizationEvaluationRun.resultJson`.

## Operational activation gates

Default availability does not bypass catalog review. Before internal validation:

1. Confirm the existing schema is applied, then rerun the consolidated seed so the DRAFT content versions exist. This Phase 1 pass adds no schema migration.
2. Review and activate selected profile questions.
3. Review and activate the matching definition, rule and content version.
4. For safety-sensitive rules, record distinct `authoredBy` and `reviewedBy` identities.
5. Confirm the kill switch is not paused; no rollout percentage is required.
6. Exercise default recommendation/feedback/action plus optional-profile enable/question/reset once against a disposable internal account.

The admin approval/editor UI remains the controlled catalog surface. Phase 1 uses reviewed activation plus audited emergency pause/resume.

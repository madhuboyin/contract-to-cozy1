# Phase 1 completion audit — greenfield pilot

This audit applies the revised data-free pilot scope in `09-implementation-roadmap.md`. Database migrations, backfills, production-data compatibility, broad catalog expansion, queues and real-user outcome targets are intentionally excluded.

## Engineering status

| Deliverable | Status | Evidence |
|---|---|---|
| Explicit opt-in and lazy Household | Complete | Owner opt-in creates and consents a pilot Household only when requested |
| Five-question progressive profile | Complete | Active PILOT questions are ranked, capped, validated and written transactionally |
| Three deterministic definitions | Complete in code | HVAC, smoke/CO and dryer-vent rules have TRUE/FALSE/UNKNOWN coverage |
| Reviewed/versioned content gate | Complete in code | Materialization requires an ACTIVE `RecommendationContentVersion`; seeds remain DRAFT |
| Generic evaluation/materialization | Complete | One pipeline evaluates all three definitions and persists rule/content versions |
| Structured explanation | Complete | Versioned title/body populate explanation headline and reason parameters |
| Top-three read surface | Complete | Authenticated property-scoped API and mobile UI limit results to three |
| Authorization | Complete | VIEWER reads summaries; CONTRIBUTOR refreshes/feedback; OWNER manages consent/profile/reset; non-owner evidence is redacted |
| Feedback and suppression | Complete | Explicit negative feedback is idempotent and suppresses/dismisses according to policy |
| Reset/delete | Complete | Owner reset removes the pilot household profile and household-bound outputs transactionally |
| Recompute | Complete | Opt-in/read recompute plus explicit contributor refresh; no broad sweep |
| Operational controls | Complete | Pilot rollout flag, global kill switch and audited per-definition pause/resume |
| Focused tests | Complete | Capability, rules, content gate, materialization, profile validation, feedback, reset and UI accessibility smoke coverage |
| PostgreSQL rollback test | Harness complete | Runs only with explicit `PERSONALIZATION_TEST_DATABASE_URL`; never targets the default/production database |

## Operational activation gates

Engineering completion does not activate the feature. Before pilot exposure:

1. Confirm the existing pilot schema is applied, then rerun the consolidated pilot seed so the new DRAFT content versions exist. This Phase 1 pass adds no schema migration.
2. Review and activate selected profile questions.
3. Review and activate the matching definition, rule and content version.
4. For safety-sensitive rules, record distinct `authoredBy` and `reviewedBy` identities.
5. Enable `TOOL_ROLLOUT_PERSONALIZATION_PILOT` for the intended cohort and confirm the kill switch is not paused.
6. Exercise opt-in, recommendation, feedback and reset once against a disposable pilot account.

The admin approval/editor UI remains Phase 2. Phase 1 uses controlled database activation plus audited emergency pause/resume.

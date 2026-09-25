# Backend test suite triage

**Date:** September 25, 2026
**Scope:** `apps/backend`, `npm run test:chunked` (5,237 tests).

## Result

| Run | Failing | Note |
|---|---|---|
| Start of this pass | 236 | after the Ask decomposition, before any triage |
| After the first two batches | 106 | stale test doubles and fixtures fixed |
| After the third batch | 87 | includes one real configuration fix |
| After the source-text batch | **64** (46 files) | tests pointed at where the code lives now |

Each remaining failure was read only as far as its first error message (**Code-traced**, not root-caused test by test). The
classification below is therefore a starting point for whoever picks each one up, and labels what each group probably is.
Nothing here is caused by the Ask decomposition: a clean copy of the earlier commit showed the same families.

## What was fixed (and why it matters)

- **A real configuration gap.** `BUYER_CLOSING_PLAN` and `CLAIMS` were registered as `ACTIVE` capabilities (Phase 6, commit
  `d411f35a`) with no entry in `config/featureFlags.ts` `TOOL_DEFAULTS`, so tool discovery reported them as missing rollout
  keys and their rollout status could not resolve. Both now default to 100%, like the other active capabilities.
- **Stale test doubles.** Work-item writes moved property-change emission into the same transaction (August 2026), so the
  minimal prisma mocks in about 15 Home Operations tests failed on `$transaction`. `tests/helpers/transactionalEmissionFake.js`
  is a shared in-memory fake for that path. Sale-case readiness, habit adoption, maintenance sync, inspection findings and
  personalization lifecycle tests also had doubles that predate new tables the services now read.
- **Expectations updated to intentional behaviour:** a closed work item can be reopened; an inspection finding routed to
  PROJECT now creates and links a tracked project; the appliance factor uses purchase date; SALE_PREP work items are
  work-shaped; three measurement gaps were closed as metrics; the retroactive permit wording is a policy constant.
- **A clock-dependent fixture:** a weather incident expiring on a fixed August date was correctly dropped once the real date
  passed it.
- Regenerated `docs/product/HOME_INTELLIGENCE_PHASE0_REGISTRY_REPORT.md`, which a test requires to match the registry.

## What is left (64 failures in 46 files)

### Product decisions (answered 2026-09-25)

1. **`ENFORCE_HUMAN_POLICY_APPROVALS`**: kept `"false"` (advisory during the test phase); `humanPolicyApprovalMode` now expects it.
2. **`HOME_RISK_REPLAY_REVIEWED_COVERAGE_ENABLED`**: OPEN. The earlier note that the key was missing was wrong: the configmap sets it,
   and `NEIGHBORHOOD_REVIEWED_COVERAGE_ENABLED`, to `"true"` (RentCast readiness commit 77990abe). Setting them to `"false"` would 503
   both endpoints in production, so nothing was changed; `propertyIntelligenceTrustContainment` still fails on this line.
3. **Feature-flag rollouts**: current 100% defaults kept for `HOME_BRIEFING`, `HOME_RISK_REPLAY`, `NEIGHBORHOOD_CHANGE_RADAR`, `PROPERTY_BRIEF`; test updated.
4. **`TwinStatusCard` in the upgrade planner**: kept; the P0 test no longer bans it (stale link-text assertions also updated).
5. **"Personalized Guidance" nav entry**: stays removed; the test asserts its absence.
6. **Capability catalog**: new ranking approved. Fixtures fixed (release gates enforced with explicit rollouts, retired `cost-explainer`/
   `true-cost`/`cost-growth` replaced, counts 48/50). Real defects found and fixed: `home-timeline` was under-classified
   (`SENSITIVE` now) and blocked launch review; Radar `COMPARE_PROVIDERS` pointed at the non-capability `home-savings` and is now informational.
   Open defect: capabilities declaring `outputEntityTypes: ['STRUCTURED_RECORD']` (e.g. `material-specs`, `claims`) cannot record a
   completion, because the completion route's schema only accepts `CAPABILITY_CONTEXT_TYPES`.

### Environment only (8 files)

`integration/askConversationalCaptureCertification.db`, `integration/askSellHoldRentGoalCertification.db` (no database at
`localhost:5433`); `integration/password-reset.integration`, `e2e/password-reset.e2e` (`JWT_SECRET` too short);
`unit/emailVerificationAppConfig`, `integration/adminReviewModeration.integration` (need a real database);
`unit/refinanceLoanEstimateExtraction` (`sharp` does not load for darwin-arm64).

### Older design (2 files)

`decisionPlatform/decisionPlatformChangeEmitterGovernance` asserts a best-effort emitter; emission is transactional on
purpose, so the test needs rewriting for the current design. `decisionPlatform/hvacDecisionRouting` is a known red test
since August.

### Still to read (about 20 files, mostly one failure each)

Source-text tests whose string was reworded or moved and that I have not yet traced: `phase2HomeActions`, `propertySetupSimplification`,
`propertyContextRemediation`, `propertyContextJustInTimeSlice1`, `...Slice4`, `...Slice4Completion`, `...Slice4Planning`,
`...Slice5Tranche2`, `sellerPrepTrustContainment`, `coveragePolicyTermProvenance`, `phase3MajorMoment`,
`phase4ProjectCompliancePolicy`, `phase6RemediationExitGate` (2), `phase7AggregationContextPolicy`, `phase8CleanupGuard`,
`phase8ArchetypeExitGate`, `propertyBriefFoundation`, `adminSourceHealth`, `integration/phase5BuyerAcquisition.acceptance`, plus
doubles missing a member: `personalizationQuality` (4), `personalizationConvertRecommendationToTask`, `homeActionProjectSafetyTier`.

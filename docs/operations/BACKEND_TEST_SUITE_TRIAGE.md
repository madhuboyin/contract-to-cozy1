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

### Needs a decision from you, not a test edit (found while triaging)

These tests fail because the code contradicts what the test says the product should do. Which side is right is a product
or release call.

1. **`ENFORCE_HUMAN_POLICY_APPROVALS`** (`unit/humanPolicyApprovalMode`). The test says the deployment enforces launch
   approvals (`"true"` in `infrastructure/kubernetes/base/configmap.yaml`). The configmap and `infrastructure/kubernetes/README.md`
   both say `"false"`. That looks deliberate for the test phase, but it means human-approval gates are advisory in the
   deployed environment.
2. **`HOME_RISK_REPLAY_REVIEWED_COVERAGE_ENABLED`** (`unit/propertyIntelligenceTrustContainment`) is expected to be `"false"`
   in deployment config and is not present at all.
3. **`HOME_BRIEFING` rollout** (`unit/propertyIntelligencePortfolioContracts`) is expected to default to 0%; the current
   default is different (`config/featureFlags.ts`).
4. **Upgrade planner renders `TwinStatusCard`** (`unit/homeDigitalTwinP0TrustBoundary`) although the P0 product boundary says
   the planner must not show a competing home-state summary (`HomeDigitalTwinClient.tsx` line 2505).
5. **Homeowner "Personalized Guidance" navigation entry** (`unit/personalizationPhase2ConsumersUi`) was removed from
   `lib/navigation/jobsNavigation.ts` in the July 18 unified-Home commit; the test says homeowners must always have it.
6. **Capability catalog behaviour** (`toolCapabilityRelated`, `toolCapabilityRecommendation`, `knowledgeHubCapabilityProjection`,
   `materialSpecsCapabilityActivation`, `diyCapabilityActivation`, `plantAdvisorCapabilityActivation`, `productFrameworkContracts`,
   `capabilityGovernanceDefinition`, `capabilityLaunchReview`, `homeEventRadarActionRegistry`): tools were retired (`cost-explainer`,
   `true-cost`) and new capabilities added, so related-tool order and ranking changed. Example: `inspection-hub` on an `ISSUE`
   entity now suggests `buyer-closing` then `diy`, not `diy` then `permits`.

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

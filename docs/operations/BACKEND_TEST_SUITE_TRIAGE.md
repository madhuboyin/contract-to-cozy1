# Backend test suite triage

**Date:** September 25, 2026
**Scope:** `apps/backend`, `npm run test:chunked` (5,237 tests).

## Result

| Run | Failing | Note |
|---|---|---|
| Start of this pass | 236 | after the Ask decomposition, before any triage |
| After the first two batches | 106 | stale test doubles and fixtures fixed |
| After the third batch | **87** | includes one real configuration fix |

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

## What is left (87 failures in 58 files)

### A. Environment only, not code (10 files, about 14 failures)

These need a database, secrets or a native module that a clean checkout does not have.

- `integration/askConversationalCaptureCertification.db`, `integration/askSellHoldRentGoalCertification.db`: no database at
  `localhost:5433`.
- `integration/password-reset.integration`, `e2e/password-reset.e2e`: `JWT_SECRET` must be at least 32 characters.
- `unit/emailVerificationAppConfig`, `integration/adminReviewModeration.integration`: need a real database behind the auth and
  review services.
- `unit/refinanceLoanEstimateExtraction`: the `sharp` native module does not load for darwin-arm64 in this install.

### B. Source-text tests pinned to refactored files (about 28 files)

These read a source file and match a regular expression that no longer matches because the code moved or was reworded (the
same class as the Ask decomposition's 41 source-reading tests, which now read through `tests/helpers/askOrchestratorSources.js`).
Fixing each means finding where the string lives now, not changing behaviour.

`personalizationPhase3Ui`, `personalizationPhase2ConsumersUi`, `personalizationModulePlacementUi`, `homeBriefingFoundation`,
`gazetteLegacyRetirement`, `homeBuyerSlice4AInspectionModules`, `homeBuyerSlice4CClosingDay`, `homeDigitalTwinP0TrustBoundary`,
`homeIntelligencePhase4Gaps`, `homeTimelineTruthHardening`, `humanPolicyApprovalMode`, `maintenanceSourceParityBoundary`,
`pastHazardExposureFoundation`, `phase2HomeActions`, `phase4RecommendationIncidents`, `phase4RemainingCompletion`,
`phase4TrustGovernance`, `phase4WorkerParity`, `phase5AssetLifecycleSlice`, `phase6RemediationExitGate` (2 of 16),
`propertyContextJustInTimeSlice4`, `propertyContextJustInTimeSlice4Completion` (a frontend path no longer exists),
`propertyContextJustInTimeSlice4Planning`, `propertyContextJustInTimeSlice5Tranche2`, `propertyContextRemediation`,
`propertyIntelligencePortfolioContracts`, `propertyIntelligenceTrustContainment`, `propertySetupSimplification`,
`sellerPrepTrustContainment`, `coveragePolicyTermProvenance`, `integration/phase5BuyerAcquisition.acceptance`.

### C. Catalog behaviour that needs a product decision (10 files, about 22 failures)

The capability registry changed (tools retired into others, new capabilities added) and these tests pin the old related-tool
order, recommendation ranking or activation state. Updating them means agreeing that the new behaviour is intended, so they
were not changed blindly. Example: `toolCapabilityRelated` expected `inspection-hub` on an `ISSUE` entity to suggest `diy`
then `permits`; it now suggests `buyer-closing` then `diy`.

`toolCapabilityRelated` (4), `toolCapabilityRecommendation` (3), `knowledgeHubCapabilityProjection` (3),
`materialSpecsCapabilityActivation` (2), `diyCapabilityActivation`, `plantAdvisorCapabilityActivation`,
`productFrameworkContracts`, `capabilityGovernanceDefinition`, `capabilityLaunchReview`, `homeEventRadarActionRegistry` (2).
Some of these also use retired tool ids in their fixtures (`cost-explainer`, `true-cost`, `cost-growth`).

### D. Tests that assert an earlier design (3 files)

- `decisionPlatform/decisionPlatformChangeEmitterGovernance` (2): asserts the emitter is best-effort (a `try` block; called
  after the transaction commits). The Phase 0 remediation made emission transactional on purpose, so the test's premise is
  out of date; it needs rewriting against the current design, not patching.
- `decisionPlatform/hvacDecisionRouting`: a non-HVAC water-heater question routes to `HVAC_DECISION_START`. Noted as a known
  red test since August.
- `phase8CleanupGuard`, `phase8ArchetypeExitGate`, `phase7AggregationContextPolicy`, `phase3MajorMoment`: guard-style tests
  whose first error is a deep-equal on a list; not yet read.

### E. Test doubles still missing a member (about 6 files)

`personalizationQuality` (prisma fake has no model the service now reads), `personalizationConvertRecommendationToTask`,
`homeActionProjectSafetyTier` (a fixture fails `parseHomeAction` validation), `propertyBriefFoundation`, `adminSourceHealth`,
`propertyContextJustInTimeSlice1`.

## Suggested order

1. Group B: mechanical, and each fix restores a guardrail that currently guards nothing.
2. Group E: small.
3. Group D: rewrite the emitter governance test for the transactional design.
4. Group C: needs the product owner's yes or no per capability.
5. Group A: leave, but run them in an environment with a database, `JWT_SECRET` and a working `sharp`.

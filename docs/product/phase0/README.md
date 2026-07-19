# Product Framework Phase 0 — Contract and Governance Foundation

Status: Technical exit criteria complete; human policy approvals are explicitly deferred during internal beta and become enforced before real-user launch

Contract version: `phase0-v1`

Date: July 18, 2026

## Purpose

Phase 0 prevents further product divergence before the experience is consolidated. It defines executable contracts for entry context, homeowner actions, recommendation governance, commercial integrity, and north-star outcome lineage. It also makes route disposition and product launch requirements reviewable and testable.

This phase does not implement the Phase 1 onboarding experience, unified Home API, navigation cutover, or major-repair closure flow.

## Implemented deliverables

| Phase 0 commitment | Implementation |
| --- | --- |
| Canonical Home Action contract | `apps/backend/src/productFramework/homeAction.contract.ts` |
| Source adapter registry | `apps/backend/src/productFramework/homeActionSourceAdapters.ts`, with a validating fixture for every declared source kind |
| Entry path, ownership state, property origin, and trigger taxonomy | `apps/backend/src/productFramework/entryContext.contract.ts` |
| Recommendation safety tiers and commercial disclosure | `apps/backend/src/productFramework/recommendationGovernance.contract.ts` |
| North-star definition and signal-to-outcome lineage | `apps/backend/src/productFramework/outcomeLineage.contract.ts`, typed runtime producers in `apps/backend/src/services/analytics/northStarLineage.ts`, and event-backed aggregation in `northStarMetric.service.ts` |
| Route disposition | `apps/frontend/scripts/product-framework/check-route-disposition.mjs` and [route-disposition.md](./route-disposition.md) |
| Golden test homes | `apps/backend/tests/fixtures/productFramework/goldenTestHomes.js` |
| Contract validation | `apps/backend/tests/unit/productFrameworkContracts.test.js` |
| Feature and launch governance | Executable role-based launch gate, [feature-brief-template.md](./feature-brief-template.md), [recommendation-launch-gate.md](./recommendation-launch-gate.md), [approval-register.md](./approval-register.md), and GitHub templates |

## Exit-criteria evidence

| Exit criterion | Status and evidence |
| --- | --- |
| Contract fixtures pass for every declared action source | Complete. Eight source adapters and fixtures cover Guidance, Maintenance, Incident, Recall, Coverage, Personalization, Project, and System. |
| Every homeowner route has a disposition | Complete. The executable route audit fails on an unclassified or ambiguous `page.tsx`. |
| Metric defines numerator, denominator, eligibility, timing, and owners | Complete. The contract and event-backed report name Product Analytics as data owner and Homeowner Product as business owner. |
| Safety-tier review is enforced | Technically complete. Missing approvals remain visible and audited in beta; launch readiness becomes blocking when `ENFORCE_HUMAN_POLICY_APPROVALS=true`. Human approvals are deferred rather than falsely recorded while there are no real users. |
| New feature governance is mandatory | Complete as a repository process gate through the feature brief, recommendation launch gate, issue template, and pull-request checklist. |

## Approved product contracts

### Home Action

Every action shown on a default homeowner surface must include:

- stable action, source, property, and lineage identity;
- one primary customer job;
- lifecycle state and Now/Soon/Plan/Consider priority;
- signal, relevance, recommended action, expected outcome, and timing rationale;
- evidence, freshness, confidence, and missing context;
- assumptions, options, and tradeoffs when material;
- safety tier and required governance controls;
- commercial disclosure for provider, purchase, or financing actions;
- primary and secondary CTAs; and
- feedback controls appropriate to the action.

The Zod contract rejects:

- material recommendations without assumptions, at least two options, and tradeoffs;
- regulated guidance without a verified jurisdiction check and professional boundary;
- emergency guidance without conservative fallback, escalation copy, and escalation CTA; and
- provider, purchase, or financing CTAs without a complete commercial disclosure.

### Entry context

Tenure, property origin, entry path, and trigger are independent concepts. `HOME_BUYER` and `EXISTING_OWNER` must not be used as the future policy model.

The approved dimensions are:

- ownership state;
- property origin;
- homeowner entry path;
- active trigger type;
- trigger entity and source; and
- first-value type and delivery state.

### Safety tiers

1. Low consequence
2. Material financial
3. Regulated / coverage
4. Safety / emergency

Controls become stricter as consequence rises. Conversational fluency never substitutes for evidence or professional escalation.

### Commercial integrity

Any provider, purchase, or financing action must declare:

- whether a commercial action is involved;
- relationship type;
- whether compensation may occur;
- whether ranking was influenced;
- a plain-language summary;
- selection criteria; and
- at least one non-commercial alternative.

`NOT_RECORDED` is an invalid launch state for a commercial action.

## North-star operational definition

The north star is the percentage of eligible important home actions identified early and completed successfully.

An action is important when at least one reviewed reason applies:

- safety or active damage;
- material financial consequence;
- material deadline, right, coverage, or warranty consequence;
- homeowner-declared importance;
- a major-moment dependency; or
- a reviewed domain rule.

An action is identified early when it is surfaced on or before its action-window close.

Successful resolution means:

- completed and verified, or explicitly marked verification-not-required;
- intentionally deferred with a next trigger, acknowledged consequence, and no unresolved safety requirement;
- deliberately dismissed with acknowledged consequence and no unresolved safety requirement; or
- safely escalated with acknowledged handoff and no failed verification state.

The lineage is:

`entryId → triggerId → signalId → actionId → recommendationVersion → journeyId → decisionId → executionId → verificationId → outcomeId`

The corresponding typed analytics events are:

1. `ENTRY_CONTEXT_CAPTURED`
2. `ACTIVE_TRIGGER_IDENTIFIED`
3. `HOME_ACTION_IDENTIFIED`
4. `HOME_ACTION_SURFACED`
5. `HOME_ACTION_RESOLUTION_RECORDED`
6. `HOME_ACTION_OUTCOME_VERIFIED`

Orchestration now adapts its risk and checklist results into canonical `HomeAction` records. Important actions emit deduplicated entry, trigger, identified, and surfaced events. Completion emits a resolution event. Verification remains a distinct event and is never inferred merely from clicking complete.

The metric denominator is every important action explicitly eligible for measurement in the identified-action cohort. The numerator is the subset surfaced by the action-window close and subsequently verified as resolved. Synthetic QA, administrative, or otherwise excluded records must carry `metricEligibility: INELIGIBLE` in event metadata.

## Pre-user database policy

The Prisma event enum was updated because typed north-star events are a Phase 0 contract requirement. No migration script was created.

- There are no real users or production user data to backfill.
- The repository owner generates and applies the database migration.
- Development and test databases may be reset and reseeded afterward.
- Later schema changes should use clean cutovers rather than dual-read, dual-write, reconciliation, or compatibility layers.

## Internal-beta governance

Human attestations do not block testing while `ENFORCE_HUMAN_POLICY_APPROVALS` is not the exact string `true`. Technical safety and evidence contracts always remain active. See [governance modes](../governance-modes.md) for the Phase 0–6 audit and required real-user launch cutover.

## Phase 0 validation commands

```bash
npm -C apps/backend run prisma:generate
node --test apps/backend/tests/unit/productFrameworkContracts.test.js
npm -C apps/backend run build
npm -C apps/frontend run qa:product-framework:routes
npx tsc --noEmit -p apps/frontend/tsconfig.json
```

## Phase 1 prerequisites now unblocked

- persist the approved entry context;
- replace orchestration's explicit legacy entry identity with persisted entry context;
- adopt the approved source adapters on Phase 1 and Phase 2 surfaces as those surfaces cut over;
- build trigger-first onboarding;
- deliver evidence-bounded first value; and
- begin the unified Home read model.

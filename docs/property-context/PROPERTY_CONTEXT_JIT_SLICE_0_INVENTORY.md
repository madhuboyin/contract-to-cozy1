# Property Context Just-in-Time Capture — Slice 0 Inventory and Contract Lock

**Completed:** 2026-07-17

**Baseline:** `3d85cf5`

**Implementation scope unlocked:** Slice 1 scalar foundation

## Inventory summary

The baseline has one shared presentation component, `PropertyContextNotice`, used 79 times across 38 frontend files. Those notices consume legacy `FeatureDecision` envelopes produced by the protection, project/compliance, financial, planning, aggregation, maintenance, seasonal, environment, energy, DIY, emergency, and Plant Advisor policy families.

The baseline direct-capture path is:

```text
Feature response FeatureDecision
  -> PropertyContextNotice selects first locally-renderable missing fact
  -> propertyId parsed from correctionPaths
  -> PATCH /api/properties/:id/context/:factKey
  -> canonical Property / PropertyExteriorProfile / PropertyResponsibility write
  -> PropertyFactEvidence write
  -> full-page reload
```

The Slice 1 path replaces each architectural weakness in that chain: capture schemas and actions are backend-owned, the selected property is explicit, capture is idempotent and context-version checked, and the frontend re-evaluates in place.

## Active entry-point inventory

| Policy family | Frontend entry points found | Current contract | Primary correction behavior | Slice 1 disposition |
|---|---:|---|---|---|
| Protection | Appliance Oracle, Climate Risk, Visual Inspector, Risk Premium Optimizer, Event Radar, Risk Replay | Legacy applicability decisions | `PropertyContextNotice` plus catalog correction paths | Explicit property identity added to shared envelopes; scalar registry available |
| Financial | Repair/Replace, Capital Timeline, Reserve Fund, Ownership Costs, Do Nothing, Home Savings, Budget, True Cost, Cost Growth, Cost Volatility, Cost Explainer, Break Even, Tax Appeal, Value, Hidden Assets, Sell/Hold/Rent, Property Tax, Refinance, Financing | Legacy financial decision matrix | Notice plus tool/profile correction routes | Explicit property identity added; aggregate financing facts locked as relational, not scalar |
| Planning | Seller Prep, Timeline, Neighborhood Change, Community Events | Legacy planning decisions | Notice plus property/tool routes | Explicit property identity added; later feature adoption remains required |
| Project/compliance | Quote Comparison, provider/booking surfaces and project policy consumers | Legacy project/compliance decisions | Notice plus project, permit, HOA, provider routes | Explicit property identity added; relational flows remain Slice 3 |
| Aggregation/guidance | Action Center, Morning Pulse, Guidance Overview, Knowledge Targeting, Personalization, Home Gazette, Digital Twin/Will | Legacy aggregate decisions | Notice plus domain correction routes | Explicit property identity added; household answers remain outside base capture |
| Maintenance/seasonal | Maintenance task generation and seasonal checklist policy | Template-specific legacy decisions | Missing facts suppress/limit tasks; correction paths when surfaced | Scalar capture registry covers presence and responsibility facts; worker behavior remains non-interactive |
| Plant Advisor | Indoor/room advisor and outdoor applicability policy | Outdoor space and landscaping responsibility are evaluated in backend policy | Previously no governed required/enhancement capture contract | First explicit minimum-path contract locked and exposed by the new evaluator |
| Environment/energy/DIY/emergency | Environment report, energy recommendations, DIY and emergency policy consumers | Legacy applicability decisions | Correction paths or limited results | Scalar definitions exist for their current canonical property fields; adoption remains feature-owned |

### Frontend files rendering the compatibility notice

The 38-file baseline is:

- dashboard aggregation: `ActionsClient`, `BudgetForecaster`, `EquityOverviewCard`, `MorningHomePulseCard`, providers, personalization, community events, and Home Event Radar;
- property tools: Repair/Replace, Seller Prep, Timeline, Break Even, Capital Timeline, Cost Explainer, Cost Growth, Cost Volatility, Financing, Guidance Overview, Hidden Asset Finder, Home Digital Twin, Home Digital Will, Home Gazette, Home Risk Replay, Mortgage Refinance Radar, Neighborhood Change Radar, Property Tax, Quote Comparison, Reserve Fund, Sell/Hold/Rent, and True Cost;
- shared feature components: Appliance Oracle, Climate Risk Predictor, Tax Appeal Assistant, Visual Inspector, Do Nothing Simulator, Home Savings Check, Risk Premium Optimizer, and Knowledge Targeting Notice;
- the shared implementation itself: `PropertyContextNotice`.

This list is a compatibility-surface inventory, not a claim that every notice is a blocking prompt. A neutral notice can currently render for an applicable result; retirement of that compatibility behavior is Slice 5.

## Fact ownership and writable coverage

The catalog contained 53 facts marked `writable: true`. Direct capture actually supported 50 canonical scalar facts:

- 27 `Property` fields across core, location, structure, systems, and safety;
- 11 `PropertyExteriorProfile` fields;
- 12 `PropertyResponsibility` scopes.

Three catalog entries had no valid scalar command and are now locked non-writable for contextual scalar capture:

| Fact | Canonical meaning | Why it is not scalar-writable |
|---|---|---|
| `systems.hasCooling` | Derived from cooling type and installed inventory | Writing a boolean would fabricate or ambiguously mutate its owners |
| `financial.financingProfile` | Relational financing aggregate | Requires the financing domain workflow and financial controls |
| `financial.currentMortgage` | Relational financing aggregate | Requires the financing domain workflow and financial controls |

Every remaining catalog-writable fact has both an actual canonical command and a backend capture definition. Registry validation runs when the registry loads and fails on unknown facts, missing actions, owner drift, or writable-support drift.

## Required versus enhancement lock

Legacy policies expose applicable/not-applicable/unknown decisions and missing/conflicted keys but do not encode required versus enhancement classification. They remain compatibility contracts until adopted.

The first reviewed explicit contract is:

| Feature / operation | Fact | Classification | Condition | Priority |
|---|---|---|---|---:|
| `PLANT_ADVISOR / GENERATE_OUTDOOR_RECOMMENDATIONS` | `exterior.hasPrivateOutdoorSpace` | `REQUIRED_APPLICABILITY` | Always | 10 |
| same | `responsibility.landscaping` | `REQUIRED_APPLICABILITY` | Private outdoor space is true | 20 |
| same | `exterior.hasIrrigation` | `ENHANCEMENT_ACCURACY` | Private outdoor space is true | 30 |

Known absence of private outdoor space returns `NOT_APPLICABLE` and never asks landscaping or irrigation questions. Missing required facts block only outdoor recommendation generation. Missing irrigation permits execution with limitations and offers at most one enhancement in the evaluation response.

## Locked API contracts

- `POST /api/properties/:propertyId/context/feature-requirements/evaluate`
  accepts stable feature/operation keys and returns property ID, context version, readiness, reason codes, used facts, and a backend-owned capture schema.
- `POST /api/properties/:propertyId/context/captures`
  accepts an opaque requirement ID, registered capture key, explicit feature/operation, expected context version, idempotency key, and answer.
- Successful capture returns capture/evidence IDs, updated facts, the new context version, and an updated evaluation.
- Material version drift and idempotency-key reuse with a different answer return `409`.
- The fact-key `PATCH` endpoint remains only as a compatibility scalar-correction path. Its UI schema is now fetched from the backend registry and it no longer requires a full-page reload.
- Responses never expose canonical table/field routing.

## Slice 0 decisions

- Financial aggregates are not enabled in scalar capture and receive financial authentication/masking decisions with their relational flow.
- Enhancement dismissal is session-only in Slice 1; no cross-session deferral model is introduced yet.
- Capture copy is code-managed with schema/action metadata locked in the backend registry.
- Slice 1 does not allow homeowner conflict resolution; conflicts remain explicit and non-looping until a safe conflict type is registered.
- Explicit unknown observations for the migrated scalar facts do not receive a generic expiry. Feature-specific freshness rules may still make evidence stale.
- Contributors and owners can write current scalar property domains; viewers receive `PERMISSION_REQUIRED` with no enabled action.
- Existing related-record editors are not embedded during Slice 1; relational selection/creation remains Slice 3.

## Exit-gate result

Slice 0 passes its implementation gate:

- every registered explicit requirement references a catalog fact and capture definition;
- every catalog-writable scalar fact has one canonical owner, validation schema, command, and renderer schema;
- no derived or relational aggregate is advertised as scalar writable;
- the standard readiness, evaluation, and capture contracts are code-locked and registry-validated.

Feature-by-feature conversion of legacy decision envelopes is deliberately tracked as later adoption work; it does not create unknown fact keys or unowned write paths in the Slice 1 registry.

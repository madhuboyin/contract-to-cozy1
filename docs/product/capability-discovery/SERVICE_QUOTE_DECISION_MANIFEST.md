# Service Quote Decision Capability Manifest

**Last reconciled:** July 29, 2026

## Canonical capability

The capability registry represents the outcome family through Service Price
Radar:

| Field | Value |
|---|---|
| Capability ID | `service-price-radar` |
| Label | Service Price Radar |
| Outcome category | `DECIDE_COMPARE` |
| Safety tier | `MATERIAL_FINANCIAL` |
| Completion kind | `DECISION_RECORDED` |
| Mode | `CONTEXTUAL` / contextual canonical in the generated inventory |
| Rollout key | `SERVICE_PRICE_RADAR` |
| Canonical route | `/dashboard/properties/[id]/tools/service-price-radar` |

The homeowner-facing description is:

> Review a service quote, understand its scope, and decide what to do next.

`DECISION_RECORDED` means an explicit Service Quote Decision outcome. Creating
or viewing a price check does not satisfy completion.

## Stage capabilities

The registry retains Quote Comparison, Negotiation Shield, and Price
Finalization because they have valid direct-entry and deep-link routes:

- Quote Comparison is `WORKFLOW_ONLY`;
- Negotiation Shield and Price Finalization remain catalog/deep-link surfaces;
- when linked to a `QuoteComparisonWorkspace`, all three advance the same
  durable outcome identity;
- their presence in the inventory must not be interpreted as three additional
  completed homeowner outcomes.

Provider Booking and Project Tracker are separate execution capabilities that
may link back to the decision workspace.

## Contextual recommendation rule

Service Price Radar should be recommended contextually only when the property
state indicates quote intent or an active service decision, such as:

- a quote document or amount is present;
- a service recommendation is ready for quote review;
- multiple proposals need comparison;
- clarification, finalization, or booking is the next unresolved stage.

A system condition or generic maintenance need alone is insufficient evidence
that the homeowner has a quote to evaluate.

## Safety and copy rules

Capability and launch copy must preserve these distinctions:

- planning guidance is not market evidence;
- a qualified verdict requires reviewed, current, healthy provenance;
- price evidence is not provider verification;
- unusually low price creates a scope-verification action, never booking
  urgency;
- regulated professional-service categories are routed outside the generic
  engine.

## Sources of truth

- Definition: `apps/backend/src/productFramework/capabilities/definitions/decideCompare.ts`
- Generated inventory:
  `docs/product/capability-discovery/current-capability-inventory.md`
- Functional contract: `docs/functional/SERVICE_PRICE_RADAR.md`
- Contextual golden fixtures:
  `apps/backend/tests/fixtures/servicePriceRadar/contextualReadiness.golden.json`

If generated inventory differs from the capability definition, regenerate the
inventory rather than editing its rows manually.

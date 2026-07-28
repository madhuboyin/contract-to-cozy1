# ADR: Consolidate Ownership Cost Intelligence

- **Status:** Accepted
- **Date:** July 28, 2026
- **Decision owner:** Homeowner Product
- **Capability:** `ownership-costs`

## Context

True Cost, Cost Growth, Cost Explainer, and Cost Volatility expose four
different definitions and temporal interpretations of ownership cost. The
separate routes require the homeowner to choose an analytical mechanism before
the product has answered the underlying question.

Canonical tax, coverage, financing, expense, utility, HOA, project, reserve,
and property records must remain owned by their source domains. Ownership Costs
needs normalized references and reproducible calculations, not a competing
copy of those facts.

## Decision

One property-scoped capability owns the homeowner outcome:

`/dashboard/properties/[id]/ownership-costs`

The workspace exposes four progressive views:

1. `current` — current cost and completeness;
2. `changes` — comparable observed-period changes only;
3. `forecast` — forward forecasts and saved scenarios;
4. `variability` — evidence-gated variability and buffer planning.

The default lens is operating expense. Cash outflow, economic cost, capital
expenditure, and reserve planning remain separately named lenses.

The legacy routes preserve query context and redirect to the corresponding
canonical view:

| Legacy route | Canonical view |
| --- | --- |
| `tools/true-cost` | `current` |
| `tools/cost-explainer` | `changes` |
| `tools/cost-growth` | `forecast` |
| `tools/cost-volatility` | `variability` |

Generated output is engagement, not completion. Completion requires a recorded
homeowner decision or action.

## Source ownership

- Property Tax owns assessments, bills, rates, exemptions, appeals, and tax
  decisions.
- Coverage & Premium Review owns policies, terms, premiums, renewals, and
  coverage decisions.
- Financing owns loan terms, payment, principal, interest, PMI, and refinance
  decisions.
- Expenses and documents own observed transaction and source evidence.
- Capital Timeline owns planned projects and replacements.
- Reserve Fund owns reserve goals, contributions, and funding progress.
- Budget Planner owns household cash-flow decisions.

Ownership Costs consumes those facts by typed reference, normalizes periods,
calculates named lenses, and records cost-specific confirmations, scenarios,
and decisions.

## Consequences

- Navigation and discovery present one Ownership Costs outcome.
- Legacy analytics IDs converge on `ownership-costs`.
- Downstream tools must eventually consume versioned snapshots or forecasts.
- Legacy calculation services remain temporary compatibility implementations
  until canonical adapters and the read model replace them.
- No database migration, backfill, compatibility table, dual write, or
  synthetic observed-history record is created.

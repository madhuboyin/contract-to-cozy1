# ContractToCozy Revised P0-Safe Merge Table (Drop-in Replacement)

**Date:** April 18, 2026  
**Purpose:** Safe first-wave route merges with low regression risk.  
**Status:** Ready for engineering implementation.

---

## P0-Safe Merge Table

| Priority | Old Route Pattern | Canonical Route Pattern | Redirect Type | Param Handling | Why Safe |
|---|---|---|---|---|---|
| P0-safe | `/dashboard/coverage-intelligence` | `/dashboard/properties/:propertyId/tools/coverage-intelligence` | 307 resolver | Preserve all query params except `propertyId`; resolve property by query -> selected context -> first property -> `/dashboard/properties?navTarget=coverage-intelligence` | Canonical property tool route already exists and is functional |
| P0-safe | `/dashboard/risk-premium-optimizer` | `/dashboard/properties/:propertyId/tools/risk-premium-optimizer` | 307 resolver | Preserve all query params except `propertyId`; resolve property by query -> selected context -> first property -> `/dashboard/properties?navTarget=risk-premium-optimizer` | Canonical property tool route already exists and is functional |
| P0-safe | `/dashboard/home-savings` | `/dashboard/properties/:propertyId/tools/home-savings` | 307 resolver | Preserve all query params except `propertyId`; resolve property by query -> selected context -> first property -> `/dashboard/properties?navTarget=home-savings` | Canonical property tool route already exists and is functional |
| P0-safe | `/dashboard/do-nothing-simulator` | `/dashboard/properties/:propertyId/tools/do-nothing` | 307 resolver | Preserve all query params except `propertyId`; resolve property by query -> selected context -> first property -> `/dashboard/properties?navTarget=do-nothing` | Canonical property tool route already exists and is functional |
| P0-safe (already live) | `/marketplace` | `/dashboard/providers` | 308 | Preserve query as-is | Already implemented as direct server redirect |

---

## Deferred from Original P0 (Not Safe Yet)

| Old Mapping | Reason Deferred |
|---|---|
| `/dashboard/home-event-radar` -> property tools route | Loop risk: property route currently redirects back to global route |
| `/dashboard/home-renovation-risk-advisor` -> property tools route | Loop risk: property route currently redirects back to global route |
| `/dashboard/risk-radar` -> home-event-radar | Semantic mismatch (risk report vs event radar) |
| `/dashboard/inspection-report` -> property reports | Feature mismatch (inspection analyzer != report export ledger) |
| `/dashboard/checklist` -> `/dashboard/maintenance` | Buyer flow regression risk |
| `/dashboard/seasonal*` -> maintenance routes | Seasonal has distinct climate/checklist behavior |
| `/properties/[id]/rooms*` -> `/inventory/rooms*` | Different UX products, not aliases |
| `health-score/risk-assessment` -> `home-score?tab=*` | Canonical tab contract not implemented |

---

## Implementation Contract for P0-Safe

1. Use temporary 307-style resolver redirects first; convert to 308 only after one release cycle without incidents.
2. Emit analytics event `route_redirected` with `{ oldRoute, canonicalRoute }`.
3. Validate no redirect loops for direct URL access and in-app nav.
4. Keep legacy links operational for at least two releases.


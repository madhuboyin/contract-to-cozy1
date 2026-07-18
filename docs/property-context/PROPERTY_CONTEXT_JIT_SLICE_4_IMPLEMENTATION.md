# Property Context JIT — Slice 4 feature adoption, tranche 1

Date: 2026-07-17

## Release boundary

This tranche adopts the first value/risk group from the FRD and closes the gap between advisory frontend readiness and backend execution enforcement.

| Feature surface | Shared UI | Execution-time enforcement | Status |
|---|---|---|---|
| Plant Advisor outdoor recommendations | Existing structured outdoor panel | Shared `PLANT_ADVISOR / GENERATE_OUTDOOR_RECOMMENDATIONS` evaluation now runs immediately before garden-zone mutations; the established domain applicability policy remains as defense in depth | Adopted |
| Maintenance Setup installed systems | Relational inventory select/create panel | Canonical `InventoryItem` creation advances `systems.installedItemTypes`; template creation retains its existing backend applicability check | Adopted |
| Maintenance safety templates | Progressive detector group appears only when safety templates are unknown | `MAINTENANCE / GENERATE_SAFETY_TASKS` runs before smoke/CO template creation, followed by the existing template policy | Adopted |
| Coverage Intelligence | Insurance policy relational enhancement from Slice 3 | Coverage calculation behavior remains nonblocking when no policy exists | Previously adopted |

## Maintenance behavior

Maintenance Setup evaluates installed-system context for the explicitly selected property. If no recognized installed type exists, the homeowner can add the minimum canonical inventory record without leaving the page. Once that requirement is ready, the page evaluates whether any smoke or carbon-monoxide template is blocked by unknown detector context and presents the registered safety group only when needed.

Successful capture invalidates the property-keyed maintenance-template query. The existing applicability service then recalculates each template from the new canonical snapshot; no full-page reload or correction redirect is used.

The installed-system requirement now reads the derived `systems.installedItemTypes` collection rather than treating any inventory record as sufficient. Its relational capture owns both the canonical inventory collection and that derived system fact, while persistence remains solely in `InventoryItem`.

## Backend enforcement

- Outdoor Plant Advisor mutations fail with `PLANT_ADVISOR_CONTEXT_REQUIRED` when the shared operation is not executable.
- Smoke/CO maintenance template creation fails with HTTP 422 and the fresh shared evaluation when required safety context is missing.
- The pre-existing Plant Advisor and maintenance applicability policies remain active after shared evaluation. They still own domain-specific not-applicable decisions and duplicate-task suppression.
- Frontend readiness does not authorize either operation.

## Deferred adoption

The next Slice 4 tranche should add operation-specific shared contracts for HVAC, plumbing, exterior, and responsibility-dependent maintenance templates, then continue through incidents, claims, insurance, and warranties. Generic Property Context notices elsewhere remain compatibility renderers until their feature-specific contracts pass the same UI and execution release gate.

No Prisma schema change or migration is required for this tranche.

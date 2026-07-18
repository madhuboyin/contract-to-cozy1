# Property Context JIT — Slice 3 inventory and initial implementation

Date: 2026-07-17
FRD baseline: `3d85cf5`

## Inventory and contract lock

Slice 3 must delegate to the domain model that already owns each relationship. It must not add a generic relational fact writer.

| Domain | Canonical owner and existing command surface | Inline minimum | Duplicate / integrity boundary | Slice 3 status |
|---|---|---|---|---|
| Inventory and installed systems | `InventoryItem`; `inventory.service.ts` | Name, category, condition | Property ownership; normalized name within category; existing appliance-specific uniqueness remains in the full editor | Implemented in shared adapter |
| Insurance policies | `InsurancePolicy`; `home-management.service.ts` | Carrier, policy number, coverage type, premium, start and expiry dates | Property ownership; normalized carrier plus policy number; expiry after start | Implemented and adopted by Coverage Intelligence |
| Warranties | `Warranty`; `home-management.service.ts` | Provider, category, start and expiry dates; optional policy number | Homeowner/property ownership; normalized identity and valid date range | Implemented in Slice 4 claim adoption |
| Inspections and findings | `InspectionReport` / `InspectionFinding`; inspection import, confirmation, and write-back services | Existing report selection or finding-specific fields | Confirmed-report lifecycle and evidence provenance must remain intact | Inventoried; adapter deferred |
| Maintenance completion | `PropertyMaintenanceTask`; `PropertyMaintenanceTask.service.ts` | Task selection and completion evidence required by the invoked action | Assignee/property authorization and completion idempotency | Inventoried; adapter deferred |
| Projects | `ProjectRecord` and project execution services | Project selection or title/type/status for a new record | Property ownership; project lifecycle and financial rollups | Inventoried; adapter deferred |
| Permits | `PropertyPermitRecord`; `permitTracker.service.ts` | Permit selection or jurisdiction/type/status when manually added | Property ownership; external/manual identity and milestone lifecycle | Inventoried; adapter deferred |
| HOA | HOA property profile and HOA tool services | Existing profile selection or the specific rule/fee needed by the feature | Property ownership and governing-document provenance | Inventoried; adapter deferred |
| Financing | `PropertyFinancingProfile` and financing services | Existing profile/scenario or calculation-specific terms | Property ownership, financial sensitivity, decimal/date validation | Inventoried; adapter deferred |

The initial contract is intentionally narrow. Inventory and insurance have stable canonical models, clear property relationships, and useful minimum records. Inspection, permit, maintenance-completion, and financing commands have lifecycle or evidence semantics that should not be bypassed by a thin create call.

## Implemented contract

- `RELATIONAL_SELECT_CREATE` is a backend-owned input schema. It contains opaque entity options and a minimal create-field contract; it never exposes a route or table name.
- Internal `relationalAdapterKey` values are allowlisted and removed from evaluation responses.
- Dynamic options are resolved by property ID on the backend.
- `minimumItems` lets a feature distinguish an empty canonical collection from a usable collection.
- `MAINTENANCE / SET_UP_INSTALLED_SYSTEMS` classifies the first recognized installed item/system type as `REQUIRED_CALCULATION`.
- `COVERAGE_INTELLIGENCE / ASSESS_PROPERTY_COVERAGE` classifies the first policy as `ENHANCEMENT_ACCURACY`, so the existing empty-coverage result remains available.
- Selection and creation run in the same transaction as the idempotency receipt and relational evidence row.
- The capture response includes an opaque selection result: entity type, entity ID, and whether it was created.

## Canonical behavior

Inventory creation writes `InventoryItem` with manual source metadata. Insurance creation writes `InsurancePolicy` connected to both the property and its homeowner profile. Existing-record selection verifies the entity belongs to the explicit route `propertyId`. Duplicate candidates are rejected with a direction to select the existing record.

No Prisma schema change or migration script is required for this tranche. Existing `PropertyContextCaptureReceipt` and `PropertyFactEvidence` records cover idempotency and audit provenance.

## Frontend adoption

The shared `PropertyContextCapturePanel` now provides:

- keyboard-operable select/add tabs;
- property-scoped existing-record choices;
- backend-described minimal create fields;
- in-place capture and re-evaluation;
- an `onCaptured` callback for invoking features that need the selected entity ID.

Coverage Intelligence adopts the insurance-policy enhancement. With no policy on record, it continues to show its current result and offers an inline minimal policy flow. Saving creates the canonical policy and removes the enhancement prompt without a page reload.

## Validation gate

The Slice 3 tranche is complete when these commands pass:

```text
apps/backend: npm run build
apps/backend: node --test tests/unit/propertyContextJustInTimeSlice3.test.js
apps/frontend: npm run build
apps/workers: npm run build
npx prisma validate --schema=apps/backend/prisma/schema.prisma
git diff --check
```

## Next relational tranche

1. Adopt the inventory mini-flow at a maintenance or repair/replace invocation that can consume `selection.entityId` directly.
2. Add warranty select/create through its existing coverage invalidation command.
3. Define lifecycle-preserving adapters for maintenance completion and inspection findings.
4. Add project/permit/HOA adapters, then financing behind the financial-sensitivity presentation and authorization gate.

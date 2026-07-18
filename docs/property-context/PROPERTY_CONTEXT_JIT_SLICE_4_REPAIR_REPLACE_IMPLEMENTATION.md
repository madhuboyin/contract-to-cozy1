# Property Context JIT — Slice 4 Repair vs. Replace adoption

Date: 2026-07-17

## Release boundary

This tranche adopts item-level Repair vs. Replace as the first Slice 4 decision-support surface. The existing route already identifies both `propertyId` and `itemId`, so the inline workflow updates that selected canonical item rather than asking the user to select or create a different inventory record.

## Minimum contract

`REPAIR_REPLACE / RUN_ANALYSIS` has no new blocking requirements. The selected inventory item continues to be enforced by the existing financial-context applicability policy. Incomplete lifecycle data is classified as `ENHANCEMENT_ACCURACY`: the prompt appears when the selected item has an unknown condition or has neither an install nor purchase date.

The backend-owned `INVENTORY_ITEM_LIFECYCLE_UPDATE` schema exposes condition, optional install date, and optional purchase date. Schema resolution uses `operationInput.inventoryItemId`, verifies that the item belongs to the explicit property, and pre-fills current canonical values.

## Scoped canonical persistence

Capture accepts only an `UPDATE` for the entity ID bound to `operationInput.inventoryItemId`. The relational adapter verifies property ownership again inside the transaction, validates the condition and date-only values, rejects future dates, and updates `InventoryItem`. It does not create duplicate inventory items or write tool-local shadow context.

## In-place re-evaluation

The Repair vs. Replace page replaces `PropertyContextNotice` with `PropertyContextCapturePanel`. After capture, the shared orchestrator re-evaluates the contract in place and the page refetches the item without reloading. Newly available lifecycle data may fill previously blank defaults, while user-entered repair cost, replacement cost, remaining years, cash buffer, risk tolerance, and usage intensity remain intact.

The run endpoint also evaluates shared feature context before invoking the canonical analysis service. Because this contract contains only an enhancement, incomplete lifecycle data never blocks analysis.

## Persistence and schema

The existing `InventoryItem.condition`, `installedOn`, and `purchasedOn` fields remain canonical. No Prisma schema change or migration is required.

# Phase 0 Consolidation Decision

Date: 2026-07-17

## Physical item identity

`InventoryItem` is the only canonical physical-item and installed-system record.
It owns system type, installation date, service date, efficiency, identity,
condition, cost, coverage, verification, and technical facts.

`HomeAsset` has been removed. New risk-derived systems are materialized as
`InventoryItem` records, and warranties, maintenance, recalls, guidance,
quotes, price finalization, material specs, permits, and analyses reference the
canonical inventory item.

`HomeItem` is retained because the Status Board is an audited consumer of its
status and event lifecycle. It is a one-to-one projection of `InventoryItem`:
`inventoryItemId` is required and unique, and the former kind union and
`homeAssetId` branch have been removed. `HomeItem` does not own physical facts.

## Financing identity

`PropertyFinancingProfile` is the only current purchase and mortgage source.
`EquityPosition` remains an append-only computed equity snapshot. Feature run
and scenario records remain historical projections and do not become canonical
inputs.

`PropertyFinanceSnapshot` and its API route have been removed. Break-Even and
Sell/Hold/Rent use a read-only canonical mortgage adapter over
`PropertyFinancingProfile`. Property create/edit accepts purchase fields for UI
continuity but persists them to `PropertyFinancingProfile`; responses project
those canonical values without storing duplicates on `Property`.

## Schema application

No database migration scripts are included. The schema changes must be applied
by the repository owner using the chosen database schema workflow.


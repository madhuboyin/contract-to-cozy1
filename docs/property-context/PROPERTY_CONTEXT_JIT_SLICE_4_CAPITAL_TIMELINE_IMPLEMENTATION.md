# Property Context JIT — Slice 4 Capital Timeline adoption

Date: 2026-07-17

## Release boundary

This tranche adopts the interactive Capital Timeline while preserving its analysis history, financial assumptions, item-level overrides, inventory editor, alerts, and downstream Reserve Fund recomputation.

## Minimum contract

`CAPITAL_TIMELINE / RUN_TIMELINE` is intentionally nonblocking. A timeline can be empty or partially populated without claiming completeness, so the contract contains two `ENHANCEMENT_ACCURACY` requirements and no required facts:

1. when the property has no inventory items, offer the existing backend-owned inventory select/create capture;
2. when a displayed timeline item lacks a known condition or install/purchase date, offer the scoped inventory lifecycle update introduced by Repair vs. Replace.

The lifecycle enhancement is activated only with an explicit `operationInput.inventoryItemId`. This prevents a global timeline evaluation from guessing which canonical inventory record should be changed. The client selects the first displayed item missing lifecycle confidence factors; after each capture, re-analysis can advance the enhancement to the next affected item.

## Canonical ownership

Item identity, condition, and install/purchase dates remain owned by `InventoryItem`. Planned dates, remaining-life adjustments, cost estimates, disabled items, and notes remain owned by `HomeCapitalTimelineOverride`. The shared flow does not duplicate either model or convert timeline preferences into global inventory facts.

## In-place continuation

The page replaces `PropertyContextNotice` with `PropertyContextCapturePanel`. Successful capture automatically reruns the current horizon with the active financial assumption set. Existing chart state, expanded rows, item overrides, and other local workspace state remain mounted; no page reload occurs.

The run endpoint evaluates the shared contract after the existing financial applicability policy and before canonical timeline computation. Because all new requirements are enhancements, missing inventory or lifecycle details do not block a partial timeline.

## Background behavior and schema

Reserve Fund worker recomputation remains noninteractive and does not evaluate or launch capture prompts. No Prisma schema change or migration is required.

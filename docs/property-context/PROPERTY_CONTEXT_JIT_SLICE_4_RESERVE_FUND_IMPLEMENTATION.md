# Property Context JIT — Slice 4 Reserve Fund adoption

Date: 2026-07-17

## Release boundary

This tranche adopts the interactive Reserve Fund Planner while preserving its posture model, contribution ledger, line-item retirement evidence, expense reconciliation, calculation history, guidance signals, and scheduled safety-net recomputation.

## Minimum contract

`RESERVE_FUND / RECALCULATE` requires at least one canonical inventory item as `REQUIRED_CALCULATION`. Without an included capital item, the planner cannot construct a meaningful savings target and must continue to label its figures as unavailable rather than zero.

Condition and install/purchase dates are `ENHANCEMENT_ACCURACY` inputs. The page selects the first active Reserve Fund line item with incomplete lifecycle data and sends its explicit `inventoryItemId` to the backend-owned lifecycle schema. Missing enhancements never disable an otherwise meaningful plan.

## In-place plan construction

The page replaces `PropertyContextNotice` and the primary Capital Timeline correction redirects with `PropertyContextCapturePanel` and a local “Build reserve plan” action. After item creation or lifecycle capture, it runs Capital Timeline with the fund horizon and requests awaited Reserve Fund synchronization. The refreshed plan appears without leaving or reloading the page.

Capital Timeline retains its normal asynchronous Reserve Fund update for every other caller. Only the explicit inline Reserve Fund workflow sets `synchronizeReserveFund`, allowing the service to await its existing canonical recalculation before the client reloads.

## Canonical ownership

- Item identity, condition, and lifecycle dates remain owned by `InventoryItem`.
- Replacement timing and cost refinements remain owned by `HomeCapitalTimelineOverride`.
- Savings posture, current balance, contribution history, calculated allocations, and retirement state remain owned by the existing Reserve Fund models.

No shadow financial fields or duplicate line items are introduced.

## Execution and worker boundaries

Manual recalculation and posture changes enforce the shared contract after the existing financial applicability policy and before canonical recalculation. Contribution, withdrawal, retirement, and reconciliation commands remain usable because they operate on existing financial evidence rather than constructing a new forecast.

Scheduled workers retain their dedicated noninteractive context/currentness checks and never launch capture prompts.

## Schema

No Prisma schema change or migration is required.

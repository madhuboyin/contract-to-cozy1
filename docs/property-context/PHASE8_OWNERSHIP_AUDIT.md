# Phase 8 Financial, Item, and Snapshot Ownership Audit

Date: 2026-07-17

## Decision

The Phase 0 ownership model remains valid and is now enforced at active API,
service, and persisted-analysis boundaries:

- `PropertyFinancingProfile` owns current financing facts. Tool projections may
  convert cents/basis points for presentation, but they do not become a second
  current-finance record.
- `InventoryItem` owns physical-item identity and facts. Property setup exposes
  a small `majorAppliances` projection backed by those rows; it does not create
  another asset model.
- `HomeItem` remains a one-to-one operational status projection and owns only
  its status/event lifecycle.
- Persisted analyses, runs, scenarios, and snapshots own historical outputs and
  reproducibility evidence. They must not be queried as current canonical facts.

## Corrections implemented

1. `CoverageAnalysis.inventoryItemId` is now a typed optional relation with a
   recency index. Item analyses write and query this relation directly.
   `inputsSnapshot` remains calculation evidence and is no longer parsed to
   discover item ownership.
2. Property-level coverage consumers explicitly require
   `inventoryItemId = null`; item consumers require a concrete item relation.
   This prevents a recent item run from masquerading as the property's current
   coverage analysis or receiving a property-level scenario.
3. The unused `/api/home-management/home-assets` compatibility endpoint and its
   InventoryItem-to-HomeAsset mapper were removed.
4. Property create/edit uses `majorAppliances`, and warranty setup uses
   `inventoryItemId` plus an InventoryItem-backed appliance projection.
5. Sell/Hold/Rent, Refinance Radar, Break-Even, and sidebar copy now name the
   canonical financing profile instead of a removed finance snapshot.
6. Personalization, Home Risk Replay, Budget Forecaster, property scoring, and
   Appliance Oracle internal readers now use InventoryItem terminology.

## Retained persisted projections

The following categories are intentionally retained because they have distinct
ownership and lifecycle semantics:

| Category | Models | Ownership rule |
| --- | --- | --- |
| Current canonical finance | `PropertyFinancingProfile` | One mutable row per property; sole current mortgage/purchase source |
| Computed finance history | `EquityPosition`, `RefinanceOpportunity` | Append-only or dated computed observations; never current-input authorities |
| Market observations | `MortgageRateSnapshot`, `HomeScoreBenchmarkSnapshot` | Dated external/benchmark facts with source and effective time |
| User scenarios | `FinancingScenario`, `CoverageScenario`, `DoNothingScenario`, `HomeTwinScenario`, `RefinanceScenarioSnapshot` | User-owned hypothetical inputs/results, explicitly saved or scoped |
| Feature analyses/runs | `CoverageAnalysis`, `ReplaceRepairAnalysis`, `RiskPremiumOptimizationAnalysis`, `NegotiationShieldAnalysis`, `HomeCapitalTimelineAnalysis`, `DoNothingSimulationRun`, `HomeSavingsRun`, `HomeRiskReplayRun`, `PropertyHiddenAssetScanRun`, `HomeTwinComputationRun`, `PersonalizationEvaluationRun` | Historical feature outputs tied to property/source entities and computation time |
| Score/report history | `PropertyInsightSnapshot`, `PropertyScoreSnapshot`, `PropertyDailySnapshot`, `IncidentScoreSnapshot`, HomeScore run/integrity models | Auditable point-in-time output; current UI selection uses explicit recency/lifecycle rules |
| Operational projections | `HomeItem` and its status/event rows, current refinance radar state | Derived operational state with an explicit canonical source relation |

Admin analytics/cohort snapshots are outside Property Context fact ownership and
remain analytics-owned aggregates.

## Schema application

This slice adds the nullable `coverage_analyses.inventoryItemId` foreign key and
index. No database migration script is included. The repository owner must
apply the Prisma schema through the chosen database schema workflow.

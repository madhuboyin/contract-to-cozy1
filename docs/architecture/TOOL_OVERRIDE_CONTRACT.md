# Saved tool overrides — contract

**Source of truth:** `apps/backend/src/services/toolOverrideContract.ts`. This document explains it; the code defines it. Read this before adding an override, a tool, or a caller that reads or writes `ToolOverride` rows.

## What a saved override is

A saved override is a **scenario input for one tool**, stored per property in `ToolOverride` (`propertyId`, `toolKey`, `key`, `value`). It is not part of the Home Record. Saving one never updates `lastAppraisedValue`, the purchase price, the financing profile or any other canonical property field. Updating the Home Record is a separate, explicit step the user takes on the property.

## One key convention

- A row's `key` is the **UPPER_SNAKE** name in the table below. That is what the pages save, what `GET /api/properties/:id/tool-overrides` returns and what the estimator's boundary translates.
- There is no second spelling. `homeValueNow`, `home_value_now` and any other form are **not** keys. A row stored under one is ignored with reason `UNSUPPORTED_KEY`. (The Prisma comment on `ToolOverride.key` used to document camel-case names; it now points here.)
- Do not read `ToolOverride` rows anywhere else. Use `parseToolOverrides` / `parseSellHoldRentOverrides`. The estimator receives values in its own typed input shape (`SellHoldRentInput`), never raw rows.

## Sell / Hold / Rent (`toolKey = SELL_HOLD_RENT`)

Units: rates are decimals (`0.035` = 3.5%); money is whole US dollars (rent and payment are per month). Bounds are inclusive.

| Persisted key | Estimator field | Unit | Valid range |
| :--- | :--- | :--- | :--- |
| `HOME_VALUE_NOW` | `homeValueNow` | USD | 10,000 – 100,000,000 |
| `MONTHLY_RENT_NOW` | `monthlyRentNow` | USD / month | 100 – 1,000,000 |
| `APPRECIATION_RATE` | `appreciationRate` | decimal | 0 – 0.15 |
| `SELLING_COST_RATE` | `sellingCostRate` | decimal | 0.01 – 0.12 |
| `INFLATION_RATE` | `inflationRate` | decimal | 0 – 0.20 |
| `PROPERTY_TAX_GROWTH_RATE` | `propertyTaxGrowthRate` | decimal | 0 – 0.20 |
| `INSURANCE_GROWTH_RATE` | `insuranceGrowthRate` | decimal | 0 – 0.20 |
| `MAINTENANCE_GROWTH_RATE` | `maintenanceGrowthRate` | decimal | 0 – 0.20 |
| `RENT_GROWTH_RATE` | `rentGrowthRate` | decimal | 0 – 0.10 |
| `VACANCY_RATE` | `vacancyRate` | decimal | 0 – 0.25 |
| `MANAGEMENT_RATE` | `managementRate` | decimal | 0 – 0.20 |
| `MORTGAGE_BALANCE` | `mortgageBalance` | USD | 1 – 100,000,000 |
| `MORTGAGE_ANNUAL_RATE` | `mortgageAnnualRate` | decimal | 0 – 0.25 |
| `REMAINING_TERM_MONTHS` | `remainingTermMonths` | whole months | 1 – 600 |
| `MONTHLY_PAYMENT` | `monthlyPayment` | USD / month | 1 – 1,000,000 |

The Sell/Hold/Rent page currently offers the first two, `APPRECIATION_RATE`, `SELLING_COST_RATE`, `RENT_GROWTH_RATE`, `VACANCY_RATE` and `MANAGEMENT_RATE`. The rest are accepted by the contract and honoured by the estimator but have no editor yet.

## Validation: never coerced

- **On read** (the estimator): each row is checked. A row that is unsupported, not a finite number, not a whole number where one is required, or out of range is **left out** and returned in `ignored` with a reason (`UNSUPPORTED_KEY`, `NOT_A_FINITE_NUMBER`, `NOT_AN_INTEGER`, `OUT_OF_RANGE`) and a plain-language `detail`. Nothing is clamped or rounded to make it fit. Ignored rows are logged and reported on the estimate as `meta.ignoredSavedOverrides`; the page lists them.
- **On write** (`PUT /api/properties/:id/tool-overrides`): the body is checked against the same contract. One invalid row rejects the whole write with `400 TOOL_OVERRIDE_INVALID` and `details.issues`; nothing is saved. A tool with no contract returns `400 TOOL_OVERRIDE_UNSUPPORTED_TOOL`. A `null` value **clears** that key, so "leave blank to use the default" is true.
- The bounds are the estimator's own limits where it has them, so an accepted value is used exactly as saved.

## Precedence

For **home value**: request value (a what-if) → valid saved `HOME_VALUE_NOW` → `lastAppraisedValue` → purchase price, disclosed as a fallback → otherwise the homeowner is asked for a planning value (see `planningHomeValue.ts`). There is no silent default.

For **rates**: request values → an assumption set chosen for the run → valid saved overrides → the engine's modelled defaults. Saved overrides stand in for the modelled defaults. (Passing them as "fallbacks" does not work: the resolver only uses fallbacks where nothing else supplied a value, and the modelled defaults supply every rate.)

For **rent, vacancy, management and the mortgage fields**: request value → valid saved override → the canonical source or heuristic.

## Adding an override or a tool

1. Add a spec (key, estimator field, unit, bounds, label) to the tool's list in `toolOverrideContract.ts`.
2. Read the translated field in the estimator. Do not read rows or invent a key.
3. Add a test that the key changes the estimate and that a malformed value does not (see `tests/unit/sellHoldRentSavedOverrides.test.js`).
4. A new tool needs its own entry in `TOOL_OVERRIDE_CONTRACTS`; there is no free-form key space.
5. Keep the UI copy honest: a saved override is a scenario input and does not change the Home Record.

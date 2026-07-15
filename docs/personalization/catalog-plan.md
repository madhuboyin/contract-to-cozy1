# Personalization catalog — Phase 0 content plan

Status: **DRAFT / PLANNING ONLY**. This is the "20–40 definition content plan"
deliverable named in `09-implementation-roadmap.md`'s Phase 0 scope — a list
of candidate definitions. Except for the focused Phase 2.5 additions called
out below, entries are names, categories and one-line intents only.

No entry is approved merely because it appears in this plan. The focused
Phase 2.5 entries identified below have authored DRAFT eligibility and content;
the remaining candidates do not. Per `03-feasibility-study.md`, an authored
`RecommendationRule` and `RecommendationContentVersion` require "immutable
version, author/reviewer,
rationale, effective/review dates, source references, safety class, test
fixtures and audit record. Publish is two-person for safety-sensitive advice."
Nothing here should be treated as pre-approved content — it exists so
Phase 1 has a starting list to review against, and so the schema/fixture
scaffolding built in Phase 0 has real-shaped codes to validate against.

The original eight planning categories are followed by two focused Phase 2.5
categories. `safetyClass` follows the `RecommendationDefinition.safetyClass`
column added in Phase 0's schema baseline (`ROUTINE` vs `SAFETY_SENSITIVE` —
the latter needs the two-person review the docs call for before it could ever
go `ACTIVE`).

## Pet-adjusted filters

| Code | Target module | Safety class | Intent |
|---|---|---|---|
| `hvac_filter_pet_adjusted` | Maintenance | ROUTINE | Shorten the recommended HVAC filter replacement interval when a high-shedding pet is present. |
| `vacuum_filter_pet_adjusted` | Maintenance | ROUTINE | Recommend more frequent vacuum filter/bag changes for multi-pet households. |
| `air_purifier_pet_suggestion` | Health | ROUTINE | Suggest considering an air purifier for multi-pet, allergy-sensitive households. |

## Pet / fence question / inspection

| Code | Target module | Safety class | Intent |
|---|---|---|---|
| `fence_integrity_check_pet_owner` | Maintenance | ROUTINE | Prompt a fence-integrity inspection for households with yard-access pets. |
| `pet_door_weatherproofing_check` | Maintenance | ROUTINE | Seasonal weatherstripping check for pet doors. |
| `yard_hazard_pet_walkthrough` | Health | ROUTINE | Seasonal yard walkthrough for pet-relevant hazards (home/yard condition only — no medical or veterinary advice). |

## Aging-in-place home safety

| Code | Target module | Safety class | Intent |
|---|---|---|---|
| `grab_bar_bathroom_suggestion` | Health | SAFETY_SENSITIVE | Suggest grab-bar installation in bathrooms for aging-in-place households. |
| `stair_railing_check` | Health | SAFETY_SENSITIVE | Prompt a stair railing and lighting safety check. |
| `nightlight_pathway_suggestion` | Health | ROUTINE | Suggest nightlight/pathway lighting for reduced-mobility households. |
| `threshold_trip_hazard_check` | Health | SAFETY_SENSITIVE | Check for raised thresholds and other trip hazards. |

## Travel preparation

| Code | Target module | Safety class | Intent |
|---|---|---|---|
| `pre_travel_home_checklist` | Maintenance | ROUTINE | Suggest a pre-travel checklist (water shutoff, thermostat setback, timer lights) before an extended absence. |
| `mail_hold_reminder` | Dashboard | ROUTINE | Reminder to arrange mail hold during a travel window. |
| `pipe_freeze_prevention_travel` | Maintenance | SAFETY_SENSITIVE | Cold-climate pipe-freeze prevention check before winter travel. |

## WFH comfort

| Code | Target module | Safety class | Intent |
|---|---|---|---|
| `home_office_lighting_suggestion` | Dashboard | ROUTINE | Suggest improved task lighting for a home-office setup. |
| `ergonomic_desk_setup_reminder` | Dashboard | ROUTINE | Reminder to review desk/chair ergonomics. |
| `internet_backup_suggestion` | Dashboard | ROUTINE | Suggest a backup connectivity plan for WFH households. |

## Budget posture

| Code | Target module | Safety class | Intent |
|---|---|---|---|
| `deferred_maintenance_budget_alert` | Dashboard | ROUTINE | Flag accumulating deferred-maintenance cost for budget-conscious households. |
| `diy_vs_pro_cost_tip` | Maintenance | ROUTINE | Offer a DIY-vs-professional cost comparison for lower-budget-posture households. |
| `seasonal_cost_smoothing_tip` | Dashboard | ROUTINE | Suggest spreading seasonal maintenance costs across months. |

## Seasonal / weather preparations

| Code | Target module | Safety class | Intent |
|---|---|---|---|
| `gutter_cleaning_seasonal` | Maintenance | ROUTINE | Seasonal gutter-cleaning reminder ahead of fall/spring. |
| `hvac_seasonal_tuneup` | Maintenance | ROUTINE | Seasonal HVAC tune-up reminder ahead of extreme-temperature seasons. |
| `storm_prep_checklist` | Risk & Climate | SAFETY_SENSITIVE | Pre-storm-season preparation checklist for the property's climate region. |
| `winterization_checklist` | Maintenance | SAFETY_SENSITIVE | Winterization checklist (hose bibs, exposed pipes) for cold climates. |

## Low-cost prevention

| Code | Target module | Safety class | Intent |
|---|---|---|---|
| `smoke_co_detector_battery_check` | Maintenance | SAFETY_SENSITIVE | Smoke/CO detector battery-check reminder. |
| `caulking_weatherstripping_check` | Maintenance | ROUTINE | Low-cost caulking/weatherstripping check to reduce energy loss. |
| `water_heater_flush_reminder` | Maintenance | ROUTINE | Annual water heater flush reminder. |
| `dryer_vent_cleaning_reminder` | Maintenance | SAFETY_SENSITIVE | Dryer vent cleaning reminder (fire-prevention, low cost). |

## Phase 2.5 focused showcase additions

These two entries have now advanced beyond plan-only status: version 1 rule
and content rows are included in the canonical bootstrap as `DRAFT` for human
review and activation.

| Code | Target module | Safety class | Intent |
|---|---|---|---|
| `smoke_detector_installation_review` | Maintenance | SAFETY_SENSITIVE | Confirm a property record that indicates smoke detectors are not installed and prompt a coverage review. |
| `aging_roof_condition_review` | Health | ROUTINE | Prompt a condition and service-history review when the recorded roof replacement year is at least 25 years ago. |

## Totals

29 candidate codes across 10 categories — within the roadmap's 20–40 target
range. 10 are marked `SAFETY_SENSITIVE` and would need the docs' two-person
review before ever reaching `ACTIVE`; the remaining 19 are `ROUTINE`.

## What Phase 0 does and doesn't do with this list

- Does: keep candidate codes in the typed plan for fixture coverage. It does
  not seed every speculative candidate into the database.
- Does: add only implemented focused-tranche definition, rule and content
  versions to `seedPersonalization.sql`, all with `status: DRAFT`.
- Does: use these exact codes as the target set for the golden-fixture
  framework (`apps/backend/src/personalization/catalog/`), so the fixture
  lint has something concrete to check coverage against.
- Does not: write rule or content versions for the remaining plan-only
  candidates.
- Does not: get anything on this list reviewed/approved by Product, Content,
  Legal, or Security — that review is a Phase 1 prerequisite for moving any
  single definition past `DRAFT`.

// apps/backend/src/modules/personalization/catalog/catalogPlan.ts
//
// Typed mirror of docs/personalization/catalog-plan.md's Phase 0 content
// plan. This is a PLAN, not authored content — no rule logic, no advice
// copy. It exists as the target-code list validateFixtures.ts checks fixture
// coverage against. It is not a database seed source. The canonical pgAdmin
// bootstrap contains only implemented focused-tranche definitions and leaves
// all of them DRAFT until review.
// Keep this file and catalog-plan.md in sync — this is the source of truth
// for tooling, the doc is the source of truth for humans reviewing the plan.

export type CatalogSafetyClass = 'ROUTINE' | 'SAFETY_SENSITIVE';
export type CatalogPlanStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'RETIRED';

export interface CatalogPlanEntry {
  code: string;
  category: string;
  targetModule: string;
  safetyClass: CatalogSafetyClass;
  intent: string;
  // All Phase 0 plan entries start DRAFT — none are reviewed/active yet.
  status: CatalogPlanStatus;
}

export const CATALOG_PLAN: readonly CatalogPlanEntry[] = [
  // Pet-adjusted filters
  { code: 'hvac_filter_pet_adjusted', category: 'pet_adjusted_filters', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Shorten the recommended HVAC filter replacement interval when a high-shedding pet is present.', status: 'DRAFT' },
  { code: 'vacuum_filter_pet_adjusted', category: 'pet_adjusted_filters', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Recommend more frequent vacuum filter/bag changes for multi-pet households.', status: 'DRAFT' },
  { code: 'air_purifier_pet_suggestion', category: 'pet_adjusted_filters', targetModule: 'Health', safetyClass: 'ROUTINE', intent: 'Suggest considering an air purifier for multi-pet, allergy-sensitive households.', status: 'DRAFT' },

  // Pet / fence question / inspection
  { code: 'fence_integrity_check_pet_owner', category: 'pet_fence_inspection', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Prompt a fence-integrity inspection for households with yard-access pets.', status: 'DRAFT' },
  { code: 'pet_door_weatherproofing_check', category: 'pet_fence_inspection', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Seasonal weatherstripping check for pet doors.', status: 'DRAFT' },
  { code: 'yard_hazard_pet_walkthrough', category: 'pet_fence_inspection', targetModule: 'Health', safetyClass: 'ROUTINE', intent: 'Seasonal yard walkthrough for pet-relevant hazards (home/yard condition only).', status: 'DRAFT' },

  // Aging-in-place home safety
  { code: 'grab_bar_bathroom_suggestion', category: 'aging_in_place_safety', targetModule: 'Health', safetyClass: 'SAFETY_SENSITIVE', intent: 'Suggest grab-bar installation in bathrooms for aging-in-place households.', status: 'DRAFT' },
  { code: 'stair_railing_check', category: 'aging_in_place_safety', targetModule: 'Health', safetyClass: 'SAFETY_SENSITIVE', intent: 'Prompt a stair railing and lighting safety check.', status: 'DRAFT' },
  { code: 'nightlight_pathway_suggestion', category: 'aging_in_place_safety', targetModule: 'Health', safetyClass: 'ROUTINE', intent: 'Suggest nightlight/pathway lighting for reduced-mobility households.', status: 'DRAFT' },
  { code: 'threshold_trip_hazard_check', category: 'aging_in_place_safety', targetModule: 'Health', safetyClass: 'SAFETY_SENSITIVE', intent: 'Check for raised thresholds and other trip hazards.', status: 'DRAFT' },

  // Travel preparation
  { code: 'pre_travel_home_checklist', category: 'travel_preparation', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Suggest a pre-travel checklist (water shutoff, thermostat setback, timer lights) before an extended absence.', status: 'DRAFT' },
  { code: 'mail_hold_reminder', category: 'travel_preparation', targetModule: 'Dashboard', safetyClass: 'ROUTINE', intent: 'Reminder to arrange mail hold during a travel window.', status: 'DRAFT' },
  { code: 'pipe_freeze_prevention_travel', category: 'travel_preparation', targetModule: 'Maintenance', safetyClass: 'SAFETY_SENSITIVE', intent: 'Cold-climate pipe-freeze prevention check before winter travel.', status: 'DRAFT' },

  // WFH comfort
  { code: 'home_office_lighting_suggestion', category: 'wfh_comfort', targetModule: 'Dashboard', safetyClass: 'ROUTINE', intent: 'Suggest improved task lighting for a home-office setup.', status: 'DRAFT' },
  { code: 'ergonomic_desk_setup_reminder', category: 'wfh_comfort', targetModule: 'Dashboard', safetyClass: 'ROUTINE', intent: 'Reminder to review desk/chair ergonomics.', status: 'DRAFT' },
  { code: 'internet_backup_suggestion', category: 'wfh_comfort', targetModule: 'Dashboard', safetyClass: 'ROUTINE', intent: 'Suggest a backup connectivity plan for WFH households.', status: 'DRAFT' },

  // Budget posture
  { code: 'deferred_maintenance_budget_alert', category: 'budget_posture', targetModule: 'Dashboard', safetyClass: 'ROUTINE', intent: 'Flag accumulating deferred-maintenance cost for budget-conscious households.', status: 'DRAFT' },
  { code: 'diy_vs_pro_cost_tip', category: 'budget_posture', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Offer a DIY-vs-professional cost comparison for lower-budget-posture households.', status: 'DRAFT' },
  { code: 'seasonal_cost_smoothing_tip', category: 'budget_posture', targetModule: 'Dashboard', safetyClass: 'ROUTINE', intent: 'Suggest spreading seasonal maintenance costs across months.', status: 'DRAFT' },

  // Seasonal / weather preparations
  { code: 'gutter_cleaning_seasonal', category: 'seasonal_weather_prep', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Seasonal gutter-cleaning reminder ahead of fall/spring.', status: 'DRAFT' },
  { code: 'hvac_seasonal_tuneup', category: 'seasonal_weather_prep', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Seasonal HVAC tune-up reminder ahead of extreme-temperature seasons.', status: 'DRAFT' },
  { code: 'storm_prep_checklist', category: 'seasonal_weather_prep', targetModule: 'Risk & Climate', safetyClass: 'SAFETY_SENSITIVE', intent: "Pre-storm-season preparation checklist for the property's climate region.", status: 'DRAFT' },
  { code: 'winterization_checklist', category: 'seasonal_weather_prep', targetModule: 'Maintenance', safetyClass: 'SAFETY_SENSITIVE', intent: 'Winterization checklist (hose bibs, exposed pipes) for cold climates.', status: 'DRAFT' },

  // Low-cost prevention
  { code: 'smoke_co_detector_battery_check', category: 'low_cost_prevention', targetModule: 'Maintenance', safetyClass: 'SAFETY_SENSITIVE', intent: 'Smoke/CO detector battery-check reminder.', status: 'DRAFT' },
  { code: 'caulking_weatherstripping_check', category: 'low_cost_prevention', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Low-cost caulking/weatherstripping check to reduce energy loss.', status: 'DRAFT' },
  { code: 'water_heater_flush_reminder', category: 'low_cost_prevention', targetModule: 'Maintenance', safetyClass: 'ROUTINE', intent: 'Annual water heater flush reminder.', status: 'DRAFT' },
  { code: 'dryer_vent_cleaning_reminder', category: 'low_cost_prevention', targetModule: 'Maintenance', safetyClass: 'SAFETY_SENSITIVE', intent: 'Dryer vent cleaning reminder (fire-prevention, low cost).', status: 'DRAFT' },

  // Phase 2.5 focused showcase
  { code: 'smoke_detector_installation_review', category: 'safety_risk_reduction', targetModule: 'Maintenance', safetyClass: 'SAFETY_SENSITIVE', intent: 'Confirm a property record that indicates smoke detectors are not installed and prompt a coverage review.', status: 'DRAFT' },
  { code: 'aging_roof_condition_review', category: 'aging_system_planning', targetModule: 'Health', safetyClass: 'ROUTINE', intent: 'Prompt a condition and service-history review when the recorded roof replacement year is at least 25 years ago.', status: 'DRAFT' },
];

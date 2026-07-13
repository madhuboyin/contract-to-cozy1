-- apps/backend/prisma/seedPersonalizationCatalog.sql
--
-- Raw-SQL equivalent of seedPersonalizationCatalog.ts, for running directly
-- in pgAdmin. Seeds the 27 Phase 0 catalog plan entries
-- (src/personalization/catalog/catalogPlan.ts /
-- docs/personalization/catalog-plan.md) as inert DRAFT
-- personalization_recommendation_definitions rows. No rules, no content
-- versions — nothing here is ACTIVE or evaluatable.
--
-- PREREQUISITE: the personalization_recommendation_definitions table must
-- already exist — i.e. `npx prisma db push` has been run for the schema
-- change that added it. If it doesn't exist yet, this will fail with
-- "relation ... does not exist"; run db push first.
--
-- Idempotent: safe to re-run. Matches by the unique `code` column; on
-- conflict it refreshes category/safetyClass/updatedAt but deliberately
-- does NOT touch `status` — if a definition was promoted past DRAFT by an
-- admin/reviewer, re-running this must not silently revert it to DRAFT.

INSERT INTO personalization_recommendation_definitions
  (id, code, category, "safetyClass", status, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'hvac_filter_pet_adjusted',          'pet_adjusted_filters',   'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'vacuum_filter_pet_adjusted',        'pet_adjusted_filters',   'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'air_purifier_pet_suggestion',       'pet_adjusted_filters',   'ROUTINE',         'DRAFT', now(), now()),

  (gen_random_uuid(), 'fence_integrity_check_pet_owner',   'pet_fence_inspection',   'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'pet_door_weatherproofing_check',    'pet_fence_inspection',   'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'yard_hazard_pet_walkthrough',        'pet_fence_inspection',   'ROUTINE',         'DRAFT', now(), now()),

  (gen_random_uuid(), 'grab_bar_bathroom_suggestion',      'aging_in_place_safety',  'SAFETY_SENSITIVE','DRAFT', now(), now()),
  (gen_random_uuid(), 'stair_railing_check',               'aging_in_place_safety',  'SAFETY_SENSITIVE','DRAFT', now(), now()),
  (gen_random_uuid(), 'nightlight_pathway_suggestion',     'aging_in_place_safety',  'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'threshold_trip_hazard_check',       'aging_in_place_safety',  'SAFETY_SENSITIVE','DRAFT', now(), now()),

  (gen_random_uuid(), 'pre_travel_home_checklist',         'travel_preparation',     'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'mail_hold_reminder',                'travel_preparation',     'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'pipe_freeze_prevention_travel',     'travel_preparation',     'SAFETY_SENSITIVE','DRAFT', now(), now()),

  (gen_random_uuid(), 'home_office_lighting_suggestion',   'wfh_comfort',            'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'ergonomic_desk_setup_reminder',     'wfh_comfort',            'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'internet_backup_suggestion',        'wfh_comfort',            'ROUTINE',         'DRAFT', now(), now()),

  (gen_random_uuid(), 'deferred_maintenance_budget_alert', 'budget_posture',         'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'diy_vs_pro_cost_tip',               'budget_posture',         'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'seasonal_cost_smoothing_tip',       'budget_posture',         'ROUTINE',         'DRAFT', now(), now()),

  (gen_random_uuid(), 'gutter_cleaning_seasonal',          'seasonal_weather_prep',  'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'hvac_seasonal_tuneup',              'seasonal_weather_prep',  'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'storm_prep_checklist',              'seasonal_weather_prep',  'SAFETY_SENSITIVE','DRAFT', now(), now()),
  (gen_random_uuid(), 'winterization_checklist',           'seasonal_weather_prep',  'SAFETY_SENSITIVE','DRAFT', now(), now()),

  (gen_random_uuid(), 'smoke_co_detector_battery_check',   'low_cost_prevention',    'SAFETY_SENSITIVE','DRAFT', now(), now()),
  (gen_random_uuid(), 'caulking_weatherstripping_check',   'low_cost_prevention',    'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'water_heater_flush_reminder',       'low_cost_prevention',    'ROUTINE',         'DRAFT', now(), now()),
  (gen_random_uuid(), 'dryer_vent_cleaning_reminder',      'low_cost_prevention',    'SAFETY_SENSITIVE','DRAFT', now(), now())
ON CONFLICT (code) DO UPDATE SET
  category      = EXCLUDED.category,
  "safetyClass" = EXCLUDED."safetyClass",
  "updatedAt"   = now();

-- Sanity check after running: should return 27.
-- SELECT count(*) FROM personalization_recommendation_definitions WHERE status = 'DRAFT';

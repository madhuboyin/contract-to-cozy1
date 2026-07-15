-- Remove obsolete Phase 0 personalization planning rows.
--
-- DATA CLEANUP ONLY: this is not a schema migration. Run it manually in
-- pgAdmin after confirming the connected database. The 25 codes below do not
-- have application-owned behavior and are not part of seedPersonalization.sql.
--
-- Deleting a recommendation definition cascades through its rule, content,
-- evaluation, recommendation, explanation, feedback, and suppression rows via
-- existing foreign keys. Audit events are not foreign-keyed, so matching
-- definition audit rows are removed explicitly.
--
-- The script is idempotent: rerunning it deletes zero rows.

BEGIN;

WITH unimplemented_codes(code) AS (
  VALUES
    ('hvac_filter_pet_adjusted'),
    ('vacuum_filter_pet_adjusted'),
    ('air_purifier_pet_suggestion'),
    ('fence_integrity_check_pet_owner'),
    ('pet_door_weatherproofing_check'),
    ('yard_hazard_pet_walkthrough'),
    ('grab_bar_bathroom_suggestion'),
    ('stair_railing_check'),
    ('nightlight_pathway_suggestion'),
    ('threshold_trip_hazard_check'),
    ('pre_travel_home_checklist'),
    ('mail_hold_reminder'),
    ('pipe_freeze_prevention_travel'),
    ('home_office_lighting_suggestion'),
    ('ergonomic_desk_setup_reminder'),
    ('internet_backup_suggestion'),
    ('deferred_maintenance_budget_alert'),
    ('diy_vs_pro_cost_tip'),
    ('seasonal_cost_smoothing_tip'),
    ('gutter_cleaning_seasonal'),
    ('hvac_seasonal_tuneup'),
    ('storm_prep_checklist'),
    ('winterization_checklist'),
    ('caulking_weatherstripping_check'),
    ('water_heater_flush_reminder')
),
deleted_audit_events AS (
  DELETE FROM personalization_audit_events audit
  USING unimplemented_codes obsolete
  WHERE audit."entityType" = 'RECOMMENDATION_DEFINITION'
    AND audit."entityId" = obsolete.code
  RETURNING audit.id
),
deleted_definitions AS (
  DELETE FROM personalization_recommendation_definitions definition
  USING unimplemented_codes obsolete
  WHERE definition.code = obsolete.code
  RETURNING definition.code
)
SELECT
  (SELECT count(*) FROM deleted_definitions) AS deleted_definitions,
  (SELECT count(*) FROM deleted_audit_events) AS deleted_audit_events;

COMMIT;

-- Verification: expect zero rows.
SELECT code, status
FROM personalization_recommendation_definitions
WHERE code IN (
  'hvac_filter_pet_adjusted',
  'vacuum_filter_pet_adjusted',
  'air_purifier_pet_suggestion',
  'fence_integrity_check_pet_owner',
  'pet_door_weatherproofing_check',
  'yard_hazard_pet_walkthrough',
  'grab_bar_bathroom_suggestion',
  'stair_railing_check',
  'nightlight_pathway_suggestion',
  'threshold_trip_hazard_check',
  'pre_travel_home_checklist',
  'mail_hold_reminder',
  'pipe_freeze_prevention_travel',
  'home_office_lighting_suggestion',
  'ergonomic_desk_setup_reminder',
  'internet_backup_suggestion',
  'deferred_maintenance_budget_alert',
  'diy_vs_pro_cost_tip',
  'seasonal_cost_smoothing_tip',
  'gutter_cleaning_seasonal',
  'hvac_seasonal_tuneup',
  'storm_prep_checklist',
  'winterization_checklist',
  'caulking_weatherstripping_check',
  'water_heater_flush_reminder'
)
ORDER BY code;

-- Verification: expect only the five implemented definitions after the
-- canonical bootstrap has been run.
SELECT code, status
FROM personalization_recommendation_definitions
ORDER BY code;

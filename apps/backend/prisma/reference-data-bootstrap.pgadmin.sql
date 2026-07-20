-- Contract-to-Cozy reference-data bootstrap for pgAdmin
--
-- DATA SEED ONLY. This is not a schema migration.
-- Run this after `prisma db push` has created the tables and enum types.
-- Safe for a database where users, providers, and properties will be created
-- manually through the UI: this script never deletes or modifies user data.
-- It is idempotent and may be run again after deployments.

BEGIN;

-- ---------------------------------------------------------------------------
-- Service categories used by provider discovery and homeowner task routing.
-- ---------------------------------------------------------------------------

INSERT INTO "service_category_config"
  ("id", "category", "availableForHomeBuyer", "availableForExistingOwner",
   "displayName", "description", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'INSPECTION', true,  false, 'Home Inspection', 'Professional home inspection services before closing', 'clipboard-check', 1,  true, now(), now()),
  (gen_random_uuid()::text, 'MOVING',     true,  false, 'Moving Services', 'Professional movers and packing services', 'truck', 2, true, now(), now()),
  (gen_random_uuid()::text, 'CLEANING',   true,  true,  'Cleaning Services', 'Move-in cleaning, deep cleaning, and maintenance', 'sparkles', 3, true, now(), now()),
  (gen_random_uuid()::text, 'LOCKSMITH',  true,  true,  'Locksmith', 'Lock rekeying, installation, and emergency services', 'key', 4, true, now(), now()),
  (gen_random_uuid()::text, 'PEST_CONTROL', true, true, 'Pest Control', 'Extermination, prevention, and pest inspections', 'bug', 5, true, now(), now()),
  (gen_random_uuid()::text, 'HVAC',       true,  true,  'HVAC', 'Heating and cooling repair, maintenance, and installation', 'wind', 6, true, now(), now()),
  (gen_random_uuid()::text, 'HANDYMAN',   false, true,  'Handyman Services', 'General repairs and home maintenance', 'wrench', 7, true, now(), now()),
  (gen_random_uuid()::text, 'PLUMBING',   false, true,  'Plumbing', 'Leak repairs, fixture installation, and drain cleaning', 'droplet', 8, true, now(), now()),
  (gen_random_uuid()::text, 'ELECTRICAL', false, true,  'Electrical', 'Outlet repairs, lighting, and electrical upgrades', 'zap', 9, true, now(), now()),
  (gen_random_uuid()::text, 'LANDSCAPING', false, true, 'Landscaping', 'Lawn care, tree trimming, and garden maintenance', 'leaf', 10, true, now(), now()),
  (gen_random_uuid()::text, 'FINANCE',    false, true,  'Property Tax Services', 'Property tax reminders, consultations, and renewal tracking', 'calculator', 11, true, now(), now()),
  (gen_random_uuid()::text, 'WARRANTY',   false, true,  'Warranty Management', 'Home warranty renewals, claims assistance, and coverage tracking', 'shield-check', 12, true, now(), now()),
  (gen_random_uuid()::text, 'ADMIN',      false, true,  'Administrative Services', 'General home administration, reminders, and documentation', 'clipboard-list', 13, true, now(), now())
ON CONFLICT ("category") DO UPDATE SET
  "availableForHomeBuyer" = EXCLUDED."availableForHomeBuyer",
  "availableForExistingOwner" = EXCLUDED."availableForExistingOwner",
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "icon" = EXCLUDED."icon",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = now();

-- ---------------------------------------------------------------------------
-- Component lifespans and replacement costs used by Risk Assessment.
-- ---------------------------------------------------------------------------

INSERT INTO "system_component_configs"
  ("id", "systemType", "category", "expectedLife", "replacementCost",
   "warningFlags", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'HVAC_FURNACE', 'SYSTEMS', 15, 8500, '{}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'HVAC_HEAT_PUMP', 'SYSTEMS', 12, 10000, '{}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'WATER_HEATER_TANK', 'SYSTEMS', 10, 1500, '{}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'WATER_HEATER_TANKLESS', 'SYSTEMS', 20, 4000, '{}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'ELECTRICAL_PANEL_MODERN', 'SYSTEMS', 40, 3500, '{}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'ELECTRICAL_PANEL_OLD', 'SYSTEMS', 30, 3000, '{"electricalPanelAgeOver40":0.2}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'ROOF_SHINGLE', 'STRUCTURE', 20, 18000, '{"hasDrainageIssues":0.1}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'ROOF_TILE_METAL', 'STRUCTURE', 50, 30000, '{}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'FOUNDATION_CONCRETE_SLAB', 'STRUCTURE', 100, 50000, '{"hasDrainageIssues":0.3}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'MAJOR_APPLIANCE_FRIDGE', 'SYSTEMS', 12, 2000, '{}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'MAJOR_APPLIANCE_DISHWASHER', 'SYSTEMS', 10, 800, '{}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'SAFETY_SMOKE_CO_DETECTORS', 'SAFETY', 10, 300, '{"isDetectorExpired":0.8}'::jsonb, true, now(), now())
ON CONFLICT ("systemType") DO UPDATE SET
  "category" = EXCLUDED."category",
  "expectedLife" = EXCLUDED."expectedLife",
  "replacementCost" = EXCLUDED."replacementCost",
  "warningFlags" = EXCLUDED."warningFlags",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = now();

-- ---------------------------------------------------------------------------
-- Optional, consent-controlled profile question. Answers are stored in the
-- household profile, never on Property.
-- ---------------------------------------------------------------------------

INSERT INTO "personalization_profile_questions"
  ("id", "code", "version", "status", "prompt", "whyAsked", "privacyNote",
   "answerSchema", "valueScore", "effortScore", "maxImpressions", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'HOUSEHOLD_SIZE', 1, 'ACTIVE',
   'How many people live in your household?',
   'Household size can improve optional usage and maintenance recommendations.',
   'Optional and stored only in your consented household profile, not on the property record.',
   '{"type":"integer","min":1,"max":25}'::jsonb, 0.55, 0.15, 3, now(), now())
ON CONFLICT ("code", "version") DO UPDATE SET
  "status" = EXCLUDED."status",
  "prompt" = EXCLUDED."prompt",
  "whyAsked" = EXCLUDED."whyAsked",
  "privacyNote" = EXCLUDED."privacyNote",
  "answerSchema" = EXCLUDED."answerSchema",
  "valueScore" = EXCLUDED."valueScore",
  "effortScore" = EXCLUDED."effortScore",
  "maxImpressions" = EXCLUDED."maxImpressions",
  "updatedAt" = now();

-- ---------------------------------------------------------------------------
-- Starter Plant Advisor catalog. PlantCatalog has no natural unique database
-- key, so rows are inserted only when the scientific name is not present.
-- ---------------------------------------------------------------------------

WITH plants("commonName", "scientificName", "lightLevel", "maintenanceLevel",
  "humidityPreference", "toxicityLevel", "isPetSafe", "suitableRoomTypes",
  "supportsAirQuality", "hasFragrance", "decorStyleTags", "placementTips",
  "careSummary", "wateringCadenceDays", "wateringNotes", "baseConfidence") AS (
  VALUES
    ('Snake Plant', 'Dracaena trifasciata', 'LOW', 'LOW', 'LOW', 'MILDLY_TOXIC', false, ARRAY['BEDROOM','OFFICE','LIVING_ROOM']::"RoomType"[], true, false, ARRAY['modern','minimal','architectural'], 'Place near a bright window or in a low-light corner with indirect light.', 'Let soil dry almost completely between waterings; tolerates missed watering.', 18, 'Water less in winter.', 0.82),
    ('ZZ Plant', 'Zamioculcas zamiifolia', 'LOW', 'LOW', 'LOW', 'MILDLY_TOXIC', false, ARRAY['OFFICE','BEDROOM','LIVING_ROOM']::"RoomType"[], true, false, ARRAY['minimal','contemporary'], 'Great for desks and shelves away from direct afternoon sun.', 'Drought-tolerant foliage plant; avoid overwatering.', 20, 'Check soil moisture before watering.', 0.80),
    ('Pothos', 'Epipremnum aureum', 'MEDIUM', 'LOW', 'MODERATE', 'MILDLY_TOXIC', false, ARRAY['KITCHEN','BATHROOM','OFFICE','LIVING_ROOM']::"RoomType"[], true, false, ARRAY['trailing','boho','casual'], 'Use hanging planters or high shelves for trailing vines.', 'Fast grower in medium indirect light; prune to keep shape.', 10, 'Water when top inch of soil is dry.', 0.84),
    ('Peace Lily', 'Spathiphyllum wallisii', 'MEDIUM', 'MEDIUM', 'HIGH', 'TOXIC', false, ARRAY['BATHROOM','BEDROOM','LIVING_ROOM']::"RoomType"[], true, true, ARRAY['lush','classic'], 'Best in bathrooms or humid corners with filtered light.', 'Prefers consistently slightly moist soil and humidity.', 7, 'Leaves droop when thirsty; avoid harsh direct light.', 0.78),
    ('Spider Plant', 'Chlorophytum comosum', 'MEDIUM', 'LOW', 'MODERATE', 'PET_SAFE', true, ARRAY['OFFICE','BEDROOM','KITCHEN','LIVING_ROOM']::"RoomType"[], true, false, ARRAY['airy','hanging'], 'Ideal in hanging baskets near bright indirect windows.', 'Adaptable and forgiving; trim brown tips for appearance.', 9, 'Allow top layer of soil to dry slightly between watering.', 0.86),
    ('Boston Fern', 'Nephrolepis exaltata', 'MEDIUM', 'MEDIUM', 'HIGH', 'PET_SAFE', true, ARRAY['BATHROOM','KITCHEN']::"RoomType"[], true, false, ARRAY['lush','traditional'], 'Works best in humid bathrooms with bright filtered light.', 'Needs regular moisture and humidity to prevent frond browning.', 5, 'Mist regularly in dry seasons.', 0.76),
    ('Rubber Plant', 'Ficus elastica', 'BRIGHT_INDIRECT', 'MEDIUM', 'MODERATE', 'TOXIC', false, ARRAY['LIVING_ROOM','OFFICE','BEDROOM']::"RoomType"[], true, false, ARRAY['statement','modern'], 'Give it a bright corner with space to grow upright.', 'Wipe leaves for dust; water when top soil dries.', 8, 'Rotate occasionally for even growth.', 0.79),
    ('Areca Palm', 'Dypsis lutescens', 'BRIGHT_INDIRECT', 'MEDIUM', 'HIGH', 'PET_SAFE', true, ARRAY['LIVING_ROOM','BEDROOM','OFFICE']::"RoomType"[], true, false, ARRAY['tropical','statement'], 'Place where it receives bright filtered light and airflow.', 'Enjoys humidity and regular watering without soggy roots.', 7, 'Increase humidity support during dry indoor months.', 0.81)
)
INSERT INTO "plant_catalog"
  ("id", "commonName", "scientificName", "lightLevel", "maintenanceLevel",
   "humidityPreference", "toxicityLevel", "isPetSafe", "suitableRoomTypes",
   "supportsAirQuality", "hasFragrance", "decorStyleTags", "placementTips",
   "careSummary", "wateringCadenceDays", "wateringNotes", "baseConfidence",
   "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  p."commonName",
  p."scientificName",
  p."lightLevel"::"PlantLightLevel",
  p."maintenanceLevel"::"PlantMaintenanceLevel",
  p."humidityPreference"::"PlantHumidityPreference",
  p."toxicityLevel"::"PlantToxicityLevel",
  p."isPetSafe",
  p."suitableRoomTypes",
  p."supportsAirQuality",
  p."hasFragrance",
  p."decorStyleTags",
  p."placementTips",
  p."careSummary",
  p."wateringCadenceDays",
  p."wateringNotes",
  p."baseConfidence",
  now(),
  now()
FROM plants p
WHERE NOT EXISTS (
  SELECT 1 FROM "plant_catalog" existing
  WHERE existing."scientificName" = p."scientificName"
);

-- ---------------------------------------------------------------------------
-- A baseline set of seasonal templates. These prevent Seasonal Maintenance
-- from being empty while properties and completion history are UI-created.
-- ---------------------------------------------------------------------------

INSERT INTO "seasonal_task_templates"
  ("id", "task_key", "season", "title", "description", "why_it_matters",
   "typical_cost_min", "typical_cost_max", "is_diy_possible", "estimated_hours",
   "priority", "service_category", "climate_regions", "timing_offset_days",
   "recurrence_pattern", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'SPRING_HVAC_AC_INSPECTION', 'SPRING', 'AC system inspection and tune-up', 'Professional inspection and maintenance before summer heat.', 'Reduces peak-season breakdown risk and supports efficient operation.', 100, 200, false, 1.5, 'CRITICAL', 'HVAC', ARRAY['VERY_COLD','COLD','MODERATE','WARM','TROPICAL']::"ClimateRegion"[], -14, 'ANNUAL', true, now(), now()),
  (gen_random_uuid()::text, 'SPRING_GUTTER_CLEANING', 'SPRING', 'Gutter cleaning and inspection', 'Remove debris and inspect gutters and downspouts.', 'Helps prevent drainage, foundation, and water-damage problems.', 150, 300, true, 2.0, 'CRITICAL', 'EXTERIOR', ARRAY['VERY_COLD','COLD','MODERATE','WARM','TROPICAL']::"ClimateRegion"[], -14, 'ANNUAL', true, now(), now()),
  (gen_random_uuid()::text, 'SUMMER_HVAC_FILTER_CHECK', 'SUMMER', 'Check and replace HVAC filter', 'Inspect the HVAC filter and replace it when dirty.', 'Supports airflow during the highest cooling-load months.', 10, 50, true, 0.5, 'RECOMMENDED', 'HVAC', ARRAY['VERY_COLD','COLD','MODERATE','WARM','TROPICAL']::"ClimateRegion"[], -7, 'QUARTERLY', true, now(), now()),
  (gen_random_uuid()::text, 'SUMMER_EXTERIOR_DRAINAGE_CHECK', 'SUMMER', 'Inspect exterior drainage', 'Check grading, drains, and downspout discharge after heavy rain.', 'Early drainage corrections reduce moisture and foundation exposure.', 0, 250, true, 1.0, 'RECOMMENDED', 'EXTERIOR', ARRAY['VERY_COLD','COLD','MODERATE','WARM','TROPICAL']::"ClimateRegion"[], -7, 'ANNUAL', true, now(), now()),
  (gen_random_uuid()::text, 'FALL_HEATING_SYSTEM_SERVICE', 'FALL', 'Heating system inspection', 'Inspect and service the primary heating system before winter.', 'Helps reduce cold-weather failures and unsafe operation.', 100, 300, false, 1.5, 'CRITICAL', 'HVAC', ARRAY['VERY_COLD','COLD','MODERATE']::"ClimateRegion"[], -21, 'ANNUAL', true, now(), now()),
  (gen_random_uuid()::text, 'FALL_WINTERIZE_OUTDOOR_FAUCETS', 'FALL', 'Winterize outdoor faucets', 'Disconnect hoses and protect exposed outdoor plumbing.', 'Helps prevent freeze-related pipe damage.', 0, 150, true, 1.0, 'CRITICAL', 'PLUMBING', ARRAY['VERY_COLD','COLD','MODERATE']::"ClimateRegion"[], -21, 'ANNUAL', true, now(), now()),
  (gen_random_uuid()::text, 'WINTER_SMOKE_CO_TEST', 'WINTER', 'Test smoke and carbon monoxide detectors', 'Test detectors and replace batteries according to manufacturer guidance.', 'Working detectors are a critical safety control during heating season.', 10, 100, true, 0.5, 'CRITICAL', 'SAFETY', ARRAY['VERY_COLD','COLD','MODERATE','WARM','TROPICAL']::"ClimateRegion"[], -7, 'SEMI_ANNUAL', true, now(), now()),
  (gen_random_uuid()::text, 'WINTER_FREEZE_READINESS', 'WINTER', 'Review freeze readiness', 'Confirm shutoffs, exposed-pipe protection, and emergency contacts.', 'Preparation reduces damage and response time during a freeze.', 0, 200, true, 1.0, 'RECOMMENDED', 'PLUMBING', ARRAY['VERY_COLD','COLD','MODERATE']::"ClimateRegion"[], -7, 'ANNUAL', true, now(), now())
ON CONFLICT ("task_key") DO UPDATE SET
  "season" = EXCLUDED."season",
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "why_it_matters" = EXCLUDED."why_it_matters",
  "typical_cost_min" = EXCLUDED."typical_cost_min",
  "typical_cost_max" = EXCLUDED."typical_cost_max",
  "is_diy_possible" = EXCLUDED."is_diy_possible",
  "estimated_hours" = EXCLUDED."estimated_hours",
  "priority" = EXCLUDED."priority",
  "service_category" = EXCLUDED."service_category",
  "climate_regions" = EXCLUDED."climate_regions",
  "timing_offset_days" = EXCLUDED."timing_offset_days",
  "recurrence_pattern" = EXCLUDED."recurrence_pattern",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = now();

-- ---------------------------------------------------------------------------
-- Baseline Home Habit Coach templates.
-- ---------------------------------------------------------------------------

INSERT INTO "habit_templates"
  ("id", "key", "title", "shortDescription", "description", "category",
   "cadence", "difficulty", "impactType", "estimatedMinutes", "isActive",
   "isSeasonal", "priority", "tipText", "completionNoteTemplate", "iconKey",
   "targetingRulesJson", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'hvac_filter_replace_monthly', 'Replace HVAC Air Filter', 'Swap the HVAC filter to maintain airflow.', 'Inspect the filter and replace it according to its type and manufacturer guidance.', 'HVAC', 'MONTHLY', 'EASY', 'IMPROVE_AIR_QUALITY', 5, true, false, 1, 'Keep replacement filters on hand.', 'Replaced filter on ___.', 'hvac_filter', NULL, now(), now()),
  (gen_random_uuid()::text, 'hvac_tune_up_spring', 'Schedule Spring HVAC Tune-Up', 'Book an annual cooling-system inspection.', 'Have a qualified technician inspect the cooling system before peak season.', 'HVAC', 'SEASONAL', 'EASY', 'PREVENT_DAMAGE', 10, true, true, 2, 'Schedule before peak cooling demand.', 'Tune-up scheduled with ___ for ___.', 'hvac_tune_up', '{"seasons":["SPRING"],"requiredCoolingTypes":["CENTRAL_AC"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'plumbing_under_sink_leak_check', 'Check Under-Sink Connections for Leaks', 'A quick monthly visual and touch check.', 'Inspect supply valves and drain connections for moisture or staining.', 'PLUMBING', 'MONTHLY', 'EASY', 'PREVENT_DAMAGE', 5, true, false, 3, 'Use a dry paper towel to reveal small leaks.', 'Checked sinks on ___.', 'plumbing_leak', NULL, now(), now()),
  (gen_random_uuid()::text, 'plumbing_water_heater_flush', 'Flush Water Heater Sediment', 'Maintain a tank water heater according to manufacturer guidance.', 'Sediment maintenance can support efficiency and service life.', 'PLUMBING', 'ANNUAL', 'MODERATE', 'REDUCE_WEAR', 20, true, false, 5, 'Follow the appliance manual and use a professional when needed.', 'Water heater serviced on ___.', 'water_heater', '{"requiredWaterHeaterTypes":["TANK"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'safety_smoke_co_test', 'Test Smoke and CO Detectors', 'Test each detector and confirm its status.', 'Routine testing helps confirm critical safety equipment is operating.', 'SAFETY', 'MONTHLY', 'EASY', 'PREVENT_DAMAGE', 10, true, false, 1, 'Follow each detector manufacturer''s test instructions.', 'Detectors tested on ___.', 'smoke_detector', NULL, now(), now()),
  (gen_random_uuid()::text, 'exterior_gutter_visual_check', 'Inspect Gutters and Downspouts', 'Look for blockage, overflow, or visible damage.', 'Good drainage reduces exterior water exposure.', 'EXTERIOR', 'SEASONAL', 'MODERATE', 'PREVENT_DAMAGE', 15, true, true, 4, 'Stay on the ground unless safe access and equipment are available.', 'Gutters checked on ___.', 'gutter', NULL, now(), now()),
  (gen_random_uuid()::text, 'appliance_fridge_coil_clean', 'Clean Refrigerator Coils', 'Remove accessible dust from refrigerator coils.', 'Clean coils can support efficient appliance operation.', 'APPLIANCE', 'ANNUAL', 'MODERATE', 'REDUCE_WEAR', 20, true, false, 6, 'Unplug the appliance and follow its manual before cleaning.', 'Coils cleaned on ___.', 'refrigerator', NULL, now(), now()),
  (gen_random_uuid()::text, 'general_monthly_home_walkthrough', 'Monthly Home Walk-Through', 'Look for stains, cracks, moisture, or other changes.', 'A short recurring inspection helps identify changes early.', 'GENERAL', 'MONTHLY', 'EASY', 'GENERAL_UPKEEP', 10, true, false, 10, 'Photograph anything worth monitoring over time.', 'Walk-through completed on ___.', 'walkthrough', NULL, now(), now())
ON CONFLICT ("key") DO UPDATE SET
  "title" = EXCLUDED."title",
  "shortDescription" = EXCLUDED."shortDescription",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "cadence" = EXCLUDED."cadence",
  "difficulty" = EXCLUDED."difficulty",
  "impactType" = EXCLUDED."impactType",
  "estimatedMinutes" = EXCLUDED."estimatedMinutes",
  "isActive" = EXCLUDED."isActive",
  "isSeasonal" = EXCLUDED."isSeasonal",
  "priority" = EXCLUDED."priority",
  "tipText" = EXCLUDED."tipText",
  "completionNoteTemplate" = EXCLUDED."completionNoteTemplate",
  "iconKey" = EXCLUDED."iconKey",
  "targetingRulesJson" = EXCLUDED."targetingRulesJson",
  "updatedAt" = now();

COMMIT;

-- Verification summary returned by pgAdmin.
SELECT 'service_category_config' AS catalog, count(*) AS row_count FROM "service_category_config"
UNION ALL SELECT 'system_component_configs', count(*) FROM "system_component_configs"
UNION ALL SELECT 'personalization_profile_questions', count(*) FROM "personalization_profile_questions"
UNION ALL SELECT 'plant_catalog', count(*) FROM "plant_catalog"
UNION ALL SELECT 'seasonal_task_templates', count(*) FROM "seasonal_task_templates"
UNION ALL SELECT 'habit_templates', count(*) FROM "habit_templates"
ORDER BY catalog;

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
--
-- This is the same catalog as prisma/seedHabitTemplates.ts (16 templates, one per concept). An earlier version of this file
-- carried three differently-keyed twins of templates in that catalog, so a database seeded from both showed the same habit
-- twice; they are retired below and the one-time clean-up of habits already created from them is
-- prisma/habit-catalog-dedupe.pgadmin.sql.
-- ---------------------------------------------------------------------------

INSERT INTO "habit_templates"
  ("id", "key", "title", "shortDescription", "description", "category",
   "cadence", "difficulty", "impactType", "estimatedMinutes", "isActive",
   "isSeasonal", "priority", "tipText", "completionNoteTemplate", "iconKey",
   "targetingRulesJson", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'hvac_filter_replace_monthly', 'Replace HVAC Air Filter', 'Swap out your HVAC filter to maintain airflow and indoor air quality.', 'A clogged filter forces your HVAC system to work harder, increasing energy bills and wear. Replace 1-inch filters monthly, thicker filters every 2–3 months.', 'HVAC', 'MONTHLY', 'EASY', 'IMPROVE_AIR_QUALITY', 5, true, false, 1, 'Keep a stock of 2–3 filters under the sink so you never have to make an extra trip.', 'Replaced filter (size: ___, brand: ___).', 'hvac_filter', NULL, now(), now()),
  (gen_random_uuid()::text, 'hvac_tune_up_spring', 'Schedule Spring HVAC Tune-Up', 'Book an annual AC inspection before cooling season starts.', 'Spring is the ideal time to have a technician inspect refrigerant levels, clean coils, and verify the system is ready for summer. Catching issues early avoids peak-season service delays.', 'HVAC', 'SEASONAL', 'EASY', 'PREVENT_DAMAGE', 10, true, true, 2, 'Book in February or March before HVAC companies get busy.', 'Scheduled tune-up with ___ for ___.', 'hvac_tune_up', '{"seasons":["SPRING"],"requiredCoolingTypes":["CENTRAL_AC"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'plumbing_under_sink_leak_check', 'Check Under-Sink Connections for Leaks', 'A quick look under kitchen and bathroom sinks catches slow drips early.', 'Slow drips under sinks can cause cabinet rot, mold, and water damage that costs thousands to repair. This 2-minute monthly check catches problems before they escalate.', 'PLUMBING', 'MONTHLY', 'EASY', 'PREVENT_DAMAGE', 5, true, false, 3, 'Press a paper towel against the supply valves and drain connections — any moisture shows immediately.', 'Checked all sinks. Found: ___.', 'plumbing_leak', NULL, now(), now()),
  (gen_random_uuid()::text, 'plumbing_winterize_outdoor_hose', 'Shut Off & Drain Outdoor Hose Bibs', 'Disconnect hoses and close interior shutoffs before the first freeze.', 'Water left in exposed outdoor lines can freeze and burst pipes behind the wall. Shut off the interior valve, open the exterior bib to drain, and store hoses indoors.', 'PLUMBING', 'SEASONAL', 'EASY', 'PREVENT_DAMAGE', 15, true, true, 2, 'Set a calendar reminder for mid-October so you don''t get caught by an early frost.', 'Disconnected hose and closed interior shutoff on ___.', 'hose_winter', '{"seasons":["FALL","WINTER"],"climateRegions":["COLD","VERY_COLD","MODERATE"],"requiredFlags":["hasIrrigation"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'plumbing_water_heater_flush', 'Flush Water Heater Sediment', 'Drain a few gallons from the tank to clear sediment and extend heater life.', 'Sediment builds up at the bottom of tank water heaters, reducing efficiency and accelerating corrosion. An annual flush takes 15 minutes and can add years to the unit''s life.', 'PLUMBING', 'ANNUAL', 'MODERATE', 'REDUCE_WEAR', 20, true, false, 5, 'Attach a garden hose to the drain valve and run it to a floor drain or outside.', 'Flushed water heater on ___. Color of water: ___.', 'water_heater', '{"requiredWaterHeaterTypes":["TANK"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'safety_smoke_detector_test', 'Test Smoke Detectors', 'Press the test button on every smoke alarm to confirm it chirps.', 'NFPA recommends testing smoke alarms monthly. Dead or missing batteries are the leading cause of smoke detector failure in house fires.', 'SAFETY', 'MONTHLY', 'EASY', 'IMPROVE_SAFETY', 5, true, false, 1, 'Replace batteries every year, or get 10-year sealed-battery models for peace of mind.', 'Tested ___ smoke detectors. All passed: yes/no.', 'smoke_detector', NULL, now(), now()),
  (gen_random_uuid()::text, 'safety_co_detector_test', 'Test Carbon Monoxide Detectors', 'Confirm CO detectors are functioning — especially before heating season.', 'Carbon monoxide is odorless and deadly. Test CO detectors monthly and replace units older than 5–7 years. Heating season is the highest-risk period.', 'SAFETY', 'MONTHLY', 'EASY', 'IMPROVE_SAFETY', 5, true, false, 1, 'CO detectors placed near sleeping areas and on each floor give the best coverage.', 'Tested ___ CO detectors. All passed: yes/no.', 'co_detector', NULL, now(), now()),
  (gen_random_uuid()::text, 'safety_sump_pump_test', 'Test Sump Pump Operation', 'Pour water into the pit to confirm the float activates and the pump runs.', 'A failed sump pump during spring melt or heavy rain can flood a basement in hours. Seasonal testing — especially before spring — prevents costly water damage.', 'SAFETY', 'SEASONAL', 'EASY', 'PREVENT_DAMAGE', 10, true, true, 2, 'Also check that the discharge line is clear of ice and debris.', 'Tested sump pump on ___. Activated correctly: yes/no.', 'sump_pump', '{"seasons":["SPRING"],"requiredFlags":["hasSumpPump"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'safety_fire_extinguisher_check', 'Inspect Fire Extinguisher Gauge', 'Confirm your kitchen extinguisher is in the green zone and accessible.', 'Fire extinguishers lose pressure over time and need annual visual inspection. Check that the gauge needle is in the green zone, the pin is intact, and the unit hasn''t been discharged.', 'SAFETY', 'ANNUAL', 'EASY', 'IMPROVE_SAFETY', 5, true, false, 3, 'Mount the extinguisher near the kitchen exit, not directly next to the stove.', 'Checked extinguisher on ___. Gauge in green: yes/no.', 'fire_extinguisher', '{"requiredFlags":["hasFireExtinguisher"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'appliance_dryer_vent_check', 'Clear Dryer Vent of Lint Buildup', 'Inspect and clean the dryer exhaust duct to reduce fire risk.', 'Lint accumulation in dryer vents is a leading cause of home fires. Clean the exhaust duct from the dryer to the exterior vent annually — or more often with heavy use.', 'APPLIANCE', 'ANNUAL', 'MODERATE', 'IMPROVE_SAFETY', 30, true, false, 2, 'Use a dryer vent cleaning kit (flexible brush) — available for $20 at hardware stores.', 'Cleaned dryer vent on ___. Length of duct: ___ ft.', 'dryer_vent', NULL, now(), now()),
  (gen_random_uuid()::text, 'appliance_dishwasher_seal_check', 'Inspect Dishwasher Door Seal', 'Look for cracks or buildup on the door gasket that could cause leaks.', 'A damaged or dirty dishwasher door seal allows water to escape during cycles, risking floor and cabinet damage. Wipe down the gasket monthly and inspect for tears.', 'APPLIANCE', 'MONTHLY', 'EASY', 'PREVENT_DAMAGE', 5, true, false, 5, 'Wipe the seal with a damp cloth and a little white vinegar to remove mold and buildup.', 'Inspected dishwasher seal on ___. Condition: ___.', 'dishwasher', NULL, now(), now()),
  (gen_random_uuid()::text, 'appliance_fridge_coil_clean', 'Vacuum Refrigerator Condenser Coils', 'Dirty coils make your fridge work harder and shorten its lifespan.', 'Dust-coated condenser coils reduce efficiency and can cause the compressor to overheat. Cleaning them twice a year takes 10 minutes and extends the appliance life significantly.', 'APPLIANCE', 'SEASONAL', 'EASY', 'IMPROVE_EFFICIENCY', 10, true, true, 6, 'Pull the fridge out slightly and use a coil brush or vacuum with a narrow attachment.', 'Cleaned fridge coils on ___.', 'refrigerator', '{"seasons":["SPRING","FALL"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'exterior_gutter_inspection', 'Inspect & Clear Gutters', 'Check for clogs and damage after leaves fall and before heavy rain season.', 'Blocked gutters can cause water to back up under roofing, damaging fascia and causing foundation seepage. Inspect and clean gutters each fall and spring.', 'EXTERIOR', 'SEASONAL', 'MODERATE', 'PREVENT_DAMAGE', 45, true, true, 2, 'Use a gutter scoop and garden hose. Check that downspouts discharge at least 4 feet from the foundation.', 'Cleaned gutters on ___. Downspouts clear: yes/no.', 'gutter', '{"seasons":["FALL","SPRING"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'exterior_caulking_windows_doors', 'Inspect Caulk Around Windows & Doors', 'Cracked caulk lets in water, air, and insects — a quick fix saves big.', 'Weathered or cracked caulk is one of the most common causes of water intrusion and energy loss. Walk the perimeter annually and re-caulk any gaps.', 'EXTERIOR', 'ANNUAL', 'EASY', 'PREVENT_DAMAGE', 30, true, true, 4, 'Use 100% silicone caulk for exterior applications — it''s more weather-resistant than latex.', 'Inspected caulk on ___. Areas re-caulked: ___.', 'caulk', '{"seasons":["SPRING","FALL"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'interior_humidity_check_winter', 'Monitor Indoor Humidity Levels', 'Low winter humidity causes dry air, static, and wood shrinkage.', 'Ideal indoor humidity is 30–50%. In winter, forced-air heating dries the air, causing wood floors to gap and respiratory discomfort. A $15 hygrometer helps you stay in range.', 'ENVIRONMENTAL', 'SEASONAL', 'EASY', 'IMPROVE_AIR_QUALITY', 5, true, true, 7, 'If humidity drops below 30%, run a room humidifier in bedrooms overnight.', 'Checked humidity on ___. Reading: ___%. Action taken: ___.', 'humidity', '{"seasons":["WINTER"],"climateRegions":["COLD","VERY_COLD","MODERATE"]}'::jsonb, now(), now()),
  (gen_random_uuid()::text, 'general_monthly_walkthrough', 'Do a Monthly Home Walk-Through', 'A 10-minute lap around your home catches small issues before they grow.', 'Walk through each room monthly looking for water stains on ceilings, cracks in walls, condensation on windows, or anything that changed since last month. Catching issues early saves big repair bills.', 'GENERAL', 'MONTHLY', 'EASY', 'GENERAL_UPKEEP', 10, true, false, 10, 'Bring your phone so you can photograph anything worth monitoring over time.', 'Walk-through completed ___. Notes: ___.', 'walkthrough', NULL, now(), now())
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

-- Retire the superseded twins. Rows are kept (property habits reference them), but the generator only reads active templates.
UPDATE "habit_templates"
   SET "isActive" = false, "updatedAt" = now()
 WHERE "key" IN ('safety_smoke_co_test', 'exterior_gutter_visual_check', 'general_monthly_home_walkthrough')
   AND "isActive" = true;

COMMIT;

-- Verification summary returned by pgAdmin.
SELECT 'service_category_config' AS catalog, count(*) AS row_count FROM "service_category_config"
UNION ALL SELECT 'system_component_configs', count(*) FROM "system_component_configs"
UNION ALL SELECT 'personalization_profile_questions', count(*) FROM "personalization_profile_questions"
UNION ALL SELECT 'plant_catalog', count(*) FROM "plant_catalog"
UNION ALL SELECT 'seasonal_task_templates', count(*) FROM "seasonal_task_templates"
UNION ALL SELECT 'habit_templates', count(*) FROM "habit_templates"
ORDER BY catalog;

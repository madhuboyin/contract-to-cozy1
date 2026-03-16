// apps/backend/prisma/seedHabitTemplates.ts
//
// Starter catalog of HabitTemplate records for Home Habit Coach.
//
// Run standalone:
//   npx ts-node prisma/seedHabitTemplates.ts
//
// Or call seedHabitTemplates(prisma) from your main seed.ts.
//
// Templates use upsert on `key` so this script is safe to re-run.

import { PrismaClient } from '@prisma/client';

const TEMPLATES = [
  // ── HVAC ──────────────────────────────────────────────────────────────────
  {
    key: 'hvac_filter_replace_monthly',
    title: 'Replace HVAC Air Filter',
    shortDescription: 'Swap out your HVAC filter to maintain airflow and indoor air quality.',
    description:
      'A clogged filter forces your HVAC system to work harder, increasing energy bills and wear. Replace 1-inch filters monthly, thicker filters every 2–3 months.',
    category: 'HVAC',
    cadence: 'MONTHLY',
    difficulty: 'EASY',
    impactType: 'IMPROVE_AIR_QUALITY',
    estimatedMinutes: 5,
    isActive: true,
    isSeasonal: false,
    priority: 1,
    tipText: 'Keep a stock of 2–3 filters under the sink so you never have to make an extra trip.',
    completionNoteTemplate: 'Replaced filter (size: ___, brand: ___).',
    iconKey: 'hvac_filter',
    targetingRulesJson: null, // applies to all homes with any HVAC
    metadataJson: null,
  },
  {
    key: 'hvac_tune_up_spring',
    title: 'Schedule Spring HVAC Tune-Up',
    shortDescription: 'Book an annual AC inspection before cooling season starts.',
    description:
      'Spring is the ideal time to have a technician inspect refrigerant levels, clean coils, and verify the system is ready for summer. Catching issues early avoids peak-season service delays.',
    category: 'HVAC',
    cadence: 'SEASONAL',
    difficulty: 'EASY',
    impactType: 'PREVENT_DAMAGE',
    estimatedMinutes: 10,
    isActive: true,
    isSeasonal: true,
    priority: 2,
    tipText: 'Book in February or March before HVAC companies get busy.',
    completionNoteTemplate: 'Scheduled tune-up with ___ for ___.',
    iconKey: 'hvac_tune_up',
    targetingRulesJson: { seasons: ['SPRING'], requiredCoolingTypes: ['CENTRAL_AC'] },
    metadataJson: null,
  },

  // ── PLUMBING ──────────────────────────────────────────────────────────────
  {
    key: 'plumbing_under_sink_leak_check',
    title: 'Check Under-Sink Connections for Leaks',
    shortDescription: 'A quick look under kitchen and bathroom sinks catches slow drips early.',
    description:
      'Slow drips under sinks can cause cabinet rot, mold, and water damage that costs thousands to repair. This 2-minute monthly check catches problems before they escalate.',
    category: 'PLUMBING',
    cadence: 'MONTHLY',
    difficulty: 'EASY',
    impactType: 'PREVENT_DAMAGE',
    estimatedMinutes: 5,
    isActive: true,
    isSeasonal: false,
    priority: 3,
    tipText: 'Press a paper towel against the supply valves and drain connections — any moisture shows immediately.',
    completionNoteTemplate: 'Checked all sinks. Found: ___.',
    iconKey: 'plumbing_leak',
    targetingRulesJson: null,
    metadataJson: null,
  },
  {
    key: 'plumbing_winterize_outdoor_hose',
    title: 'Shut Off & Drain Outdoor Hose Bibs',
    shortDescription: 'Disconnect hoses and close interior shutoffs before the first freeze.',
    description:
      'Water left in exposed outdoor lines can freeze and burst pipes behind the wall. Shut off the interior valve, open the exterior bib to drain, and store hoses indoors.',
    category: 'PLUMBING',
    cadence: 'SEASONAL',
    difficulty: 'EASY',
    impactType: 'PREVENT_DAMAGE',
    estimatedMinutes: 15,
    isActive: true,
    isSeasonal: true,
    priority: 2,
    tipText: 'Set a calendar reminder for mid-October so you don\'t get caught by an early frost.',
    completionNoteTemplate: 'Disconnected hose and closed interior shutoff on ___.',
    iconKey: 'hose_winter',
    targetingRulesJson: {
      seasons: ['FALL', 'WINTER'],
      climateRegions: ['COLD', 'VERY_COLD', 'MODERATE'],
      requiredFlags: ['hasIrrigation'],
    },
    metadataJson: null,
  },
  {
    key: 'plumbing_water_heater_flush',
    title: 'Flush Water Heater Sediment',
    shortDescription: 'Drain a few gallons from the tank to clear sediment and extend heater life.',
    description:
      'Sediment builds up at the bottom of tank water heaters, reducing efficiency and accelerating corrosion. An annual flush takes 15 minutes and can add years to the unit\'s life.',
    category: 'PLUMBING',
    cadence: 'ANNUAL',
    difficulty: 'MODERATE',
    impactType: 'REDUCE_WEAR',
    estimatedMinutes: 20,
    isActive: true,
    isSeasonal: false,
    priority: 5,
    tipText: 'Attach a garden hose to the drain valve and run it to a floor drain or outside.',
    completionNoteTemplate: 'Flushed water heater on ___. Color of water: ___.',
    iconKey: 'water_heater',
    targetingRulesJson: { requiredWaterHeaterTypes: ['TANK'] },
    metadataJson: null,
  },

  // ── SAFETY ────────────────────────────────────────────────────────────────
  {
    key: 'safety_smoke_detector_test',
    title: 'Test Smoke Detectors',
    shortDescription: 'Press the test button on every smoke alarm to confirm it chirps.',
    description:
      'NFPA recommends testing smoke alarms monthly. Dead or missing batteries are the leading cause of smoke detector failure in house fires.',
    category: 'SAFETY',
    cadence: 'MONTHLY',
    difficulty: 'EASY',
    impactType: 'IMPROVE_SAFETY',
    estimatedMinutes: 5,
    isActive: true,
    isSeasonal: false,
    priority: 1,
    tipText: 'Replace batteries every year, or get 10-year sealed-battery models for peace of mind.',
    completionNoteTemplate: 'Tested ___ smoke detectors. All passed: yes/no.',
    iconKey: 'smoke_detector',
    targetingRulesJson: null,
    metadataJson: null,
  },
  {
    key: 'safety_co_detector_test',
    title: 'Test Carbon Monoxide Detectors',
    shortDescription: 'Confirm CO detectors are functioning — especially before heating season.',
    description:
      'Carbon monoxide is odorless and deadly. Test CO detectors monthly and replace units older than 5–7 years. Heating season is the highest-risk period.',
    category: 'SAFETY',
    cadence: 'MONTHLY',
    difficulty: 'EASY',
    impactType: 'IMPROVE_SAFETY',
    estimatedMinutes: 5,
    isActive: true,
    isSeasonal: false,
    priority: 1,
    tipText: 'CO detectors placed near sleeping areas and on each floor give the best coverage.',
    completionNoteTemplate: 'Tested ___ CO detectors. All passed: yes/no.',
    iconKey: 'co_detector',
    targetingRulesJson: null,
    metadataJson: null,
  },
  {
    key: 'safety_sump_pump_test',
    title: 'Test Sump Pump Operation',
    shortDescription: 'Pour water into the pit to confirm the float activates and the pump runs.',
    description:
      'A failed sump pump during spring melt or heavy rain can flood a basement in hours. Seasonal testing — especially before spring — prevents costly water damage.',
    category: 'SAFETY',
    cadence: 'SEASONAL',
    difficulty: 'EASY',
    impactType: 'PREVENT_DAMAGE',
    estimatedMinutes: 10,
    isActive: true,
    isSeasonal: true,
    priority: 2,
    tipText: 'Also check that the discharge line is clear of ice and debris.',
    completionNoteTemplate: 'Tested sump pump on ___. Activated correctly: yes/no.',
    iconKey: 'sump_pump',
    targetingRulesJson: { seasons: ['SPRING'], requiredFlags: ['hasSumpPump'] },
    metadataJson: null,
  },
  {
    key: 'safety_fire_extinguisher_check',
    title: 'Inspect Fire Extinguisher Gauge',
    shortDescription: 'Confirm your kitchen extinguisher is in the green zone and accessible.',
    description:
      'Fire extinguishers lose pressure over time and need annual visual inspection. Check that the gauge needle is in the green zone, the pin is intact, and the unit hasn\'t been discharged.',
    category: 'SAFETY',
    cadence: 'ANNUAL',
    difficulty: 'EASY',
    impactType: 'IMPROVE_SAFETY',
    estimatedMinutes: 5,
    isActive: true,
    isSeasonal: false,
    priority: 3,
    tipText: 'Mount the extinguisher near the kitchen exit, not directly next to the stove.',
    completionNoteTemplate: 'Checked extinguisher on ___. Gauge in green: yes/no.',
    iconKey: 'fire_extinguisher',
    targetingRulesJson: { requiredFlags: ['hasFireExtinguisher'] },
    metadataJson: null,
  },

  // ── APPLIANCE ─────────────────────────────────────────────────────────────
  {
    key: 'appliance_dryer_vent_check',
    title: 'Clear Dryer Vent of Lint Buildup',
    shortDescription: 'Inspect and clean the dryer exhaust duct to reduce fire risk.',
    description:
      'Lint accumulation in dryer vents is a leading cause of home fires. Clean the exhaust duct from the dryer to the exterior vent annually — or more often with heavy use.',
    category: 'APPLIANCE',
    cadence: 'ANNUAL',
    difficulty: 'MODERATE',
    impactType: 'IMPROVE_SAFETY',
    estimatedMinutes: 30,
    isActive: true,
    isSeasonal: false,
    priority: 2,
    tipText: 'Use a dryer vent cleaning kit (flexible brush) — available for $20 at hardware stores.',
    completionNoteTemplate: 'Cleaned dryer vent on ___. Length of duct: ___ ft.',
    iconKey: 'dryer_vent',
    targetingRulesJson: null,
    metadataJson: null,
  },
  {
    key: 'appliance_dishwasher_seal_check',
    title: 'Inspect Dishwasher Door Seal',
    shortDescription: 'Look for cracks or buildup on the door gasket that could cause leaks.',
    description:
      'A damaged or dirty dishwasher door seal allows water to escape during cycles, risking floor and cabinet damage. Wipe down the gasket monthly and inspect for tears.',
    category: 'APPLIANCE',
    cadence: 'MONTHLY',
    difficulty: 'EASY',
    impactType: 'PREVENT_DAMAGE',
    estimatedMinutes: 5,
    isActive: true,
    isSeasonal: false,
    priority: 5,
    tipText: 'Wipe the seal with a damp cloth and a little white vinegar to remove mold and buildup.',
    completionNoteTemplate: 'Inspected dishwasher seal on ___. Condition: ___.',
    iconKey: 'dishwasher',
    targetingRulesJson: null,
    metadataJson: null,
  },
  {
    key: 'appliance_fridge_coil_clean',
    title: 'Vacuum Refrigerator Condenser Coils',
    shortDescription: 'Dirty coils make your fridge work harder and shorten its lifespan.',
    description:
      'Dust-coated condenser coils reduce efficiency and can cause the compressor to overheat. Cleaning them twice a year takes 10 minutes and extends the appliance life significantly.',
    category: 'APPLIANCE',
    cadence: 'SEASONAL',
    difficulty: 'EASY',
    impactType: 'IMPROVE_EFFICIENCY',
    estimatedMinutes: 10,
    isActive: true,
    isSeasonal: true,
    priority: 6,
    tipText: 'Pull the fridge out slightly and use a coil brush or vacuum with a narrow attachment.',
    completionNoteTemplate: 'Cleaned fridge coils on ___.',
    iconKey: 'refrigerator',
    targetingRulesJson: { seasons: ['SPRING', 'FALL'] },
    metadataJson: null,
  },

  // ── EXTERIOR ──────────────────────────────────────────────────────────────
  {
    key: 'exterior_gutter_inspection',
    title: 'Inspect & Clear Gutters',
    shortDescription: 'Check for clogs and damage after leaves fall and before heavy rain season.',
    description:
      'Blocked gutters can cause water to back up under roofing, damaging fascia and causing foundation seepage. Inspect and clean gutters each fall and spring.',
    category: 'EXTERIOR',
    cadence: 'SEASONAL',
    difficulty: 'MODERATE',
    impactType: 'PREVENT_DAMAGE',
    estimatedMinutes: 45,
    isActive: true,
    isSeasonal: true,
    priority: 2,
    tipText: 'Use a gutter scoop and garden hose. Check that downspouts discharge at least 4 feet from the foundation.',
    completionNoteTemplate: 'Cleaned gutters on ___. Downspouts clear: yes/no.',
    iconKey: 'gutter',
    targetingRulesJson: { seasons: ['FALL', 'SPRING'] },
    metadataJson: null,
  },
  {
    key: 'exterior_caulking_windows_doors',
    title: 'Inspect Caulk Around Windows & Doors',
    shortDescription: 'Cracked caulk lets in water, air, and insects — a quick fix saves big.',
    description:
      'Weathered or cracked caulk is one of the most common causes of water intrusion and energy loss. Walk the perimeter annually and re-caulk any gaps.',
    category: 'EXTERIOR',
    cadence: 'ANNUAL',
    difficulty: 'EASY',
    impactType: 'PREVENT_DAMAGE',
    estimatedMinutes: 30,
    isActive: true,
    isSeasonal: true,
    priority: 4,
    tipText: 'Use 100% silicone caulk for exterior applications — it\'s more weather-resistant than latex.',
    completionNoteTemplate: 'Inspected caulk on ___. Areas re-caulked: ___.',
    iconKey: 'caulk',
    targetingRulesJson: { seasons: ['SPRING', 'FALL'] },
    metadataJson: null,
  },

  // ── INTERIOR / GENERAL ────────────────────────────────────────────────────
  {
    key: 'interior_humidity_check_winter',
    title: 'Monitor Indoor Humidity Levels',
    shortDescription: 'Low winter humidity causes dry air, static, and wood shrinkage.',
    description:
      'Ideal indoor humidity is 30–50%. In winter, forced-air heating dries the air, causing wood floors to gap and respiratory discomfort. A $15 hygrometer helps you stay in range.',
    category: 'ENVIRONMENTAL',
    cadence: 'SEASONAL',
    difficulty: 'EASY',
    impactType: 'IMPROVE_AIR_QUALITY',
    estimatedMinutes: 5,
    isActive: true,
    isSeasonal: true,
    priority: 7,
    tipText: 'If humidity drops below 30%, run a room humidifier in bedrooms overnight.',
    completionNoteTemplate: 'Checked humidity on ___. Reading: ___%. Action taken: ___.',
    iconKey: 'humidity',
    targetingRulesJson: {
      seasons: ['WINTER'],
      climateRegions: ['COLD', 'VERY_COLD', 'MODERATE'],
    },
    metadataJson: null,
  },
  {
    key: 'general_monthly_walkthrough',
    title: 'Do a Monthly Home Walk-Through',
    shortDescription: 'A 10-minute lap around your home catches small issues before they grow.',
    description:
      'Walk through each room monthly looking for water stains on ceilings, cracks in walls, condensation on windows, or anything that changed since last month. Catching issues early saves big repair bills.',
    category: 'GENERAL',
    cadence: 'MONTHLY',
    difficulty: 'EASY',
    impactType: 'GENERAL_UPKEEP',
    estimatedMinutes: 10,
    isActive: true,
    isSeasonal: false,
    priority: 10,
    tipText: 'Bring your phone so you can photograph anything worth monitoring over time.',
    completionNoteTemplate: 'Walk-through completed ___. Notes: ___.',
    iconKey: 'walkthrough',
    targetingRulesJson: null, // general fallback — applies to all homes
    metadataJson: null,
  },
] as const;

export async function seedHabitTemplates(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Seeding HabitTemplate catalog...');

  for (const template of TEMPLATES) {
    await prisma.habitTemplate.upsert({
      where: { key: template.key },
      create: {
        ...template,
        targetingRulesJson: template.targetingRulesJson ?? undefined,
        metadataJson: template.metadataJson ?? undefined,
      },
      update: {
        title: template.title,
        shortDescription: template.shortDescription,
        description: template.description,
        category: template.category,
        cadence: template.cadence,
        difficulty: template.difficulty,
        impactType: template.impactType,
        estimatedMinutes: template.estimatedMinutes,
        isActive: template.isActive,
        isSeasonal: template.isSeasonal,
        priority: template.priority,
        tipText: template.tipText,
        completionNoteTemplate: template.completionNoteTemplate,
        iconKey: template.iconKey,
        targetingRulesJson: template.targetingRulesJson ?? undefined,
        metadataJson: template.metadataJson ?? undefined,
      },
    });
  }

  console.log(`✅ Upserted ${TEMPLATES.length} HabitTemplate records.`);
}

// Standalone execution
if (require.main === module) {
  const { PrismaClient: PC } = require('@prisma/client');
  const client = new PC();
  seedHabitTemplates(client)
    .catch(console.error)
    .finally(() => client.$disconnect());
}

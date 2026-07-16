// apps/workers/src/jobs/habitGeneration.job.ts
//
// Batch job: runs habit generation for every property in the database.
// Safe to run repeatedly — the generation engine deduplicates active/snoozed habits.
// Invoked by the weekly cron in worker.ts (Saturday 3:30 AM EST).

import { prisma } from '../lib/prisma';
import { generateHabitsForProperty } from '../../../backend/src/services/homeHabitCoach/habitGenerationEngine';
import { logger } from '../lib/logger';
import { createHash } from 'node:crypto';

function contextFact(key: string, value: unknown) {
  return {
    key,
    value: value ?? null,
    state: value === null || value === undefined ? 'UNKNOWN' : 'KNOWN',
    source: null,
    verified: false,
    confidence: null,
    observedAt: null,
    validUntil: null,
    correctionPath: null,
  };
}

function installedItemTypes(items: Array<{ category: string; name: string; tags: string[] }>): string[] {
  const result = new Set<string>();
  for (const item of items) {
    const text = `${item.category} ${item.name} ${item.tags.join(' ')}`.toUpperCase();
    result.add(item.category);
    if (/\b(AIR CONDITION|CENTRAL AC|WINDOW AC|HVAC_AC)\b/.test(text)) result.add('AIR_CONDITIONER');
    if (/\bFURNACE\b/.test(text)) result.add('FURNACE');
    if (/\b(WATER HEATER|BOILER)\b/.test(text)) result.add('WATER_HEATER');
    if (/\bDISHWASHER\b/.test(text)) result.add('DISHWASHER');
    if (/\b(DRYER|CLOTHES DRYER)\b/.test(text)) result.add('DRYER');
    if (/\b(REFRIGERATOR|FRIDGE)\b/.test(text)) result.add('REFRIGERATOR');
  }
  return [...result].sort();
}

const responsibilityKeys: Record<string, string> = {
  ROOF: 'responsibility.roof',
  BUILDING_EXTERIOR: 'responsibility.buildingExterior',
  LANDSCAPING: 'responsibility.landscaping',
  TREES_SHRUBS: 'responsibility.treesShrubs',
  DRIVEWAY_WALKWAYS: 'responsibility.drivewayWalkways',
  DECK_PATIO_BALCONY: 'responsibility.deckPatioBalcony',
  PLUMBING: 'responsibility.plumbing',
  HVAC: 'responsibility.hvac',
  COMMON_SAFETY: 'responsibility.commonSafety',
  SNOW_ICE: 'responsibility.snowIce',
  PEST_CONTROL: 'responsibility.pestControl',
  SHARED_SYSTEMS: 'responsibility.sharedSystems',
};

export function buildHabitPropertyContext(property: any, now: Date = new Date()): any {
  const facts: Record<string, any> = {};
  const add = (key: string, value: unknown) => { facts[key] = contextFact(key, value); };
  const exterior = property.exteriorProfile;
  add('core.dwellingType', property.dwellingType === 'UNKNOWN' ? null : property.dwellingType);
  add('core.yearBuilt', property.yearBuilt);
  add('location.state', property.state);
  add('location.climateRegion', property.climateSetting?.climateRegion);
  add('structure.roofType', property.roofType === 'UNKNOWN' ? null : property.roofType);
  add('exterior.hasIrrigation', exterior?.hasIrrigation);
  add('exterior.hasDrainageIssues', exterior?.hasDrainageIssues);
  add('systems.heatingType', property.heatingType === 'UNKNOWN' ? null : property.heatingType);
  add('systems.coolingType', property.coolingType === 'UNKNOWN' ? null : property.coolingType);
  add('systems.waterHeaterType', property.waterHeaterType === 'UNKNOWN' ? null : property.waterHeaterType);
  add('systems.installedItemTypes', installedItemTypes(property.inventoryItems ?? []));
  add('safety.hasSumpPumpBackup', property.hasSumpPumpBackup);
  add('safety.hasFireExtinguisher', property.hasFireExtinguisher);
  add('safety.hasSmokeDetectors', property.hasSmokeDetectors);
  add('safety.hasCoDetectors', property.hasCoDetectors);
  add('safety.hasSecuritySystem', property.hasSecuritySystem);
  for (const responsibility of property.responsibilities ?? []) {
    const key = responsibilityKeys[responsibility.scope];
    if (key) add(key, responsibility.party);
  }
  const scopes = ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY'];
  const stableFacts = Object.keys(facts).sort().map((key) => facts[key]);
  const contextVersion = createHash('sha256')
    .update(JSON.stringify({ propertyId: property.id, scopes: [...scopes].sort(), facts: stableFacts }))
    .digest('hex');
  return {
    propertyId: property.id,
    contextVersion,
    generatedAt: now.toISOString(),
    scopes,
    facts,
    warnings: [],
  };
}

export async function runHabitGenerationJob(): Promise<void> {
  logger.info(`[HABIT-GEN] Starting batch habit generation at ${new Date().toISOString()}`);

  const properties = await prisma.property.findMany({
    select: {
      id: true,
      dwellingType: true,
      yearBuilt: true,
      state: true,
      heatingType: true,
      coolingType: true,
      waterHeaterType: true,
      roofType: true,
      hasSumpPumpBackup: true,
      hasFireExtinguisher: true,
      hasSmokeDetectors: true,
      hasCoDetectors: true,
      hasSecuritySystem: true,
      climateSetting: { select: { climateRegion: true } },
      exteriorProfile: { select: { hasIrrigation: true, hasDrainageIssues: true } },
      responsibilities: { select: { scope: true, party: true } },
      inventoryItems: { select: { category: true, name: true, tags: true } },
    },
  });

  let successCount = 0;
  let failureCount = 0;
  let totalCreated = 0;

  for (const property of properties) {
    try {
      const result = await generateHabitsForProperty(property.id, buildHabitPropertyContext(property));
      successCount++;
      totalCreated += result.created;
    } catch (error) {
      failureCount++;
      logger.error({ err: error }, `[HABIT-GEN] Generation failed for property ${property.id}`);
    }
  }

  logger.info(
    `[HABIT-GEN] Batch complete. ` +
      `Success: ${successCount}, Failed: ${failureCount}, Total: ${properties.length}, Habits created: ${totalCreated}`,
  );
}

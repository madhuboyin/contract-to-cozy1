// apps/workers/src/jobs/seasonalChecklistGeneration.job.ts
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { evaluateSeasonalTemplateApplicability } from '@worker-shared/services/seasonal/applicabilityPolicy';
import { PropertyMaintenanceTaskService } from '@worker-shared/services/PropertyMaintenanceTask.service';
import {
  Season,
  getSeasonStartDate,
  getSeasonEndDate,
  resolveCurrentSeasonWindow,
  resolveUpcomingSeasonWindow,
} from '@worker-shared/services/seasonal/seasonWindow';

// Define types locally since they may not be exported from Prisma client
type NotificationTiming = 'EARLY' | 'STANDARD' | 'LATE';

// Type for seasonal task template
type SeasonalTaskTemplate = {
  id: string;
  taskKey: string;
  title: string;
  description: string | null;
  priority: string;
  requiredAssetType: string | null;
  requiredAssetCheck: string | null;
};

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
    if (/\b(FIREPLACE|CHIMNEY)\b/.test(text)) result.add('CHIMNEY');
    if (/\bIRRIGATION|SPRINKLER\b/.test(text)) result.add('IRRIGATION');
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

export function buildSeasonalPropertyContext(property: any, now: Date = new Date()): any {
  const types = installedItemTypes(property.inventoryItems ?? []);
  const exterior = property.exteriorProfile;
  const facts: Record<string, any> = {};
  const add = (key: string, value: unknown) => { facts[key] = contextFact(key, value); };
  add('location.isCoastal', null);
  add('structure.roofType', property.roofType === 'UNKNOWN' ? null : property.roofType);
  add('exterior.hasPrivateOutdoorSpace', exterior?.hasPrivateOutdoorSpace);
  add('exterior.outdoorSpaceTypes', exterior?.outdoorSpaceTypes);
  add('exterior.hasLawn', exterior?.hasLawn);
  add('exterior.hasTreesOrShrubs', exterior?.hasTreesOrShrubs);
  add('exterior.hasDriveway', exterior?.hasDriveway);
  add('exterior.hasPoolOrSpa', exterior?.hasPoolOrSpa);
  add('exterior.hasIrrigation', exterior?.hasIrrigation);
  add('exterior.hasOutdoorFaucets', exterior?.hasOutdoorFaucets);
  add('systems.hasCooling', property.coolingType && property.coolingType !== 'UNKNOWN'
    ? true
    : types.includes('AIR_CONDITIONER') ? true : null);
  add('systems.installedItemTypes', types);
  add('safety.hasSmokeDetectors', property.hasSmokeDetectors);
  add('safety.hasCoDetectors', property.hasCoDetectors);
  for (const responsibility of property.responsibilities ?? []) {
    const key = responsibilityKeys[responsibility.scope];
    if (key) add(key, responsibility.party);
  }
  add('maintenance.tasks', (property.maintenanceTasks ?? []).map((task: any) => ({
    seasonalTaskKey: task.seasonalChecklistItem?.taskKey ?? null,
    status: task.status,
    lastCompletedDate: task.lastCompletedDate?.toISOString() ?? null,
    updatedAt: task.updatedAt.toISOString(),
  })));
  return {
    propertyId: property.id,
    contextVersion: 'worker-current',
    generatedAt: now.toISOString(),
    scopes: ['LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'MAINTENANCE'],
    facts,
    warnings: [],
  };
}

/**
 * Background job to auto-generate seasonal checklists
 * Runs daily at 2am
 * 
 * FIXED LOGIC:
 * - Find all properties with autoGenerateChecklists=true
 * - Calculate days until next season starts
 * - Generate checklist when days <= notification offset (not exact match)
 * - Skip if checklist already exists for that season/year
 */
export async function generateSeasonalChecklists() {
  logger.info('[SEASONAL] Starting checklist generation job...');
  
  try {
    const today = new Date();

    // Get all properties. Applicability is evaluated from property context by
    // the checklist service rather than a permanent user segment.
    const properties = await prisma.property.findMany({
      include: {
        homeownerProfile: true,
        inventoryItems: true,
      },
    });

    logger.info(`[SEASONAL] Found ${properties.length} properties to check`);

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const property of properties) {
      try {
        // Get or create climate settings
        // @ts-ignore - Model exists in schema but may not be in generated client
        let climateSetting = await (prisma as any).propertyClimateSetting.findUnique({
          where: { propertyId: property.id },
        });
        
        if (!climateSetting) {
          // FIX: Create default climate setting with fallback region detection
          const detectedRegion = detectClimateRegionFallback(property.zipCode, property.state);
          
          // @ts-ignore - Model exists in schema but may not be in generated client
          climateSetting = await (prisma as any).propertyClimateSetting.create({
            data: {
              propertyId: property.id,
              climateRegion: detectedRegion,
              climateRegionSource: 'AUTO_DETECTED',
              notificationTiming: 'STANDARD',
              notificationEnabled: true,
              autoGenerateChecklists: true,
              excludedTaskKeys: [],
            },
          });
          
          logger.info(`[SEASONAL] Created climate settings for property ${property.id.substring(0, 8)}: ${detectedRegion}`);
        }
        
        // Skip if auto-generation is disabled
        if (climateSetting.autoGenerateChecklists === false) {
          skipped++;
          continue;
        }

        const climateRegion = climateSetting.climateRegion;
        const notificationTiming = climateSetting.notificationTiming || 'STANDARD';
        
        // Calculate notification offset days
        const offsetDays = getNotificationOffsetDays(notificationTiming);
        
        // Current and upcoming season windows; a season's `year` is the year
        // its start date falls in (winter in Jan–Mar belongs to the previous
        // calendar year), so both queries and generation stay consistent.
        const currentWindow = resolveCurrentSeasonWindow(today);
        const upcoming = resolveUpcomingSeasonWindow(today);
        const daysUntilNextSeason = upcoming.daysUntilStart;

        logger.info(
          `[SEASONAL] Property ${property.id.substring(0, 8)}: ` +
          `Current=${currentWindow.season} ${currentWindow.year}, Next=${upcoming.season} ${upcoming.year}, ` +
          `Days until=${daysUntilNextSeason}, Offset=${offsetDays}`
        );

        // Generate checklist if we're within the notification window (not exact match)
        // This ensures we don't miss generation if the cron runs slightly off schedule
        if (daysUntilNextSeason >= 0 && daysUntilNextSeason <= offsetDays) {
          // Check if checklist already exists
          // @ts-ignore - Model exists in schema but may not be in generated client
          const existingChecklist = await (prisma as any).seasonalChecklist.findFirst({
            where: {
              propertyId: property.id,
              season: upcoming.season,
              year: upcoming.year,
            },
          });

          if (existingChecklist) {
            logger.info(
              `[SEASONAL] Checklist already exists for ${property.id.substring(0, 8)} ` +
              `(${upcoming.season} ${upcoming.year})`
            );
            skipped++;
            continue;
          }

          // Generate the checklist
          logger.info(
            `[SEASONAL] Generating ${upcoming.season} ${upcoming.year} checklist for property ` +
            `${property.id.substring(0, 8)} (${daysUntilNextSeason} days until season)`
          );

          await generateChecklistForProperty(
            property.id,
            upcoming.season,
            upcoming.year,
            climateRegion
          );

          generated++;
        } else {
          // Also check current season - if season already started and no checklist exists, generate one
          // @ts-ignore
          const currentSeasonChecklist = await (prisma as any).seasonalChecklist.findFirst({
            where: {
              propertyId: property.id,
              season: currentWindow.season,
              year: currentWindow.year,
            },
          });

          if (!currentSeasonChecklist) {
            logger.info(
              `[SEASONAL] No checklist for current season ${currentWindow.season} ${currentWindow.year}, generating now for property ${property.id.substring(0, 8)}`
            );

            await generateChecklistForProperty(
              property.id,
              currentWindow.season,
              currentWindow.year,
              climateRegion
            );

            generated++;
          } else {
            skipped++;
          }
        }
      } catch (propertyError) {
        logger.error(
          `[SEASONAL] Error processing property ${property.id}:`,
          propertyError
        );
        errors++;
      }
    }

    logger.info(
      `[SEASONAL] Job complete. Generated: ${generated}, Skipped: ${skipped}, Errors: ${errors}`
    );
  } catch (error) {
    logger.error({ err: error }, '[SEASONAL] Fatal error in checklist generation job');
    throw error;
  }
}

/**
 * Generate a seasonal checklist for a specific property
 */
async function generateChecklistForProperty(
  propertyId: string,
  season: Season,
  year: number,
  climateRegion: string
) {
  // Get property with assets
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      exteriorProfile: true,
      responsibilities: true,
      inventoryItems: { select: { category: true, name: true, tags: true } },
      maintenanceTasks: {
        select: {
          status: true,
          lastCompletedDate: true,
          updatedAt: true,
          seasonalChecklistItem: { select: { taskKey: true } },
        },
      },
    },
  });

  if (!property) {
    throw new Error(`Property ${propertyId} not found`);
  }

  // Get climate setting
  // @ts-ignore - Model exists in schema but may not be in generated client
  const climateSetting = await (prisma as any).propertyClimateSetting.findUnique({
    where: { propertyId: propertyId },
  });

  // Get task templates for this season and climate
  // @ts-ignore - Model exists in schema but may not be in generated client
  const templates = await (prisma as any).seasonalTaskTemplate.findMany({
    where: {
      season: season,
      climateRegions: {
        hasSome: [climateRegion],
      },
      isActive: true,
    },
  });

  logger.info(
    `[SEASONAL] Found ${templates.length} templates for ${season} in ${climateRegion} climate`
  );

  // Filter templates based on user exclusions
  const excludedTaskKeys = climateSetting?.excludedTaskKeys || [];
  const includedTemplates = templates.filter((template: SeasonalTaskTemplate) => {
    return !excludedTaskKeys.includes(template.taskKey);
  });
  const propertyContext = buildSeasonalPropertyContext(property);
  const filteredTemplates = includedTemplates.filter((template: SeasonalTaskTemplate) =>
    evaluateSeasonalTemplateApplicability(propertyContext, template).status === 'APPLICABLE',
  );

  logger.info(
    `[SEASONAL] After filtering: ${filteredTemplates.length} tasks ` +
    `(excluded or inapplicable ${templates.length - filteredTemplates.length})`
  );

  // Calculate season dates
  const seasonStartDate = getSeasonStartDate(season, year);
  const seasonEndDate = getSeasonEndDate(season, year);

  // Create the checklist
  // @ts-ignore - Model exists in schema but may not be in generated client
  const checklist = await (prisma as any).seasonalChecklist.create({
    data: {
      propertyId,
      season,
      year,
      climateRegion,
      seasonStartDate,
      seasonEndDate,
      status: 'PENDING',
      totalTasks: filteredTemplates.length,
      tasksAdded: 0,
      tasksCompleted: 0,
      generatedAt: new Date(),
    },
  });

  // Create checklist items and, per W3 (maintenance/seasonal), promote each
  // one to a canonical PropertyMaintenanceTask immediately — seasonal
  // recommendations are no longer a parallel identity that only becomes
  // "real" once a homeowner clicks "Add to Checklist".
  let promoted = 0;
  let promotionFailed = 0;
  for (const template of filteredTemplates as SeasonalTaskTemplate[]) {
    // @ts-ignore - Model exists in schema but may not be in generated client
    const item = await (prisma as any).seasonalChecklistItem.create({
      data: {
        seasonalChecklistId: checklist.id,
        seasonalTaskTemplateId: template.id,
        propertyId,
        taskKey: template.taskKey,
        title: template.title,
        description: template.description,
        priority: template.priority,
        status: 'RECOMMENDED',
        recommendedDate: seasonStartDate,
      },
    });

    try {
      await PropertyMaintenanceTaskService.createFromSeasonalItemInternal(propertyId, item.id);
      promoted += 1;
    } catch (err) {
      promotionFailed += 1;
      logger.error(
        { err, seasonalItemId: item.id, propertyId },
        '[SEASONAL] Failed to promote seasonal item to a canonical maintenance task',
      );
    }
  }

  if (promoted > 0) {
    // @ts-ignore - Model exists in schema but may not be in generated client
    await (prisma as any).seasonalChecklist.update({
      where: { id: checklist.id },
      data: { tasksAdded: promoted },
    });
  }

  logger.info(
    `[SEASONAL] ✅ Created ${season} ${year} checklist with ${filteredTemplates.length} tasks ` +
    `(promoted ${promoted}, failed ${promotionFailed}) for property ${propertyId.substring(0, 8)}`
  );
}

/**
 * FIX: Fallback climate region detection without external JSON file
 * Uses simple state-based mapping
 */
function detectClimateRegionFallback(zipCode: string, state: string): string {
  // Simple state-based mapping
  const stateToClimate: Record<string, string> = {
    // Very Cold
    'AK': 'VERY_COLD',
    'ME': 'VERY_COLD',
    'VT': 'VERY_COLD',
    'NH': 'VERY_COLD',
    'MN': 'VERY_COLD',
    'ND': 'VERY_COLD',
    'SD': 'VERY_COLD',
    'MT': 'VERY_COLD',
    'WY': 'VERY_COLD',
    
    // Cold
    'WI': 'COLD',
    'MI': 'COLD',
    'NY': 'COLD',
    'MA': 'COLD',
    'CT': 'COLD',
    'RI': 'COLD',
    'IA': 'COLD',
    'IL': 'COLD',
    'IN': 'COLD',
    'OH': 'COLD',
    'PA': 'COLD',
    'ID': 'COLD',
    
    // Moderate
    'WA': 'MODERATE',
    'OR': 'MODERATE',
    'CA': 'MODERATE', // Northern CA
    'NV': 'MODERATE',
    'UT': 'MODERATE',
    'CO': 'MODERATE',
    'NE': 'MODERATE',
    'KS': 'MODERATE',
    'MO': 'MODERATE',
    'KY': 'MODERATE',
    'WV': 'MODERATE',
    'VA': 'MODERATE',
    'MD': 'MODERATE',
    'DE': 'MODERATE',
    'NJ': 'MODERATE',
    'NC': 'MODERATE',
    'TN': 'MODERATE',
    'AR': 'MODERATE',
    'OK': 'MODERATE',
    'NM': 'MODERATE',
    
    // Warm
    'AZ': 'WARM',
    'TX': 'WARM',
    'LA': 'WARM',
    'MS': 'WARM',
    'AL': 'WARM',
    'GA': 'WARM',
    'SC': 'WARM',
    
    // Tropical
    'FL': 'TROPICAL',
    'HI': 'TROPICAL',
  };
  
  const climateRegion = stateToClimate[state];
  if (climateRegion) {
    logger.info(`[SEASONAL] Detected climate region for ${state}: ${climateRegion}`);
    return climateRegion;
  }
  
  // Default to MODERATE
  logger.info(`[SEASONAL] No mapping for state ${state}, defaulting to MODERATE`);
  return 'MODERATE';
}

/**
 * Get notification offset days based on timing preference
 */
function getNotificationOffsetDays(timing: NotificationTiming): number {
  switch (timing) {
    case 'EARLY':
      return 21; // 3 weeks before
    case 'STANDARD':
      return 14; // 2 weeks before
    case 'LATE':
      return 7; // 1 week before
    default:
      return 14;
  }
}

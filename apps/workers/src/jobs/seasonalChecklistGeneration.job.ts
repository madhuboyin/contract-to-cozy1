// apps/workers/src/jobs/seasonalChecklistGeneration.job.ts
import { prisma } from '../lib/prisma';

// Define types locally since they may not be exported from Prisma client
type Season = 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER';
type NotificationTiming = 'EARLY' | 'STANDARD' | 'LATE';

// Type for seasonal task template
type SeasonalTaskTemplate = {
  id: string;
  taskKey: string;
  title: string;
  description: string | null;
  priority: string;
  assetRequirements?: any;
};

/**
 * Background job to auto-generate seasonal checklists
 * Runs daily at 2am
 * 
 * Logic:
 * - Find all EXISTING_OWNER properties with autoGenerateChecklists=true
 * - Calculate days until next season starts
 * - Generate checklist when days match notification offset (EARLY=21, STANDARD=14, LATE=7)
 * - Skip if checklist already exists for that season/year
 */
export async function generateSeasonalChecklists() {
  console.log('[SEASONAL] Starting checklist generation job...');
  
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Get all properties for EXISTING_OWNER homeowners with auto-generation enabled
    const properties = await prisma.property.findMany({
      where: {
        homeownerProfile: {
          segment: 'EXISTING_OWNER', // Only existing owners
        },
      },
      include: {
        homeownerProfile: true,
      },
    });

    console.log(`[SEASONAL] Found ${properties.length} EXISTING_OWNER properties to check`);

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const property of properties) {
      try {
        // Get climate settings or create default (query separately since relation may not be available)
        // @ts-ignore - Model exists in schema but may not be in generated client
        let climateSetting = await (prisma as any).propertyClimateSetting.findUnique({
          where: { propertyId: property.id },
        });
        
        if (!climateSetting) {
          // Create default climate setting with auto-detected region
          // @ts-ignore - Model exists in schema but may not be in generated client
          climateSetting = await (prisma as any).propertyClimateSetting.create({
            data: {
              propertyId: property.id,
              climateRegion: await detectClimateRegion(property.zipCode, property.state),
              climateRegionSource: 'AUTO_DETECTED',
              notificationTiming: 'STANDARD',
              notificationEnabled: true,
              autoGenerateChecklists: true,
              excludedTaskKeys: [],
            },
          });
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
        
        // Get current season and next season
        const currentSeason = getCurrentSeason(climateRegion, today);
        const nextSeason = getNextSeason(currentSeason);
        
        // Calculate when next season starts
        const nextSeasonStartDate = getSeasonStartDate(nextSeason, currentYear);
        const daysUntilNextSeason = Math.floor(
          (nextSeasonStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Handle year boundary for winter
        let targetYear = currentYear;
        if (nextSeason === 'WINTER' && currentSeason === 'FALL') {
          targetYear = currentYear + 1;
        }

        console.log(
          `[SEASONAL] Property ${property.id.substring(0, 8)}: ` +
          `Next season=${nextSeason}, Days until=${daysUntilNextSeason}, Offset=${offsetDays}`
        );

        // Generate checklist if we're at the notification threshold
        if (daysUntilNextSeason === offsetDays) {
          // Check if checklist already exists
          // @ts-ignore - Model exists in schema but may not be in generated client
          const existingChecklist = await (prisma as any).seasonalChecklist.findFirst({
            where: {
              propertyId: property.id,
              season: nextSeason,
              year: targetYear,
            },
          });

          if (existingChecklist) {
            console.log(
              `[SEASONAL] Checklist already exists for ${property.id.substring(0, 8)} ` +
              `(${nextSeason} ${targetYear})`
            );
            skipped++;
            continue;
          }

          // Generate the checklist
          console.log(
            `[SEASONAL] Generating ${nextSeason} ${targetYear} checklist for property ` +
            `${property.id.substring(0, 8)}`
          );

          await generateChecklistForProperty(
            property.id,
            nextSeason,
            targetYear,
            climateRegion
          );

          generated++;
        } else {
          skipped++;
        }
      } catch (propertyError) {
        console.error(
          `[SEASONAL] Error processing property ${property.id}:`,
          propertyError
        );
        errors++;
      }
    }

    console.log(
      `[SEASONAL] Job complete. Generated: ${generated}, Skipped: ${skipped}, Errors: ${errors}`
    );
  } catch (error) {
    console.error('[SEASONAL] Fatal error in checklist generation job:', error);
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
      homeAssets: true,
    },
  });

  if (!property) {
    throw new Error(`Property ${propertyId} not found`);
  }

  // Get climate setting separately (query separately since relation may not be available)
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
        has: climateRegion,
      },
    },
  });

  // Filter templates based on property assets
  const excludedTaskKeys = climateSetting?.excludedTaskKeys || [];
  const filteredTemplates = templates.filter((template: SeasonalTaskTemplate) => {
    // Skip if user has excluded this task
    if (excludedTaskKeys.includes(template.taskKey)) {
      return false;
    }

    // Check asset requirements
    return shouldIncludeTask(template, property);
  });

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

  // Create checklist items
  const items = filteredTemplates.map((template: SeasonalTaskTemplate) => ({
    seasonalChecklistId: checklist.id,
    seasonalTaskTemplateId: template.id,
    propertyId,
    taskKey: template.taskKey,
    title: template.title,
    description: template.description,
    priority: template.priority,
    status: 'RECOMMENDED',
    recommendedDate: seasonStartDate,
  }));

  // @ts-ignore - Model exists in schema but may not be in generated client
  await (prisma as any).seasonalChecklistItem.createMany({
    data: items,
  });

  console.log(
    `[SEASONAL] Created ${season} ${year} checklist with ${filteredTemplates.length} tasks ` +
    `for property ${propertyId.substring(0, 8)}`
  );
}

/**
 * Check if a task should be included based on property assets
 */
function shouldIncludeTask(template: any, property: any): boolean {
  const requirements = template.assetRequirements as any;
  
  if (!requirements) return true;

  // Check pool requirement
  if (requirements.has_pool && !property.has_pool) {
    return false;
  }

  // Check deck requirement
  if (requirements.has_deck && !property.has_deck) {
    return false;
  }

  // Check fireplace requirement
  if (requirements.has_fireplace && !property.has_fireplace) {
    return false;
  }

  // Check irrigation requirement
  if (requirements.hasIrrigation && !property.hasIrrigation) {
    return false;
  }

  // Check driveway requirement
  if (requirements.hasDriveway && !property.hasDriveway) {
    return false;
  }

  // Check lot size requirement (e.g., for lawn care)
  if (requirements.minLotSize && property.lotSize < requirements.minLotSize) {
    return false;
  }

  // Check cooling type (for AC-related tasks)
  if (requirements.coolingType && property.coolingType !== requirements.coolingType) {
    return false;
  }

  // Check heating type (for furnace-related tasks)
  if (requirements.heatingType && property.heatingType !== requirements.heatingType) {
    return false;
  }

  return true;
}

/**
 * Detect climate region from ZIP code
 */
async function detectClimateRegion(zipCode: string, state: string): Promise<string> {
  // Import climate mapping data
  const climateMapping = require('../data/zipToClimateRegion.json');
  
  // Try ZIP prefix (first 3 digits)
  const zipPrefix = zipCode.substring(0, 3);
  if (climateMapping.zipPrefixes[zipPrefix]) {
    return climateMapping.zipPrefixes[zipPrefix];
  }
  
  // Fallback to state
  if (climateMapping.states[state]) {
    return climateMapping.states[state];
  }
  
  // Default to MODERATE
  return 'MODERATE';
}

/**
 * Get current season based on climate region and date
 */
function getCurrentSeason(climateRegion: string, date: Date): Season {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Astronomical seasons (approximate)
  // Spring: March 20 - June 20
  // Summer: June 21 - September 22
  // Fall: September 23 - December 20
  // Winter: December 21 - March 19

  if ((month === 3 && day >= 20) || month === 4 || month === 5 || (month === 6 && day < 21)) {
    return 'SPRING';
  } else if ((month === 6 && day >= 21) || month === 7 || month === 8 || (month === 9 && day < 23)) {
    return 'SUMMER';
  } else if ((month === 9 && day >= 23) || month === 10 || month === 11 || (month === 12 && day < 21)) {
    return 'FALL';
  } else {
    return 'WINTER';
  }
}

/**
 * Get next season
 */
function getNextSeason(current: Season): Season {
  const seasons: Season[] = ['SPRING', 'SUMMER', 'FALL', 'WINTER'];
  const currentIndex = seasons.indexOf(current);
  return seasons[(currentIndex + 1) % 4];
}

/**
 * Get season start date
 */
function getSeasonStartDate(season: Season, year: number): Date {
  switch (season) {
    case 'SPRING':
      return new Date(year, 2, 20); // March 20
    case 'SUMMER':
      return new Date(year, 5, 21); // June 21
    case 'FALL':
      return new Date(year, 8, 23); // September 23
    case 'WINTER':
      return new Date(year, 11, 21); // December 21
    default:
      return new Date(year, 2, 20);
  }
}

/**
 * Get season end date
 */
function getSeasonEndDate(season: Season, year: number): Date {
  switch (season) {
    case 'SPRING':
      return new Date(year, 5, 20); // June 20
    case 'SUMMER':
      return new Date(year, 8, 22); // September 22
    case 'FALL':
      return new Date(year, 11, 20); // December 20
    case 'WINTER':
      return new Date(year, 2, 19); // March 19 (next year)
    default:
      return new Date(year, 5, 20);
  }
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
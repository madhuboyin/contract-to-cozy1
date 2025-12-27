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
  requiredAssetType: string | null;
  requiredAssetCheck: string | null;
};

/**
 * Background job to auto-generate seasonal checklists
 * Runs daily at 2am
 * 
 * FIXED LOGIC:
 * - Find all EXISTING_OWNER properties with autoGenerateChecklists=true
 * - Calculate days until next season starts
 * - Generate checklist when days <= notification offset (not exact match)
 * - Skip if checklist already exists for that season/year
 */
export async function generateSeasonalChecklists() {
  console.log('[SEASONAL] Starting checklist generation job...');
  
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Get all properties for EXISTING_OWNER homeowners
    const properties = await prisma.property.findMany({
      where: {
        homeownerProfile: {
          segment: 'EXISTING_OWNER', // Only existing owners
        },
      },
      include: {
        homeownerProfile: true,
        homeAssets: true,
      },
    });

    console.log(`[SEASONAL] Found ${properties.length} EXISTING_OWNER properties to check`);

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
          
          console.log(`[SEASONAL] Created climate settings for property ${property.id.substring(0, 8)}: ${detectedRegion}`);
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
        } else if (nextSeason === 'SPRING' && currentSeason === 'WINTER') {
          // Winter to Spring crosses year boundary if winter start date is in next year
          if (nextSeasonStartDate.getFullYear() > currentYear) {
            targetYear = nextSeasonStartDate.getFullYear();
          }
        }

        console.log(
          `[SEASONAL] Property ${property.id.substring(0, 8)}: ` +
          `Current=${currentSeason}, Next=${nextSeason}, Days until=${daysUntilNextSeason}, Offset=${offsetDays}`
        );

        // FIX: Generate checklist if we're within the notification window (not exact match)
        // This ensures we don't miss generation if the cron runs slightly off schedule
        if (daysUntilNextSeason >= 0 && daysUntilNextSeason <= offsetDays) {
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
            `${property.id.substring(0, 8)} (${daysUntilNextSeason} days until season)`
          );

          await generateChecklistForProperty(
            property.id,
            nextSeason,
            targetYear,
            climateRegion
          );

          generated++;
        } else {
          // FIX: Also check current season - if season just started and no checklist exists, generate one
          // @ts-ignore
          const currentSeasonChecklist = await (prisma as any).seasonalChecklist.findFirst({
            where: {
              propertyId: property.id,
              season: currentSeason,
              year: currentYear,
            },
          });

          if (!currentSeasonChecklist) {
            console.log(
              `[SEASONAL] No checklist for current season ${currentSeason} ${currentYear}, generating now for property ${property.id.substring(0, 8)}`
            );

            await generateChecklistForProperty(
              property.id,
              currentSeason,
              currentYear,
              climateRegion
            );

            generated++;
          } else {
            skipped++;
          }
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

  console.log(
    `[SEASONAL] Found ${templates.length} templates for ${season} in ${climateRegion} climate`
  );

  // Filter templates based on user exclusions
  const excludedTaskKeys = climateSetting?.excludedTaskKeys || [];
  const filteredTemplates = templates.filter((template: SeasonalTaskTemplate) => {
    return !excludedTaskKeys.includes(template.taskKey);
  });

  console.log(
    `[SEASONAL] After filtering: ${filteredTemplates.length} tasks ` +
    `(excluded ${templates.length - filteredTemplates.length})`
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

  // Create checklist items
  if (filteredTemplates.length > 0) {
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
  }

  console.log(
    `[SEASONAL] ✅ Created ${season} ${year} checklist with ${filteredTemplates.length} tasks ` +
    `for property ${propertyId.substring(0, 8)}`
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
    console.log(`[SEASONAL] Detected climate region for ${state}: ${climateRegion}`);
    return climateRegion;
  }
  
  // Default to MODERATE
  console.log(`[SEASONAL] No mapping for state ${state}, defaulting to MODERATE`);
  return 'MODERATE';
}

/**
 * Get current season based on climate region and date
 */
function getCurrentSeason(climateRegion: string, date: Date): Season {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Astronomical seasons
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
      // Winter ends in the NEXT year
      return new Date(year + 1, 2, 19); // March 19 (next year)
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
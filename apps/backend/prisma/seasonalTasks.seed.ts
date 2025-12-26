// apps/backend/prisma/seeds/seasonalTasks.seed.ts
/// <reference types="node" />
import { PrismaClient, Season, TaskPriority, ClimateRegion, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface TaskTemplateJson {
  taskKey: string;
  season: string;
  title: string;
  description?: string;
  whyItMatters?: string;
  typicalCostMin?: number;
  typicalCostMax?: number;
  isDiyPossible: boolean;
  estimatedHours?: number;
  priority: string;
  serviceCategory?: string;
  climateRegions: string[];
  assetRequirements?: Record<string, any>;
  recurrencePattern?: string;
}

async function seedSeasonalTasks() {
  console.log('🌱 Seeding seasonal task templates...');

  try {
    // Read the JSON file
    // Use import.meta.url for ES modules or require.resolve for CommonJS
    const dataPath = path.join(process.cwd(), 'src/data/seasonalTaskTemplates.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const templates: TaskTemplateJson[] = JSON.parse(rawData);

    console.log(`📋 Found ${templates.length} task templates to seed`);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const template of templates) {
      try {
        // Convert to proper Prisma types
        const data: Prisma.SeasonalTaskTemplateCreateInput = {
          taskKey: template.taskKey,
          season: template.season as Season,
          title: template.title,
          description: template.description || null,
          whyItMatters: template.whyItMatters || null,
          typicalCostMin: template.typicalCostMin 
            ? new Prisma.Decimal(template.typicalCostMin) 
            : null,
          typicalCostMax: template.typicalCostMax 
            ? new Prisma.Decimal(template.typicalCostMax) 
            : null,
          isDiyPossible: template.isDiyPossible,
          estimatedHours: template.estimatedHours || null,
          priority: template.priority as TaskPriority,
          serviceCategory: template.serviceCategory || null,
          climateRegions: template.climateRegions as ClimateRegion[],
          // Note: assetRequirements from JSON is not stored directly in the schema
          // The schema uses requiredAssetType and requiredAssetCheck instead
          recurrencePattern: template.recurrencePattern || undefined,
        };

        // Upsert the template
        const result = await prisma.seasonalTaskTemplate.upsert({
          where: { taskKey: template.taskKey },
          update: data,
          create: data,
        });

        if (result.createdAt === result.updatedAt) {
          created++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`❌ Error seeding task ${template.taskKey}:`, err);
        errors++;
      }
    }

    console.log('✅ Seasonal task templates seeded successfully!');
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${templates.length}`);
  } catch (error) {
    console.error('❌ Fatal error seeding seasonal tasks:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedSeasonalTasks()
  .catch((error) => {
    console.error('Seed script failed:', error);
    process.exit(1);
  });

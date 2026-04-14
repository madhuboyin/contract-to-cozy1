// apps/workers/src/jobs/habitGeneration.job.ts
//
// Batch job: runs habit generation for every property in the database.
// Safe to run repeatedly — the generation engine deduplicates active/snoozed habits.
// Invoked by the weekly cron in worker.ts (Saturday 3:30 AM EST).

import { prisma } from '../lib/prisma';
import { generateHabitsForProperty } from '../../../backend/src/services/homeHabitCoach/habitGenerationEngine';
import { logger } from '../lib/logger';

export async function runHabitGenerationJob(): Promise<void> {
  logger.info(`[HABIT-GEN] Starting batch habit generation at ${new Date().toISOString()}`);

  const properties = await prisma.property.findMany({
    select: { id: true },
  });

  let successCount = 0;
  let failureCount = 0;
  let totalCreated = 0;

  for (const property of properties) {
    try {
      const result = await generateHabitsForProperty(property.id);
      successCount++;
      totalCreated += result.created;
    } catch (error) {
      failureCount++;
      logger.error(`[HABIT-GEN] Generation failed for property ${property.id}:`, error);
    }
  }

  logger.info(
    `[HABIT-GEN] Batch complete. ` +
      `Success: ${successCount}, Failed: ${failureCount}, Total: ${properties.length}, Habits created: ${totalCreated}`,
  );
}

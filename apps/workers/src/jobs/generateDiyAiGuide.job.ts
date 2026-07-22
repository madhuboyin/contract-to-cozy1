// apps/workers/src/jobs/generateDiyAiGuide.job.ts
import { diyAiGuideService } from '@worker-shared/services/diyAiGuide.service';
import { logger } from '../lib/logger';

export const GENERATE_DIY_AI_GUIDE_JOB = 'GENERATE_DIY_AI_GUIDE';

export async function generateDiyAiGuideJob(guideId: string): Promise<void> {
  logger.info(`[DIY-AI-GUIDE] Starting generation for guide ${guideId}`);
  await diyAiGuideService.generate(guideId);
  logger.info(`[DIY-AI-GUIDE] Completed for guide ${guideId}`);
}

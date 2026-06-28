import { permitDetectionService } from '../../../backend/src/services/permitDetection.service';

export const DETECT_UNPERMITTED_WORK_JOB = 'detect-unpermitted-work';

export async function detectUnpermittedWorkJob(propertyId: string): Promise<void> {
  await permitDetectionService.detectUnpermittedWork(propertyId);
}

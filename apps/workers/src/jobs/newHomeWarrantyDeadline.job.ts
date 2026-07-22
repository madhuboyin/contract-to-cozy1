import { processNewHomeWarrantyDeadlines } from '@worker-shared/services/newHomeWarrantyDeadline.service';

export async function runNewHomeWarrantyDeadlineJob(opts?: { dryRun?: boolean; propertyId?: string }) {
  return processNewHomeWarrantyDeadlines({ dryRun: opts?.dryRun, propertyId: opts?.propertyId });
}

import { processNewHomeWarrantyDeadlines } from '@worker-shared/services/newHomeWarrantyDeadline.service';

export async function runNewHomeWarrantyDeadlineJob() {
  return processNewHomeWarrantyDeadlines();
}

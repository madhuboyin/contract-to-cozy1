import { processNewHomeWarrantyDeadlines } from '../../../backend/src/services/newHomeWarrantyDeadline.service';

export async function runNewHomeWarrantyDeadlineJob() {
  return processNewHomeWarrantyDeadlines();
}

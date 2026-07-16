import { prisma } from '../lib/prisma';
import { deriveChecklistProgress } from '../utils/seasonalProgress';

/**
 * Re-evaluate a seasonal checklist's COMPLETED/IN_PROGRESS status from its
 * item statuses. Uses derived progress (dismissed items are out of scope) so
 * dismissing the last pending item can complete a season, and reactivating
 * one reopens it. No-op for dismissed checklists.
 */
export async function syncSeasonalChecklistStatus(checklistId: string): Promise<void> {
  const checklist = await prisma.seasonalChecklist.findUnique({
    where: { id: checklistId },
    include: { items: { select: { status: true } } },
  });
  if (!checklist || checklist.status === 'DISMISSED') return;

  const progress = deriveChecklistProgress(checklist.items);

  if (progress.isFullyCompleted && checklist.status !== 'COMPLETED') {
    await prisma.seasonalChecklist.update({
      where: { id: checklistId },
      data: { status: 'COMPLETED' },
    });
  } else if (!progress.isFullyCompleted && checklist.status === 'COMPLETED') {
    await prisma.seasonalChecklist.update({
      where: { id: checklistId },
      data: { status: 'IN_PROGRESS' },
    });
  }
}

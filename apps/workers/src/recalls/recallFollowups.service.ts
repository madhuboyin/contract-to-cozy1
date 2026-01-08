// apps/workers/src/recalls/recallFollowups.service.ts
import { prisma } from '../lib/prisma';

const NOTIF_TYPE_RECALL = 'RECALL_ALERT';
const NOTIF_ENTITY_TYPE = 'RECALL_MATCH';

/**
 * You can tune these URLs later to match your frontend routes.
 * Keeping this stable makes notifications actionable.
 */
function buildActionUrl(propertyId: string, matchId: string) {
  // Example: property detail → safety alerts tab (future)
  // For now, link to property page; FE can add recall panel later.
  return `/dashboard/properties/${propertyId}?tab=recalls&matchId=${matchId}`;
}

function taskTitle(recallTitle: string) {
  return `Safety Recall: ${recallTitle}`;
}

function taskDescription(recall: any, inventoryItem: any) {
  const lines: string[] = [];
  if (recall.hazard) lines.push(`Hazard: ${recall.hazard}`);
  if (recall.remedy) lines.push(`Recommended: ${recall.remedy}`);
  if (recall.recallUrl) lines.push(`Details: ${recall.recallUrl}`);

  if (inventoryItem?.manufacturer || inventoryItem?.modelNumber) {
    lines.push(
      `Asset: ${(inventoryItem?.manufacturer || '').trim()} ${(inventoryItem?.modelNumber || '').trim()}`.trim()
    );
  }

  return lines.join('\n');
}

async function getUserIdForProperty(propertyId: string): Promise<string | null> {
  // Assumption: HomeownerProfile has userId (very likely in your system)
  const prop = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      homeownerProfile: { select: { userId: true } },
    },
  });

  return (prop as any)?.homeownerProfile?.userId ?? null;
}

async function ensureRecallNotification(params: {
  userId: string;
  propertyId: string;
  matchId: string;
  recallTitle: string;
  severity?: string | null;
  confidencePct: number;
  recallUrl?: string | null;
}) {
  // Dedupe rule:
  // 1) If there is already a notification for this recallMatchId + type, skip.
  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.userId,
      type: NOTIF_TYPE_RECALL,
      recallMatchId: params.matchId,
    },
    select: { id: true },
  });

  if (existing) return { created: false as const };

  const title = `Safety recall detected`;
  const message = params.recallTitle;

  const actionUrl = buildActionUrl(params.propertyId, params.matchId);

  await prisma.notification.create({
    data: {
      userId: params.userId,
      type: NOTIF_TYPE_RECALL,
      title,
      message,
      actionUrl,
      entityType: NOTIF_ENTITY_TYPE,
      entityId: params.matchId,
      recallMatchId: params.matchId,
      metadata: {
        propertyId: params.propertyId,
        recallTitle: params.recallTitle,
        severity: params.severity,
        confidencePct: params.confidencePct,
        recallUrl: params.recallUrl || null,
      },
    },
  });

  return { created: true as const };
}

export async function createFollowupsForOpenMatches(limit = 200) {
  const matches = await prisma.recallMatch.findMany({
    where: {
      status: 'OPEN',
      maintenanceTaskId: null,
    },
    include: {
      recall: true,
      inventoryItem: true,
      property: true,
    },
    take: limit,
  });

  let tasksCreated = 0;
  let notificationsCreated = 0;
  let notificationsSkipped = 0;

  for (const m of matches) {
    // 1) Create a task/action
    const task = await prisma.propertyMaintenanceTask.create({
      data: {
        propertyId: m.propertyId,
        title: taskTitle(m.recall.title),
        description: taskDescription(m.recall, m.inventoryItem),
        source: 'RECALL_ALERT', // matches your enum addition
      },
    });

    await prisma.recallMatch.update({
      where: { id: m.id },
      data: { maintenanceTaskId: task.id },
    });

    tasksCreated++;

    // 2) Create in-app notification (deduped)
    const userId = await getUserIdForProperty(m.propertyId);
    if (!userId) continue;

    const notif = await ensureRecallNotification({
      userId,
      propertyId: m.propertyId,
      matchId: m.id,
      recallTitle: m.recall.title,
      severity: m.recall.severity,
      confidencePct: m.confidencePct,
      recallUrl: m.recall.recallUrl,
    });

    if (notif.created) notificationsCreated++;
    else notificationsSkipped++;
  }

  return { tasksCreated, notificationsCreated, notificationsSkipped };
}

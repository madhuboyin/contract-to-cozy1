// apps/workers/src/recalls/recallTasks.service.ts
import { prisma } from '../lib/prisma';

export async function createTasksForOpenRecallMatches() {
  // Find open matches without tasks
  const matches = await prisma.recallMatch.findMany({
    where: {
      status: 'OPEN' as any,
      maintenanceTaskId: null,
    },
    include: {
      recall: true,
      inventoryItem: true,
      property: true,
    },
    take: 200,
  });

  let created = 0;

  for (const m of matches) {
    const title = `Safety Recall: ${m.recall.title}`;
    const description = buildTaskDescription(m);

    const task = await prisma.propertyMaintenanceTask.create({
      data: {
        propertyId: m.propertyId,
        title,
        description,
        source: 'RECALL_ALERT' as any,
        // Optional: you might map severity -> priority if your task model has it
        // priority: mapSeverity(m.recall.severity),
      },
    });

    await prisma.recallMatch.update({
      where: { id: m.id },
      data: { maintenanceTaskId: task.id },
    });

    created++;
  }

  return { created };
}

function buildTaskDescription(m: any) {
  const parts: string[] = [];
  if (m.recall.hazard) parts.push(`Hazard: ${m.recall.hazard}`);
  if (m.recall.remedy) parts.push(`Recommended: ${m.recall.remedy}`);
  if (m.recall.recallUrl) parts.push(`Details: ${m.recall.recallUrl}`);
  if (m.inventoryItem?.modelNumber) parts.push(`Asset model: ${m.inventoryItem.modelNumber}`);
  return parts.join('\n');
}

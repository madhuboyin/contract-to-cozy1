// apps/backend/src/services/maintenanceReminder.service.ts
//
// WKR-001 fix: the previous worker-side implementation
// (sendMaintenanceReminders in apps/workers/src/worker.ts) read legacy
// ChecklistItem rows, built email text, and only logged that a reminder was
// "sent" — it never created a notification, queued a delivery, or called
// the email transport, and swallowed all errors so the scheduler recorded a
// false-successful run.
//
// This sources reminders from the canonical PropertyMaintenanceTask model
// (the same model the Home/Plan & Projects surfaces and every other
// maintenance-producing job — warranty deadlines, permits, seasonal —
// already write to) and creates real governed notifications via
// NotificationService.create, mirroring newHomeWarrantyDeadline.service.ts.

import { prisma } from '../lib/prisma';
import { NotificationService } from './notification.service';
import { areWorkerOutboundNotificationsEnabled } from '../config/workerExecutionPolicy';

const DAY_MS = 24 * 60 * 60 * 1000;

// Reminders inside this window are treated as a material deadline (immediate
// delivery); everything further out is routine and folds into the weekly
// Home Brief — see the worker audit's Section 2 cadence contract.
const MATERIAL_DEADLINE_DAYS = 2;

export type MaintenanceReminderResult = {
  examined: number;
  notified: number;
  skipped: number;
};

export async function processMaintenanceReminders(options: {
  propertyId?: string;
  now?: Date;
  horizonDays?: number;
} = {}): Promise<MaintenanceReminderResult> {
  const now = options.now ?? new Date();
  const horizon = new Date(now.getTime() + (options.horizonDays ?? 7) * DAY_MS);
  const propertyFilter = options.propertyId ? { propertyId: options.propertyId } : {};

  const tasks = await prisma.propertyMaintenanceTask.findMany({
    where: {
      ...propertyFilter,
      status: 'PENDING',
      nextDueDate: { not: null, lte: horizon },
    },
    include: {
      property: { select: { homeownerProfile: { select: { userId: true } } } },
    },
  });

  let notified = 0;
  let skipped = 0;
  const transportEnabled = areWorkerOutboundNotificationsEnabled();

  for (const task of tasks) {
    const dueAt = task.nextDueDate!;
    // Idempotency: a reminder has already gone out for this exact due date.
    // Comparing timestamps (not just null-ness) means a completed-and-
    // rescheduled recurring task is reminded again for its new due date.
    if (task.remindedForDueDate && task.remindedForDueDate.getTime() === dueAt.getTime()) {
      skipped += 1;
      continue;
    }

    const userId = task.property.homeownerProfile?.userId;
    if (!userId) {
      skipped += 1;
      continue;
    }

    const daysUntilDue = Math.round((dueAt.getTime() - now.getTime()) / DAY_MS);
    const isMaterial = daysUntilDue <= MATERIAL_DEADLINE_DAYS;
    const dueLabel =
      daysUntilDue < 0
        ? `overdue since ${dueAt.toLocaleDateString()}`
        : daysUntilDue === 0
        ? 'due today'
        : `due ${dueAt.toLocaleDateString()} (in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'})`;

    const result = await NotificationService.create({
      userId,
      type: 'MAINTENANCE_TASK_REMINDER',
      title: `Maintenance reminder: ${task.title}`,
      message: `"${task.title}" is ${dueLabel}.`,
      actionUrl: `/dashboard/properties/${task.propertyId}/tools/guidance-overview`,
      entityType: 'PROPERTY_MAINTENANCE_TASK',
      entityId: task.id,
      category: isMaterial ? 'MATERIAL_DEADLINE' : 'MAINTENANCE',
      urgency: isMaterial ? 'MATERIAL' : 'ROUTINE',
      transportEnabled,
      metadata: {
        propertyId: task.propertyId,
        actionKey: task.actionKey ?? undefined,
        nextDueDate: dueAt.toISOString(),
        daysUntilDue,
      },
    });

    await prisma.propertyMaintenanceTask.update({
      where: { id: task.id },
      data: { remindedForDueDate: dueAt },
    });

    if (result) notified += 1;
    else skipped += 1;
  }

  return { examined: tasks.length, notified, skipped };
}

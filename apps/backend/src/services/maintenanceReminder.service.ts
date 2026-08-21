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
import { logger } from '../lib/logger';
import { createAskNotificationContinuation } from './ask/askNotificationContinuation.service';
import { operatingModeForOwnershipState } from './skills/context/propertyJourneyContext.contract';

const DAY_MS = 24 * 60 * 60 * 1000;

// Reminders inside this window are treated as a material deadline (immediate
// delivery); everything further out is routine and folds into the weekly
// Home Brief — see the worker audit's Section 2 cadence contract.
const MATERIAL_DEADLINE_DAYS = 2;

export type MaintenanceReminderResult = {
  examined: number;
  notified: number;
  skipped: number;
  failed: number;
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
      property: {
        select: {
          homeownerProfile: { select: { userId: true } },
          onboarding: { select: { ownershipState: true } },
        },
      },
    },
  });

  let notified = 0;
  let skipped = 0;
  let failed = 0;
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

    // Assigned household members own their task reminders. Unassigned tasks
    // retain the established primary-homeowner fallback.
    const userId = task.assignedToUserId ?? task.property.homeownerProfile?.userId;
    if (!userId) {
      skipped += 1;
      continue;
    }

    // Pre-close buyers don't yet possess the property, so "due in N days"
    // maintenance obligations don't apply — those only make sense once
    // ownership transfers (see resolutionCenter.service.ts / homeBriefing.service.ts
    // for the same pre-close suppression on the other homeowner-only surfaces).
    if (operatingModeForOwnershipState(task.property.onboarding?.ownershipState) === 'BUYING') {
      skipped += 1;
      continue;
    }

    // WKR-008: isolate per-task failures so one bad reminder doesn't abort
    // every other homeowner's reminder for the rest of this run.
    try {
      const daysUntilDue = Math.round((dueAt.getTime() - now.getTime()) / DAY_MS);
      const isMaterial = daysUntilDue <= MATERIAL_DEADLINE_DAYS;
      const dueLabel =
        daysUntilDue < 0
          ? `overdue since ${dueAt.toLocaleDateString()}`
          : daysUntilDue === 0
          ? 'due today'
          : `due ${dueAt.toLocaleDateString()} (in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'})`;
      const domainActionUrl = `/dashboard/maintenance?propertyId=${encodeURIComponent(task.propertyId)}&taskId=${encodeURIComponent(task.id)}&from=notification`;
      let continuation: Awaited<ReturnType<typeof createAskNotificationContinuation>> | null = null;
      try {
        continuation = await createAskNotificationContinuation({
          userId,
          propertyId: task.propertyId,
          triggerKey: `maintenance-deadline:${task.id}:${dueAt.toISOString()}`,
          operationId: 'MAINTENANCE_STATUS',
          question: `"${task.title}" is ${dueLabel}. Why does this matter, and what should I do next?`,
          reasonCode: 'MAINTENANCE_DEADLINE_MONITOR_TRIGGERED',
          title: `Maintenance attention: ${task.title}`,
          body: `"${task.title}" is ${dueLabel}. Review the canonical task now to complete it, reschedule it, or correct the due date. Keeping the record current prevents missed work from remaining hidden in future home planning.`,
          tone: daysUntilDue < 0 ? 'CRITICAL' : daysUntilDue <= MATERIAL_DEADLINE_DAYS ? 'CAUTION' : 'DEFAULT',
          details: [
            { label: 'What changed', value: dueLabel },
            { label: 'Why it matters', value: 'The recorded maintenance obligation has entered its reminder window and may need completion, rescheduling, or correction' },
            { label: 'Recommended next action', value: 'Review the task and record the current outcome or next due date' },
          ],
          domainAction: { id: 'open-maintenance-task', label: 'Open maintenance task', href: domainActionUrl },
          parameters: { taskId: task.id, dueAt: dueAt.toISOString(), daysUntilDue, actionKey: task.actionKey ?? null },
          suggestions: ['What maintenance is still pending?', `Help me review ${task.title}`],
        });
      } catch (error) {
        logger.error({ err: error, taskId: task.id }, '[maintenance-reminders] Failed to create Ask continuation');
      }

      const result = await NotificationService.create({
        userId,
        type: 'MAINTENANCE_TASK_REMINDER',
        title: `Maintenance reminder: ${task.title}`,
        message: `"${task.title}" is ${dueLabel}. Open Ask to see why it matters and review the recommended next action.`,
        actionUrl: continuation?.actionUrl ?? domainActionUrl,
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
          askExecutionId: continuation?.executionId,
          askSessionId: continuation?.sessionId,
          domainActionUrl,
        },
      });

      await prisma.propertyMaintenanceTask.update({
        where: { id: task.id },
        data: { remindedForDueDate: dueAt },
      });

      if (result) notified += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      logger.error({ err, taskId: task.id, propertyId: task.propertyId }, '[maintenance-reminders] Failed to remind for task');
    }
  }

  if (failed > 0 && failed === tasks.length) {
    throw new Error(`[maintenance-reminders] All ${failed} task(s) failed — rejecting run instead of reporting false success`);
  }

  return { examined: tasks.length, notified, skipped, failed };
}

// apps/backend/src/services/orchestrationSuppression.service.ts

import { prisma } from '../lib/prisma';
import { ChecklistItemStatus } from '@prisma/client';

export type SuppressionSource =
  | {
      type: 'PROPERTY_MAINTENANCE_TASK';
      task: {
        id: string;
        title: string;
        nextDueDate: Date | null;
        status: string;
      };
    }
  | {
      type: 'CHECKLIST_ITEM';
      checklistItem: {
        id: string;
        title: string;
        frequency?: string | null;
        nextDueDate?: Date | null;
        status: ChecklistItemStatus;
      };
    }
  | {
      type: 'USER_EVENT';
      eventType: 'USER_MARKED_COMPLETE' | 'USER_UNMARKED_COMPLETE';
      createdAt: Date;
    }
  | null;

export class OrchestrationSuppressionService {
  /**
   * Canonical suppression resolution.
   *
   * Precedence:
   * 1. Latest USER_EVENT (MARK / UNMARK)
   * 2. PropertyMaintenanceTask (new system)
   * 3. Checklist-backed suppression (legacy system)
   */
  static async resolveSuppressionSource(params: {
    propertyId: string;
    actionKey: string;
  }): Promise<SuppressionSource> {
    const { propertyId, actionKey } = params;

    /* --------------------------------------------
    * 1️⃣ USER EVENT (highest precedence)
    * ------------------------------------------ */
    const latestEvent = await prisma.orchestrationActionEvent.findFirst({
      where: {
        propertyId,
        actionKey,
        actionType: {
          in: ['USER_MARKED_COMPLETE', 'USER_UNMARKED_COMPLETE'],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        actionType: true,
        createdAt: true,
      },
    });

    if (latestEvent !== null) {
      if (
        latestEvent.actionType === 'USER_MARKED_COMPLETE' ||
        latestEvent.actionType === 'USER_UNMARKED_COMPLETE'
      ) {
        return {
          type: 'USER_EVENT',
          eventType: latestEvent.actionType,
          createdAt: latestEvent.createdAt,
        };
      }
    }

    /* --------------------------------------------
    * 2️⃣ PROPERTY MAINTENANCE TASK (new system)
    * ✅ CHECK THIS FIRST BEFORE LEGACY
    * ------------------------------------------ */
    const maintenanceTask = await prisma.propertyMaintenanceTask.findFirst({
      where: {
        propertyId,
        actionKey,
      },
      select: {
        id: true,
        title: true,
        nextDueDate: true,
        status: true,
      },
    });

    if (maintenanceTask) {
      console.log('✅ Found suppression via PropertyMaintenanceTask:', {
        actionKey,
        taskId: maintenanceTask.id,
        title: maintenanceTask.title,
      });

      return {
        type: 'PROPERTY_MAINTENANCE_TASK',
        task: maintenanceTask,
      };
    }

    /* --------------------------------------------
    * 3️⃣ CHECKLIST ITEM SUPPRESSION (legacy)
    * ------------------------------------------ */
    const checklistItem = await prisma.checklistItem.findFirst({
      where: {
        propertyId,
        actionKey,
      },
      select: {
        id: true,
        title: true,
        frequency: true,
        nextDueDate: true,
        status: true,
      },
    });

    if (checklistItem) {
      console.log('⚠️  Found suppression via LEGACY ChecklistItem:', {
        actionKey,
        itemId: checklistItem.id,
        title: checklistItem.title,
      });

      return {
        type: 'CHECKLIST_ITEM',
        checklistItem,
      };
    }

    return null;
  }
}
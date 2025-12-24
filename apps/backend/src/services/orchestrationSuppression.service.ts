// apps/backend/src/services/orchestrationSuppression.service.ts

import { prisma } from '../lib/prisma';
import { ChecklistItemStatus, OrchestrationActionEventType } from '@prisma/client';

export type SuppressionSource =
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
      eventType: 'USER_MARKED_COMPLETE';
      createdAt: Date;
    }
  | null;

export class OrchestrationSuppressionService {
  /**
   * Resolves the authoritative suppression source for an orchestration action.
   *
   * Priority:
   * 1. USER_MARKED_COMPLETE (latest event wins, undo-aware)
   * 2. Checklist item linkage (legacy / system-driven)
   */
  static async resolveSuppressionSource(params: {
    propertyId: string;
    orchestrationActionId: string;
    actionKey?: string; // preferred when available
  }): Promise<SuppressionSource> {
    const { propertyId, orchestrationActionId, actionKey } = params;

    if (!propertyId) {
      return null;
    }

    // ---------------------------------------------------------------------
    // 1️⃣ USER EVENT–BASED SUPPRESSION (AUTHORITATIVE, IDEMPOTENT)
    // ---------------------------------------------------------------------

    if (actionKey) {
      const events = await prisma.orchestrationActionEvent.findMany({
        where: {
          propertyId,
          actionKey,
          actionType: {
            in: [
              OrchestrationActionEventType.USER_MARKED_COMPLETE,
              OrchestrationActionEventType.USER_UNMARKED_COMPLETE,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 1, // only latest matters
      });

      const latest = events[0];

      if (latest?.actionType === OrchestrationActionEventType.USER_MARKED_COMPLETE) {
        return {
          type: 'USER_EVENT',
          eventType: 'USER_MARKED_COMPLETE',
          createdAt: latest.createdAt,
        };
      }

      // If latest is UNMARK, explicitly not suppressed
      if (latest?.actionType === OrchestrationActionEventType.USER_UNMARKED_COMPLETE) {
        return null;
      }
    }

    // ---------------------------------------------------------------------
    // 2️⃣ CHECKLIST-BASED SUPPRESSION (LEGACY / SYSTEM)
    // ---------------------------------------------------------------------

    if (!orchestrationActionId) {
      return null;
    }

    const checklistItem = await prisma.checklistItem.findFirst({
      where: {
        propertyId,
        orchestrationActionId,
      },
      select: {
        id: true,
        title: true,
        frequency: true,
        nextDueDate: true,
        status: true,
      },
    });

    if (!checklistItem) {
      return null;
    }

    return {
      type: 'CHECKLIST_ITEM',
      checklistItem,
    };
  }
}

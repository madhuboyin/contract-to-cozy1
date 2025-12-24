// apps/backend/src/services/orchestrationSuppression.service.ts

import { prisma } from '../lib/prisma';
import { ChecklistItemStatus } from '@prisma/client';

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
   * 2. Checklist-backed suppression
   */
/**
 * Canonical suppression resolution.
 *
 * Precedence:
 * 1. Latest USER_EVENT (MARK / UNMARK)
 * 2. Checklist-backed suppression (via actionKey)
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
    * 2️⃣ CHECKLIST ITEM SUPPRESSION (via actionKey)
    * ✅ DIRECT LOOKUP - NO FALLBACKS NEEDED
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

    if (!checklistItem) {
      return null;
    }

    return {
      type: 'CHECKLIST_ITEM',
      checklistItem,
    };
  }
}

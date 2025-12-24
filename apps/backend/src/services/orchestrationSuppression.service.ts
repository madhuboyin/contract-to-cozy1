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
  | null;

export class OrchestrationSuppressionService {
  /**
   * Resolves the source of suppression for a given orchestration action.
   * Currently supports checklist-based suppression.
   */
  static async resolveSuppressionSource(params: {
    propertyId: string;
    orchestrationActionId: string;
  }): Promise<SuppressionSource> {
    const { propertyId, orchestrationActionId } = params;

    if (!propertyId || !orchestrationActionId) {
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

// apps/backend/src/modules/gazette/services/gazettePublish.service.ts
// Handles publish vs skip decision and edition lifecycle management.

import { GazetteEdition } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { GazetteWeekWindow } from '../types/gazette.types';

export class GazettePublishService {
  /**
   * Publish or skip an edition based on qualified story count.
   */
  static async publishOrSkip(
    edition: GazetteEdition,
    qualifiedCount: number,
    selectedCount: number,
  ): Promise<GazetteEdition> {
    const shouldPublish =
      qualifiedCount >= edition.minQualifiedNeeded && selectedCount > 0;

    if (shouldPublish) {
      return prisma.gazetteEdition.update({
        where: { id: edition.id },
        data: {
          status: 'PUBLISHED' as any,
          publishedAt: new Date(),
          qualifiedCount,
          selectedCount,
        },
      });
    } else {
      const skippedReason = GazettePublishService._buildSkippedReason(
        qualifiedCount,
        edition.minQualifiedNeeded,
        selectedCount,
      );

      return prisma.gazetteEdition.update({
        where: { id: edition.id },
        data: {
          status: 'SKIPPED' as any,
          qualifiedCount,
          selectedCount,
          skippedReason,
        },
      });
    }
  }

  /**
   * Find or create an edition for a property + week window (idempotent).
   */
  static async findOrCreateEdition(
    propertyId: string,
    weekWindow: GazetteWeekWindow,
  ): Promise<{ edition: GazetteEdition; isNew: boolean }> {
    const { weekStart, weekEnd } = weekWindow;

    // Attempt to find existing edition
    const existing = await prisma.gazetteEdition.findFirst({
      where: {
        propertyId,
        weekStart,
        weekEnd,
      },
    });

    if (existing) {
      return { edition: existing, isNew: false };
    }

    // Create new edition
    const created = await prisma.gazetteEdition.create({
      data: {
        propertyId,
        weekStart,
        weekEnd,
        status: 'DRAFT' as any,
        minQualifiedNeeded: 4,
        qualifiedCount: 0,
        selectedCount: 0,
        generationVersion: 'v1.0.0',
      },
    });

    return { edition: created, isNew: true };
  }

  /**
   * Get the ISO week window (Monday 00:00 UTC to Sunday 23:59:59.999 UTC)
   * containing the reference date. Defaults to today.
   */
  static getWeekWindow(referenceDate?: Date): GazetteWeekWindow {
    const ref = referenceDate ?? new Date();

    // Clone and normalize to UTC midnight
    const d = new Date(
      Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
    );

    // ISO week: Monday = 1, Sunday = 0. getUTCDay() returns 0 for Sunday.
    const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, ..., 6=Sat

    // Days to subtract to reach Monday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - daysToMonday);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private static _buildSkippedReason(
    qualifiedCount: number,
    minQualifiedNeeded: number,
    selectedCount: number,
  ): string {
    if (qualifiedCount === 0) {
      return `No stories qualified for this edition (minimum ${minQualifiedNeeded} required).`;
    }
    if (selectedCount === 0) {
      return `${qualifiedCount} stories qualified but none were selected after ranking.`;
    }
    return `Only ${qualifiedCount} of ${minQualifiedNeeded} required stories qualified. Edition skipped to maintain quality bar.`;
  }
}

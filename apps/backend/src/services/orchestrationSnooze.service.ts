// apps/backend/src/services/orchestrationSnooze.service.ts

import { prisma } from '../lib/prisma';

export type ActiveSnooze = {
  id: string;
  snoozedAt: Date;
  snoozeUntil: Date;
  snoozeReason: string | null;
  daysRemaining: number;
};

/**
 * Get active snooze for an action
 */
export async function getActiveSnooze(
  propertyId: string,
  actionKey: string
): Promise<ActiveSnooze | null> {
  const now = new Date();

  const snooze = await prisma.orchestrationActionSnooze.findFirst({
    where: {
      propertyId,
      actionKey,
      endedAt: null,
      snoozeUntil: { gt: now },
    },
    orderBy: { snoozedAt: 'desc' },
  });

  if (!snooze) return null;

  const diffTime = snooze.snoozeUntil.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    id: snooze.id,
    snoozedAt: snooze.snoozedAt,
    snoozeUntil: snooze.snoozeUntil,
    snoozeReason: snooze.snoozeReason,
    daysRemaining,
  };
}

/**
 * Snooze an action
 */
export async function snoozeAction(params: {
  propertyId: string;
  actionKey: string;
  snoozeUntil: Date;
  snoozeReason?: string;
}): Promise<{ success: boolean }> {
  const { propertyId, actionKey, snoozeUntil, snoozeReason } = params;

  // End any existing active snoozes for this action
  await prisma.orchestrationActionSnooze.updateMany({
    where: {
      propertyId,
      actionKey,
      endedAt: null,
    },
    data: {
      endedAt: new Date(),
    },
  });

  // Create new snooze
  await prisma.orchestrationActionSnooze.create({
    data: {
      propertyId,
      actionKey,
      snoozeUntil,
      snoozeReason: snoozeReason ?? null,
    },
  });

  return { success: true };
}

/**
 * Un-snooze an action (bring back immediately)
 */
export async function unsnoozeAction(
  propertyId: string,
  actionKey: string
): Promise<{ success: boolean }> {
  await prisma.orchestrationActionSnooze.updateMany({
    where: {
      propertyId,
      actionKey,
      endedAt: null,
    },
    data: {
      endedAt: new Date(),
    },
  });

  return { success: true };
}

/**
 * Get all active snoozes for a property
 */
export async function getPropertySnoozes(
  propertyId: string
): Promise<Map<string, ActiveSnooze>> {
  const now = new Date();

  const snoozes = await prisma.orchestrationActionSnooze.findMany({
    where: {
      propertyId,
      endedAt: null,
      snoozeUntil: { gt: now },
    },
    orderBy: { snoozedAt: 'desc' },
  });

  const snoozeMap = new Map<string, ActiveSnooze>();

  for (const snooze of snoozes) {
    // Only keep most recent snooze per actionKey
    if (snoozeMap.has(snooze.actionKey)) continue;

    const diffTime = snooze.snoozeUntil.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    snoozeMap.set(snooze.actionKey, {
      id: snooze.id,
      snoozedAt: snooze.snoozedAt,
      snoozeUntil: snooze.snoozeUntil,
      snoozeReason: snooze.snoozeReason,
      daysRemaining,
    });
  }

  return snoozeMap;
}
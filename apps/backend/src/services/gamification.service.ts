// apps/backend/src/services/gamification.service.ts

import { prisma } from '../lib/prisma';

const STREAK_EXPIRY_DAYS = 7;
const STREAK_MILESTONE_SIZE = 3;
const BONUS_STEP = 0.05;
const MAX_BONUS_MULTIPLIER = 1.25;
const MIN_BONUS_MULTIPLIER = 1.0;

export interface PropertyStreakState {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date | null;
  bonusMultiplier: number;
}

export interface StreakUpdateResult extends PropertyStreakState {
  milestoneReached: boolean;
}

function clampBonusMultiplier(value: number) {
  return Math.min(MAX_BONUS_MULTIPLIER, Math.max(MIN_BONUS_MULTIPLIER, value));
}

function isStreakExpired(lastActivityDate: Date | null, now = new Date()) {
  if (!lastActivityDate) return false;
  const expiryMs = STREAK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - lastActivityDate.getTime() > expiryMs;
}

export async function getPropertyStreakState(propertyId: string): Promise<PropertyStreakState> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      currentStreak: true,
      longestStreak: true,
      lastActivityDate: true,
      bonusMultiplier: true,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  return {
    currentStreak: property.currentStreak,
    longestStreak: property.longestStreak,
    lastActivityDate: property.lastActivityDate,
    bonusMultiplier: property.bonusMultiplier,
  };
}

export async function evaluateStreakExpiry(propertyId: string): Promise<PropertyStreakState> {
  const property = await getPropertyStreakState(propertyId);

  if (!isStreakExpired(property.lastActivityDate) || property.currentStreak === 0) {
    return property;
  }

  const updated = await prisma.property.update({
    where: { id: propertyId },
    data: {
      currentStreak: 0,
    },
    select: {
      currentStreak: true,
      longestStreak: true,
      lastActivityDate: true,
      bonusMultiplier: true,
    },
  });

  return {
    currentStreak: updated.currentStreak,
    longestStreak: updated.longestStreak,
    lastActivityDate: updated.lastActivityDate,
    bonusMultiplier: updated.bonusMultiplier,
  };
}

export async function incrementStreak(propertyId: string): Promise<StreakUpdateResult> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const property = await tx.property.findUnique({
      where: { id: propertyId },
      select: {
        currentStreak: true,
        longestStreak: true,
        lastActivityDate: true,
        bonusMultiplier: true,
      },
    });

    if (!property) {
      throw new Error('Property not found');
    }

    const expired = isStreakExpired(property.lastActivityDate, now);
    const previousStreak = expired ? 0 : property.currentStreak;
    const nextCurrentStreak = previousStreak + 1;
    const nextLongestStreak = Math.max(property.longestStreak, nextCurrentStreak);

    const previousMilestoneCount = Math.floor(previousStreak / STREAK_MILESTONE_SIZE);
    const nextMilestoneCount = Math.floor(nextCurrentStreak / STREAK_MILESTONE_SIZE);
    const milestoneDelta = Math.max(0, nextMilestoneCount - previousMilestoneCount);
    const milestoneReached = milestoneDelta > 0;

    const nextBonusMultiplier = clampBonusMultiplier(
      property.bonusMultiplier + milestoneDelta * BONUS_STEP
    );

    const updated = await tx.property.update({
      where: { id: propertyId },
      data: {
        currentStreak: nextCurrentStreak,
        longestStreak: nextLongestStreak,
        lastActivityDate: now,
        bonusMultiplier: nextBonusMultiplier,
      },
      select: {
        currentStreak: true,
        longestStreak: true,
        lastActivityDate: true,
        bonusMultiplier: true,
      },
    });

    return {
      currentStreak: updated.currentStreak,
      longestStreak: updated.longestStreak,
      lastActivityDate: updated.lastActivityDate,
      bonusMultiplier: updated.bonusMultiplier,
      milestoneReached,
    };
  });
}


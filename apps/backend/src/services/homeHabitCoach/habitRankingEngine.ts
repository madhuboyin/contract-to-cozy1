// apps/backend/src/services/homeHabitCoach/habitRankingEngine.ts
//
// Behavior-aware ranking layer for PropertyHabit records.
//
// The generation engine assigns a static `priorityScore` at creation time.
// This module computes a live-adjusted score that accounts for:
//   - Due-date proximity (overdue or imminent habits rise in priority)
//   - Snooze fatigue (repeatedly-snoozed habits are gently deprioritized)
//   - Category dismissal signals (if user just dismissed a SAFETY habit, other SAFETY
//     habits slide down temporarily so the feed doesn't feel repetitive)
//
// Spotlight selection additionally prefers actionable, quick habits over long ones
// when scores are similar, improving the first-tap engagement rate.

import { prisma } from '../../lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RankableHabit {
  id: string;
  status: string;
  priorityScore: number | null;
  dueAt: Date | null;
  snoozedUntil: Date | null;
  habitTemplate: {
    id: string;
    category: string;
    estimatedMinutes: number | null;
  };
}

interface BehaviorSignals {
  snoozeCountByHabit: Map<string, number>;
  recentDismissByCategory: Map<string, Date>;
}

// ─── Signal loading ────────────────────────────────────────────────────────────

async function loadBehaviorSignals(propertyId: string): Promise<BehaviorSignals> {
  // Snooze counts per habit (all time — a habit snoozed 5+ times is clearly being avoided)
  const snoozeCounts = await prisma.propertyHabitAction.groupBy({
    by: ['propertyHabitId'],
    where: { propertyId, actionType: 'SNOOZED' },
    _count: { id: true },
  });
  const snoozeCountByHabit = new Map(snoozeCounts.map((r) => [r.propertyHabitId, r._count.id]));

  // Recently dismissed habits (last 30 days) for category-level signal
  const recentDismissals = await prisma.propertyHabit.findMany({
    where: {
      propertyId,
      status: 'DISMISSED',
      lastActionAt: { gte: new Date(Date.now() - 30 * DAY_MS) },
    },
    select: {
      lastActionAt: true,
      habitTemplate: { select: { category: true } },
    },
  });

  const recentDismissByCategory = new Map<string, Date>();
  for (const habit of recentDismissals) {
    if (!habit.lastActionAt) continue;
    const existing = recentDismissByCategory.get(habit.habitTemplate.category);
    if (!existing || habit.lastActionAt > existing) {
      recentDismissByCategory.set(habit.habitTemplate.category, habit.lastActionAt);
    }
  }

  return { snoozeCountByHabit, recentDismissByCategory };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function computeLiveRankScore(habit: RankableHabit, signals: BehaviorSignals): number {
  let score = habit.priorityScore ?? 50;

  // Due proximity bonus — imminent or overdue habits bubble up
  if (habit.dueAt) {
    const diffDays = (habit.dueAt.getTime() - Date.now()) / DAY_MS;
    if (diffDays < 0) score += 20;       // Overdue
    else if (diffDays <= 1) score += 15; // Due today or tomorrow
    else if (diffDays <= 7) score += 8;  // Due this week
    else if (diffDays <= 14) score += 3; // Due within two weeks
  }

  // Snooze fatigue — if user keeps deferring this habit, ease off for now
  const snoozeCount = signals.snoozeCountByHabit.get(habit.id) ?? 0;
  if (snoozeCount >= 5) score -= 20;
  else if (snoozeCount >= 3) score -= 10;

  // Category dismissal signal — give the user breathing room after a dismiss
  const lastDismiss = signals.recentDismissByCategory.get(habit.habitTemplate.category);
  if (lastDismiss) {
    const daysSince = (Date.now() - lastDismiss.getTime()) / DAY_MS;
    if (daysSince < 7) score -= 15;
    else if (daysSince < 14) score -= 8;
  }

  return Math.max(0, Math.round(score));
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

export async function rankHabits<T extends RankableHabit>(
  habits: T[],
  propertyId: string,
): Promise<T[]> {
  if (habits.length === 0) return habits;

  const signals = await loadBehaviorSignals(propertyId);

  return [...habits].sort((a, b) => {
    const diff = computeLiveRankScore(b, signals) - computeLiveRankScore(a, signals);
    if (diff !== 0) return diff;
    // Tie-break: habits with a sooner due date win
    if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });
}

// ─── Spotlight selection ──────────────────────────────────────────────────────

export async function selectSpotlight<T extends RankableHabit>(
  habits: T[],
  propertyId: string,
): Promise<T | null> {
  if (habits.length === 0) return null;

  const signals = await loadBehaviorSignals(propertyId);
  const now = Date.now();

  // Only surface habits that are actually active (not hidden by an active snooze window)
  const candidates = habits.filter(
    (h) =>
      h.status === 'ACTIVE' ||
      (h.status === 'SNOOZED' && h.snoozedUntil != null && h.snoozedUntil.getTime() <= now),
  );

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((h) => ({ habit: h, score: computeLiveRankScore(h, signals) }))
    .sort((a, b) => b.score - a.score);

  // Among candidates scoring within 5 points of the best, prefer quick tasks
  // (≤15 min) — they have higher completion rates and make the spotlight feel doable.
  const best = scored[0].score;
  const nearTop = scored.filter((s) => s.score >= best - 5);

  if (nearTop.length > 1) {
    const quickOne = nearTop.find(
      (s) => (s.habit.habitTemplate.estimatedMinutes ?? 999) <= 15,
    );
    if (quickOne) return quickOne.habit;
  }

  return scored[0].habit;
}

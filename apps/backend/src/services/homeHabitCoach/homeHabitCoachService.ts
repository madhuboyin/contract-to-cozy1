// apps/backend/src/services/homeHabitCoach/homeHabitCoachService.ts

import { HabitAssignmentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
import { generateHabitsForProperty } from './habitGenerationEngine';
import { rankHabits, selectSpotlight } from './habitRankingEngine';

// ─── Status transition rules ───────────────────────────────────────────────

const VALID_STATUSES_FOR: Record<string, HabitAssignmentStatus[]> = {
  complete: ['ACTIVE', 'SNOOZED'],
  snooze: ['ACTIVE'],
  skip: ['ACTIVE', 'SNOOZED'],
  dismiss: ['ACTIVE', 'SNOOZED', 'SKIPPED'],
  reopen: ['COMPLETED', 'SKIPPED', 'DISMISSED', 'EXPIRED'],
};

const SNOOZE_PRESET_DAYS: Record<string, number> = {
  '1d': 1,
  '3d': 3,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

// ─── Shared select shapes ─────────────────────────────────────────────────

const TEMPLATE_SUMMARY_SELECT = {
  id: true,
  key: true,
  title: true,
  shortDescription: true,
  category: true,
  cadence: true,
  difficulty: true,
  impactType: true,
  estimatedMinutes: true,
  isSeasonal: true,
  iconKey: true,
  tipText: true,
} as const;

const HABIT_SUMMARY_SELECT = {
  id: true,
  propertyId: true,
  status: true,
  generationSource: true,
  titleOverride: true,
  descriptionOverride: true,
  surfacedAt: true,
  dueAt: true,
  expiresAt: true,
  snoozedUntil: true,
  lastCompletedAt: true,
  lastActionAt: true,
  priorityScore: true,
  reasonSummary: true,
  createdAt: true,
  updatedAt: true,
  habitTemplate: { select: TEMPLATE_SUMMARY_SELECT },
} as const;

// ─── Phase-3: reminder schedule + completion evidence helpers ──────────────

const CADENCE_LABEL: Record<string, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  SEASONAL: 'Seasonal',
  ANNUAL: 'Annual',
};

function buildHabitExtras(h: any) {
  const cadence: string | null = h.habitTemplate?.cadence ?? null;
  return {
    reminderSchedule: {
      channel: 'IN_APP' as const,
      nextReminderAt: (h.snoozedUntil as Date | null)?.toISOString()
        ?? (h.dueAt as Date | null)?.toISOString()
        ?? null,
      cadenceLabel: cadence ? (CADENCE_LABEL[cadence] ?? cadence) : 'One-time',
    },
    completionEvidence: {
      evidenceType: (h.lastCompletedAt as Date | null) ? 'COMPLETION_TIMESTAMP' : 'NONE',
      capturedAt: (h.lastCompletedAt as Date | null)?.toISOString() ?? null,
      notes: null as string | null,
    },
  };
}

function mapHabit(h: any) {
  return { ...h, ...buildHabitExtras(h) };
}

// ─── Internal guard ────────────────────────────────────────────────────────

async function assertHabitAccess(
  propertyId: string,
  habitId: string,
): Promise<{ id: string; status: HabitAssignmentStatus }> {
  const habit = await prisma.propertyHabit.findFirst({
    where: { id: habitId, propertyId },
    select: { id: true, status: true },
  });
  if (!habit) throw new APIError('Habit not found', 404, 'HABIT_NOT_FOUND');
  return habit;
}

// ─── Service ──────────────────────────────────────────────────────────────

export class HomeHabitCoachService {
  // ── Generation ───────────────────────────────────────────────────────────

  async generateHabits(propertyId: string) {
    return generateHabitsForProperty(propertyId);
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async listActiveHabits(
    propertyId: string,
    opts: {
      status?: HabitAssignmentStatus;
      includeSnoozed?: boolean;
      limit?: number;
      cursor?: string;
    },
  ) {
    const limit = opts.limit ?? 20;
    const now = new Date();

    const statusFilter: HabitAssignmentStatus[] = opts.status
      ? [opts.status]
      : opts.includeSnoozed
        ? ['ACTIVE', 'SNOOZED']
        : ['ACTIVE'];

    // Load all matching habits then rank in memory (lists are typically small).
    // Cursor is applied post-sort so pagination remains stable.
    const allHabits = await prisma.propertyHabit.findMany({
      where: { propertyId, status: { in: statusFilter } },
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'desc' }],
      select: HABIT_SUMMARY_SELECT,
    });

    // When includeSnoozed is true the caller wants to see all habits (active + snoozed),
    // including ones still inside their snooze window (so the UI can display "Back on Mar 15").
    // When false, hide snoozed habits that haven't woken up yet.
    const visible = opts.includeSnoozed
      ? allHabits
      : allHabits.filter(
          (h) => h.status !== 'SNOOZED' || (h.snoozedUntil != null && h.snoozedUntil <= now),
        );

    // Apply behavior-aware ranking on top of base priorityScore
    const ranked = await rankHabits(visible, propertyId);

    // Apply cursor (offset by ID position in sorted list)
    const startIndex = opts.cursor
      ? ranked.findIndex((h) => h.id === opts.cursor) + 1
      : 0;
    const page = ranked.slice(startIndex, startIndex + limit + 1);

    const hasMore = page.length > limit;
    const items = hasMore ? page.slice(0, limit) : page;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return { habits: items.map(mapHabit), hasMore, nextCursor };
  }

  async getSpotlightHabit(propertyId: string) {
    // Load all active candidates (including snoozed — selectSpotlight filters them)
    const candidates = await prisma.propertyHabit.findMany({
      where: { propertyId, status: { in: ['ACTIVE', 'SNOOZED'] } },
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'desc' }],
      select: HABIT_SUMMARY_SELECT,
    });

    const habit = await selectSpotlight(candidates, propertyId);
    return { habit: habit ? mapHabit(habit) : null };
  }

  async getHabitHistory(
    propertyId: string,
    opts: { limit?: number; cursor?: string },
  ) {
    const limit = opts.limit ?? 20;

    const where: Prisma.PropertyHabitWhereInput = {
      propertyId,
      status: { in: ['COMPLETED', 'SKIPPED', 'DISMISSED', 'EXPIRED'] },
    };

    if (opts.cursor) {
      where.id = { lt: opts.cursor };
    }

    const habits = await prisma.propertyHabit.findMany({
      where,
      take: limit + 1,
      orderBy: [{ lastActionAt: 'desc' }, { createdAt: 'desc' }],
      select: HABIT_SUMMARY_SELECT,
    });

    const hasMore = habits.length > limit;
    const items = hasMore ? habits.slice(0, limit) : habits;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return { habits: items.map(mapHabit), hasMore, nextCursor };
  }

  async getHabitDetail(propertyId: string, habitId: string) {
    const habit = await prisma.propertyHabit.findFirst({
      where: { id: habitId, propertyId },
      select: {
        id: true,
        propertyId: true,
        status: true,
        generationSource: true,
        titleOverride: true,
        descriptionOverride: true,
        surfacedAt: true,
        dueAt: true,
        availableFrom: true,
        expiresAt: true,
        snoozedUntil: true,
        lastCompletedAt: true,
        lastActionAt: true,
        priorityScore: true,
        reasonSummary: true,
        reasonJson: true,
        contextJson: true,
        createdAt: true,
        updatedAt: true,
        habitTemplate: {
          select: {
            ...TEMPLATE_SUMMARY_SELECT,
            description: true,
            completionNoteTemplate: true,
          },
        },
        actions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            actionType: true,
            note: true,
            snoozeUntil: true,
            createdAt: true,
            userId: true,
          },
        },
      },
    });

    if (!habit) throw new APIError('Habit not found', 404, 'HABIT_NOT_FOUND');
    return { habit: mapHabit(habit) };
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async completeHabit(
    propertyId: string,
    habitId: string,
    userId: string | null,
    body: { note?: string | null },
  ) {
    const habit = await assertHabitAccess(propertyId, habitId);

    if (!VALID_STATUSES_FOR.complete.includes(habit.status)) {
      throw new APIError(
        `Cannot complete a habit with status ${habit.status}`,
        422,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.propertyHabit.update({
        where: { id: habitId },
        data: {
          status: 'COMPLETED',
          lastCompletedAt: now,
          lastActionAt: now,
          snoozedUntil: null,
        },
        select: HABIT_SUMMARY_SELECT,
      }),
      prisma.propertyHabitAction.create({
        data: {
          propertyHabitId: habitId,
          propertyId,
          userId,
          actionType: 'COMPLETED',
          note: body.note ?? null,
        },
      }),
    ]);

    return { habit: mapHabit(updated) };
  }

  async snoozeHabit(
    propertyId: string,
    habitId: string,
    userId: string | null,
    body: { snoozeUntil?: string; snoozePreset?: string; note?: string | null },
  ) {
    const habit = await assertHabitAccess(propertyId, habitId);

    if (!VALID_STATUSES_FOR.snooze.includes(habit.status)) {
      throw new APIError(
        `Cannot snooze a habit with status ${habit.status}`,
        422,
        'INVALID_STATUS_TRANSITION',
      );
    }

    let snoozedUntil: Date;
    if (body.snoozeUntil) {
      snoozedUntil = new Date(body.snoozeUntil);
    } else if (body.snoozePreset) {
      const days = SNOOZE_PRESET_DAYS[body.snoozePreset];
      if (!days) throw new APIError('Invalid snooze preset', 400, 'INVALID_SNOOZE_PRESET');
      snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    } else {
      throw new APIError('snoozeUntil or snoozePreset is required', 400, 'MISSING_SNOOZE_DURATION');
    }

    if (snoozedUntil <= new Date()) {
      throw new APIError('snoozeUntil must be in the future', 400, 'INVALID_SNOOZE_DATE');
    }

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.propertyHabit.update({
        where: { id: habitId },
        data: { status: 'SNOOZED', snoozedUntil, lastActionAt: now },
        select: HABIT_SUMMARY_SELECT,
      }),
      prisma.propertyHabitAction.create({
        data: {
          propertyHabitId: habitId,
          propertyId,
          userId,
          actionType: 'SNOOZED',
          note: body.note ?? null,
          snoozeUntil: snoozedUntil,
        },
      }),
    ]);

    return { habit: mapHabit(updated) };
  }

  async skipHabit(
    propertyId: string,
    habitId: string,
    userId: string | null,
    body: { note?: string | null },
  ) {
    const habit = await assertHabitAccess(propertyId, habitId);

    if (!VALID_STATUSES_FOR.skip.includes(habit.status)) {
      throw new APIError(
        `Cannot skip a habit with status ${habit.status}`,
        422,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.propertyHabit.update({
        where: { id: habitId },
        data: { status: 'SKIPPED', lastActionAt: now, snoozedUntil: null },
        select: HABIT_SUMMARY_SELECT,
      }),
      prisma.propertyHabitAction.create({
        data: {
          propertyHabitId: habitId,
          propertyId,
          userId,
          actionType: 'SKIPPED',
          note: body.note ?? null,
        },
      }),
    ]);

    return { habit: mapHabit(updated) };
  }

  async dismissHabit(
    propertyId: string,
    habitId: string,
    userId: string | null,
    body: { note?: string | null },
  ) {
    const habit = await assertHabitAccess(propertyId, habitId);

    if (!VALID_STATUSES_FOR.dismiss.includes(habit.status)) {
      throw new APIError(
        `Cannot dismiss a habit with status ${habit.status}`,
        422,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.propertyHabit.update({
        where: { id: habitId },
        data: { status: 'DISMISSED', lastActionAt: now, snoozedUntil: null },
        select: HABIT_SUMMARY_SELECT,
      }),
      prisma.propertyHabitAction.create({
        data: {
          propertyHabitId: habitId,
          propertyId,
          userId,
          actionType: 'DISMISSED',
          note: body.note ?? null,
        },
      }),
    ]);

    return { habit: mapHabit(updated) };
  }

  async reopenHabit(
    propertyId: string,
    habitId: string,
    userId: string | null,
  ) {
    const habit = await assertHabitAccess(propertyId, habitId);

    if (!VALID_STATUSES_FOR.reopen.includes(habit.status)) {
      throw new APIError(
        `Cannot reopen a habit with status ${habit.status}`,
        422,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.propertyHabit.update({
        where: { id: habitId },
        data: { status: 'ACTIVE', snoozedUntil: null, lastActionAt: now },
        select: HABIT_SUMMARY_SELECT,
      }),
      prisma.propertyHabitAction.create({
        data: {
          propertyHabitId: habitId,
          propertyId,
          userId,
          actionType: 'REOPENED',
        },
      }),
    ]);

    return { habit: mapHabit(updated) };
  }

  async recordViewed(
    propertyId: string,
    habitId: string,
    userId: string | null,
  ) {
    await assertHabitAccess(propertyId, habitId);

    // Debounce: skip if a VIEWED action was recorded in the last hour
    const recentView = await prisma.propertyHabitAction.findFirst({
      where: {
        propertyHabitId: habitId,
        actionType: 'VIEWED',
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
      select: { id: true },
    });

    if (recentView) return { recorded: false };

    await prisma.propertyHabitAction.create({
      data: {
        propertyHabitId: habitId,
        propertyId,
        userId,
        actionType: 'VIEWED',
      },
    });

    return { recorded: true };
  }

  // ── Preferences ──────────────────────────────────────────────────────────

  async getPreferences(propertyId: string) {
    // Create default record if none exists (lazy initialization)
    const prefs = await prisma.propertyHabitPreference.upsert({
      where: { propertyId },
      create: { propertyId },
      update: {},
    });

    return { preferences: prefs };
  }

  async updatePreferences(
    propertyId: string,
    body: {
      isEnabled?: boolean;
      preferredSurfaceCount?: number | null;
      hiddenCategories?: string[];
      snoozeDefaults?: Record<string, number> | null;
      quietHours?: { start: string; end: string } | null;
      personalization?: Record<string, unknown> | null;
    },
  ) {
    const data: Prisma.PropertyHabitPreferenceUpdateInput = {};

    if (body.isEnabled !== undefined) data.isEnabled = body.isEnabled;
    if (body.preferredSurfaceCount !== undefined) data.preferredSurfaceCount = body.preferredSurfaceCount;
    if (body.hiddenCategories !== undefined)
      data.hiddenCategoriesJson = body.hiddenCategories as Prisma.InputJsonValue;
    if (body.snoozeDefaults !== undefined)
      data.snoozeDefaultsJson = body.snoozeDefaults as Prisma.InputJsonValue;
    if (body.quietHours !== undefined)
      data.quietHoursJson = body.quietHours as Prisma.InputJsonValue;
    if (body.personalization !== undefined)
      data.personalizationJson = body.personalization as Prisma.InputJsonValue;

    const createData: Prisma.PropertyHabitPreferenceUncheckedCreateInput = {
      propertyId,
      isEnabled: body.isEnabled,
      preferredSurfaceCount: body.preferredSurfaceCount,
      hiddenCategoriesJson: body.hiddenCategories !== undefined
        ? (body.hiddenCategories as Prisma.InputJsonValue)
        : undefined,
      snoozeDefaultsJson: body.snoozeDefaults !== undefined
        ? (body.snoozeDefaults as Prisma.InputJsonValue)
        : undefined,
      quietHoursJson: body.quietHours !== undefined
        ? (body.quietHours as Prisma.InputJsonValue)
        : undefined,
      personalizationJson: body.personalization !== undefined
        ? (body.personalization as Prisma.InputJsonValue)
        : undefined,
    };

    const prefs = await prisma.propertyHabitPreference.upsert({
      where: { propertyId },
      create: createData,
      update: data,
    });

    return { preferences: prefs };
  }
}

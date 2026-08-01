// apps/backend/src/services/homeHabitCoach/homeHabitCoachService.ts

import { HabitAssignmentStatus, HabitCadence, Prisma, RecurrenceFrequency } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
import { generateHabitsForProperty } from './habitGenerationEngine';
import { rankHabits, selectSpotlight } from './habitRankingEngine';
import { getPropertyContext } from '../../modules/propertyContext';
import { PropertyMaintenanceTaskService } from '../PropertyMaintenanceTask.service';

// Home Operations Slice 3: HabitCadence -> RecurrenceFrequency, lossless now
// that RecurrenceFrequency has DAILY/WEEKLY. SEASONAL maps to the closest
// existing fit (QUARTERLY) — a literal "seasonal" recurrence isn't
// meaningful for a single maintenance task. AD_HOC isn't a cadence at all,
// so it maps to "not recurring" (a one-time task), not a frequency.
const CADENCE_TO_RECURRENCE: Record<HabitCadence, RecurrenceFrequency | null> = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  SEASONAL: 'QUARTERLY',
  ANNUAL: 'ANNUALLY',
  AD_HOC: null,
};

function fallbackDueDateForCadence(frequency: RecurrenceFrequency | null): Date {
  const now = new Date();
  switch (frequency) {
    case 'DAILY': return new Date(now.setDate(now.getDate() + 1));
    case 'WEEKLY': return new Date(now.setDate(now.getDate() + 7));
    case 'QUARTERLY': return new Date(now.setMonth(now.getMonth() + 3));
    case 'ANNUALLY': return new Date(now.setFullYear(now.getFullYear() + 1));
    case 'MONTHLY':
    default:
      return new Date(now.setMonth(now.getMonth() + 1));
  }
}

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
  safetyTier: true,
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
  // Home Operations Slice 3: presence (not a HabitAssignmentStatus value)
  // is what "adopted into an ongoing routine" means. The linked task's own
  // status/lastCompletedDate is what "habit adherence reads task outcomes"
  // means in practice — an adopted habit's PropertyHabit.status stays
  // ACTIVE indefinitely (adoption isn't a habit-lifecycle transition), so
  // recurring-routine adherence has to come from the task, not from
  // PropertyHabitAction rows shaped for one-shot habit completion.
  linkedMaintenanceTaskId: true,
  linkedMaintenanceTask: { select: { status: true, lastCompletedDate: true, nextDueDate: true } },
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
  const linkedTask = h.linkedMaintenanceTask as { status: string; lastCompletedDate: Date | null; nextDueDate: Date | null } | null | undefined;
  return {
    reminderSchedule: {
      channel: 'IN_APP' as const,
      nextReminderAt: (h.snoozedUntil as Date | null)?.toISOString()
        ?? (linkedTask?.nextDueDate as Date | null)?.toISOString()
        ?? (h.dueAt as Date | null)?.toISOString()
        ?? null,
      cadenceLabel: cadence ? (CADENCE_LABEL[cadence] ?? cadence) : 'One-time',
    },
    completionEvidence: {
      evidenceType: (h.lastCompletedAt as Date | null) ? 'COMPLETION_TIMESTAMP' : 'NONE',
      capturedAt: (h.lastCompletedAt as Date | null)?.toISOString() ?? null,
      notes: null as string | null,
    },
    // Home Operations Slice 3: null unless adopted. Once adopted, adherence
    // is read from the linked task's own completion history, not from this
    // habit's own (one-shot-shaped) status/lastCompletedAt.
    routineAdherence: h.linkedMaintenanceTaskId ? {
      linkedTaskId: h.linkedMaintenanceTaskId as string,
      linkedTaskStatus: linkedTask?.status ?? null,
      lastCompletedDate: linkedTask?.lastCompletedDate?.toISOString() ?? null,
      nextDueDate: linkedTask?.nextDueDate?.toISOString() ?? null,
    } : null,
  };
}

function mapHabit(h: any) {
  return { ...h, ...buildHabitExtras(h) };
}

// ─── Internal guard ────────────────────────────────────────────────────────

async function assertHabitAccess(
  propertyId: string,
  habitId: string,
): Promise<{ id: string; status: HabitAssignmentStatus; linkedMaintenanceTaskId: string | null }> {
  const habit = await prisma.propertyHabit.findFirst({
    where: { id: habitId, propertyId },
    select: { id: true, status: true, linkedMaintenanceTaskId: true },
  });
  if (!habit) throw new APIError('Habit not found', 404, 'HABIT_NOT_FOUND');
  return habit;
}

// ─── Service ──────────────────────────────────────────────────────────────

export class HomeHabitCoachService {
  // ── Generation ───────────────────────────────────────────────────────────

  async generateHabits(propertyId: string, userId: string) {
    const context = await getPropertyContext(propertyId, { userId }, {
      scopes: ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY'],
    });
    return generateHabitsForProperty(propertyId, context);
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
        linkedMaintenanceTaskId: true,
        linkedMaintenanceTask: { select: { status: true, lastCompletedDate: true, nextDueDate: true } },
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

  /**
   * Home Operations Slice 3: "Add to my routine." Creates/links a recurring
   * PropertyMaintenanceTask so the habit becomes real, tracked work only on
   * adoption — not on generation. Idempotent on linkedMaintenanceTaskId: a
   * retry (or a second click before the UI re-renders) returns the existing
   * link rather than creating a duplicate task.
   *
   * Deliberately does not require the habit to be ACTIVE — a snoozed or
   * even completed one-off suggestion can still become an ongoing routine;
   * adoption is a distinct axis from the one-shot lifecycle status.
   */
  async adoptHabit(propertyId: string, habitId: string, userId: string) {
    const habit = await prisma.propertyHabit.findFirst({
      where: { id: habitId, propertyId },
      select: {
        id: true,
        linkedMaintenanceTaskId: true,
        titleOverride: true,
        descriptionOverride: true,
        dueAt: true,
        habitTemplate: { select: { title: true, description: true, cadence: true, safetyTier: true } },
      },
    });
    if (!habit) throw new APIError('Habit not found', 404, 'HABIT_NOT_FOUND');

    if (habit.habitTemplate.safetyTier !== 'LOW_CONSEQUENCE' || habit.habitTemplate.cadence === 'AD_HOC') {
      throw new APIError(
        'Safety-sensitive and one-time obligations must be handled as governed work, not adopted as a habit.',
        409,
        'HABIT_NOT_ROUTINE_ELIGIBLE',
      );
    }

    if (habit.linkedMaintenanceTaskId) {
      const current = await prisma.propertyHabit.findUnique({ where: { id: habitId }, select: HABIT_SUMMARY_SELECT });
      return { habit: mapHabit(current) };
    }

    const frequency = CADENCE_TO_RECURRENCE[habit.habitTemplate.cadence];
    const task = await PropertyMaintenanceTaskService.createUserTask(userId, propertyId, {
      title: habit.titleOverride ?? habit.habitTemplate.title,
      description: habit.descriptionOverride ?? habit.habitTemplate.description ?? undefined,
      isRecurring: frequency !== null,
      frequency: frequency ?? undefined,
      nextDueDate: (habit.dueAt ?? fallbackDueDateForCadence(frequency)).toISOString(),
    });

    const updated = await prisma.propertyHabit.update({
      where: { id: habitId },
      data: { linkedMaintenanceTaskId: task.id, lastActionAt: new Date() },
      select: HABIT_SUMMARY_SELECT,
    });

    return { habit: mapHabit(updated) };
  }

  async completeHabit(
    propertyId: string,
    habitId: string,
    userId: string | null,
    body: { note?: string | null },
  ) {
    const habit = await assertHabitAccess(propertyId, habitId);

    if (habit.linkedMaintenanceTaskId) {
      throw new APIError(
        'This routine is completed from its linked Maintenance task.',
        409,
        'ROUTINE_COMPLETION_OWNED_BY_MAINTENANCE',
      );
    }

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

    if (habit.linkedMaintenanceTaskId) {
      throw new APIError(
        'Snooze the linked Maintenance task so the routine keeps one schedule.',
        409,
        'ROUTINE_SCHEDULE_OWNED_BY_MAINTENANCE',
      );
    }

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

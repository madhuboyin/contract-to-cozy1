// apps/backend/src/validators/homeHabitCoach.validators.ts
import { z } from 'zod';
import { HabitAssignmentStatus, HabitCategory } from '@prisma/client';

const HabitCategorySchema = z.nativeEnum(HabitCategory);
const HabitAssignmentStatusSchema = z.nativeEnum(HabitAssignmentStatus);

const SNOOZE_PRESETS = ['1d', '3d', '7d', '14d', '30d'] as const;

export const listHabitsQuerySchema = z.object({
  status: HabitAssignmentStatusSchema.optional(),
  includeSnoozed: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const listHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const snoozeHabitBodySchema = z
  .object({
    snoozeUntil: z.string().datetime().optional(),
    snoozePreset: z.enum(SNOOZE_PRESETS).optional(),
    note: z.string().max(500).optional().nullable(),
  })
  .refine((data) => data.snoozeUntil != null || data.snoozePreset != null, {
    message: 'Either snoozeUntil or snoozePreset is required',
    path: ['snoozeUntil'],
  });

export const completeHabitBodySchema = z.object({
  note: z.string().max(500).optional().nullable(),
});

export const skipHabitBodySchema = z.object({
  note: z.string().max(500).optional().nullable(),
});

export const dismissHabitBodySchema = z.object({
  note: z.string().max(500).optional().nullable(),
});

export const updatePreferencesBodySchema = z.object({
  isEnabled: z.boolean().optional(),
  preferredSurfaceCount: z.number().int().min(1).max(20).nullable().optional(),
  hiddenCategories: z.array(HabitCategorySchema).optional(),
  snoozeDefaults: z
    .record(z.string(), z.number().int().min(1).max(90))
    .nullable()
    .optional(),
  quietHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
      end: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
    })
    .nullable()
    .optional(),
  personalization: z.record(z.string(), z.unknown()).nullable().optional(),
});

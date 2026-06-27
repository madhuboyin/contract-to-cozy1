import { z } from 'zod';
import { HouseholdRole, HouseholdActivityType } from '@prisma/client';

const roleSchema = z.nativeEnum(HouseholdRole);

export const SendInviteSchema = z.object({
  email: z.string().email(),
  role: roleSchema,
});

export const UpdateMemberRoleSchema = z.object({
  role: roleSchema.optional(),
  displayName: z.string().min(1).max(80).optional().nullable(),
});

export const UpdateNotificationPrefsSchema = z.object({
  notifyOnRiskChange: z.boolean().optional(),
  notifyOnTaskDue: z.boolean().optional(),
  notifyOnTaskAssigned: z.boolean().optional(),
  notifyOnGuidanceUpdate: z.boolean().optional(),
  notifyOnIncident: z.boolean().optional(),
  notifyOnHomeEvent: z.boolean().optional(),
  notifyOnAlerts: z.boolean().optional(),
});

export const AssignTaskSchema = z.object({
  taskType: z.enum(['MAINTENANCE', 'SEASONAL', 'BUYER']),
  assigneeUserId: z.string().nullable(),
});

export const ActivityFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  activityTypes: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? (v.split(',').filter(Boolean) as HouseholdActivityType[])
        : undefined
    ),
});

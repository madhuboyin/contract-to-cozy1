import { z } from 'zod';

// ─── Enum schemas ─────────────────────────────────────────────────────────────

export const HomeDigitalWillStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export const HomeDigitalWillReadinessSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'READY',
  'NEEDS_REVIEW',
]);
export const HomeDigitalWillSectionTypeSchema = z.enum([
  'EMERGENCY',
  'CRITICAL_INFO',
  'CONTRACTORS',
  'MAINTENANCE_KNOWLEDGE',
  'UTILITIES',
  'INSURANCE',
  'HOUSE_RULES',
  'GENERAL_NOTES',
]);
export const HomeDigitalWillEntryTypeSchema = z.enum([
  'INSTRUCTION',
  'LOCATION_NOTE',
  'CONTACT_NOTE',
  'SERVICE_PREFERENCE',
  'MAINTENANCE_RULE',
  'POLICY_NOTE',
  'ACCESS_NOTE',
  'GENERAL_NOTE',
]);
export const HomeDigitalWillEntryPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const HomeDigitalWillTrustedContactRoleSchema = z.enum([
  'SPOUSE',
  'FAMILY_MEMBER',
  'PROPERTY_MANAGER',
  'EMERGENCY_CONTACT',
  'CARETAKER',
  'OTHER',
]);
export const HomeDigitalWillAccessLevelSchema = z.enum(['VIEW', 'EDIT', 'EMERGENCY_ONLY']);

// ─── Digital Will ─────────────────────────────────────────────────────────────

export const createDigitalWillBodySchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
});

export const updateDigitalWillBodySchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  status: HomeDigitalWillStatusSchema.optional(),
  readiness: HomeDigitalWillReadinessSchema.optional(),
  completionPercent: z.number().int().min(0).max(100).optional(),
  setupCompletedAt: z.string().datetime().nullable().optional(),
  lastReviewedAt: z.string().datetime().nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
});

// ─── Sections ─────────────────────────────────────────────────────────────────

export const createSectionBodySchema = z.object({
  type: HomeDigitalWillSectionTypeSchema,
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isEnabled: z.boolean().optional(),
});

export const updateSectionBodySchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isEnabled: z.boolean().optional(),
});

// ─── Entries ─────────────────────────────────────────────────────────────────

export const createEntryBodySchema = z.object({
  entryType: HomeDigitalWillEntryTypeSchema,
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().max(10000).nullable().optional(),
  summary: z.string().trim().max(1000).nullable().optional(),
  priority: HomeDigitalWillEntryPrioritySchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  isPinned: z.boolean().optional(),
  isEmergency: z.boolean().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
});

export const updateEntryBodySchema = z.object({
  entryType: HomeDigitalWillEntryTypeSchema.optional(),
  title: z.string().trim().min(1).max(500).optional(),
  content: z.string().trim().max(10000).nullable().optional(),
  summary: z.string().trim().max(1000).nullable().optional(),
  priority: HomeDigitalWillEntryPrioritySchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  isPinned: z.boolean().optional(),
  isEmergency: z.boolean().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
});

// ─── Reorder ─────────────────────────────────────────────────────────────────

export const reorderBodySchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

// ─── Trusted Contacts ─────────────────────────────────────────────────────────

export const createTrustedContactBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  relationship: z.string().trim().max(255).nullable().optional(),
  role: HomeDigitalWillTrustedContactRoleSchema,
  accessLevel: HomeDigitalWillAccessLevelSchema,
  isPrimary: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateTrustedContactBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  relationship: z.string().trim().max(255).nullable().optional(),
  role: HomeDigitalWillTrustedContactRoleSchema.optional(),
  accessLevel: HomeDigitalWillAccessLevelSchema.optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateDigitalWillBody = z.infer<typeof createDigitalWillBodySchema>;
export type UpdateDigitalWillBody = z.infer<typeof updateDigitalWillBodySchema>;
export type CreateSectionBody = z.infer<typeof createSectionBodySchema>;
export type UpdateSectionBody = z.infer<typeof updateSectionBodySchema>;
export type ReorderBody = z.infer<typeof reorderBodySchema>;
export type CreateEntryBody = z.infer<typeof createEntryBodySchema>;
export type UpdateEntryBody = z.infer<typeof updateEntryBodySchema>;
export type CreateTrustedContactBody = z.infer<typeof createTrustedContactBodySchema>;
export type UpdateTrustedContactBody = z.infer<typeof updateTrustedContactBodySchema>;

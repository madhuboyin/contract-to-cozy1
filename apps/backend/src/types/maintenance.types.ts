// apps/backend/src/types/maintenance.types.ts
// --- FIXED VERSION ---

import { z } from 'zod';
import { RecurrenceFrequency, ServiceCategory } from '@prisma/client';

// Zod schema for Prisma enums (ensures string values are valid)
const recurrenceFrequencyEnum = z.nativeEnum(RecurrenceFrequency);
const serviceCategoryEnum = z.nativeEnum(ServiceCategory);

/**
 * Zod schema for validating the incoming 'MaintenanceTaskConfig' payload.
 */
const maintenanceTaskConfigSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().nullable().optional(),
  isRecurring: z.boolean(),
  
  // Conditionally validate frequency: required if isRecurring is true
  frequency: recurrenceFrequencyEnum.nullable().optional(),
  nextDueDate: z.preprocess((arg) => {
    // Convert string to Date object
    if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
  }, z.date().nullable().optional()),
  
  serviceCategory: serviceCategoryEnum.nullable().optional(),
  
  // FIX: Add propertyId field
  propertyId: z.string().nullable().optional(),
  
}).refine(data => {
  // If it's recurring, frequency and nextDueDate must be provided
  if (data.isRecurring) {
    return data.frequency && data.nextDueDate;
  }
  // If not recurring, they are not required
  return true;
}, {
  message: 'Frequency and Next Due Date are required for recurring tasks',
  path: ['frequency', 'nextDueDate'],
});

/**
 * Zod schema for the entire API endpoint.
 * We expect a 'tasks' property containing an array of config objects.
 */
export const createCustomMaintenanceItemsSchema = z.object({
  body: z.object({
    tasks: z.array(maintenanceTaskConfigSchema).min(1, 'At least one task is required'),
  }),
});

/**
 * TypeScript interface matching the Zod schema.
 * This is what the service function will accept.
 */
export type MaintenanceTaskConfig = z.infer<typeof maintenanceTaskConfigSchema>;
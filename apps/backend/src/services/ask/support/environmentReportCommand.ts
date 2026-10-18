// Environment Report weather preparation and HVAC filter maintenance controls inside Ask Cozy.
// Pure: declared messages, action IDs, entity types, and input parsing.
import { z } from 'zod';

export const ENVIRONMENT_INSIGHT_ENTITY_TYPE = 'ENVIRONMENT_INSIGHT';
export const WEATHER_PREPARATION_ITEM_ENTITY_TYPE = 'WEATHER_PREPARATION_ITEM';
export const ENVIRONMENT_HVAC_FILTER_ENTITY_TYPE = 'ENVIRONMENT_HVAC_FILTER';

export const ENVIRONMENT_REPORT_COMMAND_MESSAGES = {
  START_PREPARATION: 'Start the weather preparation checklist for this environment insight.',
  COMPLETE_STEP: 'Mark this weather preparation step done.',
  SKIP_STEP: 'Mark this weather preparation step not needed.',
  REOPEN_STEP: 'Reopen this weather preparation step.',
  RECORD_HVAC_FILTER: 'Record the last HVAC filter change for this home.',
} as const;

export type EnvironmentReportCommandKind = keyof typeof ENVIRONMENT_REPORT_COMMAND_MESSAGES;

export const ENVIRONMENT_REPORT_ACTION_IDS = {
  START_PREPARATION: 'environment-report-start-preparation',
  COMPLETE_STEP: 'environment-report-step-complete',
  SKIP_STEP: 'environment-report-step-skip',
  REOPEN_STEP: 'environment-report-step-reopen',
  RECORD_HVAC_FILTER: 'environment-report-record-hvac-filter',
  OPEN_PLANT_CARE: 'environment-report-open-plant-care',
  OPEN_PAST_HAZARDS: 'environment-report-open-past-hazards',
} as const;

export const ENVIRONMENT_REPORT_BACK_ACTION_ID = 'environment-report-back';
export const ENVIRONMENT_HVAC_FILTER_CAPTURE_KEY = 'ENVIRONMENT_HVAC_FILTER_COMPLETED_DATE';

export function environmentReportCommandKindFromMessage(message: string): EnvironmentReportCommandKind | null {
  const entry = (Object.entries(ENVIRONMENT_REPORT_COMMAND_MESSAGES) as Array<[EnvironmentReportCommandKind, string]>)
    .find(([, value]) => value === message);
  return entry?.[0] ?? null;
}

export function buildWeatherPreparationStepEntityId(preparationId: string, itemId: string): string {
  return `${preparationId}:${itemId}`;
}

export function parseWeatherPreparationStepEntityId(entityId: string): { preparationId: string; itemId: string } | null {
  const idx = entityId.indexOf(':');
  if (idx <= 0 || idx >= entityId.length - 1) return null;
  const preparationId = entityId.slice(0, idx).trim();
  const itemId = entityId.slice(idx + 1).trim();
  if (!preparationId || !itemId || itemId.includes(':')) return null;
  return { preparationId, itemId };
}

const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);

export const EnvironmentHvacFilterInputSchema = z.object({
  completedDate: exactDate,
}).strict();

export type EnvironmentHvacFilterForm = z.infer<typeof EnvironmentHvacFilterInputSchema>;

export function parseEnvironmentHvacFilterAnswer(
  answer: unknown,
  today = new Date().toISOString().slice(0, 10),
): { success: true; data: EnvironmentHvacFilterForm } | { success: false; reason: 'INVALID' | 'FUTURE' } {
  const parsed = EnvironmentHvacFilterInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const dateObj = new Date(`${parsed.data.completedDate}T12:00:00.000Z`);
  if (Number.isNaN(dateObj.getTime()) || dateObj.toISOString().slice(0, 10) !== parsed.data.completedDate) {
    return { success: false, reason: 'INVALID' };
  }
  if (parsed.data.completedDate > today) return { success: false, reason: 'FUTURE' };
  return { success: true, data: parsed.data };
}

export const ENVIRONMENT_HVAC_FILTER_INVALID_MESSAGES = {
  INVALID: 'Enter a valid date for the last HVAC filter change.',
  FUTURE: 'The HVAC filter change date cannot be in the future.',
} as const;

// Ask handler support: commandInputs. Moved out of askHandlerSupport.ts unchanged (FRD v1.110); that file re-exports these modules.
import { HouseholdRole, MaintenanceTaskPriority, RecurrenceFrequency, ServiceCategory } from '@prisma/client';
import { z } from 'zod';
import { isMeaningfulMaintenanceTaskTitle } from '../askMaintenanceTaskInput';
import { prisma } from '../../../lib/prisma';
import { createHash } from 'node:crypto';
import { RADAR_FEEDBACK_COMMENT_MAX_LENGTH } from '../../../modules/homeEventRadar/domain/radarInteraction';
import { RADAR_ACTION_CODES } from '../../../modules/homeEventRadar/domain/radarActionRegistry';
import { INVENTORY_CATEGORY_VALUES, ROOM_TYPE_VALUES } from './capture';
import { askContextFingerprint } from './propertyContext';

export const MaintenanceTaskWorkflowInputSchema = z.object({
  title: z.string().trim().min(3).max(160).refine(isMeaningfulMaintenanceTaskTitle, {
    message: 'Describe the maintenance work to be done.',
  }),
  description: z.string().trim().max(1000).optional(),
  priority: z.nativeEnum(MaintenanceTaskPriority).default(MaintenanceTaskPriority.MEDIUM),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estimatedCostUsd: z.number().min(0).max(10_000_000).optional(),
  isRecurring: z.boolean().default(false),
  frequency: z.nativeEnum(RecurrenceFrequency).optional(),
}).strict().superRefine((value, context) => {
  if (value.isRecurring && !value.frequency) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['frequency'], message: 'Choose how often this task repeats.' });
  }
  if (value.nextDueDate) {
    const due = new Date(`${value.nextDueDate}T00:00:00.000Z`);
    if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== value.nextDueDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['nextDueDate'], message: 'Enter a valid due date.' });
    }
  }
});

export type MaintenanceTaskWorkflowInput = z.infer<typeof MaintenanceTaskWorkflowInputSchema>;

export const MaintenanceCompletionWorkflowInputSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  actualCostUsd: z.number().min(0).max(10_000_000).optional(),
  outcomeHealth: z.enum(['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED']).optional(),
}).strict();

export type MaintenanceCompletionWorkflowInput = z.infer<typeof MaintenanceCompletionWorkflowInputSchema>;

export const MaintenanceTaskUpdateInputSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  action: z.enum(['EDIT', 'RESCHEDULE', 'ASSIGN', 'UNASSIGN', 'ARCHIVE', 'REOPEN']),
  title: z.string().trim().min(3).max(160).optional(),
  priority: z.nativeEnum(MaintenanceTaskPriority).optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assigneeUserId: z.string().trim().min(1).max(160).nullable().optional(),
}).strict();

export const RadarFeedbackInputSchema = z.object({
  matchId: z.string().trim().min(1).max(160),
  feedbackType: z.enum(['wrong_location', 'not_relevant', 'duplicate', 'stale', 'other']).nullable(),
  comment: z.string().trim().max(RADAR_FEEDBACK_COMMENT_MAX_LENGTH).nullable(),
}).strict();

export const RADAR_CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const RadarTaskTargetSchema = z.object({ matchId: z.string().trim().min(1).max(160), actionCode: z.enum(RADAR_ACTION_CODES) }).strict();

// The inline form's answer. dueDate is the shared APPROXIMATE_DATE value ({ precision, value }), limited to an exact date.
export const RadarTaskAnswerSchema = z.object({
  operation: z.enum(['create_task', 'create_reminder', 'link_existing_task']),
  maintenanceTaskId: z.string().trim().max(128).nullish(),
  dueDate: z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).nullish(),
  dueTime: z.string().regex(RADAR_CLOCK_TIME).nullish().or(z.literal('')),
  assigneeUserId: z.string().trim().min(1).max(128).nullish(),
});

// What confirming sends to radarTaskIntegrationService.createOrLink (the traditional POST body, plus its target).
export const RadarTaskInputSchema = z.object({
  matchId: z.string().trim().min(1).max(160),
  actionCode: z.enum(RADAR_ACTION_CODES),
  operation: z.enum(['create_task', 'create_reminder', 'link_existing_task']),
  maintenanceTaskId: z.string().trim().min(1).max(128).nullable(),
  dueAt: z.string().datetime({ offset: true }).nullable(),
  assigneeUserId: z.string().trim().min(1).max(128).nullable(),
}).strict();

export const InventoryItemCorrectionInputSchema = z.object({
  itemId: z.string().trim().min(1).max(160),
  field: z.enum(['installedOn', 'purchasedOn', 'lastServicedOn', 'condition', 'brand', 'model', 'serialNo', 'purchaseCostCents', 'replacementCostCents', 'notes', 'category', 'roomId']),
  // null until the homeowner supplies (or edits in) a value; confirm rejects null.
  value: z.string().max(2000).nullable(),
}).strict();

export const optionalShortText = (max: number) => z.string().trim().max(max).nullish().transform((value) => (value ? value : null));

export const InventoryCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(INVENTORY_CATEGORY_VALUES),
  roomId: z.string().min(1).max(64),
  brand: optionalShortText(80),
  model: optionalShortText(80),
}).strict();

export const HouseholdInvitationInputSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.enum([HouseholdRole.CONTRIBUTOR, HouseholdRole.VIEWER]),
}).strict();

export const HomeEventCorrectionInputSchema = z.object({
  eventId: z.string().trim().min(1).max(160),
  field: z.enum(['title', 'occurredAt', 'summary', 'amount', 'type', 'importance', 'roomId', 'inventoryItemId']),
  value: z.string().max(2000).nullable(),
}).strict();

export const HomeEventVisibilityInputSchema = z.object({
  eventId: z.string().trim().min(1).max(160),
  value: z.enum(['PRIVATE', 'HOUSEHOLD', 'RESALE_PACK']).nullable(),
}).strict();

export const WarrantyCorrectionInputSchema = z.object({
  warrantyId: z.string().trim().min(1).max(160),
  field: z.enum(['providerName', 'expiryDate', 'startDate', 'category', 'policyNumber', 'cost', 'coverageDetails']),
  value: z.string().max(2000).nullable(),
}).strict();

export const RoomRenameInputSchema = z.object({
  roomId: z.string().trim().min(1).max(160),
  // Defaults to the name so a proposal stored before type and floor level existed still confirms as a rename.
  field: z.enum(['name', 'type', 'floorLevel']).default('name'),
  value: z.string().max(200).nullable(),
}).strict();

export const RoomCreateInputSchema = z.object({
  type: z.enum(ROOM_TYPE_VALUES),
  name: z.string().trim().min(1).max(80),
  floorLevel: z.number().int().min(-5).max(50).nullish().transform((value) => value ?? null),
}).strict();

export const QuoteWorkspaceCommandInputSchema = z.object({
  serviceCategory: z.nativeEnum(ServiceCategory),
  scopeSummary: z.string().trim().min(3).max(1000),
}).strict();

export type InspectionResolution = z.infer<typeof InspectionResolutionSchema>;

export type InvitableHouseholdRole = z.infer<typeof HouseholdInvitationInputSchema>['role'];

export const InspectionResolutionSchema = z.object({
  method: z.enum(['CONTRACTOR_WORK', 'DIY', 'SELLER_REPAIR', 'CREDITED_AT_CLOSING', 'DISMISSED']),
  notes: z.string().trim().min(1).max(1000).nullable(),
  costCents: z.number().int().min(0).max(1_000_000_000).nullable(),
}).strict();

export const GuidanceJourneyCommandInputSchema = z.object({
  scopeCategory: z.enum(['ITEM', 'SERVICE']),
  scopeId: z.string().trim().min(1).max(160),
  issueType: z.string().trim().min(1).max(160),
  inventoryItemId: z.string().trim().min(1).max(160).nullable(),
  serviceKey: z.string().trim().min(1).max(160).nullable(),
  label: z.string().trim().min(1).max(240),
}).strict();

export const HomeDeadlineMonitorInputSchema = z.object({
  sourceType: z.enum(['WARRANTY', 'INSURANCE_POLICY', 'MAINTENANCE']),
  sourceId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(3).max(160),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadDays: z.number().int().min(1).max(90),
}).strict();

export async function guidanceJourneyContextVersion(propertyId: string, input: z.infer<typeof GuidanceJourneyCommandInputSchema>): Promise<string> {
  if (input.inventoryItemId) {
    const item = await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, propertyId }, select: { id: true, updatedAt: true } });
    return askContextFingerprint(item ? [item.id, item.updatedAt.toISOString()] : ['missing', input.inventoryItemId]);
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, updatedAt: true } });
  return askContextFingerprint([property?.id ?? propertyId, property?.updatedAt?.toISOString() ?? 'missing', input.serviceKey]);
}

export function homeDeadlineSourceVersion(source: { id: string; expiryDate: Date | null; updatedAt: Date }): string {
  return createHash('sha256').update(JSON.stringify({ id: source.id, expiryDate: source.expiryDate, updatedAt: source.updatedAt })).digest('hex');
}

// External review [P1]: Radar's own proactive continuation carries a real
// `radarMatchId` (radarNotificationDelivery.service.ts's own `parameters:
// { radarEventId, radarMatchId, ... }`), and the envelope producer's own
// `source.sourceRecordId` for a PropertyRadarMatch-sourced item IS that
// same match row's id (`intelligenceEnvelopeQuery.service.ts`'s
// `sourceRecordId: row.id` inside its `PropertyRadarMatch` reader) -- so
// this can scope precisely to the exact triggering match without the
// broader entityRef-on-Radar-producers gap (Phase 0 §4.6, tracked
// separately into Phase 7) ever coming into play.
export type RadarEnvelopeQuerySuppliedInput = { radarMatchId?: string | null; radarEventId?: string | null };

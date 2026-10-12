// Ask handler support: commandInputs. Moved out of askHandlerSupport.ts unchanged (FRD v1.110); that file re-exports these modules.
import { HouseholdRole, InventoryItemCategory, MaintenanceTaskPriority, MaterialCategory, PlantGoalType, PlantLightLevel, PlantMaintenanceLevel, RecurrenceFrequency, ServiceCategory } from '@prisma/client';
import { z } from 'zod';
import { isMeaningfulMaintenanceTaskTitle } from '../askMaintenanceTaskInput';
import { prisma } from '../../../lib/prisma';
import { createHash } from 'node:crypto';
import { RADAR_FEEDBACK_COMMENT_MAX_LENGTH } from '../../../modules/homeEventRadar/domain/radarInteraction';
import { RADAR_ACTION_CODES } from '../../../modules/homeEventRadar/domain/radarActionRegistry';
import { INVENTORY_CATEGORY_VALUES, ROOM_TYPE_VALUES } from './capture';
import { askContextFingerprint } from './propertyContext';
import { HOME_JOURNEY_OPTIONS } from './homeSettingsConstants';
import { WHOLE_HOME_VALUE } from './homeRecordAddConstants';
import { DO_NOTHING_HORIZONS, NO_SAVED_SCENARIO_VALUE, SERVICE_PRICE_MAX_QUOTE, SERVICE_PRICE_UNSUPPORTED_CATEGORIES } from './homeToolRunConstants';
import { SERVICE_RADAR_CATEGORY_VALUES } from '../../servicePriceRadar.types';
import { OWNERSHIP_COST_CATEGORIES } from '../../ownershipCosts/ownershipCost.contract';

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
  action: z.enum(['EDIT', 'RESCHEDULE', 'ASSIGN', 'UNASSIGN', 'ARCHIVE', 'REOPEN', 'DELETE', 'SNOOZE', 'UNSNOOZE']),
  title: z.string().trim().min(3).max(160).optional(),
  priority: z.nativeEnum(MaintenanceTaskPriority).optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isRecurring: z.boolean().optional(),
  frequency: z.nativeEnum(RecurrenceFrequency).nullable().optional(),
  serviceCategory: z.nativeEnum(ServiceCategory).optional(),
  assigneeUserId: z.string().trim().min(1).max(160).nullable().optional(),
  snoozedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.isRecurring === true && !value.frequency) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['frequency'], message: 'Choose how often this task repeats.' });
  }
  if (value.isRecurring === false && value.frequency !== null && value.frequency !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['frequency'], message: 'A one-time task cannot have a recurrence frequency.' });
  }
  if (value.action === 'SNOOZE' && !value.snoozedUntil) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['snoozedUntil'], message: 'Choose when reminders should resume.' });
  }
  if (value.action === 'UNSNOOZE' && value.snoozedUntil !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['snoozedUntil'], message: 'Resuming reminders must clear the snooze date.' });
  }
});

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
  field: z.enum(['name', 'installedOn', 'purchasedOn', 'lastServicedOn', 'condition', 'brand', 'model', 'serialNo', 'purchaseCostCents', 'replacementCostCents', 'notes', 'category', 'roomId']),
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

// Group B recall-mutation follow-up (gap audit §17; FRD v1.163). No cost field, unlike
// InspectionResolutionSchema above -- recalls.service.ts's resolveRecallMatch has no cost parameter.
export type RecallResolution = z.infer<typeof RecallResolutionSchema>;

export const RecallResolutionSchema = z.object({
  resolutionType: z.enum(['FIXED', 'REPLACED', 'REFUNDED', 'NOT_APPLICABLE', 'IGNORED', 'OTHER']),
  resolutionNotes: z.string().trim().min(1).max(1000).nullable(),
}).strict();

export const GuidanceJourneyCommandInputSchema = z.object({
  scopeCategory: z.enum(['ITEM', 'SERVICE']),
  scopeId: z.string().trim().min(1).max(160),
  issueType: z.string().trim().min(1).max(160),
  inventoryItemId: z.string().trim().min(1).max(160).nullable(),
  serviceKey: z.string().trim().min(1).max(160).nullable(),
  label: z.string().trim().min(1).max(240),
}).strict();

/** How many days before an expiration the reminder is due when the request does not say. */
export const HOME_DEADLINE_DEFAULT_LEAD_DAYS = 30;

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

// Property purchase date (PROPERTY_PURCHASE_DATE_SET). The inline form answers with the shared APPROXIMATE_DATE value limited to an exact day;
// the stored and confirmed input is the plain day. A purchase date is a past or present day, never a future one.
const PURCHASE_DATE_DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  return parsed.getTime() >= Date.UTC(1800, 0, 1) && parsed.getTime() <= Date.now() + 24 * 60 * 60 * 1000;
}, { message: 'Enter a real date on or before today.' });

export const PurchaseDateAnswerSchema = z.object({
  purchaseDate: z.object({ precision: z.literal('EXACT_DATE'), value: PURCHASE_DATE_DAY }).strict(),
}).strict().transform((answer) => ({ purchaseDate: answer.purchaseDate.value }));

export const PurchaseDateInputSchema = z.object({ purchaseDate: PURCHASE_DATE_DAY }).strict();

// Home journey (HOME_JOURNEY_SET): the same five confirmed choices the onboarding page offers (UNKNOWN is not a choice).
export const HomeJourneyInputSchema = z.object({
  ownershipState: z.enum(HOME_JOURNEY_OPTIONS.map((option) => option.value) as [string, ...string[]]),
}).strict();

// Material spec (MATERIAL_SPEC_ADD) and indoor plant (HOME_PLANT_ADD): the inline forms' answers and the stored, confirmed input. Optional text that is
// left empty is stored as null; the whole-home room choice is stored as no room.
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((value) => (value ? value : null));

export const MaterialSpecAddInputSchema = z.object({
  category: z.nativeEnum(MaterialCategory),
  label: z.string().trim().min(1).max(120),
  roomId: z.string().trim().max(160).nullish().transform((value) => (!value || value === WHOLE_HOME_VALUE ? null : value)),
  manufacturer: optionalText(120),
  productName: optionalText(120),
  colorCode: optionalText(60),
  finish: optionalText(60),
  supplier: optionalText(120),
  notes: optionalText(1000),
}).strict();

export const HomePlantAddInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  roomId: z.string().trim().min(1).max(160),
  nickname: optionalText(120),
  notes: optionalText(1000),
}).strict();

const projectExactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);

export const ProjectTrackerCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  projectType: z.enum([
    'ROOF_REPLACEMENT', 'HVAC_REPLACEMENT', 'HVAC_REPAIR', 'KITCHEN_REMODEL', 'BATHROOM_REMODEL',
    'ELECTRICAL_PANEL', 'PLUMBING_REPIPING', 'WATER_HEATER', 'FOUNDATION_WORK', 'WINDOW_REPLACEMENT',
    'FLOORING', 'PAINTING_INTERIOR', 'PAINTING_EXTERIOR', 'DECK_PATIO', 'ADDITION', 'SEWER_LINE',
    'SOLAR_INSTALLATION', 'LANDSCAPING_MAJOR', 'GENERAL_REPAIR', 'CUSTOM',
  ]),
  fulfillmentMode: z.enum(['PROVIDER', 'DIY']),
  contractorName: optionalText(200),
  contractAmountDollars: z.coerce.number().min(0).max(100_000_000),
  startDate: projectExactDate,
  expectedEndDate: projectExactDate.nullish().transform((value) => value || null),
  permitApplicability: z.enum(['REQUIRED', 'NOT_REQUIRED', 'UNKNOWN']),
  permitApplicabilityBasis: optionalText(2000),
  hoaApplicability: z.enum(['REQUIRED', 'NOT_REQUIRED', 'UNKNOWN']),
  hoaApplicabilityBasis: optionalText(2000),
  initialMilestoneName: z.string().trim().min(1).max(200),
  initialMilestoneDate: projectExactDate.nullish().transform((value) => value || null),
  contractDocumentIds: z.array(z.string().min(1).max(160)).max(1).default([]),
}).strict().superRefine((value, context) => {
  if (value.fulfillmentMode === 'PROVIDER' && !value.contractorName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['contractorName'], message: 'Provider-led projects require a contractor or company name.' });
  }
  for (const [field, basisField, label] of [
    ['permitApplicability', 'permitApplicabilityBasis', 'Permit'],
    ['hoaApplicability', 'hoaApplicabilityBasis', 'HOA'],
  ] as const) {
    if (value[field] !== 'UNKNOWN' && !value[basisField]) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [basisField], message: `${label} applicability requires a source or rationale.` });
    }
  }
});

export const ProjectTrackerMilestoneInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText(2000),
  milestoneType: z.enum(['STANDARD', 'PAYMENT_TRIGGER', 'CUSTOM']).default('STANDARD'),
  scheduledDate: projectExactDate.nullish().transform((value) => value || null),
  requiresPhotoEvidence: z.coerce.boolean().default(false),
  position: z.coerce.number().int().min(0).max(10_000).optional(),
  dependsOnMilestoneId: optionalText(160),
  status: z.enum(['UPCOMING', 'IN_PROGRESS', 'DELAYED', 'BLOCKED']).optional(),
}).strict();

export const ProjectTrackerEditInputSchema = z.object({
  name: z.string().trim().min(1).max(200), description: optionalText(2000), contractorName: optionalText(200), contractorLicense: optionalText(100), contractorPhone: optionalText(30),
  contractorEmail: z.preprocess((value) => value === '' ? null : value, z.string().email().nullable().optional()),
  expectedEndDate: projectExactDate.nullish().transform((value) => value || null),
  permitApplicability: z.enum(['REQUIRED', 'NOT_REQUIRED', 'UNKNOWN']), permitApplicabilityBasis: optionalText(2000), hoaApplicability: z.enum(['REQUIRED', 'NOT_REQUIRED', 'UNKNOWN']), hoaApplicabilityBasis: optionalText(2000),
  contractDocumentIds: z.array(z.string().min(1).max(160)).max(1).default([]),
  homeSystemsAffected: z.array(z.nativeEnum(InventoryItemCategory)).max(20).default([]),
  serviceCategory: z.nativeEnum(ServiceCategory).nullable().optional(),
  contractorId: optionalText(160),
}).strict().superRefine((value, context) => {
  for (const [field, basisField, label] of [['permitApplicability', 'permitApplicabilityBasis', 'Permit'], ['hoaApplicability', 'hoaApplicabilityBasis', 'HOA']] as const) if (value[field] !== 'UNKNOWN' && !value[basisField]) context.addIssue({ code: z.ZodIssueCode.custom, path: [basisField], message: `${label} applicability requires a source or rationale.` });
});

export const ProjectTrackerMilestoneCompleteInputSchema = z.object({
  completionNotes: optionalText(2000),
  actualCompletedDate: projectExactDate.nullish().transform((value) => value || null),
}).strict();

export const ProjectTrackerPaymentPaidInputSchema = z.object({
  paidDate: projectExactDate.nullish().transform((value) => value || null),
  paymentMethod: optionalText(100),
  receiptDocumentIds: z.array(z.string().min(1).max(160)).max(1).default([]),
}).strict();

export const ProjectTrackerProgressInputSchema = z.object({
  entryDate: projectExactDate,
  entryType: z.enum(['DAILY_NOTE', 'PHOTO_UPDATE', 'MILESTONE_UPDATE', 'MATERIAL_DELIVERY', 'INSPECTION', 'ISSUE_NOTE']).default('DAILY_NOTE'),
  notes: z.string().trim().min(1).max(5000),
  milestoneId: optionalText(160),
  roomId: optionalText(160),
  photoDocumentIds: z.array(z.string().min(1).max(160)).max(50).default([]),
  materialType: optionalText(100), materialBrand: optionalText(100), materialModel: optionalText(100), materialColor: optionalText(100), materialSupplier: optionalText(200), materialQuantity: optionalText(100),
}).strict();

export const ProjectTrackerIssueInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  severity: z.enum(['MINOR', 'MAJOR', 'BLOCKING']),
  category: z.enum(['QUALITY_CONCERN', 'SCOPE_DISPUTE', 'TIMELINE_DISPUTE', 'COMMUNICATION', 'SAFETY', 'DAMAGE', 'PAYMENT_DISPUTE', 'OTHER']),
  blocksPayment: z.coerce.boolean().optional(),
  attachmentDocumentIds: z.array(z.string().min(1).max(160)).max(50).default([]),
}).strict();

export const ProjectTrackerIssueResolveInputSchema = z.object({
  resolutionNotes: z.string().trim().min(1).max(5000),
}).strict();

export const ProjectTrackerIssueNoteInputSchema = z.object({
  notes: z.string().trim().min(1).max(5000),
  evidenceDocumentIds: z.array(z.string().min(1).max(160)).max(50).default([]),
}).strict();

export const ProjectTrackerDisputePackageInputSchema = z.object({
  evidenceDocumentIds: z.array(z.string().min(1).max(160)).max(100).default([]),
}).strict();

const projectMaterialCategory = z.enum(['PAINT', 'TILE', 'FLOORING', 'GROUT', 'COUNTERTOP', 'CABINET', 'HARDWARE', 'TRIM_MOLDING', 'WALLPAPER', 'ROOFING', 'SIDING', 'WINDOW', 'DOOR', 'INSULATION', 'OTHER']);
export const ProjectTrackerMaterialInputSchema = z.object({
  label: z.string().trim().min(1).max(200), category: projectMaterialCategory,
  manufacturer: optionalText(100), productLine: optionalText(100), productName: optionalText(200), sku: optionalText(100), colorCode: optionalText(50), finish: optionalText(80), dimensions: optionalText(100), material: optionalText(100), supplier: optionalText(150), quantityPurchased: optionalText(80), lotBatch: optionalText(100), notes: optionalText(1000), careInstructions: optionalText(5000),
  permitRelevant: z.coerce.boolean().default(false), hoaRelevant: z.coerce.boolean().default(false),
  submittalDocumentIds: z.array(z.string().min(1).max(160)).max(50).default([]),
}).strict();

export const ProjectTrackerMaterialLifecycleInputSchema = z.object({
  evidenceDocumentIds: z.array(z.string().min(1).max(160)).max(50).default([]), approvalDocumentIds: z.array(z.string().min(1).max(160)).max(50).default([]), submittalDocumentIds: z.array(z.string().min(1).max(160)).max(50).default([]),
  receiptDocumentIds: z.array(z.string().min(1).max(160)).max(1).default([]), warrantyDocumentIds: z.array(z.string().min(1).max(160)).max(1).default([]), manualDocumentIds: z.array(z.string().min(1).max(160)).max(1).default([]), quantityInstalled: optionalText(100), quantityRemaining: z.string().trim().max(100).optional(), remainingStorageLocation: optionalText(300), installedByName: optionalText(200), installedAt: projectExactDate.nullish().transform((value) => value || null), notes: z.string().trim().min(1).max(3000),
}).strict();

export const ProjectTrackerMaterialSubstitutionInputSchema = z.object({
  label: z.string().trim().min(1).max(200), manufacturer: optionalText(100), productName: optionalText(200), sku: optionalText(100), identityChanges: z.array(z.string().trim().min(1).max(200)).min(1).max(50), reason: z.string().trim().min(1).max(2000), costDeltaDollars: z.coerce.number().min(-100_000_000).max(100_000_000).optional(), scheduleImpact: optionalText(1000), permitRelevant: z.coerce.boolean().default(false), hoaRelevant: z.coerce.boolean().default(false), evidenceDocumentIds: z.array(z.string().min(1).max(160)).min(1).max(50), sourceChangeOrderId: optionalText(160),
}).strict();

export const ProjectTrackerPaymentCreateInputSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amountDollars: z.coerce.number().positive().max(100_000_000),
  triggerType: z.enum(['MILESTONE', 'DATE', 'MANUAL']),
  triggerMilestoneId: optionalText(160),
  dueDate: projectExactDate.nullish().transform((value) => value || null),
  notes: optionalText(2000),
}).strict().superRefine((value, context) => {
  if (value.triggerType === 'MILESTONE' && !value.triggerMilestoneId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['triggerMilestoneId'], message: 'A milestone-triggered payment requires a milestone.' });
  if (value.triggerType === 'DATE' && !value.dueDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'A date-triggered payment requires a due date.' });
});

export const ProjectTrackerChangeOrderInputSchema = z.object({
  title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(5000),
  category: z.enum(['HOMEOWNER_REQUEST', 'UNFORESEEN_CONDITION', 'MATERIAL_SUBSTITUTION', 'DESIGN_CHANGE', 'ERROR_CORRECTION', 'OTHER']),
  costDeltaDollars: z.coerce.number().min(-100_000_000).max(100_000_000), proposedByName: z.string().trim().min(1).max(200), notes: optionalText(2000),
  workItemsChanged: z.coerce.boolean().default(false), spacesChanged: z.coerce.boolean().default(false), systemsChanged: z.coerce.boolean().default(false),
  dimensionsChanged: z.coerce.boolean().default(false), structuralEffectsChanged: z.coerce.boolean().default(false), exteriorEffectsChanged: z.coerce.boolean().default(false),
  regulatedMaterialsChanged: z.coerce.boolean().default(false), scheduleOnly: z.coerce.boolean().default(false), impactExplanation: z.string().trim().min(1).max(2000),
  supportingDocumentIds: z.array(z.string().min(1).max(160)).max(1).default([]),
}).strict().superRefine((value, context) => {
  const scopeChanged = value.workItemsChanged || value.spacesChanged || value.systemsChanged || value.dimensionsChanged || value.structuralEffectsChanged || value.exteriorEffectsChanged || value.regulatedMaterialsChanged;
  if (value.scheduleOnly && scopeChanged) context.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduleOnly'], message: 'A schedule-only change cannot also declare a scope change.' });
});

export const ProjectTrackerComplianceReviewInputSchema = z.object({
  amendedPermitStatus: z.enum(['REQUIRED', 'REQUESTED', 'CONFIRMED', 'NOT_APPLICABLE']),
  hoaReapprovalStatus: z.enum(['REQUIRED', 'REQUESTED', 'CONFIRMED', 'NOT_APPLICABLE']),
  evidenceDocumentIds: z.array(z.string().min(1).max(160)).max(50).default([]),
  reviewNotes: z.string().trim().min(1).max(3000),
}).strict();

const completionDisposition = z.enum(['SATISFIED', 'NOT_APPLICABLE']);
export const ProjectTrackerCompletionInputSchema = z.object({
  actualEndDate: projectExactDate.nullish().transform((value) => value || null), actualCostDollars: z.coerce.number().min(0).max(100_000_000),
  commissioningResult: z.enum(['PASSED', 'NOT_REQUIRED']), functionalVerificationResult: z.literal('PASSED'), safetyCheckResult: z.enum(['PASSED', 'NOT_REQUIRED']), inspectionResult: z.enum(['PASSED', 'NOT_REQUIRED']),
  providerOutcome: z.enum(['SUCCESS', 'PARTIAL', 'FAILED', 'NOT_APPLICABLE']), recommendationComprehensionConfirmed: z.literal(true),
  punchList: completionDisposition, corrections: completionDisposition, lienWaiver: completionDisposition, payment: completionDisposition, warranty: completionDisposition, commissioning: completionDisposition, safety: completionDisposition, inspection: completionDisposition,
  punchListNotes: optionalText(2000), correctionsNotes: optionalText(2000), lienWaiverNotes: optionalText(2000), paymentNotes: optionalText(2000), warrantyNotes: optionalText(2000), commissioningNotes: optionalText(2000), safetyNotes: optionalText(2000), inspectionNotes: optionalText(2000),
  contractorRatingQuality: z.coerce.number().int().min(1).max(5).optional(), contractorRatingTimeline: z.coerce.number().int().min(1).max(5).optional(), contractorRatingComms: z.coerce.number().int().min(1).max(5).optional(), contractorRatingBudget: z.coerce.number().int().min(1).max(5).optional(),
  contractorReviewText: optionalText(2000), warrantyPeriodMonths: z.coerce.number().int().min(0).max(1200).optional(),
  proofDocumentIds: z.array(z.string().min(1).max(160)).max(50).default([]), warrantyDocumentIds: z.array(z.string().min(1).max(160)).max(1).default([]),
}).strict().superRefine((value, context) => {
  for (const key of ['punchList', 'corrections', 'lienWaiver', 'payment', 'warranty', 'commissioning', 'safety', 'inspection'] as const) {
    if (value[key] === 'NOT_APPLICABLE' && !value[`${key}Notes`]?.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: [`${key}Notes`], message: 'Explain why this closeout category is not applicable.' });
  }
});

// Room Plant Advisor generation. Light is the one required growing-context fact; the remaining preferences refine the deterministic ranking.
export const RoomPlantRecommendationInputSchema = z.object({
  roomId: z.string().trim().min(1).max(160),
  lightLevel: z.nativeEnum(PlantLightLevel),
  maintenancePreference: z.nativeEnum(PlantMaintenanceLevel).nullable().optional().default(null),
  hasPets: z.boolean().default(false),
  goals: z.array(z.nativeEnum(PlantGoalType)).max(5).default([]),
  notes: optionalText(1000),
}).strict();

export const OwnershipCostScenarioInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  lens: z.enum(['OPERATING_EXPENSE', 'CASH_OUTFLOW']).default('OPERATING_EXPENSE'),
  horizonYears: z.coerce.number().pipe(z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)])),
  category: z.enum(OWNERSHIP_COST_CATEGORIES),
  growthPercent: z.preprocess((value) => value === '' ? null : value, z.coerce.number().min(-25).max(50).nullable().optional().default(null)),
  annualAdjustmentDollars: z.preprocess((value) => value === '' ? null : value, z.coerce.number().min(-1_000_000).max(1_000_000).nullable().optional().default(null)),
}).strict();

export const OwnershipCostDecisionInputSchema = z.object({
  reason: z.string().trim().min(1).max(1000).nullable().optional().default(null),
  revisitAt: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
  ]).nullable().optional().default(null),
}).strict();

export const OwnershipCostScenarioRenameInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
}).strict();

export const ReserveFundContributionInputSchema = z.object({
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'BALANCE_CORRECTION']),
  amountDollars: z.coerce.number().positive().max(100_000_000),
  direction: z.enum(['INCREASE', 'DECREASE']).default('INCREASE'),
  occurredAt: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
  ]).nullable().optional().default(null),
  note: z.string().trim().max(500).nullable().optional().default(null),
}).strict();

// Do-Nothing run (DO_NOTHING_SIMULATION_RUN): one of the four horizons the simulator accepts, and optionally one saved scenario. The form answers with
// text; the stored input holds the number.
export const DoNothingRunInputSchema = z.object({
  horizonMonths: z.coerce.number().pipe(z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(36)])),
  scenarioId: z.string().trim().max(160).nullish().transform((value) => (!value || value === NO_SAVED_SCENARIO_VALUE ? null : value)),
}).strict();
export { DO_NOTHING_HORIZONS };

// Service price check (SERVICE_PRICE_CHECK_RUN): a supported category, a quote amount the radar accepts, and optionally the vendor and a label.
const SUPPORTED_PRICE_CATEGORIES = SERVICE_RADAR_CATEGORY_VALUES.filter((value) => !(SERVICE_PRICE_UNSUPPORTED_CATEGORIES as readonly string[]).includes(value));
export const ServicePriceCheckInputSchema = z.object({
  serviceCategory: z.enum(SUPPORTED_PRICE_CATEGORIES as [string, ...string[]]),
  quoteAmount: z.coerce.number().positive().max(SERVICE_PRICE_MAX_QUOTE).transform((value) => Math.round(value * 100) / 100),
  quoteVendorName: optionalText(120),
  serviceLabelRaw: optionalText(200),
}).strict();
export const SERVICE_PRICE_CATEGORY_CHOICES: readonly string[] = SUPPORTED_PRICE_CATEGORIES;

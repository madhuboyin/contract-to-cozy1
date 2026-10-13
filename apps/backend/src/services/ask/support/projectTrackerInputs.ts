// Ask handler support: Project Tracker command inputs, split out of commandInputs.ts to keep that module under its size ceiling (FRD v1.364).
// commandInputs.ts re-exports this module, so every existing import is unchanged.
import { InventoryItemCategory, ServiceCategory } from '@prisma/client';
import { z } from 'zod';
import { optionalText } from './inputPrimitives';

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

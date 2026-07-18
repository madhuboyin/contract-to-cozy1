import { z } from 'zod';

// ── Shared enums ──────────────────────────────────────────────────────────────

const projectType = z.enum([
  'ROOF_REPLACEMENT', 'HVAC_REPLACEMENT', 'HVAC_REPAIR', 'KITCHEN_REMODEL',
  'BATHROOM_REMODEL', 'ELECTRICAL_PANEL', 'PLUMBING_REPIPING', 'WATER_HEATER',
  'FOUNDATION_WORK', 'WINDOW_REPLACEMENT', 'FLOORING', 'PAINTING_INTERIOR',
  'PAINTING_EXTERIOR', 'DECK_PATIO', 'ADDITION', 'SEWER_LINE', 'SOLAR_INSTALLATION',
  'LANDSCAPING_MAJOR', 'GENERAL_REPAIR', 'CUSTOM',
]);

const projectStatus = z.enum([
  'DRAFT', 'PLANNING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED', 'DISPUTED',
]);

const milestoneType = z.enum(['STANDARD', 'PERMIT_INSPECTION', 'PAYMENT_TRIGGER', 'CUSTOM']);

const milestoneStatus = z.enum([
  'UPCOMING', 'IN_PROGRESS', 'COMPLETE', 'DELAYED', 'DISPUTED', 'BLOCKED',
]);

const paymentTriggerType = z.enum(['MILESTONE', 'DATE', 'MANUAL']);

const paymentStatus = z.enum(['PENDING', 'DUE', 'PAID', 'OVERDUE', 'DISPUTED', 'ON_HOLD']);

const changeOrderCategory = z.enum([
  'HOMEOWNER_REQUEST', 'UNFORESEEN_CONDITION', 'MATERIAL_SUBSTITUTION',
  'DESIGN_CHANGE', 'ERROR_CORRECTION', 'OTHER',
]);

const issueSeverity = z.enum(['MINOR', 'MAJOR', 'BLOCKING']);

const issueCategory = z.enum([
  'QUALITY_CONCERN', 'SCOPE_DISPUTE', 'TIMELINE_DISPUTE', 'COMMUNICATION',
  'SAFETY', 'DAMAGE', 'PAYMENT_DISPUTE', 'OTHER',
]);

const issueStatus = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED']);

const logEntryType = z.enum(['MILESTONE_PHOTO', 'DAILY_NOTE', 'ISSUE_PHOTO', 'MATERIAL_DELIVERY']);

const inventoryItemCategory = z.enum([
  'APPLIANCE', 'HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'SAFETY',
  'SMART_HOME', 'FURNITURE', 'ELECTRONICS', 'OTHER', 'INTERIOR', 'STRUCTURAL',
  'EXTERIOR', 'SITE',
]);

// ── Project Record ────────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  projectType,
  contractorName: z.string().min(1).max(200).optional(),
  contractorLicense: z.string().max(100).optional(),
  contractorPhone: z.string().max(30).optional(),
  contractorEmail: z.string().email().optional(),
  contractorId: z.string().optional(),
  description: z.string().max(2000).optional(),
  sourceType: z.enum(['PRICE_FINALIZATION', 'BOOKING', 'GUIDANCE', 'MANUAL']).default('MANUAL'),
  guidanceJourneyId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  priceFinalizationId: z.string().optional(),
  bookingId: z.string().optional(),
  executionPath: z.enum(['REPAIR', 'REPLACEMENT']).optional(),
  fulfillmentMode: z.enum(['PROVIDER', 'DIY']).default('PROVIDER'),
  fundingMode: z.enum(['SELF_PAID', 'COVERED', 'MIXED']).default('SELF_PAID'),
  complexity: z.enum(['MINOR', 'MAJOR']).default('MAJOR'),
  recommendationVersion: z.string().max(120).optional(),
  contractAmountCents: z.number().int().min(0),
  startDate: z.string().date(),
  expectedEndDate: z.string().date().optional(),
  homeSystemsAffected: z.array(inventoryItemCategory).default([]),
  serviceCategory: z.string().optional(),
  contractDocumentKey: z.string().optional(),
  // Initial milestones (from accepted template or custom)
  milestones: z.array(z.object({
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    milestoneType: milestoneType.default('STANDARD'),
    scheduledDate: z.string().date().optional(),
    requiresPhotoEvidence: z.boolean().default(false),
    position: z.number().int().min(0),
  })).optional(),
}).superRefine((value, ctx) => {
  if (value.fulfillmentMode === 'PROVIDER' && !value.contractorName) {
    ctx.addIssue({
      code: 'custom',
      path: ['contractorName'],
      message: 'Provider-led projects require a contractor or company name.',
    });
  }
  if (value.sourceType === 'GUIDANCE' && !value.guidanceJourneyId) {
    ctx.addIssue({
      code: 'custom',
      path: ['guidanceJourneyId'],
      message: 'Guidance-sourced projects require a journey link.',
    });
  }
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  contractorName: z.string().min(1).max(200).optional(),
  contractorLicense: z.string().max(100).optional(),
  contractorPhone: z.string().max(30).optional(),
  contractorEmail: z.string().email().optional(),
  contractorId: z.string().optional(),
  expectedEndDate: z.string().date().optional(),
  homeSystemsAffected: z.array(inventoryItemCategory).optional(),
  serviceCategory: z.string().optional(),
  contractDocumentKey: z.string().optional(),
  status: z.enum(['PLANNING', 'IN_PROGRESS', 'PAUSED']).optional(),
});

// ── Milestones ────────────────────────────────────────────────────────────────

export const CreateMilestoneSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  milestoneType: milestoneType.default('STANDARD'),
  scheduledDate: z.string().date().optional(),
  requiresPhotoEvidence: z.boolean().default(false),
  position: z.number().int().min(0).optional(),
  dependsOnMilestoneId: z.string().optional(),
  linkedPermitMilestoneId: z.string().optional(),
});

export const UpdateMilestoneSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  scheduledDate: z.string().date().optional(),
  requiresPhotoEvidence: z.boolean().optional(),
  status: milestoneStatus.optional(),
  position: z.number().int().min(0).optional(),
  dependsOnMilestoneId: z.string().nullable().optional(),
  linkedPermitMilestoneId: z.string().nullable().optional(),
});

export const CompleteMilestoneSchema = z.object({
  completionNotes: z.string().max(2000).optional(),
  actualCompletedDate: z.string().date().optional(),
});

// ── Payments ──────────────────────────────────────────────────────────────────

export const CreatePaymentSchema = z.object({
  description: z.string().min(1).max(200),
  amountCents: z.number().int().min(1),
  triggerType: paymentTriggerType.default('MANUAL'),
  triggerMilestoneId: z.string().optional(),
  dueDate: z.string().date().optional(),
  notes: z.string().max(2000).optional(),
});

export const UpdatePaymentSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  amountCents: z.number().int().min(1).optional(),
  triggerType: paymentTriggerType.optional(),
  triggerMilestoneId: z.string().nullable().optional(),
  dueDate: z.string().date().optional(),
  notes: z.string().max(2000).optional(),
  status: paymentStatus.optional(),
});

export const MarkPaymentPaidSchema = z.object({
  paidDate: z.string().date().optional(),
  paymentMethod: z.string().max(100).optional(),
  receiptDocumentKey: z.string().optional(),
});

// ── Change Orders ─────────────────────────────────────────────────────────────

export const CreateChangeOrderSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  category: changeOrderCategory,
  costDeltaCents: z.number().int(),
  proposedByName: z.string().min(1).max(200),
  supportingDocumentKey: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const UpdateChangeOrderSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  category: changeOrderCategory.optional(),
  costDeltaCents: z.number().int().optional(),
  proposedByName: z.string().min(1).max(200).optional(),
  supportingDocumentKey: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

// ── Progress Log ──────────────────────────────────────────────────────────────

export const CreateLogEntrySchema = z.object({
  entryDate: z.string().date(),
  entryType: logEntryType,
  notes: z.string().max(5000).optional(),
  photoKeys: z.array(z.string()).default([]),
  milestoneId: z.string().optional(),
  roomId: z.string().optional(),
  materialType: z.string().max(100).optional(),
  materialBrand: z.string().max(100).optional(),
  materialModel: z.string().max(100).optional(),
  materialColor: z.string().max(100).optional(),
  materialSupplier: z.string().max(200).optional(),
  materialQuantity: z.string().max(100).optional(),
});

export const ListLogEntriesSchema = z.object({
  milestoneId: z.string().optional(),
  entryType: logEntryType.optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// ── Issues ────────────────────────────────────────────────────────────────────

export const CreateIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  severity: issueSeverity,
  category: issueCategory,
  blocksPayment: z.boolean().optional(),
  attachmentKeys: z.array(z.string()).default([]),
});

export const UpdateIssueSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  severity: issueSeverity.optional(),
  category: issueCategory.optional(),
  status: issueStatus.optional(),
  blocksPayment: z.boolean().optional(),
  attachmentKeys: z.array(z.string()).optional(),
});

export const ResolveIssueSchema = z.object({
  resolutionNotes: z.string().min(1).max(5000),
});

// ── Completion ────────────────────────────────────────────────────────────────

export const ConfirmCompletionSchema = z.object({
  actualEndDate: z.string().date().optional(),
  contractorRatingQuality: z.number().int().min(1).max(5),
  contractorRatingTimeline: z.number().int().min(1).max(5),
  contractorRatingComms: z.number().int().min(1).max(5),
  contractorRatingBudget: z.number().int().min(1).max(5),
  contractorReviewText: z.string().max(2000).optional(),
  warrantyPeriodMonths: z.number().int().min(0).optional(),
  warrantyDocumentKey: z.string().optional(),
  completionRecordKey: z.string().optional(),
});

import { z } from 'zod';

const hoaDuesFrequency = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']);

const hoaWorkType = z.enum([
  'EXTERIOR_PAINT', 'FENCE', 'ROOFING', 'ROOM_ADDITION', 'DECK_PATIO',
  'LANDSCAPING', 'SOLAR', 'WINDOWS_DOORS', 'DRIVEWAY', 'SHED_OUTBUILDING',
  'POOL', 'SATELLITE_ANTENNA', 'OTHER',
]);

const hoaApprovalStatus = z.enum([
  'NOT_SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED',
  'APPROVED_WITH_CONDITIONS', 'DENIED', 'EXPIRED',
]);
const lineageId = z.string().trim().min(1).max(160).optional();

export const UpsertAssociationSchema = z.object({
  name: z.string().min(1).max(200),
  managementCompany: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  duesAmountCents: z.number().int().min(0).optional(),
  duesFrequency: hoaDuesFrequency.optional(),
  nextDueDate: z.string().datetime().optional(),
  documentIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const CreateApprovalRecordSchema = z.object({
  workType: hoaWorkType,
  description: z.string().optional(),
  status: hoaApprovalStatus.default('NOT_SUBMITTED'),
  submittedDate: z.string().datetime().optional(),
  documentIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
  renovationAdvisorSessionId: z.string().optional(),
  sourceActionId: lineageId,
  sourceEntityType: lineageId,
  sourceEntityId: lineageId,
  sourceJourneyId: lineageId,
});

export const UpdateApprovalRecordSchema = z.object({
  workType: hoaWorkType.optional(),
  description: z.string().optional(),
  status: hoaApprovalStatus.optional(),
  submittedDate: z.string().datetime().optional(),
  decisionDate: z.string().datetime().optional(),
  approvalConditions: z.string().optional(),
  denialReason: z.string().optional(),
  expirationDate: z.string().datetime().optional(),
  documentIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const ReportViolationSchema = z.object({
  workType: hoaWorkType.optional(),
  summary: z.string().min(1).max(200),
  description: z.string().optional(),
  cureDeadline: z.string().datetime().optional(),
  fineAmountCents: z.number().int().min(0).optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
});

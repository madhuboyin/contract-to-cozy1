import { z } from 'zod';

export const AttachRenovationComplianceRecordSchema = z.object({
  subjectType: z.enum(['PERMIT', 'HOA_APPROVAL']),
  subjectId: z.string().trim().min(1),
  scopeVersionId: z.string().trim().min(1).optional(),
});

export const CreateRenovationComplianceConditionSchema = z.object({
  subjectType: z.enum(['PERMIT', 'HOA_APPROVAL']),
  subjectId: z.string().trim().min(1),
  scopeVersionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(5000),
  sourceReference: z.string().trim().min(1).max(1000),
  sourceDocumentId: z.string().trim().min(1).optional(),
  isBlocking: z.boolean().default(true),
  ownerUserId: z.string().trim().min(1).optional(),
  dueAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const UpdateRenovationComplianceConditionSchema = z.object({
  status: z.enum(['OPEN', 'SATISFIED', 'WAIVED_WITH_ACKNOWLEDGMENT', 'EXPIRED']),
  verificationNotes: z.string().trim().min(1).max(5000),
  sourceDocumentId: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'SATISFIED' && !value.sourceDocumentId) {
    ctx.addIssue({
      code: 'custom',
      path: ['sourceDocumentId'],
      message: 'Satisfied conditions require verification evidence.',
    });
  }
});

const extractedHoaCondition = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(5000),
  sourceReference: z.string().trim().min(1).max(1000).optional(),
  isBlocking: z.boolean().default(true),
  dueAt: z.string().datetime().optional(),
});

export const CreateHoaDocumentReviewSchema = z.object({
  hoaApprovalId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  scopeVersionId: z.string().trim().min(1).optional(),
  extractedDecisionStatus: z.enum([
    'APPROVED', 'APPROVED_WITH_CONDITIONS', 'DENIED', 'EXPIRED',
  ]).optional(),
  extractedConditions: z.array(extractedHoaCondition).max(50).default([]),
  extractedExpirationDate: z.string().datetime().optional(),
  extractedReferenceNumber: z.string().trim().min(1).max(240).optional(),
  extractionMethod: z.enum(['DOCUMENT_PARSER', 'OCR_REVIEW', 'MANUAL_TRANSCRIPTION']),
  parserVersion: z.string().trim().min(1).max(120).optional(),
}).superRefine((value, ctx) => {
  if (value.extractedDecisionStatus === 'APPROVED_WITH_CONDITIONS' && value.extractedConditions.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['extractedConditions'],
      message: 'A conditional approval extraction must include at least one condition candidate.',
    });
  }
});

export const ReviewHoaDocumentExtractionSchema = z.object({
  status: z.enum(['CONFIRMED', 'REJECTED']),
  reviewNotes: z.string().trim().min(1).max(5000),
  selectedConditionIndexes: z.array(z.number().int().min(0)).max(50).optional(),
  sourceReference: z.string().trim().min(1).max(1000).optional(),
});

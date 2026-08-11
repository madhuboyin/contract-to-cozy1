import { z } from 'zod';

export const ASK_EXECUTION_STATUSES = [
  'RECEIVED',
  'ROUTING',
  'NEEDS_PROPERTY',
  'NEEDS_ENTITY',
  'NEEDS_CLARIFICATION',
  'NEEDS_CONTEXT',
  'READY_WITH_LIMITATIONS',
  'NEEDS_CONFIRMATION',
  'RUNNING',
  'ANSWERED',
  'COMPLETED',
  'NOT_APPLICABLE',
  'UNAVAILABLE',
  'OUT_OF_SCOPE',
  'BLOCKED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'CANCELLED',
  'EXPIRED',
] as const;

export const AskExecutionStatusSchema = z.enum(ASK_EXECUTION_STATUSES);

const AskActionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  href: z.string().trim().min(1).max(1200).optional(),
  style: z.enum(['PRIMARY', 'SECONDARY', 'QUIET']).default('SECONDARY'),
});

const SummaryBlockSchema = z.object({
  type: z.literal('SUMMARY'),
  id: z.string(),
  title: z.string(),
  body: z.string(),
  tone: z.enum(['DEFAULT', 'POSITIVE', 'CAUTION', 'CRITICAL']).default('DEFAULT'),
  actions: z.array(AskActionSchema).max(3).default([]),
});

const GroupedListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  meta: z.array(z.string()).max(6).default([]),
  status: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
});

const GroupedListBlockSchema = z.object({
  type: z.literal('GROUPED_LIST'),
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string(),
    count: z.number().int().nonnegative(),
    items: z.array(GroupedListItemSchema).max(100),
  })).max(12),
  actions: z.array(AskActionSchema).max(3).default([]),
});

const TableBlockSchema = z.object({
  type: z.literal('TABLE'),
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  columns: z.array(z.object({ key: z.string(), label: z.string() })).min(1).max(12),
  rows: z.array(z.object({ id: z.string(), values: z.record(z.string(), z.string()) })).max(100),
  actions: z.array(AskActionSchema).max(3).default([]),
});

const CapabilityListBlockSchema = z.object({
  type: z.literal('CAPABILITY_LIST'),
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  capabilities: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    expectedOutput: z.string(),
    href: z.string(),
    readiness: z.enum(['READY', 'NEEDS_PROPERTY', 'AVAILABLE']),
    releaseStage: z.enum(['ACTIVE', 'BETA']),
  })).min(1).max(3),
});

const EvidenceBlockSchema = z.object({
  type: z.literal('EVIDENCE'),
  id: z.string(),
  title: z.string(),
  items: z.array(z.object({
    label: z.string(),
    source: z.string().nullable(),
    observedAt: z.string().nullable(),
  })).max(30),
});

const BoundaryBlockSchema = z.object({
  type: z.literal('BOUNDARY'),
  id: z.string(),
  title: z.string(),
  body: z.string(),
  severity: z.enum(['INFO', 'CAUTION', 'EMERGENCY']),
  suggestions: z.array(z.string()).max(5).default([]),
});

export const AskPresentationBlockSchema = z.discriminatedUnion('type', [
  SummaryBlockSchema,
  GroupedListBlockSchema,
  TableBlockSchema,
  CapabilityListBlockSchema,
  EvidenceBlockSchema,
  BoundaryBlockSchema,
]);

export const AskCaptureRequestSchema = z.object({
  requirementId: z.string(),
  captureKey: z.string(),
  classification: z.enum(['REQUIRED_APPLICABILITY', 'REQUIRED_SAFETY', 'REQUIRED_CALCULATION', 'ENHANCEMENT_ACCURACY']),
  state: z.enum(['KNOWN', 'UNKNOWN', 'CONFLICTED', 'STALE']),
  title: z.string(),
  question: z.string(),
  helpText: z.string().nullable(),
  inputSchema: z.unknown(),
  currentAnswer: z.unknown().optional(),
  allowNotSure: z.boolean(),
  sensitivity: z.enum(['STANDARD', 'FINANCIAL', 'SECURITY']),
  confirmationText: z.string().nullable().default(null),
  expectedContextVersion: z.string(),
});

export const SubmitAskCaptureRequestSchema = z.object({
  requirementId: z.string().trim().min(1).max(100),
  captureKey: z.string().trim().min(1).max(100),
  expectedContextVersion: z.string().trim().min(1).max(128),
  idempotencyKey: z.string().trim().min(8).max(128),
  answer: z.record(z.string(), z.unknown()),
  sensitiveDataConfirmed: z.boolean().optional(),
}).strict();

export const CreateAskExecutionRequestSchema = z.object({
  clientRequestId: z.string().trim().min(1).max(160),
  sessionId: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(4000),
  propertyId: z.string().trim().min(1).max(160).nullable().optional(),
  launchContext: z.object({
    surface: z.string().trim().min(1).max(80),
    capabilityId: z.string().trim().max(120).nullable().optional(),
    entityType: z.string().trim().max(120).nullable().optional(),
    entityId: z.string().trim().max(160).nullable().optional(),
    actionId: z.string().trim().max(160).nullable().optional(),
    journeyId: z.string().trim().max(160).nullable().optional(),
    returnTo: z.string().trim().max(1000).nullable().optional(),
  }).optional(),
}).strict();

export const AskExecutionResponseSchema = z.object({
  executionId: z.string(),
  sessionId: z.string(),
  question: z.string(),
  status: AskExecutionStatusSchema,
  property: z.object({ id: z.string(), label: z.string() }).nullable(),
  operation: z.object({ id: z.string(), version: z.string(), family: z.string() }).nullable(),
  contextVersion: z.string().nullable(),
  blocks: z.array(AskPresentationBlockSchema),
  captureRequests: z.array(AskCaptureRequestSchema).max(3).default([]),
  suggestions: z.array(z.string()).max(5),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AskExecutionStatus = z.infer<typeof AskExecutionStatusSchema>;
export type AskPresentationBlock = z.infer<typeof AskPresentationBlockSchema>;
export type AskCaptureRequest = z.infer<typeof AskCaptureRequestSchema>;
export type CreateAskExecutionRequest = z.infer<typeof CreateAskExecutionRequestSchema>;
export type SubmitAskCaptureRequest = z.infer<typeof SubmitAskCaptureRequestSchema>;
export type AskExecutionResponse = z.infer<typeof AskExecutionResponseSchema>;

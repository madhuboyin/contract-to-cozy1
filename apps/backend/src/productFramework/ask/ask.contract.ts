import { z } from 'zod';

export const ASK_RESPONSE_SCHEMA_VERSION = '1.0' as const;

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
  // The true row count when the adapter truncated for display (e.g. a
  // 20-item capital timeline shown as 12 rows). Omitted or equal to
  // rows.length means nothing was truncated. Mirrors the count/items.length
  // distinction GROUPED_LIST sections already carry, so tables can render
  // the same "+N more" affordance instead of silently dropping rows from
  // view with no indication more exist.
  totalCount: z.number().int().nonnegative().optional(),
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
    readiness: z.enum(['READY', 'NEEDS_PROPERTY', 'NEEDS_CONTEXT', 'UNAVAILABLE', 'AVAILABLE']),
    readinessLabel: z.string().max(240).nullable().default(null),
    readinessReasons: z.array(z.string().max(600)).max(5).default([]),
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

const MonitorBlockSchema = z.object({
  type: z.literal('MONITOR'),
  id: z.string(),
  monitorId: z.string(),
  title: z.string(),
  status: z.enum(['ACTIVE', 'PAUSED', 'STOPPED']),
  threshold: z.string(),
  product: z.string(),
  channel: z.string(),
  cadence: z.string(),
  quietHours: z.string().nullable(),
  sourceBoundary: z.string(),
  actions: z.array(AskActionSchema).max(3),
});

const WorkflowProgressBlockSchema = z.object({
  type: z.literal('WORKFLOW_PROGRESS'),
  id: z.string(),
  title: z.string(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED']),
  description: z.string(),
  details: z.array(z.object({ label: z.string(), value: z.string() })).max(12),
  actions: z.array(AskActionSchema).max(3),
});

const MetricRowBlockSchema = z.object({
  type: z.literal('METRIC_ROW'), id: z.string(), title: z.string(), description: z.string().nullable().optional(),
  metrics: z.array(z.object({ label: z.string(), value: z.string(), detail: z.string().nullable().optional(), tone: z.enum(['DEFAULT', 'POSITIVE', 'CAUTION', 'CRITICAL']).default('DEFAULT') })).min(1).max(6),
});

const TimelineBlockSchema = z.object({
  type: z.literal('TIMELINE'), id: z.string(), title: z.string(), description: z.string().nullable().optional(),
  items: z.array(z.object({ id: z.string(), label: z.string(), date: z.string().nullable().optional(), description: z.string().nullable().optional(), status: z.string().nullable().optional(), href: z.string().nullable().optional() })).max(50),
});

const ComparisonBlockSchema = z.object({
  type: z.literal('COMPARISON'), id: z.string(), title: z.string(), description: z.string().nullable().optional(),
  options: z.array(z.object({ id: z.string(), label: z.string(), summary: z.string().nullable().optional(), attributes: z.array(z.object({ label: z.string(), value: z.string(), tone: z.enum(['DEFAULT', 'POSITIVE', 'CAUTION', 'CRITICAL']).default('DEFAULT') })).max(12) })).min(2).max(4),
  actions: z.array(AskActionSchema).max(3).default([]),
});

const DecisionTraceBlockSchema = z.object({
  type: z.literal('DECISION_TRACE'), id: z.string(), title: z.string(),
  steps: z.array(z.object({ label: z.string(), detail: z.string(), outcome: z.string().nullable().optional() })).min(1).max(12),
});

// Ask Intelligence FRD §21.4. Renders a durable DecisionThread without
// relying on raw conversation history. lifecycleStatus and contextStatus are
// independent (FRD §10.2/§10.3) and both surfaced distinctly, never
// collapsed into one status string.
const DecisionProgressBlockSchema = z.object({
  type: z.literal('DECISION_PROGRESS'), id: z.string(), title: z.string(),
  decisionThreadId: z.string(),
  lifecycleStatus: z.enum(['OPEN', 'GATHERING_CONTEXT', 'READY_TO_COMPARE', 'RECOMMENDATION_AVAILABLE', 'ACTION_IN_PROGRESS', 'DECIDED', 'COMPLETED', 'ABANDONED', 'ARCHIVED']),
  contextStatus: z.enum(['CURRENT', 'STALE', 'CONFLICTED']),
  verdict: z.string().nullable(),
  reasonCodes: z.array(z.string()).max(12),
  limitationCodes: z.array(z.string()).max(12),
  contextIssueCodes: z.array(z.string()).max(12),
  confidenceLabel: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
  generatedAt: z.string().nullable(),
  actions: z.array(AskActionSchema).max(4).default([]),
});

// Ask Intelligence FRD §21.3. Compares a registered baseline against one
// Scenario version (FRD §13); never mutates the thread's current snapshot.
const ScenarioComparisonBlockSchema = z.object({
  type: z.literal('SCENARIO_COMPARISON'), id: z.string(), title: z.string(),
  decisionThreadId: z.string(), scenarioId: z.string(),
  baseline: z.object({
    label: z.string(), verdict: z.string(),
    reasonCodes: z.array(z.string()).max(12), limitationCodes: z.array(z.string()).max(12),
  }),
  scenario: z.object({
    label: z.string(), verdict: z.string(),
    reasonCodes: z.array(z.string()).max(12), limitationCodes: z.array(z.string()).max(12),
    assumptions: z.array(z.object({ label: z.string(), value: z.string() })).max(8),
  }),
  comparisonDirection: z.enum(['SCENARIO_FAVORS_REPLACE', 'SCENARIO_FAVORS_REPAIR', 'NO_CHANGE']),
  actions: z.array(AskActionSchema).max(3).default([]),
});

const AssumptionsBlockSchema = z.object({ type: z.literal('ASSUMPTIONS'), id: z.string(), title: z.string(), items: z.array(z.string()).min(1).max(20) });
const LimitationBlockSchema = z.object({ type: z.literal('LIMITATION'), id: z.string(), title: z.string(), body: z.string(), severity: z.enum(['INFO', 'CAUTION']) });
const EmptyStateBlockSchema = z.object({ type: z.literal('EMPTY_STATE'), id: z.string(), title: z.string(), body: z.string(), actions: z.array(AskActionSchema).max(3).default([]) });
const ErrorStateBlockSchema = z.object({ type: z.literal('ERROR_STATE'), id: z.string(), title: z.string(), body: z.string(), retryable: z.boolean(), actions: z.array(AskActionSchema).max(3).default([]) });

export const AskPresentationBlockSchema = z.discriminatedUnion('type', [
  SummaryBlockSchema,
  GroupedListBlockSchema,
  TableBlockSchema,
  CapabilityListBlockSchema,
  EvidenceBlockSchema,
  BoundaryBlockSchema,
  MonitorBlockSchema,
  WorkflowProgressBlockSchema,
  MetricRowBlockSchema,
  TimelineBlockSchema,
  ComparisonBlockSchema,
  DecisionTraceBlockSchema,
  DecisionProgressBlockSchema,
  ScenarioComparisonBlockSchema,
  AssumptionsBlockSchema,
  LimitationBlockSchema,
  EmptyStateBlockSchema,
  ErrorStateBlockSchema,
]);

export const AskConfirmationSchema = z.object({
  confirmationId: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })).max(12),
  confirmLabel: z.string(),
  consentText: z.string(),
  expiresAt: z.string().datetime(),
});

export const SubmitAskConfirmationSchema = z.object({
  confirmationVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(128),
  consentConfirmed: z.literal(true),
}).strict();

export const SubmitAskFeedbackSchema = z.object({
  rating: z.enum(['UP', 'DOWN']),
  comment: z.string().trim().max(1000).optional(),
}).strict();

export const RequestAskCorrectionSchema = z.object({
  kind: z.enum(['HOME_RECORD', 'RETRY_RESPONSE']),
}).strict();

export const ContinueAskExecutionSchema = z.object({
  surface: z.enum(['ASK_PAGE', 'GLOBAL_LAUNCHER']),
}).strict();

export const ResolveAskExecutionPropertySchema = z.object({
  propertyId: z.string().trim().min(1).max(160),
}).strict();

export const AskClarificationSchema = z.object({
  version: z.number().int().positive(),
  question: z.string().trim().min(1).max(500),
  options: z.array(z.object({
    operationId: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
  })).max(3),
  allowFreeText: z.boolean(),
  expiresAt: z.string().datetime(),
});

export const SubmitAskClarificationSchema = z.object({
  clarificationVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(128),
  operationId: z.string().trim().min(1).max(120).optional(),
  answer: z.string().trim().min(1).max(1000).optional(),
}).strict().refine((value) => Boolean(value.operationId || value.answer), {
  message: 'Choose an option or add a clarification.',
});

export const AskCaptureRequestSchema = z.object({
  requirementId: z.string(),
  captureKey: z.string(),
  classification: z.enum([
    'REQUIRED_APPLICABILITY',
    'REQUIRED_SAFETY',
    'REQUIRED_CALCULATION',
    'ENHANCEMENT_ACCURACY',
    'SCENARIO_INPUT',
    'PREFERENCE_INPUT',
    'WORKFLOW_INPUT',
  ]),
  state: z.enum(['KNOWN', 'UNKNOWN', 'CONFLICTED', 'STALE']),
  title: z.string(),
  question: z.string(),
  helpText: z.string().nullable(),
  inputSchema: z.unknown(),
  currentAnswer: z.unknown().optional(),
  allowNotSure: z.boolean(),
  sensitivity: z.enum(['STANDARD', 'FINANCIAL', 'SECURITY']),
  destinationLabel: z.string().nullable().default(null),
  fallbackHref: z.string().startsWith('/').nullable().optional(),
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

export const RecordAskCaptureEventSchema = z.object({
  requirementId: z.string().trim().min(1).max(100),
  captureKey: z.string().trim().min(1).max(100),
  event: z.enum(['DISMISSED', 'FULL_FORM_OPENED']),
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
  schemaVersion: z.literal(ASK_RESPONSE_SCHEMA_VERSION),
  executionId: z.string(),
  sessionId: z.string(),
  question: z.string(),
  status: AskExecutionStatusSchema,
  property: z.object({ id: z.string(), label: z.string() }).nullable(),
  operation: z.object({ id: z.string(), version: z.string(), family: z.string() }).nullable(),
  contextVersion: z.string().nullable(),
  blocks: z.array(AskPresentationBlockSchema),
  captureRequests: z.array(AskCaptureRequestSchema).max(3).default([]),
  clarification: AskClarificationSchema.nullable().default(null),
  confirmation: AskConfirmationSchema.nullable().default(null),
  suggestions: z.array(z.string()).max(5),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AskPendingWorkItemSchema = z.object({
  pendingKind: z.enum(['CLARIFICATION', 'PROPERTY_SELECTION', 'ENTITY_SELECTION', 'CONTEXT_CAPTURE', 'CONFIRMATION', 'COMMAND_RECOVERY']),
  actionLabel: z.string().trim().min(1).max(120),
  execution: AskExecutionResponseSchema,
});

export type AskExecutionStatus = z.infer<typeof AskExecutionStatusSchema>;
export type AskPresentationBlock = z.infer<typeof AskPresentationBlockSchema>;
export type AskCaptureRequest = z.infer<typeof AskCaptureRequestSchema>;
export type AskConfirmation = z.infer<typeof AskConfirmationSchema>;
export type AskClarification = z.infer<typeof AskClarificationSchema>;
export type CreateAskExecutionRequest = z.infer<typeof CreateAskExecutionRequestSchema>;
export type SubmitAskCaptureRequest = z.infer<typeof SubmitAskCaptureRequestSchema>;
export type RecordAskCaptureEvent = z.infer<typeof RecordAskCaptureEventSchema>;
export type SubmitAskConfirmation = z.infer<typeof SubmitAskConfirmationSchema>;
export type SubmitAskFeedback = z.infer<typeof SubmitAskFeedbackSchema>;
export type RequestAskCorrection = z.infer<typeof RequestAskCorrectionSchema>;
export type ContinueAskExecution = z.infer<typeof ContinueAskExecutionSchema>;
export type ResolveAskExecutionProperty = z.infer<typeof ResolveAskExecutionPropertySchema>;
export type AskPendingWorkItem = z.infer<typeof AskPendingWorkItemSchema>;
export type SubmitAskClarification = z.infer<typeof SubmitAskClarificationSchema>;
export type AskExecutionResponse = z.infer<typeof AskExecutionResponseSchema>;

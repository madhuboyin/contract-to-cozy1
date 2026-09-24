import { z } from 'zod';
import { FEEDBACK_REASON_CODES } from '../feedback.contract';

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
  // Response-level workflow actions use the same server-owned Ask command
  // path as row actions, while legacy destinations remain ordinary hrefs.
  interactionType: z.literal('START_WORKFLOW').optional(),
  message: z.string().trim().min(1).max(300).optional(),
  operationId: z.string().trim().min(1).max(120).optional(),
  style: z.enum(['PRIMARY', 'SECONDARY', 'QUIET']).default('SECONDARY'),
}).superRefine((action, ctx) => {
  if (action.interactionType === 'START_WORKFLOW') {
    if (!action.message) ctx.addIssue({ code: 'custom', path: ['message'], message: 'START_WORKFLOW actions require a message.' });
    if (!action.operationId) ctx.addIssue({ code: 'custom', path: ['operationId'], message: 'START_WORKFLOW actions require an operationId.' });
    if (action.href) ctx.addIssue({ code: 'custom', path: ['href'], message: 'START_WORKFLOW actions must not also navigate.' });
  } else if (action.message || action.operationId) {
    ctx.addIssue({ code: 'custom', path: ['interactionType'], message: 'Workflow metadata requires interactionType START_WORKFLOW.' });
  }
});

const AskDisplayToneSchema = z.enum(['DEFAULT', 'POSITIVE', 'CAUTION', 'CRITICAL']);

const AskAnswerChipSchema = z.object({
  label: z.string().trim().min(1).max(60),
  tone: AskDisplayToneSchema.default('DEFAULT'),
});

const SummaryBlockSchema = z.object({
  type: z.literal('SUMMARY'),
  id: z.string(),
  title: z.string(),
  body: z.string(),
  tone: z.enum(['DEFAULT', 'POSITIVE', 'CAUTION', 'CRITICAL']).default('DEFAULT'),
  actions: z.array(AskActionSchema).max(3).default([]),
  // IW-PRES-013 (answer first): up to four number chips taken from the same records as the result. Optional so
  // existing producers are unchanged.
  chips: z.array(AskAnswerChipSchema).max(4).optional(),
});

// Ask Cozy Stage 3, Phase 5 (implementation plan §11; FRD §28/§29). The one
// new block type this phase adds -- per FRD §28's own explicit "no existing
// field distinguishes a Cozy-initiated execution" gap. Structurally a
// SUMMARY block plus `triggerSource` (which background producer created
// this turn -- e.g. `REFINANCE_RATE_MONITOR`, `MAINTENANCE_DEADLINE_MONITOR`,
// `HOME_EVENT_RADAR` -- lets the frontend render "Cozy noticed via X"
// distinctly from an ordinary homeowner-initiated SUMMARY). Replaces the
// SUMMARY block `createAskNotificationContinuation` previously built for
// every proactive turn, rather than being added alongside it, so a
// proactive turn is now structurally distinguishable, not just
// conventionally recognizable by reasonCode.
const ProactiveInsightBlockSchema = z.object({
  type: z.literal('PROACTIVE_INSIGHT'),
  id: z.string(),
  title: z.string(),
  body: z.string(),
  tone: z.enum(['DEFAULT', 'POSITIVE', 'CAUTION', 'CRITICAL']).default('DEFAULT'),
  triggerSource: z.string().trim().min(1).max(80),
  actions: z.array(AskActionSchema).max(3).default([]),
});

// ASK_COZY_INTERACTION_MODEL_UI_FRD §7's own interaction taxonomy (ACT-001).
// Not every value has an implemented item action yet -- declaring the full
// enum here (rather than a single literal) means a future FILTER_RESULT or
// REMIND_LATER item action validates against the same contract without a
// schema change.
const ASK_ITEM_ACTION_INTERACTION_TYPES = [
  'CONVERSATION_CONTINUE', 'FILTER_RESULT', 'MUTATE_RECORD', 'NAVIGATE', 'CONFIRM', 'EDIT_PROPOSAL', 'REFRESH', 'DISMISS', 'REMIND_LATER',
] as const;

// ASK_COZY_INTERACTION_MODEL_UI_FRD §7 (ACT-001/ACT-003): a declared item
// command, not a navigation link -- entityType/the item's own id identify
// the canonical target, and `message` is the exact natural-language command
// the frontend sends back through the normal ask() path (launchContext
// carries entityType/entityId so the operation resolves the target
// directly; see launchMaintenanceTaskId in askOrchestrator.service.ts).
// Deliberately not reusing AskActionSchema: item commands also carry their
// target entity, while response-level START_WORKFLOW actions only start a
// workflow and navigation actions remain href-based.
// External review finding: this shape originally carried only a label and
// a canned message string, with no declared interaction type or registered
// operation at all -- ACT-001 requires separating interaction type, domain
// operation and target, and ACT-003 requires the contract to carry the
// registered operation explicitly. `operationId` is deliberately typed as a
// plain string (not the AskOperationId union from services/ask) to avoid
// this contract module importing from the services layer.
const GroupedListItemActionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(300),
  style: z.enum(['PRIMARY', 'SECONDARY', 'QUIET']).default('SECONDARY'),
  interactionType: z.enum(ASK_ITEM_ACTION_INTERACTION_TYPES),
  operationId: z.string().trim().min(1).max(120),
});

const GroupedListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  meta: z.array(z.string()).max(6).default([]),
  status: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
  entityType: z.string().trim().min(1).max(60).nullable().optional(),
  // The entity's parent record, when the inline detail must re-read it through its parent (an inspection finding is
  // read through its report). Additive; FRD v1.43.
  parentId: z.string().trim().min(1).max(160).nullable().optional(),
  // Additive for existing grouped-list producers: actionable rows opt in;
  // historical/non-actionable rows remain valid without emitting an empty list.
  actions: z.array(GroupedListItemActionSchema).max(12).optional(),
  // ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.72): typed display facts the shared patterns use. All optional and
  // additive; a renderer that does not know them keeps showing `description` and `meta`.
  tone: AskDisplayToneSchema.optional(),
  timingLabel: z.string().trim().min(1).max(80).nullable().optional(),
  amountLabel: z.string().trim().min(1).max(80).nullable().optional(),
  floorLevel: z.number().int().min(-5).max(200).nullable().optional(),
  countLabel: z.string().trim().min(1).max(60).nullable().optional(),
  badgeLabel: z.string().trim().min(1).max(60).nullable().optional(),
});

// IW-PRES-022: the server declares which shared pattern a grouped list uses. The client uses it only when the
// block's data fits the pattern, and otherwise renders the ordinary grouped list (IW-PRES-012).
const GroupedListPresentationSchema = z.discriminatedUnion('pattern', [
  z.object({ pattern: z.literal('SHELVES') }),
  z.object({
    pattern: z.literal('DECK'),
    // Item action ids a right or left swipe performs. Each must be declared on every item, or swiping is off.
    swipeRightActionId: z.string().trim().min(1).max(120).nullable().optional(),
    swipeLeftActionId: z.string().trim().min(1).max(120).nullable().optional(),
  }),
  z.object({ pattern: z.literal('ROOM_MAP') }),
]);

// ASK_COZY_INTERACTION_MODEL_UI_FRD §7 (ACT-001 FILTER_RESULT): a declared,
// clickable filter -- `message` is the exact canned phrasing the existing
// askFollowUpContext.ts filter-continuation matcher already recognizes
// (e.g. "Only show overdue tasks"), so a chip click reuses that mechanism
// (and RES-003's duplicate-card suppression) instead of a new dispatch
// path. `active` reflects the currently-applied filter so the UI can show
// which chip is selected.
const GroupedListFilterSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(300),
  active: z.boolean(),
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
    // Server-owned window into the full collection. Omitted by legacy
    // producers; Maintenance uses it for stable inline pagination.
    offset: z.number().int().nonnegative().optional(),
    items: z.array(GroupedListItemSchema).max(100),
  })).max(12),
  actions: z.array(AskActionSchema).max(3).default([]),
  filters: z.array(GroupedListFilterSchema).max(6).default([]),
  presentation: GroupedListPresentationSchema.optional(),
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
    inlineLaunch: z.object({ interactionType: z.literal('CONVERSATION_CONTINUE'), operationId: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(300) }).nullable(),
    inlineBoundary: z.string().trim().min(1).max(300),
    readiness: z.enum(['READY', 'NEEDS_PROPERTY', 'NEEDS_CONTEXT', 'UNAVAILABLE', 'AVAILABLE']),
    readinessLabel: z.string().max(240).nullable().default(null),
    readinessReasons: z.array(z.string().max(600)).max(5).default([]),
    releaseStage: z.enum(['ACTIVE', 'BETA']),
  })).min(1).max(5),
});

const EvidenceBlockSchema = z.object({
  type: z.literal('EVIDENCE'),
  id: z.string(),
  title: z.string(),
  items: z.array(z.object({
    label: z.string(),
    source: z.string().nullable(),
    observedAt: z.string().nullable(),
    // IW-SHELL-006 phase 2: producers may bind a source to the exact
    // schema-validated result item it supports. The response-level schema
    // below rejects dangling block/item references; the client never
    // infers this relationship from labels, URLs, or display order.
    claim: z.object({
      targetBlockId: z.string().trim().min(1).max(160),
      targetItemId: z.string().trim().min(1).max(160).nullable().default(null),
      text: z.string().trim().min(1).max(500),
    }).nullable().optional(),
  })).max(30),
});

const BoundaryBlockSchema = z.object({
  type: z.literal('BOUNDARY'),
  id: z.string(),
  title: z.string(),
  body: z.string(),
  severity: z.enum(['INFO', 'CAUTION', 'EMERGENCY']),
  suggestions: z.array(z.string()).max(5).default([]),
  actions: z.array(AskActionSchema).max(2).optional(),
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

// IW-SHELL-006 contextual output category. Each governed producer has its own
// discriminated artifact lifecycle: maintenance creation can only declare a
// created task, while quote comparison can declare the exact workspace the
// canonical create-or-reuse service returned. The client must not infer
// artifacts from workflow copy, action URLs, or display order.
const OutputArtifactNavigationSchema = z.object({
  label: z.string().trim().min(1).max(120),
  href: z.string().regex(/^\/dashboard\//),
}).nullable().default(null);

const OutputArtifactsBlockSchema = z.object({
  type: z.literal('OUTPUT_ARTIFACTS'),
  id: z.string(),
  title: z.string(),
  items: z.array(z.discriminatedUnion('artifactType', [
    z.object({
      artifactType: z.literal('PROPERTY_MAINTENANCE_TASK'),
      artifactId: z.string().trim().min(1).max(160),
      relationship: z.literal('CREATED'),
      label: z.string().trim().min(1).max(240),
      status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NEEDS_REVIEW']),
      createdAt: z.string().datetime(),
      navigation: OutputArtifactNavigationSchema,
    }),
    z.object({
      artifactType: z.literal('QUOTE_COMPARISON_WORKSPACE'),
      artifactId: z.string().trim().min(1).max(160),
      relationship: z.enum(['CREATED', 'REUSED']),
      label: z.string().trim().min(1).max(240),
      status: z.enum(['DRAFT', 'SHORTLISTED', 'DECIDED', 'ARCHIVED']),
      createdAt: z.string().datetime(),
      navigation: OutputArtifactNavigationSchema,
    }),
  ])).min(1).max(10),
});

// IW-SHELL-006 contextual related-record category. Relationships are
// producer-declared from canonical IDs; the client must never derive them
// from matching labels, URLs, or neighboring blocks.
const RelatedRecordsBlockSchema = z.object({
  type: z.literal('RELATED_RECORDS'),
  id: z.string(),
  title: z.string(),
  relationships: z.array(z.object({
    relationshipType: z.literal('DOCUMENT_EVIDENCE_FOR_HOME_EVENT'),
    source: z.object({
      recordType: z.literal('DOCUMENT'),
      recordId: z.string().trim().min(1).max(160),
      label: z.string().trim().min(1).max(240),
    }),
    target: z.object({
      recordType: z.literal('HOME_EVENT'),
      recordId: z.string().trim().min(1).max(160),
      label: z.string().trim().min(1).max(240),
    }),
    navigation: z.object({
      label: z.string().trim().min(1).max(120),
      href: z.string().regex(/^\/dashboard\//),
    }).nullable().default(null),
  })).min(1).max(20),
});

const MetricRowBlockSchema = z.object({
  type: z.literal('METRIC_ROW'), id: z.string(), title: z.string(), description: z.string().nullable().optional(),
  metrics: z.array(z.object({ label: z.string(), value: z.string(), detail: z.string().nullable().optional(), tone: z.enum(['DEFAULT', 'POSITIVE', 'CAUTION', 'CRITICAL']).default('DEFAULT') })).min(1).max(6),
});

const TimelineBlockSchema = z.object({
  type: z.literal('TIMELINE'), id: z.string(), title: z.string(), description: z.string().nullable().optional(),
  items: z.array(z.object({
    id: z.string(), label: z.string(), date: z.string().nullable().optional(), description: z.string().nullable().optional(), status: z.string().nullable().optional(), href: z.string().nullable().optional(),
    // IW-PRES-017 (FRD v1.72): optional category (legend and filter), recorded date precision, and item actions.
    category: z.object({ id: z.string().trim().min(1).max(60), label: z.string().trim().min(1).max(60) }).nullable().optional(),
    datePrecision: z.enum(['DAY', 'MONTH', 'YEAR']).nullable().optional(),
    entityType: z.string().trim().min(1).max(60).nullable().optional(),
    actions: z.array(GroupedListItemActionSchema).max(4).optional(),
  })).max(50),
});

const ComparisonBadgeSchema = z.object({
  label: z.string().trim().min(1).max(48),
  basis: z.string().trim().min(1).max(300),
  policyCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
});

// IW-PRES-018 (FRD v1.72): age against a typical life range, one bar per item. Status is declared by the server
// from the range, never worked out by the renderer. Items without an age are listed separately so the homeowner
// can add the missing year through a declared item action.
const LifespanBlockSchema = z.object({
  type: z.literal('LIFESPAN'), id: z.string(), title: z.string(), description: z.string().nullable().optional(),
  basis: z.string().trim().min(1).max(300),
  items: z.array(z.object({
    id: z.string(),
    label: z.string(),
    ageYears: z.number().min(0).max(200),
    typicalLifeYears: z.object({ min: z.number().min(0).max(200), max: z.number().min(0).max(200) })
      .refine((range) => range.min <= range.max, { message: 'Typical life minimum must not exceed its maximum.' }),
    status: z.enum(['WITHIN_RANGE', 'PLAN_AHEAD', 'PAST_RANGE']),
    statusLabel: z.string().trim().min(1).max(60),
    entityType: z.string().trim().min(1).max(60).nullable().optional(),
    actions: z.array(GroupedListItemActionSchema).max(4).optional(),
  })).max(50),
  missingAge: z.array(z.object({
    id: z.string(),
    label: z.string(),
    entityType: z.string().trim().min(1).max(60).nullable().optional(),
    actions: z.array(GroupedListItemActionSchema).max(4).optional(),
  })).max(20).default([]),
});

// IW-PRES-020 (FRD v1.72): checklist readiness as a ring. `percent` is the domain's own readiness figure and
// `basis` says what it counts; the renderer never recomputes it.
const ProgressBlockSchema = z.object({
  type: z.literal('PROGRESS'), id: z.string(), title: z.string(), description: z.string().nullable().optional(),
  percent: z.number().min(0).max(100),
  basis: z.string().trim().min(1).max(200),
  metrics: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(40), tone: AskDisplayToneSchema.default('DEFAULT') })).max(3).default([]),
  nextSteps: z.array(GroupedListItemSchema).max(3).default([]),
  actions: z.array(AskActionSchema).max(3).default([]),
});

const ComparisonBlockSchema = z.object({
  type: z.literal('COMPARISON'), id: z.string(), title: z.string(), description: z.string().nullable().optional(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    summary: z.string().nullable().optional(),
    // Badges are server-declared decisions, never labels inferred by the
    // renderer. The policy code makes the governing rule inspectable while
    // basis provides the homeowner-facing explanation required by IW-PRES-006.
    badge: ComparisonBadgeSchema.nullable().optional(),
    // IW-PRES-016 (FRD v1.72): an option may lead on several declared things ("Lowest price", "Soonest start").
    // `badge` stays for existing producers; a renderer shows `badges` when present.
    badges: z.array(ComparisonBadgeSchema).max(3).optional(),
    attributes: z.array(z.object({ label: z.string(), value: z.string(), tone: z.enum(['DEFAULT', 'POSITIVE', 'CAUTION', 'CRITICAL']).default('DEFAULT') })).max(12),
    actions: z.array(AskActionSchema).max(2).default([]),
  })).min(2).max(4),
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

// Ask Intelligence FRD §11.4. Rendered whenever a confirmed, active
// preference materially affected a recommendation; privacy-appropriate
// summary copy only, never the raw stored value. "Change"/"forget" controls
// are surfaced as suggested follow-up messages (see askOrchestrator.service.ts),
// not action hrefs -- AskAction is link-only and these are commands, not
// navigation.
const PreferenceReferenceBlockSchema = z.object({
  type: z.literal('PREFERENCE_REFERENCE'), id: z.string(), title: z.string(),
  preferenceKey: z.string(),
  summary: z.string(),
  visibility: z.enum(['PRIVATE', 'OWNER_ONLY', 'HOUSEHOLD_SUMMARY', 'HOUSEHOLD_DETAIL']),
  confirmedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

// Ask Intelligence FRD §14.2. Rendered only from recorded trigger, evidence,
// timing, and confidence codes -- never generated as a post-hoc rationale.
const WhyNowBlockSchema = z.object({
  type: z.literal('WHY_NOW'), id: z.string(), title: z.string(),
  triggerCodes: z.array(z.string()).max(12),
  evidenceCodes: z.array(z.string()).max(12),
  timingNote: z.string().nullable(),
  confidenceLabel: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
});

// Ask Intelligence FRD §14.3. Compares two compatible snapshots; a changed
// engine/contract version with no changed homeowner fact must be disclosed
// as a system-method change, distinct from a material verdict change.
const RecommendationChangeBlockSchema = z.object({
  type: z.literal('RECOMMENDATION_CHANGE'), id: z.string(), title: z.string(),
  decisionThreadId: z.string(),
  previousVerdict: z.string(), currentVerdict: z.string(),
  category: z.enum(['MATERIAL', 'CONFIDENCE_ONLY', 'SYSTEM_METHOD_ONLY', 'UNCHANGED']),
  changedFactors: z.array(z.string()).max(12),
  changedAt: z.string(),
});

// Ask Intelligence FRD §16.4. Rendered from PropertyChange rows (the
// existing HomeChangeView read projection, see decisionPlatformChangeEmitter.ts
// and propertyChange.service.ts) -- never a copied source value, since
// PropertyChange itself stores none. "Previous/current semantic state" is
// disclosed via changeType + a server-built summary rather than a literal
// value diff.
const ChangeSummaryBlockSchema = z.object({
  type: z.literal('CHANGE_SUMMARY'), id: z.string(), title: z.string(),
  source: z.string(),
  changeType: z.enum([
    'SOURCE_RECORD_CREATED', 'SOURCE_RECORD_REVISED', 'SOURCE_LIFECYCLE_CHANGED',
    'PROPERTY_FACT_CHANGED', 'ACTION_STATE_CHANGED', 'OUTCOME_CONFIRMED', 'SOURCE_HEALTH_CHANGED', 'DOCUMENT_PROMOTED',
  ]),
  summary: z.string(),
  effectiveAt: z.string().nullable(),
  detectedAt: z.string(),
  materiality: z.enum(['INFORMATIONAL', 'MEANINGFUL', 'IMPORTANT', 'URGENT']),
  materialityReasonCodes: z.array(z.string()).max(12),
  confidence: z.number().min(0).max(1).nullable(),
  linkedAction: z.object({ label: z.string(), href: z.string() }).nullable(),
});

// Ask Intelligence FRD §17/§21.2, Phase 9B. Renders the versioned,
// channel-specific ranked view of the existing governed Home Actions feed
// (see priorityListPolicy.ts) -- never a second ranking, just an
// explainable annotation of the same feed homeActionsResult() already
// queries. No internal numeric score is exposed, only the comparative
// reason codes and consumer category FRD §17.3 requires; `truncated` is a
// list-level flag, not per item, per §21.2's bullet list.
const PriorityListItemSchema = z.object({
  homeActionId: z.string(),
  title: z.string(),
  consumerPriority: z.enum(['DO_NOW', 'PLAN_SOON', 'WATCH', 'OPTIONAL', 'NO_ACTION']),
  comparativeReasonCodes: z.array(z.string()).max(8),
  confidenceLabel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  deadlineAt: z.string().nullable(),
  dependencyRefs: z.array(z.string()).max(10).default([]),
  cta: AskActionSchema.nullable(),
  watchState: z.string().nullable(),
  suppressed: z.boolean(),
  completed: z.boolean(),
  unavailable: z.boolean(),
  stale: z.boolean(),
});

const PriorityListBlockSchema = z.object({
  type: z.literal('PRIORITY_LIST'), id: z.string(), title: z.string(),
  propertyId: z.string(),
  rankingPolicyVersion: z.string(),
  generatedAt: z.string(),
  sourceFreshnessAt: z.string().nullable(),
  items: z.array(PriorityListItemSchema).max(20),
  truncated: z.boolean(),
});

// Ask Intelligence FRD §19.1/§21.5, Phase 10A. One entry per recorded
// RecommendationAttribution + its OutcomeObservation. `comparable` is false
// (and cost/timing labels are omitted) whenever units, inclusions, time
// basis, or attribution are not comparable -- per §21.5, the block must not
// show a predicted-vs-observed delta in that case. Correction/dispute/unlink
// controls are surfaced as suggested follow-up messages (see
// askOrchestrator.service.ts), not action hrefs, matching
// PREFERENCE_REFERENCE's "change"/"forget" convention -- these are commands,
// not navigation.
const OutcomeSummaryEntrySchema = z.object({
  outcomeObservationId: z.string(),
  recommendationSnapshotId: z.string(),
  observedType: z.string(),
  occurredAt: z.string(),
  verificationStatus: z.enum(['REPORTED', 'CORROBORATED', 'VERIFIED', 'REJECTED', 'SUPERSEDED']),
  sourceLabel: z.string(),
  relationshipType: z.enum(['SELECTED_OPTION', 'ACTION_STARTED', 'ACTION_COMPLETED', 'COST_OBSERVED', 'TIMING_OBSERVED', 'RESULT_OBSERVED']),
  attributionConfidence: z.number().min(0).max(1).nullable(),
  reviewStatus: z.enum(['PENDING', 'CONFIRMED', 'DISPUTED', 'REJECTED']),
  comparable: z.boolean(),
  observedCostLabel: z.string().nullable(),
  predictedCostLabel: z.string().nullable(),
  note: z.string().nullable(),
});

const OutcomeSummaryBlockSchema = z.object({
  type: z.literal('OUTCOME_SUMMARY'), id: z.string(), title: z.string(),
  decisionThreadId: z.string(),
  entries: z.array(OutcomeSummaryEntrySchema).max(20),
  // FRD §21.5's required limitation: "deviation or a different homeowner
  // choice does not by itself prove that the recommendation was incorrect."
  limitation: z.string(),
});

const AssumptionsBlockSchema = z.object({ type: z.literal('ASSUMPTIONS'), id: z.string(), title: z.string(), items: z.array(z.string()).min(1).max(20) });
const LimitationBlockSchema = z.object({ type: z.literal('LIMITATION'), id: z.string(), title: z.string(), body: z.string(), severity: z.enum(['INFO', 'CAUTION']) });
const EmptyStateBlockSchema = z.object({ type: z.literal('EMPTY_STATE'), id: z.string(), title: z.string(), body: z.string(), actions: z.array(AskActionSchema).max(3).default([]) });
const ErrorStateBlockSchema = z.object({ type: z.literal('ERROR_STATE'), id: z.string(), title: z.string(), body: z.string(), retryable: z.boolean(), actions: z.array(AskActionSchema).max(3).default([]) });

export const AskPresentationBlockSchema = z.discriminatedUnion('type', [
  SummaryBlockSchema,
  ProactiveInsightBlockSchema,
  GroupedListBlockSchema,
  TableBlockSchema,
  CapabilityListBlockSchema,
  EvidenceBlockSchema,
  BoundaryBlockSchema,
  MonitorBlockSchema,
  WorkflowProgressBlockSchema,
  OutputArtifactsBlockSchema,
  RelatedRecordsBlockSchema,
  MetricRowBlockSchema,
  TimelineBlockSchema,
  ComparisonBlockSchema,
  DecisionTraceBlockSchema,
  DecisionProgressBlockSchema,
  ScenarioComparisonBlockSchema,
  PreferenceReferenceBlockSchema,
  WhyNowBlockSchema,
  RecommendationChangeBlockSchema,
  ChangeSummaryBlockSchema,
  PriorityListBlockSchema,
  OutcomeSummaryBlockSchema,
  AssumptionsBlockSchema,
  LimitationBlockSchema,
  EmptyStateBlockSchema,
  ErrorStateBlockSchema,
  LifespanBlockSchema,
  ProgressBlockSchema,
]);

// ASK_COZY_INTERACTION_MODEL_UI_FRD §8 (CONF-002/CONF-003): a declared,
// typed field the homeowner may change before confirming, distinct from
// `fields` (read-only display). Deliberately just DATE for now -- the only
// case maintenance v1 needs (rescheduling) -- rather than building a
// generic form-field type system speculatively; extend this enum when a
// second editable-field case is actually implemented.
const AskConfirmationEditableFieldSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(160),
  // DATE (YYYY-MM-DD), single-line TEXT, multi-line TEXTAREA, SELECT (one of
  // `options`) and MONEY (dollars, up to two decimals). The value is always a
  // string; each operation's own edit handler owns the field-specific validation.
  type: z.enum(['DATE', 'TEXT', 'TEXTAREA', 'SELECT', 'MONEY']),
  value: z.string().max(2000),
  options: z.array(z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(80) })).max(12).optional(),
});

export const AskConfirmationSchema = z.object({
  confirmationId: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })).max(12),
  editableFields: z.array(AskConfirmationEditableFieldSchema).max(3).default([]),
  confirmLabel: z.string(),
  consentText: z.string(),
  expiresAt: z.string().datetime(),
});

export const SubmitAskConfirmationSchema = z.object({
  confirmationVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(128),
  consentConfirmed: z.literal(true),
}).strict();

// ASK_COZY_INTERACTION_MODEL_UI_FRD CONF-003: editing invalidates the
// version being edited and returns a newly validated proposal -- it never
// applies a write itself, so unlike SubmitAskConfirmationSchema it carries
// no consent/idempotency key. `confirmationVersion` must match the
// confirmation currently open, exactly like confirming does.
export const EditAskConfirmationSchema = z.object({
  confirmationVersion: z.number().int().positive(),
  edits: z.record(z.string().trim().min(1).max(60), z.string().trim().min(1).max(2000)).refine(
    (value) => Object.keys(value).length > 0 && Object.keys(value).length <= 3,
    { message: 'Provide at least one edited field.' },
  ),
}).strict();

// Home Intelligence Functional Completeness FRD Phase 7 (HI-FBK-003):
// optional elaboration on why the rating was given, drawn from the one
// platform-wide reason-code vocabulary. Bounded to 3 — this is a quick
// reason chip selection, not a free-form list.
const FeedbackReasonCodesSchema = z.array(z.enum(FEEDBACK_REASON_CODES)).max(3).optional();

export const SubmitAskFeedbackSchema = z.object({
  rating: z.enum(['UP', 'DOWN']),
  comment: z.string().trim().max(1000).optional(),
  reasonCodes: FeedbackReasonCodesSchema,
}).strict();

// Ask Intelligence FRD §22.1/Phase 9B "usefulness feedback" deliverable.
// Per-item feedback on a single PRIORITY_LIST entry (FRD §21.2), distinct
// from SubmitAskFeedbackSchema's whole-execution UP/DOWN rating.
export const SubmitHomeActionUsefulnessFeedbackSchema = z.object({
  rating: z.enum(['USEFUL', 'NOT_USEFUL']),
  comment: z.string().trim().max(1000).optional(),
  reasonCodes: FeedbackReasonCodesSchema,
}).strict();

export const RequestAskCorrectionSchema = z.object({
  kind: z.enum(['HOME_RECORD', 'RETRY_RESPONSE', 'INTENT', 'ENTITY']),
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
  // The homeowner may skip this question for now (Property Summary per-area capture). Skipping writes nothing.
  skippable: z.boolean().optional(),
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
    decisionThreadId: z.string().trim().max(160).nullable().optional(),
    workItemId: z.string().trim().max(160).nullable().optional(),
    journeyId: z.string().trim().max(160).nullable().optional(),
    contextVersion: z.string().trim().max(160).nullable().optional(),
    returnTo: z.string().trim().max(1000).nullable().optional(),
    // ASK_COZY_INTERACTION_MODEL_UI_FRD MAINT-005/A12: the execution this
    // turn's item action was clicked from (e.g. a "Complete" button on a
    // pending-maintenance list row), if any. Lets a confirm handler refresh
    // that still-visible result in place once its mutation succeeds,
    // instead of leaving it showing stale pending/complete state.
    sourceExecutionId: z.string().trim().max(160).nullable().optional(),
    // ASK_COZY_INTERACTION_MODEL_UI_FRD ACT-001/ACT-003: a declared item
    // action's own registered operation (GroupedListItemActionSchema.operationId
    // above), threaded through so the server can route directly to it
    // instead of re-deriving the operation from free-text pattern matching
    // on a canned message. Only ever a routing HINT, not a bypass of
    // authorization -- createAskExecution validates it against
    // ASK_OPERATION_DEFINITIONS before honoring it, and every downstream
    // role/target/confirmation check still runs exactly as it does for any
    // other route to that same operation (ACT-002).
    operationId: z.string().trim().max(120).nullable().optional(),
    // ASK_COZY_INLINE_WORKSPACE_FRD Phase 3, evidence upload design
    // (approved 2026-09-22): the id of a Document already uploaded via
    // POST /api/documents/property/:propertyId/evidence-upload, carried
    // the same way entityId carries an existing record's id. Only ever
    // honored by capture.evidence.confirm's own declared-action guard,
    // which independently re-verifies the document belongs to this
    // property before building any confirmation -- like operationId, a
    // routing hint, never a bypass of that re-check.
    documentId: z.string().trim().max(160).nullable().optional(),
  }).optional(),
}).strict();

// Ask Cozy Stage 3, Phase 3 (implementation plan §9/§19; FRD §14/§16/§28).
// Factored out of AskExecutionResponseSchema so childExecutions below can
// nest ONE level (each child is a full response object) without a truly
// recursive Zod schema: AskExecutionResponseChildSchema fixes its own
// childExecutions at [] by construction (z.tuple([]) accepts only an empty
// array), matching the plan's explicit decision not to allow arbitrarily
// deep candidate chains.
const AskExecutionResponseBaseSchema = z.object({
  schemaVersion: z.literal(ASK_RESPONSE_SCHEMA_VERSION),
  executionId: z.string(),
  sessionId: z.string(),
  question: z.string(),
  status: AskExecutionStatusSchema,
  property: z.object({ id: z.string(), label: z.string() }).nullable(),
  skill: z.object({ id: z.string(), version: z.string(), domain: z.string() }).nullable().default(null),
  skillHandoff: z.object({
    suggestedNextSkillId: z.string().trim().min(1).max(100),
    suggestedGoal: z.string().trim().min(1).max(160),
    reasonCodes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/)).min(1).max(8),
    contextReferenceIds: z.array(z.string().trim().min(1).max(128)).max(8),
    continuity: z.object({
      propertyId: z.string().nullable(), sourceEntityType: z.string().nullable(), sourceEntityId: z.string().nullable(),
      sourceHomeActionId: z.string().nullable(), decisionThreadId: z.string().nullable(), workItemId: z.string().nullable(),
      journeyId: z.string().nullable(), contextVersion: z.string().nullable(), returnDestination: z.string().nullable(),
    }).default({ propertyId: null, sourceEntityType: null, sourceEntityId: null, sourceHomeActionId: null, decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: null, returnDestination: null }),
  }).nullable().default(null),
  operation: z.object({ id: z.string(), version: z.string(), family: z.string() }).nullable(),
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-003/MAINT-003: set only when this
  // execution is a bare filter refinement of an existing read result (e.g.
  // "only show urgent") -- askFollowUpContext.ts's isFilterContinuation
  // branch already resolves the prior execution id for routing but never
  // exposed it, so the frontend had no way to distinguish "new question"
  // from "refine the surface I'm already looking at" and always rendered a
  // second full response. Never set for a mutation, entity-pronoun, or
  // pagination continuation -- those are legitimately separate turns.
  continuesExecutionId: z.string().nullable().default(null),
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001: the three-layer model's
  // "original response" -- frozen the first time this execution's result
  // was ever computed, and never overwritten by a later refresh/confirm/
  // edit write (each of those preserves whatever was already stored here).
  // `blocks` above is always "current data"; this is what Cozy originally
  // answered. Stored inside resultJson itself (not a new column) so no
  // database migration is required for this to take effect.
  originalResponse: z.object({
    blocks: z.array(AskPresentationBlockSchema),
    observedAt: z.string().datetime(),
  }).nullable().default(null),
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001-005/FRESH-001/HAND-001-003: an
  // explicit representation of "what the homeowner is currently viewing,"
  // separate from any one conversational turn -- resultId is stable across
  // every filter-chip click and refresh of the SAME interactive result.
  // Deliberately generic (not maintenance-only) in shape, though only
  // maintenance populates it today; a domain-specific consumer reads its
  // own known fields and ignores the rest.
  viewState: z.object({
    resultId: z.string(),
    domainScopePhrase: z.string().nullable(),
    dateScopePhrase: z.string().nullable(),
    statusFilter: z.string(),
    selectedTaskId: z.string().nullable(),
    queryMessage: z.string().nullable().optional(),
    collectionOffsets: z.record(z.string(), z.number().int().nonnegative()).optional(),
    revision: z.number().int().nonnegative(),
  }).nullable().default(null),
  contextVersion: z.string().nullable(),
  blocks: z.array(AskPresentationBlockSchema),
  captureRequests: z.array(AskCaptureRequestSchema).max(3).default([]),
  clarification: AskClarificationSchema.nullable().default(null),
  confirmation: AskConfirmationSchema.nullable().default(null),
  correctionCapabilities: z.object({
    intent: z.boolean(),
    entity: z.boolean(),
    homeRecord: z.boolean(),
    retryResponse: z.boolean(),
  }).default({ intent: false, entity: false, homeRecord: false, retryResponse: false }),
  suggestions: z.array(z.string()).max(5),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

function validateEvidenceClaimMappings(
  response: z.infer<typeof AskExecutionResponseBaseSchema>,
  ctx: z.RefinementCtx,
) {
  const validateBlocks = (
    blocks: z.infer<typeof AskPresentationBlockSchema>[],
    pathPrefix: Array<string | number>,
  ) => {
    const blocksById = new Map(blocks.map((block) => [block.id, block]));

    blocks.forEach((block, blockIndex) => {
      if (block.type !== 'EVIDENCE') return;
      block.items.forEach((item, itemIndex) => {
        if (!item.claim) return;
        const target = blocksById.get(item.claim.targetBlockId);
        const path = [...pathPrefix, blockIndex, 'items', itemIndex, 'claim'];
        if (!target || target.type === 'EVIDENCE') {
          ctx.addIssue({ code: 'custom', path: [...path, 'targetBlockId'], message: 'Evidence claims must reference a non-evidence block in the same response.' });
          return;
        }
        if (!item.claim.targetItemId) return;

        const targetItemExists = target.type === 'TABLE'
          ? target.rows.some((row) => row.id === item.claim!.targetItemId)
          : target.type === 'GROUPED_LIST'
            ? target.sections.some((section) => section.items.some((entry) => entry.id === item.claim!.targetItemId))
            : target.type === 'COMPARISON'
              ? target.options.some((option) => option.id === item.claim!.targetItemId)
              : target.type === 'TIMELINE'
                ? target.items.some((entry) => entry.id === item.claim!.targetItemId)
                : target.type === 'LIFESPAN'
                  ? target.items.some((entry) => entry.id === item.claim!.targetItemId)
                  : false;
        if (!targetItemExists) {
          ctx.addIssue({ code: 'custom', path: [...path, 'targetItemId'], message: 'Evidence claim item must exist in the referenced result block.' });
        }
      });
    });
  };

  validateBlocks(response.blocks, ['blocks']);
  if (response.originalResponse) validateBlocks(response.originalResponse.blocks, ['originalResponse', 'blocks']);
}

const AskExecutionResponseChildSchema = AskExecutionResponseBaseSchema.extend({
  childExecutions: z.tuple([]).default([]),
}).superRefine(validateEvidenceClaimMappings);

export const AskExecutionResponseSchema = AskExecutionResponseBaseSchema.extend({
  childExecutions: z.array(AskExecutionResponseChildSchema).max(3).default([]),
}).superRefine(validateEvidenceClaimMappings);

export const AskPendingWorkItemSchema = z.object({
  pendingKind: z.enum(['CLARIFICATION', 'PROPERTY_SELECTION', 'ENTITY_SELECTION', 'CONTEXT_CAPTURE', 'CONFIRMATION', 'COMMAND_RECOVERY']),
  actionLabel: z.string().trim().min(1).max(120),
  execution: AskExecutionResponseSchema,
});

export const AskRecentSessionSummarySchema = z.object({
  sessionId: z.string(),
  title: z.string().trim().min(1).max(120),
  property: z.object({ id: z.string(), label: z.string() }),
  latestStatus: AskExecutionStatusSchema,
  latestExecutionId: z.string(),
  executionCount: z.number().int().positive(),
  lastActiveAt: z.string().datetime(),
  // IW-HIST-009..011: lifecycle state the history rail's session menu reads.
  pinned: z.boolean(),
  archived: z.boolean(),
  titleSetByUser: z.boolean(),
});

export const AskRecentSessionPageSchema = z.object({
  items: z.array(AskRecentSessionSummarySchema),
  nextCursor: z.string().nullable(),
  // IW-HIST-003: pinned conversations in their own stable group, returned with the first page of the recent list only
  // (not with search results, the archived view, or later pages). Items never repeat pinned conversations.
  pinned: z.array(AskRecentSessionSummarySchema).optional(),
});

// IW-HIST-009..011, IW-HIST-014: one session-menu change at a time from the rail. A title is the homeowner's own; an
// empty title is rejected rather than treated as "reset".
export const AskSessionUpdateRequestSchema = z.union([
  z.object({ title: z.string().trim().min(1).max(120) }).strict(),
  z.object({ pinned: z.boolean() }).strict(),
  z.object({ archived: z.boolean() }).strict(),
]);

const AskSessionSearchBaseSchema = z.object({
  query: z.string().trim().min(1).max(120),
  cursor: z.string().min(1).max(512).optional(),
});
export const AskSessionSearchRequestSchema = z.union([
  AskSessionSearchBaseSchema.extend({ propertyId: z.string().trim().min(1).max(160) }).strict(),
  AskSessionSearchBaseSchema.extend({ scope: z.literal('ALL_HOMES') }).strict(),
]);

export type AskExecutionStatus = z.infer<typeof AskExecutionStatusSchema>;
export type AskPresentationBlock = z.infer<typeof AskPresentationBlockSchema>;
export type AskCaptureRequest = z.infer<typeof AskCaptureRequestSchema>;
export type AskConfirmation = z.infer<typeof AskConfirmationSchema>;
export type AskClarification = z.infer<typeof AskClarificationSchema>;
export type CreateAskExecutionRequest = z.infer<typeof CreateAskExecutionRequestSchema>;
export type SubmitAskCaptureRequest = z.infer<typeof SubmitAskCaptureRequestSchema>;
export type RecordAskCaptureEvent = z.infer<typeof RecordAskCaptureEventSchema>;
export type SubmitAskConfirmation = z.infer<typeof SubmitAskConfirmationSchema>;
export type EditAskConfirmation = z.infer<typeof EditAskConfirmationSchema>;
export type SubmitAskFeedback = z.infer<typeof SubmitAskFeedbackSchema>;
export type SubmitHomeActionUsefulnessFeedback = z.infer<typeof SubmitHomeActionUsefulnessFeedbackSchema>;
export type RequestAskCorrection = z.infer<typeof RequestAskCorrectionSchema>;
export type ContinueAskExecution = z.infer<typeof ContinueAskExecutionSchema>;
export type ResolveAskExecutionProperty = z.infer<typeof ResolveAskExecutionPropertySchema>;
export type AskPendingWorkItem = z.infer<typeof AskPendingWorkItemSchema>;
export type AskRecentSessionSummary = z.infer<typeof AskRecentSessionSummarySchema>;
export type AskRecentSessionPage = z.infer<typeof AskRecentSessionPageSchema>;
export type AskSessionUpdateRequest = z.infer<typeof AskSessionUpdateRequestSchema>;
export type SubmitAskClarification = z.infer<typeof SubmitAskClarificationSchema>;
export type AskExecutionResponse = z.infer<typeof AskExecutionResponseSchema>;

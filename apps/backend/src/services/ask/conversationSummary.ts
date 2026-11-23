// BICC-CTX-001 .. CTX-005 (docs/product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md §9): the bounded structured conversation summary.
//
// Follow-up resolution needs the few facts of earlier turns that matter (which home, which result, which entities, the dates and amounts the person
// stated, corrections, an open clarification), not the transcript. This module builds exactly that, as plain data:
//   - it is STRUCTURED: no raw message text, no free-form prose from a result, only typed fields and canonical identifiers (CTX-001/002);
//   - it is BOUNDED: a turn window, a recency window, per-field limits and a byte budget, with the truncation recorded (CTX-004);
//   - it carries CANONICAL identity: every entity and result reference keeps its id and property scope; a display label never retargets it (CTX-002);
//   - it is RECONCILED before use: property switching, access loss, entity deletion and result expiry remove incompatible context and the reset is
//     disclosed (CTX-003);
//   - it keeps workflow identity as ids only (CTX-005), and it is never the property truth: preference memory and record facts stay elsewhere.
// Pure and deterministic. The persistence read is separate (`loadConversationSummary`) so the logic is testable without a database.
import { minimizeAskQuestion } from './askPromptMinimization';

export const SUMMARY_POLICY = Object.freeze({
  version: 1,
  maxTurns: 6,
  maxAgeMs: 2 * 60 * 60 * 1000,
  maxEntities: 8,
  maxSources: 12,
  maxCorrections: 4,
  maxWorkflows: 4,
  maxLabelChars: 80,
  maxObjectiveChars: 40,
  maxClarificationChars: 160,
  maxBytes: 4096,
  /** Keys that are never copied into a summary, whatever a stored row contains. */
  forbiddenKeys: Object.freeze(['message', 'question', 'email', 'phone', 'address', 'ssn', 'accountNumber', 'password', 'token', 'body', 'blocks', 'resultJson'] as const),
});

export type LifecycleMode = 'HOMEOWNER' | 'UNDER_CONTRACT_BUYER' | 'PROSPECTIVE_BUYER';

export interface TurnDigest {
  executionId: string;
  status: string;
  operationId: string | null;
  propertyId: string | null;
  createdAt: Date;
  resultId?: string | null;
  slots?: { item?: string; targetDate?: string; horizonYears?: number; amount?: number; objective?: string } | null;
  entities?: ReadonlyArray<{ entityType: string; entityId: string; label?: string | null }>;
  corrections?: ReadonlyArray<'INTENT' | 'ENTITY' | 'HOME_RECORD'>;
  clarification?: { question: string; optionOperationIds: readonly string[] } | null;
  sources?: ReadonlyArray<{ sourceType: string; sourceId: string }>;
  workflows?: ReadonlyArray<{ workflowType: 'JOURNEY' | 'DECISION_THREAD' | 'WORK_ITEM'; workflowId: string }>;
}

export interface SummaryEntity { entityType: string; entityId: string; label: string | null; propertyId: string | null }

export interface ConversationSummary {
  version: number;
  scope: { propertyId: string | null; lifecycleMode: LifecycleMode | null };
  referencedResult: { executionId: string; operationId: string | null; resultId: string | null; propertyId: string | null } | null;
  activeEntities: SummaryEntity[];
  stated: { items: string[]; dates: string[]; horizonsYears: number[]; amounts: number[]; objectives: string[] };
  /** The newest settled turn that stated anything, and the operation that answered it: what a slot follow-up ("what about the water heater?") rewrites. */
  slotSource: { executionId: string; operationId: string | null } | null;
  corrections: Array<{ kind: 'INTENT' | 'ENTITY' | 'HOME_RECORD'; executionId: string }>;
  openClarification: { executionId: string; question: string; optionOperationIds: string[] } | null;
  sources: Array<{ sourceType: string; sourceId: string; propertyId: string | null }>;
  workflows: Array<{ workflowType: string; workflowId: string }>;
  turnsIncluded: number;
  truncated: boolean;
  redactions: number;
}

const SETTLED = new Set(['ANSWERED', 'READY_WITH_LIMITATIONS', 'COMPLETED']);
const cap = (value: string, max: number): string => value.length > max ? value.slice(0, max) : value;
const unique = <T,>(values: readonly T[]): T[] => [...new Set(values)];

export function buildConversationSummary(input: {
  digests: readonly TurnDigest[];
  scope: { propertyId: string | null; lifecycleMode: LifecycleMode | null };
  now?: Date;
}): ConversationSummary {
  const policy = SUMMARY_POLICY;
  const now = (input.now ?? new Date()).getTime();
  let truncated = false; let redactions = 0;
  const clean = (value: string, max: number): string => {
    const redacted = minimizeAskQuestion(value);
    if (redacted !== value.replace(/\s+/g, ' ').trim()) redactions += 1;
    if (redacted.length > max) truncated = true;
    return cap(redacted, max);
  };
  // newest first, inside the recency window, capped at the turn window
  const recent = [...input.digests].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const inWindow = recent.filter((digest) => now - digest.createdAt.getTime() <= policy.maxAgeMs);
  if (inWindow.length < recent.length) truncated = true;
  const turns = inWindow.slice(0, policy.maxTurns);
  if (inWindow.length > turns.length) truncated = true;

  const latestSettled = turns.find((digest) => SETTLED.has(digest.status) && digest.operationId);
  const entities = new Map<string, SummaryEntity>();
  const stated = { items: [] as string[], dates: [] as string[], horizonsYears: [] as number[], amounts: [] as number[], objectives: [] as string[] };
  const corrections: ConversationSummary['corrections'] = [];
  const sources = new Map<string, ConversationSummary['sources'][number]>();
  const workflows = new Map<string, ConversationSummary['workflows'][number]>();
  let slotSource: ConversationSummary['slotSource'] = null;
  for (const turn of turns) {
    for (const entity of turn.entities ?? []) {
      const key = `${entity.entityType}:${entity.entityId}`;
      if (!entity.entityId || entities.has(key)) continue;
      entities.set(key, { entityType: entity.entityType, entityId: entity.entityId, label: entity.label ? clean(entity.label, policy.maxLabelChars) : null, propertyId: turn.propertyId });
    }
    const slots = turn.slots;
    // A value stated in a turn that did not answer is not carried (composition FRD FR-SLT-1/2): only settled turns contribute stated values.
    if (slots && SETTLED.has(turn.status)) {
      if (!slotSource && Object.values(slots).some((value) => value !== undefined && value !== null)) slotSource = { executionId: turn.executionId, operationId: turn.operationId };
      if (slots.item) stated.items.push(clean(slots.item, policy.maxLabelChars));
      if (slots.targetDate) stated.dates.push(clean(slots.targetDate, policy.maxLabelChars));
      if (Number.isFinite(slots.horizonYears)) stated.horizonsYears.push(Number(slots.horizonYears));
      if (Number.isFinite(slots.amount)) stated.amounts.push(Number(slots.amount));
      if (slots.objective) stated.objectives.push(clean(slots.objective, policy.maxObjectiveChars));
    }
    for (const kind of turn.corrections ?? []) corrections.push({ kind, executionId: turn.executionId });
    for (const source of turn.sources ?? []) { const key = `${source.sourceType}:${source.sourceId}`; if (source.sourceId && !sources.has(key)) sources.set(key, { ...source, propertyId: turn.propertyId }); }
    for (const workflow of turn.workflows ?? []) { const key = `${workflow.workflowType}:${workflow.workflowId}`; if (workflow.workflowId && !workflows.has(key)) workflows.set(key, workflow); }
  }
  const pending = turns.find((digest) => digest.status === 'NEEDS_CLARIFICATION' && digest.clarification);
  // an open clarification only counts when nothing newer than it has settled (the person already moved on otherwise)
  const open = pending && !turns.some((digest) => digest.createdAt.getTime() > pending.createdAt.getTime() && SETTLED.has(digest.status)) ? pending : null;

  const limit = <T,>(values: readonly T[], max: number): T[] => { if (values.length > max) truncated = true; return values.slice(0, max); };
  const summary: ConversationSummary = {
    version: policy.version,
    scope: { propertyId: input.scope.propertyId, lifecycleMode: input.scope.lifecycleMode },
    referencedResult: latestSettled ? { executionId: latestSettled.executionId, operationId: latestSettled.operationId, resultId: latestSettled.resultId ?? null, propertyId: latestSettled.propertyId } : null,
    activeEntities: limit([...entities.values()], policy.maxEntities),
    stated: { items: limit(unique(stated.items), 4), dates: limit(unique(stated.dates), 4), horizonsYears: limit(unique(stated.horizonsYears), 4), amounts: limit(unique(stated.amounts), 4), objectives: limit(unique(stated.objectives), 4) },
    corrections: limit(corrections, policy.maxCorrections),
    openClarification: open?.clarification ? { executionId: open.executionId, question: clean(open.clarification.question, policy.maxClarificationChars), optionOperationIds: open.clarification.optionOperationIds.slice(0, 4) } : null,
    sources: limit([...sources.values()], policy.maxSources),
    workflows: limit([...workflows.values()], policy.maxWorkflows),
    slotSource,
    turnsIncluded: turns.length,
    truncated,
    redactions,
  };
  return enforceByteBudget(summary);
}

/** The summary never exceeds its byte budget: the least important context is dropped first, and the truncation is recorded. */
export function enforceByteBudget(summary: ConversationSummary, maxBytes: number = SUMMARY_POLICY.maxBytes): ConversationSummary {
  const size = (value: ConversationSummary) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  let current = summary;
  const droppers: Array<(value: ConversationSummary) => ConversationSummary> = [
    (value) => ({ ...value, sources: value.sources.slice(0, Math.ceil(value.sources.length / 2)) }),
    (value) => ({ ...value, activeEntities: value.activeEntities.slice(0, Math.ceil(value.activeEntities.length / 2)) }),
    (value) => ({ ...value, stated: { items: [], dates: [], horizonsYears: [], amounts: [], objectives: [] } }),
    (value) => ({ ...value, sources: [], corrections: [] }),
  ];
  for (const drop of droppers) { if (size(current) <= maxBytes) break; current = { ...drop(current), truncated: true }; }
  return current;
}

export interface SummaryReconciliation {
  /** The property the person is on now. */
  propertyId: string | null;
  /** Properties the person can still access. */
  accessiblePropertyIds: ReadonlySet<string>;
  deletedEntityIds?: ReadonlySet<string>;
  expiredExecutionIds?: ReadonlySet<string>;
}

export interface ReconciledSummary {
  summary: ConversationSummary;
  /** What was removed and why; empty when the context is still compatible. */
  resets: Array<{ reason: 'PROPERTY_SWITCH' | 'ACCESS_LOST' | 'ENTITY_DELETED' | 'RESULT_EXPIRED'; removed: number }>;
  /** Plain words for the person when anything was reset (CTX-003), else null. */
  disclosure: string | null;
}

/** Removes context that is no longer compatible and says so. Entity and result references are matched by canonical id and property scope, never by label. */
export function reconcileConversationSummary(summary: ConversationSummary, current: SummaryReconciliation): ReconciledSummary {
  const resets: ReconciledSummary['resets'] = [];
  const count = (reason: ReconciledSummary['resets'][number]['reason'], removed: number) => { if (removed > 0) resets.push({ reason, removed }); };
  const compatible = (propertyId: string | null): 'OK' | 'PROPERTY_SWITCH' | 'ACCESS_LOST' => {
    if (propertyId === null) return 'OK';
    if (!current.accessiblePropertyIds.has(propertyId)) return 'ACCESS_LOST';
    if (current.propertyId !== null && propertyId !== current.propertyId) return 'PROPERTY_SWITCH';
    return 'OK';
  };
  const tally = { PROPERTY_SWITCH: 0, ACCESS_LOST: 0, ENTITY_DELETED: 0, RESULT_EXPIRED: 0 };
  const keepEntity = (entity: SummaryEntity) => {
    const state = compatible(entity.propertyId);
    if (state !== 'OK') { tally[state] += 1; return false; }
    if (current.deletedEntityIds?.has(entity.entityId)) { tally.ENTITY_DELETED += 1; return false; }
    return true;
  };
  const keepSource = (source: ConversationSummary['sources'][number]) => {
    const state = compatible(source.propertyId);
    if (state !== 'OK') { tally[state] += 1; return false; }
    return true;
  };
  let referencedResult = summary.referencedResult;
  if (referencedResult) {
    const state = compatible(referencedResult.propertyId);
    if (state !== 'OK') { tally[state] += 1; referencedResult = null; }
    else if (current.expiredExecutionIds?.has(referencedResult.executionId)) { tally.RESULT_EXPIRED += 1; referencedResult = null; }
  }
  let openClarification = summary.openClarification;
  if (openClarification && current.expiredExecutionIds?.has(openClarification.executionId)) { tally.RESULT_EXPIRED += 1; openClarification = null; }
  const reconciled: ConversationSummary = {
    ...summary,
    scope: { ...summary.scope, propertyId: current.propertyId },
    referencedResult,
    activeEntities: summary.activeEntities.filter(keepEntity),
    sources: summary.sources.filter(keepSource),
    openClarification,
  };
  // A property switch also drops the stated values: a date or amount said about one home must not carry to another.
  if (tally.PROPERTY_SWITCH > 0 || tally.ACCESS_LOST > 0) {
    reconciled.stated = { items: [], dates: [], horizonsYears: [], amounts: [], objectives: [] };
    reconciled.slotSource = null;
    reconciled.corrections = [];
    reconciled.workflows = [];
  }
  for (const [reason, removed] of Object.entries(tally) as Array<[keyof typeof tally, number]>) count(reason, removed);
  const disclosure = resets.length
    ? resets.some((reset) => reset.reason === 'PROPERTY_SWITCH' || reset.reason === 'ACCESS_LOST')
      ? 'I started fresh because you switched homes, so nothing from the earlier conversation about another home carries over.'
      : 'Something we were looking at earlier is no longer available, so I left it out.'
    : null;
  return { summary: reconciled, resets, disclosure };
}

/**
 * The ONE entity a stored answer named, by canonical identifier, or null. An answer that listed several things names none: "it" against a list is the ambiguity
 * a follow-up must not guess through. Only typed identifiers are read (a grouped-list row's `id` and `entityType`), never a title or any text.
 */
export function singularEntityOf(resultJson: unknown): { entityType: string; entityId: string } | null {
  const result = record(resultJson);
  const blocks = Array.isArray(result?.blocks) ? result!.blocks as unknown[] : [];
  const found: Array<{ entityType: string; entityId: string }> = [];
  let listedRows = 0;
  for (const raw of blocks) {
    const block = record(raw);
    if (block?.type !== 'GROUPED_LIST' || !Array.isArray(block.sections)) continue;
    for (const sectionRaw of block.sections as unknown[]) {
      const section = record(sectionRaw);
      for (const itemRaw of Array.isArray(section?.items) ? section!.items as unknown[] : []) {
        listedRows += 1;
        const item = record(itemRaw); const entityType = str(item?.entityType); const entityId = str(item?.id);
        if (entityType && entityId) found.push({ entityType, entityId });
      }
    }
  }
  return listedRows === 1 && found.length === 1 ? found[0] : null;
}

// ---------------- persistence read ----------------

const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** Turns one stored execution row into a digest of typed fields only. No message, answer text or free-form value is read. */
export function digestFromRow(row: {
  id: string; status: string; operationId: string | null; propertyId: string | null; createdAt: Date; parametersJson?: unknown; launchContextJson?: unknown; resultJson?: unknown;
}, corrections: ReadonlyArray<'INTENT' | 'ENTITY' | 'HOME_RECORD'> = []): TurnDigest {
  const parameters = record(row.parametersJson); const launch = record(row.launchContextJson);
  const view = record(parameters?.viewState); const slots = record(parameters?.slots);
  const clarificationRaw = record(parameters?.clarification);
  const entities: Array<{ entityType: string; entityId: string; label?: string | null }> = [];
  const entityType = str(launch?.entityType); const entityId = str(launch?.entityId);
  if (entityType && entityId) entities.push({ entityType, entityId });
  const selectedTask = str(view?.selectedTaskId); if (selectedTask) entities.push({ entityType: 'MAINTENANCE_TASK', entityId: selectedTask });
  const named = singularEntityOf(row.resultJson); if (named) entities.push(named);
  const sourcesRaw = Array.isArray(parameters?.sources) ? parameters!.sources as unknown[] : [];
  const sources = sourcesRaw.flatMap((entry) => { const item = record(entry); const sourceType = str(item?.sourceType); const sourceId = str(item?.sourceId); return sourceType && sourceId ? [{ sourceType, sourceId }] : []; });
  const workflows: NonNullable<TurnDigest['workflows']>[number][] = [];
  for (const [key, type] of [['journeyId', 'JOURNEY'], ['decisionThreadId', 'DECISION_THREAD'], ['workItemId', 'WORK_ITEM']] as const) { const id = str(launch?.[key]); if (id) workflows.push({ workflowType: type, workflowId: id }); }
  const options = Array.isArray(clarificationRaw?.candidateOperationIds) ? (clarificationRaw!.candidateOperationIds as unknown[]).filter((id): id is string => typeof id === 'string') : [];
  return {
    executionId: row.id, status: row.status, operationId: row.operationId, propertyId: row.propertyId, createdAt: row.createdAt,
    resultId: str(view?.resultId),
    slots: slots ? { item: str(slots.item) ?? undefined, targetDate: str(slots.targetDate) ?? undefined, horizonYears: typeof slots.horizonYears === 'number' ? slots.horizonYears : undefined, amount: typeof slots.amount === 'number' ? slots.amount : undefined, objective: str(slots.objective) ?? undefined } : null,
    entities, corrections, sources, workflows,
    clarification: options.length ? { question: 'Which did you mean?', optionOperationIds: options } : null,
  };
}

/** Reads the last few top-level executions of one session and summarises them. Row ownership is verified by userId. */
export async function loadConversationSummary(input: {
  userId: string; sessionId: string; propertyId: string | null; lifecycleMode: LifecycleMode | null; now?: Date;
  /** Read only this home's turns. A slot follow-up carries values within one home; turns of another home are not context for it. */
  restrictToProperty?: boolean;
}, db: {
  askExecution: { findMany(args: Record<string, unknown>): Promise<Array<{ id: string; status: string; operationId: string | null; propertyId: string | null; createdAt: Date; parametersJson: unknown; launchContextJson: unknown; resultJson?: unknown }>> };
  askExecutionEvent: { findMany(args: Record<string, unknown>): Promise<Array<{ executionId: string; metadataJson: unknown }>> };
}): Promise<ConversationSummary> {
  const rows = await db.askExecution.findMany({
    where: { sessionId: input.sessionId, userId: input.userId, parentExecutionId: null, ...(input.restrictToProperty && input.propertyId ? { propertyId: input.propertyId, status: { in: ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'] } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: SUMMARY_POLICY.maxTurns + 1,
    select: { id: true, status: true, operationId: true, propertyId: true, createdAt: true, parametersJson: true, launchContextJson: true, resultJson: true },
  });
  const events = rows.length ? await db.askExecutionEvent.findMany({ where: { executionId: { in: rows.map((row) => row.id) }, eventType: 'CORRECTION_REQUESTED' }, select: { executionId: true, metadataJson: true } }) : [];
  const correctionsBy = new Map<string, Array<'INTENT' | 'ENTITY' | 'HOME_RECORD'>>();
  for (const event of events) { const kind = record(event.metadataJson)?.kind; if (kind === 'INTENT' || kind === 'ENTITY' || kind === 'HOME_RECORD') correctionsBy.set(event.executionId, [...(correctionsBy.get(event.executionId) ?? []), kind]); }
  return buildConversationSummary({ digests: rows.map((row) => digestFromRow(row, correctionsBy.get(row.id) ?? [])), scope: { propertyId: input.propertyId, lifecycleMode: input.lifecycleMode }, now: input.now });
}

// ---------------- the continuation gate ----------------

export interface ContinuationContext {
  /** True when the most recent settled result belongs to a home the person is no longer on (or can no longer reach): a follow-up must not resolve against it. */
  blocked: boolean;
  /** Plain words for the person, set only when the context was blocked (CTX-003). */
  disclosure: string | null;
  reasons: string[];
  summary: ConversationSummary;
}

/**
 * BICC-CTX-001/003: decides whether an elliptical follow-up ("only show urgent", "what about it") may continue from the conversation so far. The summary is built
 * from the session's recent turns and reconciled against the home the person is on now. When the latest settled result belongs to another home or one the person
 * can no longer reach, the follow-up fails closed and the person is told, instead of silently resolving against an older turn of this home.
 */
export async function evaluateContinuationContext(input: {
  userId: string; sessionId: string; propertyId: string | null; lifecycleMode?: LifecycleMode | null; now?: Date;
}, db: Parameters<typeof loadConversationSummary>[1]): Promise<ContinuationContext> {
  const summary = await loadConversationSummary({ userId: input.userId, sessionId: input.sessionId, propertyId: input.propertyId, lifecycleMode: input.lifecycleMode ?? null, now: input.now }, db);
  // Without a selected home there is nothing to switch away from; the existing property-less scoping applies unchanged.
  if (!input.propertyId) return { blocked: false, disclosure: null, reasons: [], summary };
  // Another home that appears in the person's own conversation is a different home, not an access loss: this gate has no access lookup, so the person's
  // own earlier homes are treated as reachable and only the switch is reported. (A real access-loss check belongs to the caller that can authorize.)
  const seenHomes = new Set<string>([input.propertyId]);
  for (const id of [summary.referencedResult?.propertyId, ...summary.activeEntities.map((entity) => entity.propertyId), ...summary.sources.map((source) => source.propertyId)]) if (id) seenHomes.add(id);
  const reconciled = reconcileConversationSummary(summary, { propertyId: input.propertyId, accessiblePropertyIds: seenHomes });
  const referentLost = summary.referencedResult !== null && reconciled.summary.referencedResult === null
    && reconciled.resets.some((reset) => reset.reason === 'PROPERTY_SWITCH' || reset.reason === 'ACCESS_LOST');
  return { blocked: referentLost, disclosure: referentLost ? reconciled.disclosure : null, reasons: referentLost ? reconciled.resets.map((reset) => reset.reason) : [], summary: reconciled.summary };
}

/**
 * The slots a follow-up carries, read from the summary: the newest stated value of each kind (newest turn wins, FR-SLT-4), the operation that answered the newest
 * turn that stated anything, and that turn's id. Null when no settled turn stated anything.
 */
export function carriedSlotsFromSummary(summary: ConversationSummary): { item?: string; targetDate?: string; horizonYears?: number; amount?: number; objective?: string; referencedExecutionId: string; operationId?: string } | null {
  if (!summary.slotSource) return null;
  const slots: { item?: string; targetDate?: string; horizonYears?: number; amount?: number; objective?: string; referencedExecutionId: string; operationId?: string } = { referencedExecutionId: summary.slotSource.executionId };
  if (summary.stated.items[0]) slots.item = summary.stated.items[0];
  if (summary.stated.dates[0]) slots.targetDate = summary.stated.dates[0];
  if (summary.stated.horizonsYears[0] !== undefined) slots.horizonYears = summary.stated.horizonsYears[0];
  if (summary.stated.amounts[0] !== undefined) slots.amount = summary.stated.amounts[0];
  if (summary.stated.objectives[0]) slots.objective = summary.stated.objectives[0];
  if (summary.slotSource.operationId) slots.operationId = summary.slotSource.operationId;
  return slots;
}

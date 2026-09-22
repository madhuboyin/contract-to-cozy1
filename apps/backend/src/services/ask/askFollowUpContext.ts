import type { AskExecutionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { AskOperationId } from './askOperationRegistry';

// A registered operation family that a bare filter/scope refinement ("only
// show the urgent ones") may legitimately continue without the homeowner
// repeating the whole question. Command/write/analysis operations are
// deliberately excluded: continuing a filter refinement into a mutation or
// a scenario-bound analysis would silently change what gets acted on.
const FILTER_CONTINUABLE_OPERATIONS: ReadonlySet<AskOperationId> = new Set([
  'MAINTENANCE_STATUS',
  'COVERAGE_GAPS',
  'INCIDENT_CLAIM_STATUS',
  'SAVINGS_OPPORTUNITIES',
  'OWNERSHIP_COSTS',
  'INVENTORY_LOOKUP',
  'PROPERTY_SUMMARY',
  'HOME_ACTIONS',
  // B02 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md):
  // without this, a declared lane-filter chip's own canned message (which
  // does carry sourceExecutionId) would not be recognized as continuing
  // BUYER_DEADLINES -- it would instead route through ordinary
  // classification, which is not guaranteed to land back on the same
  // operation.
  'BUYER_DEADLINES',
]);

const ENVELOPE_PAGINATION_PATTERN = /^\s*(?:(?:show|load|see|get)\s+(?:me\s+)?(?:the\s+)?(?:next|more|previous)|continue\s+(?:the\s+)?(?:intelligence|results?))\b/i;
const SPECIALIST_CONTINUATION_PATTERN = /\b(?:new|good|fair|poor|unknown|installed|installation|year|cost|estimate|quote|assessment|wrong|incorrect|not right|dispute|resume|continue|hvac|furnace|heater|heat pump|boiler|air conditioner|a\/?c|unit|system|one)\b/i;

// Resolved executions worth treating as follow-up context. Boundary,
// expired, cancelled, and failed executions carry no reusable content.
const REUSABLE_PRIOR_STATUSES: AskExecutionStatus[] = [
  'ANSWERED',
  'COMPLETED',
  'NEEDS_ENTITY',
  'NEEDS_CONTEXT',
  'NEEDS_CONFIRMATION',
  'READY_WITH_LIMITATIONS',
];

// How far back a follow-up may reach. Bounded and durable: this reads prior
// *typed executions* already persisted for this session, never raw model
// chat history, and only within a short recency window so an unrelated
// question from an hour ago can't be silently reattached to a new one.
const FOLLOW_UP_LOOKBACK_MS = 30 * 60 * 1000;

const ENTITY_CONTINUATION_PATTERN = /\b(?:complete|finish|mark|update|reschedule|cancel|archive|reopen)\b.{0,25}\b(it|that one|this one|that task|this task|the other one)\b/i;
const FILTER_CONTINUATION_PATTERN = /^\s*(?:only|just|now show|now only show|instead show|filter to|show only|and only)\b/i;

// External review, Phase 5: a proactive continuation card (any producer --
// `createAskNotificationContinuation` stamps this on every one) opens a
// dedicated Ask session built around exactly one triggering signal. Radar's
// own suggested chips ("What should I do about this?", "How urgent is
// this?") are vague-referent follow-ups that don't match ANY of the four
// patterns above -- entity/filter/pagination/specialist -- so they used to
// short-circuit the top-level gate below and never even read the prior
// execution, let alone its structured signal context.
const MONITOR_VAGUE_FOLLOWUP_PATTERN = /^\s*(?:what should i do(?: about (?:this|it))?|how (?:urgent|serious|bad) is (?:this|it)|what does (?:this|it) mean|should i (?:be )?worr(?:y|ied) about (?:this|it))\s*\??\s*$/i;

// Narrower than the general ENTITY_CONTINUATION_PATTERN verb set -- only
// gates the one monitor-continuation branch below (Maintenance's "Now
// complete it"), not the other five verbs, which have no equivalent
// suppliedInput-backed operation to force-route to yet.
const MAINTENANCE_COMPLETE_VERB_PATTERN = /\b(?:complete|finish)\b/i;

// FRD ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md Phase 4 exit
// criterion / G04 (docs/architecture/ASK_COZY_PHASE4_SELL_HOLD_RENT_UX_COMPLETION_VERIFICATION.md):
// sell/hold/rent had no vague-follow-up branch here at all -- a message
// like "what's the status on my plan?" after a SELL_HOLD_RENT_ANALYSIS or
// SELL_HOLD_RENT_GOAL_CAPTURE turn fell through to ordinary top-level
// intent classification with no pinning to the active goal thread, unlike
// HVAC_SPECIALIST_ENGAGE, Maintenance, and Envelope/Radar just below and
// above. Anchored to the whole message (like MONITOR_VAGUE_FOLLOWUP_PATTERN)
// rather than a broad word-boundary scan (like SPECIALIST_CONTINUATION_PATTERN)
// deliberately -- SELL_HOLD_RENT_ANALYSIS is a deterministic snapshot read
// with no message-driven branching of its own (confirmed by its own
// signature, which takes no `message` parameter), not an open-ended agent
// conversation, so a narrow, closed set of genuinely bare continuation
// phrasings is the right shape here, not a permissive keyword scan that
// could hijack an unrelated question.
const SELL_HOLD_RENT_VAGUE_FOLLOWUP_PATTERN = /^\s*(?:what(?:'s| is) (?:the )?(?:status|update|progress)(?: on| for| of)?(?: my| the| this)?(?: plan| decision)?|how(?:'s| is)(?: my| the)? plan (?:going|doing)|what(?:'s| is) next(?: (?:on|for|with)(?: it| that| this| the plan))?|(?:keep going|continue|move forward) with (?:it|that|this|the plan)|any (?:updates?|changes?)(?: on| to| for)?(?: my| the| this)?(?: plan| decision)|should i still (?:sell|hold|rent)|is (?:it|that|this) still (?:accurate|current|the same|up to date)|what about(?: my| the| this)?(?: plan| decision))\s*\??\s*$/i;

export interface AskFollowUpResolution {
  effectiveMessage: string;
  forcedOperationId: AskOperationId | null;
  sourceExecutionId: string | null;
  continuationCursor: string | null;
  // External review, Phase 5: the structured counterpart to
  // `effectiveMessage`'s text-only rewriting -- carries a prior proactive
  // continuation's own resolved ids (a Maintenance task, a Radar match)
  // forward into the next operation's `CapabilityInvocationEnvelope.suppliedInput`
  // (a field the contract already declared but nothing ever populated or
  // read, confirmed by grep before wiring this). `null` when no structured
  // context applies -- the overwhelming majority of turns.
  suppliedInput: Record<string, unknown> | null;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-003/MAINT-003: true only for the
  // isFilterContinuation branch below -- a bare filter refinement of the
  // active read result. Distinct from sourceExecutionId (set for every
  // continuation kind, including entity/pagination/specialist/monitor
  // turns, which are legitimately separate answers and must not collapse
  // into the prior card).
  isFilterRefinement: boolean;
}

interface PriorExecutionRow {
  id: string;
  operationId: string | null;
  message: string;
  resultJson: unknown;
  parametersJson: unknown;
  launchContextJson: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A proactive continuation card is marked the same way for every producer
// (`createAskNotificationContinuation`'s own `launchContextJson.surface`),
// regardless of which monitor created it -- Radar, Maintenance, Refinance.
function isMonitorNotificationCard(row: PriorExecutionRow): boolean {
  return isRecord(row.launchContextJson) && row.launchContextJson.surface === 'MONITOR_NOTIFICATION';
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === 'string' && record[key] ? (record[key] as string) : null;
}

// A prior answer is reusable as an entity referent only when it named
// exactly one thing — resolving "it" against a list is exactly the
// ambiguity Ask must fail closed on, not guess through.
function extractSingularEntityTitle(resultJson: unknown): string | null {
  if (!isRecord(resultJson) || !Array.isArray(resultJson.blocks)) return null;
  const blocks = resultJson.blocks as Array<Record<string, unknown>>;

  for (const block of blocks) {
    if (block.type !== 'WORKFLOW_PROGRESS' || !Array.isArray(block.details)) continue;
    const taskDetail = (block.details as Array<Record<string, unknown>>).find(
      (detail) => typeof detail.label === 'string' && detail.label.toLowerCase() === 'task',
    );
    if (typeof taskDetail?.value === 'string' && taskDetail.value.trim()) return taskDetail.value.trim();
  }

  const groupedListTitles: string[] = [];
  for (const block of blocks) {
    if (block.type !== 'GROUPED_LIST' || !Array.isArray(block.sections)) continue;
    for (const section of block.sections as Array<Record<string, unknown>>) {
      if (!Array.isArray(section.items)) continue;
      for (const item of section.items as Array<Record<string, unknown>>) {
        if (typeof item.title === 'string' && item.title.trim()) groupedListTitles.push(item.title.trim());
      }
    }
  }
  if (groupedListTitles.length === 1) return groupedListTitles[0];
  if (groupedListTitles.length > 1) return null;

  for (const block of blocks) {
    if (block.type !== 'TABLE' || !Array.isArray(block.rows) || !Array.isArray(block.columns)) continue;
    const rows = block.rows as Array<Record<string, unknown>>;
    const columns = block.columns as Array<Record<string, unknown>>;
    if (rows.length !== 1 || !columns.length) continue;
    const firstKey = columns[0]?.key;
    const values = rows[0]?.values;
    if (typeof firstKey === 'string' && isRecord(values) && typeof values[firstKey] === 'string') {
      return (values[firstKey] as string).trim() || null;
    }
  }
  return null;
}

// External review finding (RES-003/ACT-001): a declared control (a filter
// chip, an item action) renders on one specific execution's card, but this
// previously always resolved against "the most recent execution in the
// session" regardless. After any later, unrelated turn, that heuristic
// would silently target the wrong prior result -- filtering a maintenance
// list the homeowner scrolled back to, after asking an intervening
// question about something else, could resolve against that intervening
// turn instead. `pinnedExecutionId`, when provided, resolves against that
// exact row (still scoped to this session/property and to reusable
// statuses) instead of the recency heuristic; a pin that doesn't resolve
// returns null rather than falling back to "most recent," so a stale or
// cross-session id fails closed instead of silently matching the wrong turn.
async function findRecentPriorExecution(sessionId: string, propertyId: string | null | undefined, pinnedExecutionId?: string | null): Promise<PriorExecutionRow | null> {
  const row = await prisma.askExecution.findFirst({
    where: {
      sessionId,
      // `undefined` makes Prisma omit this filter entirely rather than
      // matching NULL, so before the current turn's property is resolved
      // (first message of a session, a NEEDS_PROPERTY turn, a no-property
      // launch) this must not silently widen to "any property in this
      // session" -- a session can legitimately carry executions for more
      // than one property over its lifetime (NEEDS_PROPERTY resumption
      // mutates session.propertyId in place). Explicit null scopes a
      // property-less turn to only reuse other property-less prior turns.
      propertyId: propertyId ?? null,
      operationId: { not: null },
      status: { in: REUSABLE_PRIOR_STATUSES },
      ...(pinnedExecutionId ? { id: pinnedExecutionId } : { createdAt: { gte: new Date(Date.now() - FOLLOW_UP_LOOKBACK_MS) } }),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, operationId: true, message: true, resultJson: true, parametersJson: true, launchContextJson: true },
  });
  return row;
}

// Rewrites a bare follow-up ("Now complete it.", "Only show the urgent
// ones.") into an effective message that carries enough of the prior turn's
// typed context for the existing deterministic routing/parsing regexes to
// resolve correctly — without ever touching the raw text shown to the
// homeowner or sent to a model. Returns the original message unchanged when
// no durable prior execution or recognizable continuation pattern applies.
export async function resolveAskFollowUpMessage(input: {
  sessionId: string;
  propertyId: string | null | undefined;
  message: string;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-003/ACT-001: set only when the
  // client dispatched this message from a declared control rendered on a
  // specific prior execution (a filter chip, an item action) -- see
  // findRecentPriorExecution's pinnedExecutionId. Also used below to skip
  // concatenating with the prior turn's raw text: a declared filter chip's
  // message is a complete, self-sufficient specification of the desired
  // filter state, not an additive natural-language fragment.
  declaredSourceExecutionId?: string | null;
}): Promise<AskFollowUpResolution> {
  const fallback: AskFollowUpResolution = { effectiveMessage: input.message, forcedOperationId: null, sourceExecutionId: null, continuationCursor: null, suppliedInput: null, isFilterRefinement: false };
  const entityMatch = ENTITY_CONTINUATION_PATTERN.exec(input.message);
  const isFilterContinuation = FILTER_CONTINUATION_PATTERN.test(input.message);
  const isEnvelopePagination = ENVELOPE_PAGINATION_PATTERN.test(input.message);
  const isSpecialistContinuation = SPECIALIST_CONTINUATION_PATTERN.test(input.message);
  const isMonitorVagueFollowup = MONITOR_VAGUE_FOLLOWUP_PATTERN.test(input.message);
  const isSellHoldRentVagueFollowup = SELL_HOLD_RENT_VAGUE_FOLLOWUP_PATTERN.test(input.message);
  if (!entityMatch && !isFilterContinuation && !isEnvelopePagination && !isSpecialistContinuation && !isMonitorVagueFollowup && !isSellHoldRentVagueFollowup) return fallback;

  const prior = await findRecentPriorExecution(input.sessionId, input.propertyId, input.declaredSourceExecutionId);
  if (!prior || !prior.operationId) return fallback;

  if (entityMatch) {
    const entityTitle = extractSingularEntityTitle(prior.resultJson);
    if (entityTitle) {
      const pronounSpan = entityMatch[1];
      // String.replace(pronounSpan, ...) would rewrite the *first* occurrence
      // of that substring anywhere in the message, not necessarily the one
      // the regex matched -- e.g. "I know it's overdue, mark it complete"
      // would garble the "it" inside "it's" instead. The capture group is
      // always the tail of the whole match (the pattern's trailing \b is
      // zero-width, nothing follows the group), so its exact position can be
      // computed from the match length instead of searched for.
      const groupStart = entityMatch.index + entityMatch[0].length - pronounSpan.length;
      const groupEnd = groupStart + pronounSpan.length;
      const rewritten = `${input.message.slice(0, groupStart)}${entityTitle}${input.message.slice(groupEnd)}`;
      return { effectiveMessage: rewritten, forcedOperationId: null, sourceExecutionId: prior.id, continuationCursor: null, suppliedInput: null, isFilterRefinement: false };
    }

    // External review [P1]: a proactive Maintenance continuation card
    // (MAINTENANCE_STATUS operationId, MONITOR_NOTIFICATION launchContext)
    // has no extractable task TITLE in its resultJson -- its WORKFLOW_PROGRESS
    // `details` use generic labels ("What changed", "Why it matters"), never
    // `label: 'Task'` -- so `extractSingularEntityTitle` above always returns
    // null for it and "Now complete it" fell through to the fallback,
    // unresolved, for every maintenance-deadline notification. The exact
    // task id was sitting in the card's own `parametersJson.taskId` the
    // whole time (`maintenanceReminder.service.ts`'s own `parameters:
    // { taskId: task.id, ... }`). Resolved via `suppliedInput.taskId`
    // instead of title-rewriting -- the same deterministic id-lookup
    // `maintenanceTaskCompleteResult` already uses for submitAskCapture's
    // own capture-edit path (askOrchestrator.service.ts:1078-1079), and
    // genuinely more precise than a title match would be.
    if (MAINTENANCE_COMPLETE_VERB_PATTERN.test(input.message) && prior.operationId === 'MAINTENANCE_STATUS' && isMonitorNotificationCard(prior)) {
      const parameters = isRecord(prior.parametersJson) ? prior.parametersJson : {};
      const taskId = stringField(parameters, 'taskId');
      if (taskId) {
        return {
          effectiveMessage: input.message,
          forcedOperationId: 'MAINTENANCE_TASK_COMPLETE',
          sourceExecutionId: prior.id,
          continuationCursor: null,
          suppliedInput: { taskId },
          isFilterRefinement: false,
        };
      }
    }
    return fallback;
  }

  if (isEnvelopePagination && prior.operationId === 'INTELLIGENCE_ENVELOPE_QUERY') {
    const parameters = isRecord(prior.parametersJson) ? prior.parametersJson : {};
    const cursor = typeof parameters.nextCursor === 'string' ? parameters.nextCursor : null;
    if (cursor) {
      return {
        effectiveMessage: `${prior.message}. ${input.message}`,
        forcedOperationId: 'INTELLIGENCE_ENVELOPE_QUERY',
        sourceExecutionId: prior.id,
        continuationCursor: cursor,
        suppliedInput: null,
        isFilterRefinement: false,
      };
    }
  }

  // Capability-card audit (FRD Appendix D), second reference journey. Same
  // cursor-forwarding shape as INTELLIGENCE_ENVELOPE_QUERY's own pagination
  // branch above -- homeEventRadarFeedResult's suggestion ("Show more
  // monitored events") matches ENVELOPE_PAGINATION_PATTERN's generic
  // show/more phrasing.
  if (isEnvelopePagination && prior.operationId === 'HOME_EVENT_RADAR_FEED') {
    const parameters = isRecord(prior.parametersJson) ? prior.parametersJson : {};
    const cursor = typeof parameters.nextCursor === 'string' ? parameters.nextCursor : null;
    if (cursor) {
      return {
        effectiveMessage: `${prior.message}. ${input.message}`,
        forcedOperationId: 'HOME_EVENT_RADAR_FEED',
        sourceExecutionId: prior.id,
        continuationCursor: cursor,
        suppliedInput: null,
        isFilterRefinement: false,
      };
    }
  }

  // Maintenance collection paging updates the same stable result rather
  // than adding a second live list. The exact section and direction remain
  // structured launch context owned by the declared UI control; this
  // resolver only pins the read operation and source execution.
  if (isEnvelopePagination && prior.operationId === 'MAINTENANCE_STATUS') {
    return {
      effectiveMessage: input.message,
      forcedOperationId: 'MAINTENANCE_STATUS',
      sourceExecutionId: prior.id,
      continuationCursor: null,
      suppliedInput: null,
      isFilterRefinement: true,
    };
  }

  if (isSpecialistContinuation && prior.operationId === 'HVAC_SPECIALIST_ENGAGE') {
    return {
      effectiveMessage: `${prior.message}. Homeowner follow-up: ${input.message}`,
      forcedOperationId: 'HVAC_SPECIALIST_ENGAGE',
      sourceExecutionId: prior.id,
      continuationCursor: null,
      suppliedInput: null,
      isFilterRefinement: false,
    };
  }

  // G04 fix (see SELL_HOLD_RENT_VAGUE_FOLLOWUP_PATTERN above): always routes
  // to SELL_HOLD_RENT_ANALYSIS, never SELL_HOLD_RENT_GOAL_CAPTURE, even when
  // the prior turn was the goal-capture attachment -- GOAL_CAPTURE is not
  // directly message-routable at all (goalCaptureNotDirectlyRoutableResult
  // in askOrchestrator.service.ts), while ANALYSIS already reads and
  // surfaces the same active thread's current progress (FRD §22 Option B),
  // giving the homeowner the exact thread's current, bounded, structured
  // state rather than re-deriving anything from the raw follow-up text.
  if (isSellHoldRentVagueFollowup
    && (prior.operationId === 'SELL_HOLD_RENT_ANALYSIS' || prior.operationId === 'SELL_HOLD_RENT_GOAL_CAPTURE')) {
    return {
      effectiveMessage: input.message,
      forcedOperationId: 'SELL_HOLD_RENT_ANALYSIS',
      sourceExecutionId: prior.id,
      continuationCursor: null,
      suppliedInput: null,
      isFilterRefinement: false,
    };
  }

  if (isFilterContinuation && FILTER_CONTINUABLE_OPERATIONS.has(prior.operationId as AskOperationId)) {
    return {
      // External review finding: concatenating with the prior turn's raw
      // text meant a status/priority filter could never actually be
      // CLEARED or SWITCHED by a declared chip -- "Show overdue
      // maintenance" + "Now show all open maintenance tasks" still
      // contains "overdue", so the parser kept applying it even though the
      // homeowner picked "All open" specifically to clear it. A declared
      // chip's message is a complete specification on its own; only an
      // organic typed follow-up ("only show urgent," with no declared
      // source) still needs concatenation, since free text like that
      // relies on the prior turn for context the new message doesn't
      // repeat (e.g. an earlier scope/room word).
      effectiveMessage: input.declaredSourceExecutionId ? input.message : `${prior.message}. ${input.message}`,
      forcedOperationId: prior.operationId as AskOperationId,
      sourceExecutionId: prior.id,
      continuationCursor: null,
      suppliedInput: null,
      isFilterRefinement: true,
    };
  }

  // External review [P1]: Radar's own suggested follow-ups ("What should I
  // do about this?", "How urgent is this?") carry no entity/filter/
  // pagination/specialist pattern at all -- they used to never even reach
  // this function's DB read (the top-level gate above returned fallback
  // immediately). Once the prior execution is confirmed to be a Radar
  // proactive continuation card, its own `radarMatchId`/`radarEventId`
  // (`radarNotificationDelivery.service.ts`'s own `parameters:
  // { radarEventId, radarMatchId, ... }`) are threaded forward as
  // `suppliedInput` so the next INTELLIGENCE_ENVELOPE_QUERY turn can scope
  // its answer to the exact match that triggered this session, not a
  // property-wide dump with zero memory of what "this" refers to.
  if (isMonitorVagueFollowup && prior.operationId === 'INTELLIGENCE_ENVELOPE_QUERY' && isMonitorNotificationCard(prior)) {
    const parameters = isRecord(prior.parametersJson) ? prior.parametersJson : {};
    const radarMatchId = stringField(parameters, 'radarMatchId');
    const radarEventId = stringField(parameters, 'radarEventId');
    return {
      effectiveMessage: `${prior.message}. ${input.message}`,
      forcedOperationId: 'INTELLIGENCE_ENVELOPE_QUERY',
      sourceExecutionId: prior.id,
      continuationCursor: null,
      suppliedInput: (radarMatchId || radarEventId) ? { radarMatchId, radarEventId } : null,
      isFilterRefinement: false,
    };
  }

  return fallback;
}

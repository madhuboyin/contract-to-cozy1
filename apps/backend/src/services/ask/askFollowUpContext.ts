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
]);

const ENVELOPE_PAGINATION_PATTERN = /^\s*(?:(?:show|load|see|get)\s+(?:me\s+)?(?:the\s+)?(?:next|more)|continue\s+(?:the\s+)?(?:intelligence|results?))\b/i;
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

export interface AskFollowUpResolution {
  effectiveMessage: string;
  forcedOperationId: AskOperationId | null;
  sourceExecutionId: string | null;
  continuationCursor: string | null;
}

interface PriorExecutionRow {
  id: string;
  operationId: string | null;
  message: string;
  resultJson: unknown;
  parametersJson: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

async function findRecentPriorExecution(sessionId: string, propertyId: string | null | undefined): Promise<PriorExecutionRow | null> {
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
      createdAt: { gte: new Date(Date.now() - FOLLOW_UP_LOOKBACK_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, operationId: true, message: true, resultJson: true, parametersJson: true },
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
}): Promise<AskFollowUpResolution> {
  const fallback: AskFollowUpResolution = { effectiveMessage: input.message, forcedOperationId: null, sourceExecutionId: null, continuationCursor: null };
  const entityMatch = ENTITY_CONTINUATION_PATTERN.exec(input.message);
  const isFilterContinuation = FILTER_CONTINUATION_PATTERN.test(input.message);
  const isEnvelopePagination = ENVELOPE_PAGINATION_PATTERN.test(input.message);
  const isSpecialistContinuation = SPECIALIST_CONTINUATION_PATTERN.test(input.message);
  if (!entityMatch && !isFilterContinuation && !isEnvelopePagination && !isSpecialistContinuation) return fallback;

  const prior = await findRecentPriorExecution(input.sessionId, input.propertyId);
  if (!prior || !prior.operationId) return fallback;

  if (entityMatch) {
    const entityTitle = extractSingularEntityTitle(prior.resultJson);
    if (!entityTitle) return fallback;
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
    return { effectiveMessage: rewritten, forcedOperationId: null, sourceExecutionId: prior.id, continuationCursor: null };
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
      };
    }
  }

  if (isSpecialistContinuation && prior.operationId === 'HVAC_SPECIALIST_ENGAGE') {
    return {
      effectiveMessage: `${prior.message}. Homeowner follow-up: ${input.message}`,
      forcedOperationId: 'HVAC_SPECIALIST_ENGAGE',
      sourceExecutionId: prior.id,
      continuationCursor: null,
    };
  }

  if (isFilterContinuation && FILTER_CONTINUABLE_OPERATIONS.has(prior.operationId as AskOperationId)) {
    return {
      effectiveMessage: `${prior.message}. ${input.message}`,
      forcedOperationId: prior.operationId as AskOperationId,
      sourceExecutionId: prior.id,
      continuationCursor: null,
    };
  }

  return fallback;
}

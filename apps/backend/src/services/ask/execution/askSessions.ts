// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { AskExecution, AskExecutionStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type AskPendingWorkItem, type AskRecentSessionPage, type AskRecentSessionSummary, type AskSessionUpdateRequest, type ContinueAskExecution } from '../../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { ASK_SESSION_HISTORY_PAGE_SIZE, askHistoryAccessiblePropertyWhere, askSessionHistoryWhere, decodeAskSessionHistoryCursor, encodeAskSessionHistoryCursor } from '../askSessionHistoryPagination';
import { resolvePropertyAccess } from '../../propertyAccess.service';
import { asInputJson, ensurePropertyAccess, expireIfSkillBindingChanged, mapPersistedExecution, preservedExecutionHistory, propertyLabel, propertySummary } from '../askHandlerSupport';

export async function getAskSession(userId: string, sessionId: string): Promise<AskExecutionResponse[]> {
  const session = await prisma.askSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  if (!session) return [];
  const executions = await prisma.askExecution.findMany({ where: { sessionId, userId }, orderBy: { createdAt: 'asc' } });
  const propertyIds = [...new Set(executions.map((execution) => execution.propertyId).filter((value): value is string => Boolean(value)))];
  // Row ownership (userId) proves this is the homeowner's own conversation,
  // not that they still hold current access to every property it touches.
  // A revoked household member must lose visibility into that property's
  // stored answers immediately (FRD ASK-25.2), so each referenced property
  // is rechecked here rather than trusting the historical snapshot; any
  // execution for a property the user can no longer reach is dropped
  // rather than failing the whole session read.
  const accessEntries = await Promise.all(propertyIds.map(async (propertyId) => [propertyId, Boolean(await resolvePropertyAccess(userId, propertyId))] as const));
  const accessiblePropertyIds = new Set(accessEntries.filter(([, accessible]) => accessible).map(([propertyId]) => propertyId));
  const visibleExecutions = executions.filter((execution) => !execution.propertyId || accessiblePropertyIds.has(execution.propertyId));
  const properties = await prisma.property.findMany({ where: { id: { in: [...accessiblePropertyIds] } }, select: { id: true, name: true, address: true, city: true, state: true } });
  const labels = new Map(properties.map((property) => [property.id, { id: property.id, label: propertyLabel(property) }]));
  return visibleExecutions.map((execution) => mapPersistedExecution(execution, execution.propertyId ? labels.get(execution.propertyId) ?? null : null));
}

export async function getRecentAskSessions(userId: string, propertyId: string | null, cursorValue?: string, searchQuery?: string, view: 'RECENT' | 'ARCHIVED' = 'RECENT'): Promise<AskRecentSessionPage> {
  if (propertyId) await ensurePropertyAccess(userId, propertyId);
  const accessibleProperties = propertyId ? null : await prisma.property.findMany({
    where: askHistoryAccessiblePropertyWhere(userId),
    select: { id: true, name: true, address: true, city: true, state: true },
  });
  const cursor = cursorValue ? decodeAskSessionHistoryCursor(cursorValue) : null;
  if (cursorValue && !cursor) throw Object.assign(new Error('Invalid conversation history cursor.'), { code: 'ASK_INVALID_CURSOR' });
  const now = new Date();
  const bounds = { userId, now, retentionDays: readAskOperationalControls().rawConversationRetentionDays, searchQuery };
  const scope = propertyId ? { propertyId } : { accessiblePropertyIds: accessibleProperties!.map((property) => property.id) };
  const whereFor = (list: 'RECENT' | 'PINNED' | 'ARCHIVED', pageCursor: typeof cursor) => askSessionHistoryWhere({ ...bounds, ...scope, cursor: pageCursor, list } as Parameters<typeof askSessionHistoryWhere>[0]);
  const select = {
    id: true,
    propertyId: true,
    title: true,
    lastActiveAt: true,
    titleSetByUserAt: true,
    pinnedAt: true,
    archivedAt: true,
    _count: { select: { executions: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } },
    executions: {
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      take: 1,
      select: { id: true, message: true, status: true },
    },
  } satisfies Prisma.AskSessionSelect;
  const sessions = await prisma.askSession.findMany({
    where: whereFor(view === 'ARCHIVED' ? 'ARCHIVED' : 'RECENT', cursor),
    orderBy: [{ lastActiveAt: 'desc' }, { id: 'desc' }],
    take: ASK_SESSION_HISTORY_PAGE_SIZE + 1,
    select,
  });
  // IW-HIST-003: pinned conversations form their own stable group, sent once with the first page of the recent list.
  const includePinned = view === 'RECENT' && !cursor && !searchQuery;
  const pinnedSessions = includePinned ? await prisma.askSession.findMany({
    where: whereFor('PINNED', null),
    orderBy: [{ pinnedAt: 'desc' }, { id: 'desc' }],
    take: ASK_SESSION_HISTORY_PAGE_SIZE,
    select,
  }) : [];
  const selectedProperty = propertyId ? await propertySummary(propertyId) : null;
  if (propertyId && !selectedProperty) return { items: [], nextCursor: null, ...(includePinned ? { pinned: [] } : {}) };
  const labels = new Map<string, { id: string; label: string }>(
    propertyId && selectedProperty ? [[propertyId, selectedProperty]]
      : accessibleProperties!.map((property) => [property.id, { id: property.id, label: propertyLabel(property) }]),
  );
  const summarize = (rows: typeof sessions): AskRecentSessionSummary[] => rows.flatMap((session) => {
    const latest = session.executions[0];
    const property = session.propertyId ? labels.get(session.propertyId) : null;
    if (!latest || !property) return [];
    const title = (session.title?.trim() || latest.message.trim()).slice(0, 120);
    return [{
      sessionId: session.id,
      title,
      property,
      latestStatus: latest.status,
      latestExecutionId: latest.id,
      executionCount: session._count.executions,
      lastActiveAt: session.lastActiveAt.toISOString(),
      pinned: Boolean(session.pinnedAt),
      archived: Boolean(session.archivedAt),
      titleSetByUser: Boolean(session.titleSetByUserAt),
    }];
  });
  const page = sessions.slice(0, ASK_SESSION_HISTORY_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: summarize(page),
    nextCursor: sessions.length > ASK_SESSION_HISTORY_PAGE_SIZE && last
      ? encodeAskSessionHistoryCursor({ lastActiveAt: last.lastActiveAt, id: last.id }) : null,
    ...(includePinned ? { pinned: summarize(pinnedSessions) } : {}),
  };
}

// IW-HIST-009..011 (session lifecycle controls): rename, pin/unpin and archive/restore one of the homeowner's own
// conversations. The session must belong to the user, still be retained, and (for a property-scoped session) its home
// must still be accessible -- a conversation whose home access was revoked is reported as not found rather than
// letting its title be edited or confirmed to exist (IW-HIST-006). None of these touches retention (expiresAt),
// lastActiveAt, executions or any home record. Archiving also unpins, so a restored conversation returns to the
// ordinary recent list.
export async function updateAskSessionForUser(userId: string, sessionId: string, change: AskSessionUpdateRequest): Promise<{ sessionId: string; title: string | null; pinned: boolean; archived: boolean; titleSetByUser: boolean }> {
  const notFound = () => Object.assign(new Error('Ask session not found.'), { code: 'ASK_SESSION_NOT_FOUND' });
  const now = new Date();
  const session = await prisma.askSession.findFirst({
    where: { id: sessionId, userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true, propertyId: true },
  });
  if (!session) throw notFound();
  if (session.propertyId && !(await resolvePropertyAccess(userId, session.propertyId))) throw notFound();
  const data: Prisma.AskSessionUpdateInput = 'title' in change
    ? { title: change.title, titleSetByUserAt: now }
    : 'pinned' in change
      ? { pinnedAt: change.pinned ? now : null }
      : change.archived ? { archivedAt: now, pinnedAt: null } : { archivedAt: null };
  const updated = await prisma.askSession.update({
    where: { id: session.id },
    data,
    select: { id: true, title: true, pinnedAt: true, archivedAt: true, titleSetByUserAt: true },
  });
  return { sessionId: updated.id, title: updated.title, pinned: Boolean(updated.pinnedAt), archived: Boolean(updated.archivedAt), titleSetByUser: Boolean(updated.titleSetByUserAt) };
}

export async function getAskExecution(userId: string, executionId: string): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.propertyId) await ensurePropertyAccess(userId, execution.propertyId);
  return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
}

export const INTERACTIVE_ASK_STATUSES: AskExecutionStatus[] = ['NEEDS_PROPERTY', 'NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT', 'NEEDS_CONFIRMATION'];

const CONTINUABLE_ASK_STATUSES: AskExecutionStatus[] = [...INTERACTIVE_ASK_STATUSES, 'RUNNING'];

function pendingKind(status: AskExecutionStatus): AskPendingWorkItem['pendingKind'] {
  if (status === 'RUNNING') return 'COMMAND_RECOVERY';
  if (status === 'NEEDS_PROPERTY') return 'PROPERTY_SELECTION';
  if (status === 'NEEDS_ENTITY') return 'ENTITY_SELECTION';
  if (status === 'NEEDS_CONTEXT') return 'CONTEXT_CAPTURE';
  if (status === 'NEEDS_CONFIRMATION') return 'CONFIRMATION';
  return 'CLARIFICATION';
}

function pendingActionLabel(status: AskExecutionStatus): string {
  if (status === 'RUNNING') return 'Check action status';
  if (status === 'NEEDS_PROPERTY') return 'Select a home';
  if (status === 'NEEDS_ENTITY') return 'Choose a record';
  if (status === 'NEEDS_CONTEXT') return 'Add the missing detail';
  if (status === 'NEEDS_CONFIRMATION') return 'Review and confirm';
  return 'Answer one question';
}

function pendingInteractionExpiresAt(execution: { resultJson: Prisma.JsonValue | null }): Date | null {
  if (!execution.resultJson || typeof execution.resultJson !== 'object' || Array.isArray(execution.resultJson)) return null;
  const result = execution.resultJson as { clarification?: unknown; confirmation?: unknown };
  const interaction = result.clarification && typeof result.clarification === 'object' && !Array.isArray(result.clarification)
    ? result.clarification as Record<string, unknown>
    : result.confirmation && typeof result.confirmation === 'object' && !Array.isArray(result.confirmation)
      ? result.confirmation as Record<string, unknown>
      : null;
  const value = interaction?.expiresAt;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// A restart/crash/OOM between "status: RUNNING" (set immediately before the
// operation runs) and the follow-up write that records its outcome leaves
// the row physically stuck at RUNNING forever: no in-process catch block
// ever runs again to move it forward. Confirmed-command executions always
// create an AskConfirmationReceipt before flipping to RUNNING and already
// have a correct lease-based recovery path (confirmAskExecution's
// recoveringClaim) — this only reclaims RUNNING rows with no confirmation
// receipt at all, i.e. a plain read/analysis operation, once enough time
// has passed that it could not still be legitimately executing.
const ASK_RUNNING_RECLAIM_GRACE_MS = 30_000;

export async function reclaimOrphanedRunningExecution(execution: AskExecution): Promise<AskExecution> {
  if (execution.status !== 'RUNNING') return execution;
  const controls = readAskOperationalControls();
  const orphanThresholdMs = controls.executionTimeoutMs + ASK_RUNNING_RECLAIM_GRACE_MS;
  if (Date.now() - execution.updatedAt.getTime() < orphanThresholdMs) return execution;
  const activeClaim = await prisma.askConfirmationReceipt.findFirst({ where: { executionId: execution.id }, select: { id: true } });
  if (activeClaim) return execution;
  const updated = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId: execution.userId, status: 'RUNNING' },
    data: {
      status: 'FAILED_RETRYABLE', reasonCode: 'ASK_EXECUTION_INTERRUPTED', completedAt: null,
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{ type: 'ERROR_STATE', id: 'execution-interrupted', title: 'This got interrupted', body: 'The system restarted while this was running. No action was performed — try asking again.', retryable: true, actions: [] }],
        captureRequests: [], clarification: null, confirmation: null, suggestions: ['Ask this question again'],
        ...preservedExecutionHistory(execution.resultJson, [{ type: 'ERROR_STATE', id: 'execution-interrupted', title: 'This got interrupted', body: 'No action was performed.', retryable: true, actions: [] }]),
      }),
    },
  });
  if (updated.count === 1) {
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'RECLAIMED_ORPHANED_RUNNING', metadataJson: asInputJson({ reason: 'RUNNING_TIMEOUT_EXCEEDED' }) } });
  }
  return prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
}

async function expirePendingInteraction(execution: AskExecution): Promise<AskExecution> {
  if (execution.status === 'RUNNING') return reclaimOrphanedRunningExecution(execution);
  const interactionExpiresAt = pendingInteractionExpiresAt(execution);
  if (!interactionExpiresAt || interactionExpiresAt > new Date()) return execution;
  const updated = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId: execution.userId, status: execution.status },
    data: {
      status: 'EXPIRED', reasonCode: 'ASK_EXECUTION_EXPIRED', completedAt: new Date(),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'pending-work-expired', title: 'This pending request expired', status: 'EXPIRED', description: 'No action was performed. Ask the question again to use current home records and settings.', details: [], actions: [] }],
        captureRequests: [], clarification: null, confirmation: null, suggestions: ['Ask this question again'],
        ...preservedExecutionHistory(execution.resultJson, [{ type: 'WORKFLOW_PROGRESS', id: 'pending-work-expired', title: 'This pending request expired', status: 'EXPIRED', description: 'No action was performed.', details: [], actions: [] }]),
      }),
    },
  });
  if (updated.count === 1) {
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'EXPIRED', metadataJson: asInputJson({ reason: 'PENDING_INTERACTION_EXPIRED' }) } });
  }
  return prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
}

export async function getAskPendingWork(userId: string, propertyId: string | null): Promise<AskPendingWorkItem[]> {
  if (propertyId) await ensurePropertyAccess(userId, propertyId);
  // A RUNNING row with no confirmation receipt at all is a plain
  // read/analysis operation; it's only worth sweeping here once it's old
  // enough that it can no longer be a normal, currently-executing request
  // (matching reclaimOrphanedRunningExecution's own threshold) — otherwise
  // every question in flight on any tab/device would flicker into "pending
  // work" for the second or two it takes to answer.
  const orphanRunningCutoff = new Date(Date.now() - (readAskOperationalControls().executionTimeoutMs + ASK_RUNNING_RECLAIM_GRACE_MS));
  const rows = await prisma.askExecution.findMany({
    where: {
      userId,
      propertyId,
      AND: [
        { OR: [
          { status: { in: INTERACTIVE_ASK_STATUSES } },
          { status: 'RUNNING', confirmations: { some: { status: 'CLAIMED' } } },
          { status: 'RUNNING', confirmations: { none: {} }, updatedAt: { lte: orphanRunningCutoff } },
        ] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  const property = await propertySummary(propertyId);
  const items: AskPendingWorkItem[] = [];
  for (const row of rows) {
    const current = await expirePendingInteraction(row);
    if (!CONTINUABLE_ASK_STATUSES.includes(current.status)) continue;
    items.push({
      pendingKind: pendingKind(current.status),
      actionLabel: pendingActionLabel(current.status),
      execution: mapPersistedExecution(current, property),
    });
    if (items.length === 3) break;
  }
  return items;
}

export async function continueAskExecution(userId: string, executionId: string, input: ContinueAskExecution): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.propertyId) await ensurePropertyAccess(userId, execution.propertyId);
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  const current = CONTINUABLE_ASK_STATUSES.includes(execution.status) ? await expirePendingInteraction(execution) : execution;
  if (CONTINUABLE_ASK_STATUSES.includes(current.status)) {
    await prisma.askExecutionEvent.create({
      data: { executionId, eventType: 'CONTINUATION_OPENED', metadataJson: asInputJson({ surface: input.surface, status: current.status }) },
    });
    await prisma.askSession.update({ where: { id: current.sessionId }, data: { lastActiveAt: new Date() } });
  }
  return mapPersistedExecution(current, await propertySummary(current.propertyId));
}

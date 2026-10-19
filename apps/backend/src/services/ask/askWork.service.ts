import { z } from 'zod';
import type { HouseholdRole } from '@prisma/client';
import { logger } from '../../lib/logger';
import type { AskAccountRole } from './askAccountEligibility';
import { readPendingExecutionWork } from './work/pendingExecutions.reader';
import { readDecisionThreadWork } from './work/decisionThreads.reader';
import { readIncidentWork } from './work/incidents.reader';
import { readClaimWork } from './work/claims.reader';
import { readProjectWork } from './work/projects.reader';
import { readGuidanceJourneyWork } from './work/guidanceJourneys.reader';
import { readDiyProjectWork } from './work/diyProjects.reader';
import { readRenovationCaseWork } from './work/renovationCases.reader';
import { readMonitorWork } from './work/monitors.reader';
import { readQueuedJobWork } from './work/queuedJobs.reader';
import { readRetryableExecutionWork } from './work/retryableExecutions.reader';
import { readScheduledFollowUpWork } from './work/scheduledFollowUps.reader';
import { createOperationalWorkItemReader } from './work/operationalWorkItems.reader';
import { ensureAskServiceAccountEligibility, ensurePropertyAccess } from './askHandlerSupport';
import { loadOperatingMode } from './askRecordContext';
import type { AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';
import {
  ASK_WORK_PROVIDER_REGISTRY, ASK_WORK_LIFECYCLE_VIEWS, evaluateWorkProviderApplicability, validateAskWorkProviderRegistry,
  type AskWorkLifecycleView, type AskWorkProviderDefinition, type AskWorkProviderId, type AskWorkType,
} from './governance/askWorkProviderRegistry';
import {
  ASK_WORK_CONTRACT_VERSION, ASK_WORK_DEFAULT_LIMIT, ASK_WORK_MAX_LIMIT, compareAskWorkRows,
  type AskWorkBoundary, type AskWorkPage, type AskWorkProviderReader, type AskWorkProviderState, type AskWorkProviderStatus, type AskWorkRow,
} from './askWork.contract';

/**
 * The canonical readers, one per CONNECTED provider. A provider with no entry here is reported UNAVAILABLE; its rows are never synthesized.
 * Each reader is side-effect free (FR-WORK: the Work GET never expires, updates, or reconciles anything).
 */
export const ASK_WORK_PROVIDER_READERS: Partial<Record<AskWorkProviderId, AskWorkProviderReader>> = {
  PENDING_EXECUTIONS: readPendingExecutionWork,
  OPERATIONAL_WORK_ITEMS: createOperationalWorkItemReader(),
  DECISION_THREADS: readDecisionThreadWork,
  INCIDENTS: readIncidentWork,
  CLAIMS: readClaimWork,
  PROJECTS: readProjectWork,
  GUIDANCE_JOURNEYS: readGuidanceJourneyWork,
  DIY_PROJECTS: readDiyProjectWork,
  RENOVATION_CASES: readRenovationCaseWork,
  MONITORS: readMonitorWork,
  QUEUED_JOBS: readQueuedJobWork,
  RETRYABLE_EXECUTIONS: readRetryableExecutionWork,
  SCHEDULED_FOLLOW_UPS: readScheduledFollowUpWork,
};

export class AskWorkInvalidRequestError extends Error {
  code = 'ASK_INVALID_REQUEST';
}

export interface AskWorkQuery {
  view?: string | null;
  cursor?: string | null;
  limit?: number | null;
  workType?: string | null;
  status?: string | null;
}

const CursorSchema = z.object({ v: z.enum(ASK_WORK_LIFECYCLE_VIEWS as unknown as [AskWorkLifecycleView, ...AskWorkLifecycleView[]]), t: z.string().min(1).max(40), k: z.string().min(1).max(300) });

export function encodeWorkCursor(view: AskWorkLifecycleView, boundary: AskWorkBoundary): string {
  return Buffer.from(JSON.stringify({ v: view, t: boundary.sortAt, k: boundary.workKey }), 'utf8').toString('base64url');
}

function decodeWorkCursor(cursor: string | null | undefined, view: AskWorkLifecycleView): AskWorkBoundary | null {
  if (!cursor) return null;
  try {
    const parsed = CursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    if (parsed.v !== view) throw new Error('cursor view mismatch');
    return { sortAt: parsed.t, workKey: parsed.k };
  } catch {
    throw new AskWorkInvalidRequestError('cursor is not valid.');
  }
}

function parseView(view: string | null | undefined): AskWorkLifecycleView {
  if (!view) return 'NEEDS_YOU';
  if (!(ASK_WORK_LIFECYCLE_VIEWS as readonly string[]).includes(view)) throw new AskWorkInvalidRequestError('view is not valid.');
  return view as AskWorkLifecycleView;
}

function parseLimit(limit: number | null | undefined): number {
  if (limit == null) return ASK_WORK_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new AskWorkInvalidRequestError('limit must be a positive integer.');
  return Math.min(limit, ASK_WORK_MAX_LIMIT);
}

/** Startup validation: the registry is well formed and a provider's declared reader state matches whether a reader is registered. */
export function validateAskWorkProviders(
  entries: readonly AskWorkProviderDefinition[] = ASK_WORK_PROVIDER_REGISTRY,
  readers: Partial<Record<AskWorkProviderId, AskWorkProviderReader>> = ASK_WORK_PROVIDER_READERS,
): string[] {
  const issues = validateAskWorkProviderRegistry(entries);
  for (const entry of entries) {
    const registered = Boolean(readers[entry.id]);
    if (entry.reader.state === 'CONNECTED' && !registered) issues.push(`${entry.id} is declared connected but has no registered reader`);
    if (entry.reader.state === 'UNAVAILABLE' && registered) issues.push(`${entry.id} has a registered reader but is declared unavailable`);
  }
  return issues;
}

export class AskWorkRestrictedError extends Error {
  code = 'ASK_PERMISSION_REQUIRED';
}

/** Reauthorizes on every call: account eligibility and current household membership. Per-provider floors are applied below. */
export async function authorizeAskWork(userId: string, propertyId: string, accountRole: AskAccountRole | undefined): Promise<{ role: HouseholdRole }> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const access = await ensurePropertyAccess(userId, propertyId);
  return { role: access.role };
}

interface ProviderOutcome {
  definition: AskWorkProviderDefinition;
  status: AskWorkProviderStatus;
  rows: AskWorkRow[];
  viewCounts: Partial<Record<AskWorkLifecycleView, number>> | null;
}

const NOT_APPLICABLE_REASONS: Record<'RESTRICTED' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED', string> = {
  RESTRICTED: 'Your household role cannot read this kind of work.',
  NOT_APPLICABLE: 'This kind of work does not apply to this home right now.',
  CONTEXT_REQUIRED: 'More about this home is needed before this kind of work can be shown.',
};

function emptyStatus(definition: AskWorkProviderDefinition, state: AskWorkProviderState, reason: string | null): AskWorkProviderStatus {
  return { providerId: definition.id, label: definition.label, workType: definition.workType, state, reason, total: null, delivered: 0, required: definition.requiredForExit };
}

export async function getAskWorkPage(
  userId: string,
  propertyId: string,
  query: AskWorkQuery,
  accountRole?: AskAccountRole,
): Promise<AskWorkPage> {
  // Validate the request before any I/O so a malformed cursor or view is a 400 and never a lookup.
  const parsed = parseWorkQuery(query);
  const { role } = await authorizeAskWork(userId, propertyId, accountRole);
  const operatingMode = await loadOperatingMode(userId, propertyId);
  return composeAskWorkPage({ userId, propertyId, role, operatingMode }, parsed, ASK_WORK_PROVIDER_READERS);
}

function parseWorkQuery(query: AskWorkQuery): ParsedWorkQuery {
  const view = parseView(query.view);
  const limit = parseLimit(query.limit);
  const after = decodeWorkCursor(query.cursor, view);
  const workType = query.workType?.trim() || null;
  if (workType && !ASK_WORK_PROVIDER_REGISTRY.some((entry) => entry.workType === workType)) throw new AskWorkInvalidRequestError('workType is not valid.');
  const status = query.status?.trim() || null;
  if (status && status.length > 60) throw new AskWorkInvalidRequestError('status is not valid.');
  return { view, limit, after, workType, status };
}

interface ParsedWorkQuery {
  view: AskWorkLifecycleView;
  limit: number;
  after: AskWorkBoundary | null;
  workType: string | null;
  status: string | null;
}

/**
 * One page of the canonical Work index (FR-WORK-001/005). Each applicable, connected provider returns the next `limit` rows after the
 * global (sortAt desc, workKey asc) boundary, so the merged first `limit` rows are exactly the next page. A provider that is unavailable,
 * restricted, or fails is reported with its state and makes the page partial; it is never omitted and never counted as zero.
 */
export async function composeAskWorkPage(
  input: { userId: string; propertyId: string; role: HouseholdRole; operatingMode: AskOperatingMode },
  parsed: ParsedWorkQuery,
  readers: Partial<Record<AskWorkProviderId, AskWorkProviderReader>>,
  registry: readonly AskWorkProviderDefinition[] = ASK_WORK_PROVIDER_REGISTRY,
): Promise<AskWorkPage> {
  const { userId, propertyId, role, operatingMode } = input;
  const { view, limit, after, workType, status } = parsed;

  const outcomes: ProviderOutcome[] = await Promise.all(registry
    .filter((definition) => !workType || definition.workType === (workType as AskWorkType))
    .map(async (definition): Promise<ProviderOutcome> => {
      const none = (state: AskWorkProviderState, reason: string | null): ProviderOutcome => ({ definition, status: emptyStatus(definition, state, reason), rows: [], viewCounts: null });
      const applicability = evaluateWorkProviderApplicability(definition, { householdRole: role, operatingMode });
      if (applicability !== 'APPLICABLE') return none(applicability, NOT_APPLICABLE_REASONS[applicability]);
      if (definition.reader.state === 'UNAVAILABLE') return none('UNAVAILABLE', definition.reader.reason);
      const reader = readers[definition.id];
      if (!reader) return none('UNAVAILABLE', 'No canonical reader is registered for this kind of work.');
      if (!definition.views.includes(view)) return { definition, status: { ...emptyStatus(definition, 'AVAILABLE', null), total: 0 }, rows: [], viewCounts: null };
      try {
        const result = await reader({ userId, propertyId, role }, { view, after, limit: limit + 1, status });
        const rows = result.rows.filter((row) => row.providerId === definition.id && row.propertyId === propertyId);
        return { definition, status: { ...emptyStatus(definition, 'AVAILABLE', null), total: result.total, delivered: rows.length }, rows, viewCounts: result.viewCounts };
      } catch (error) {
        logger.warn({ err: error, propertyId, providerId: definition.id }, 'Ask Work provider failed');
        return none('FAILED', 'This kind of work could not be read right now.');
      }
    }));

  // Canonical domain providers win; a fallback projection never shows work another provider owns. Aliases are kept on the selected row.
  const selected = new Map<string, { row: AskWorkRow; precedence: number }>();
  const aliasOwner = new Map<string, string>();
  for (const outcome of outcomes) {
    for (const row of outcome.rows) {
      const keys = [row.workKey, ...row.sourceAliases];
      const existingKey = keys.map((key) => aliasOwner.get(key)).find((key): key is string => Boolean(key));
      const precedence = outcome.definition.precedence;
      if (existingKey) {
        const current = selected.get(existingKey)!;
        if (precedence >= current.precedence) {
          current.row.sourceAliases = [...new Set([...current.row.sourceAliases, row.workKey, ...row.sourceAliases])].filter((key) => key !== current.row.workKey);
          for (const key of keys) aliasOwner.set(key, existingKey);
          continue;
        }
        selected.delete(existingKey);
        const merged = { ...row, sourceAliases: [...new Set([...row.sourceAliases, current.row.workKey, ...current.row.sourceAliases])].filter((key) => key !== row.workKey) };
        selected.set(row.workKey, { row: merged, precedence });
        for (const key of [...keys, ...merged.sourceAliases]) aliasOwner.set(key, row.workKey);
        continue;
      }
      selected.set(row.workKey, { row, precedence });
      for (const key of keys) aliasOwner.set(key, row.workKey);
    }
  }
  const ordered = [...selected.values()].map((entry) => entry.row).sort(compareAskWorkRows);
  const rows = ordered.slice(0, limit);
  // Readers are asked for limit + 1 rows, so one extra merged row proves more work exists beyond this page.
  const hasMore = ordered.length > limit;
  const last = rows[rows.length - 1];

  const statuses = outcomes.map((outcome) => outcome.status);
  const partial = statuses.some((entry) => entry.state !== 'AVAILABLE' && entry.state !== 'NOT_APPLICABLE');
  const complete = !partial && statuses.every((entry) => entry.state === 'NOT_APPLICABLE' || entry.total !== null);
  const total = complete ? statuses.reduce((sum, entry) => sum + (entry.total ?? 0), 0) : null;

  const viewCounts = {} as Record<AskWorkLifecycleView, number | null>;
  for (const candidate of ASK_WORK_LIFECYCLE_VIEWS) {
    let sum = 0;
    let known = true;
    for (const outcome of outcomes) {
      if (outcome.status.state === 'NOT_APPLICABLE' || !outcome.definition.views.includes(candidate)) continue;
      const count = outcome.viewCounts?.[candidate] ?? (candidate === view ? outcome.status.total : null);
      if (outcome.status.state !== 'AVAILABLE' || count == null) { known = false; break; }
      sum += count;
    }
    viewCounts[candidate] = known ? sum : null;
  }

  return {
    contractVersion: ASK_WORK_CONTRACT_VERSION,
    propertyId,
    generatedAt: new Date().toISOString(),
    view,
    total,
    totalScope: complete ? 'COMPLETE' : 'PARTIAL',
    partial,
    delivered: rows.length,
    nextCursor: hasMore && last ? encodeWorkCursor(view, { sortAt: last.sortAt, workKey: last.workKey }) : null,
    truncated: hasMore,
    viewCounts,
    sort: { key: 'sortAt', label: 'Most recently updated first' },
    query: { workType: workType as AskWorkType | null, status },
    providers: statuses,
    rows,
  };
}

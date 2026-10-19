import { prisma } from '../../../lib/prisma';
import { repairBookingWhere } from './repairs.reader';
import { loadOperatingMode } from '../askRecordContext';
import type { AskAccountRole } from '../askAccountEligibility';
import { ASK_WORK_PROVIDER_REGISTRY, evaluateWorkProviderApplicability, type AskWorkProviderDefinition, type AskWorkProviderId } from '../governance/askWorkProviderRegistry';
import {
  ASK_WORK_CONTRACT_VERSION, type AskWorkProviderReader, type AskWorkResolution, type AskWorkResumeOutcome, type AskWorkRow,
} from '../askWork.contract';

/** workKey prefixes, most specific first, with the provider that owns each. `execution:` is decided by the execution's own status. */
const KEY_PREFIXES: ReadonlyArray<{ prefix: string; provider: AskWorkProviderId; kind: string }> = [
  { prefix: 'monitor:refinanceRate:', provider: 'MONITORS', kind: 'monitor' },
  { prefix: 'job:reportExport:', provider: 'QUEUED_JOBS', kind: 'reportExport' },
  { prefix: 'job:scoreExport:', provider: 'QUEUED_JOBS', kind: 'scoreExport' },
  { prefix: 'followUp:claim:', provider: 'SCHEDULED_FOLLOW_UPS', kind: 'followUpClaim' },
  { prefix: 'followUp:project:', provider: 'SCHEDULED_FOLLOW_UPS', kind: 'followUpProject' },
  { prefix: 'followUp:savings:', provider: 'SCHEDULED_FOLLOW_UPS', kind: 'followUpSavings' },
  { prefix: 'decisionThread:', provider: 'DECISION_THREADS', kind: 'decisionThread' },
  { prefix: 'execution:', provider: 'PENDING_EXECUTIONS', kind: 'execution' },
  { prefix: 'workItem:', provider: 'OPERATIONAL_WORK_ITEMS', kind: 'workItem' },
  { prefix: 'incident:', provider: 'INCIDENTS', kind: 'incident' },
  { prefix: 'claim:', provider: 'CLAIMS', kind: 'claim' },
  { prefix: 'project:', provider: 'PROJECTS', kind: 'project' },
  { prefix: 'journey:', provider: 'GUIDANCE_JOURNEYS', kind: 'journey' },
  { prefix: 'diyProject:', provider: 'DIY_PROJECTS', kind: 'diyProject' },
  { prefix: 'renovation:', provider: 'RENOVATION_CASES', kind: 'renovation' },
  { prefix: 'repair:', provider: 'REPAIRS', kind: 'repair' },
];

export function parseAskWorkKey(workKey: string): { provider: AskWorkProviderId; kind: string; entityId: string } | null {
  const match = KEY_PREFIXES.find((entry) => workKey.startsWith(entry.prefix));
  const entityId = match ? workKey.slice(match.prefix.length) : '';
  return match && entityId && entityId.length <= 160 ? { provider: match.provider, kind: match.kind, entityId } : null;
}

type Probe =
  | { state: 'MISSING' }
  | { state: 'OUTCOME'; outcome: AskWorkResumeOutcome; supersededBy?: string | null; message: string }
  | { state: 'READ'; provider?: AskWorkProviderId };

const outcome = (value: AskWorkResumeOutcome, message: string, supersededBy: string | null = null): Probe => ({ state: 'OUTCOME', outcome: value, supersededBy, message });

const EXECUTION_COMPLETED = ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS', 'NOT_APPLICABLE'];
const EXECUTION_OPEN = ['NEEDS_PROPERTY', 'NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT', 'NEEDS_CONFIRMATION', 'RUNNING'];

/**
 * Cheap, read-only existence and supersession checks that run before the row is reread, so a gone, finished, or replaced piece of work
 * gets its own recovery outcome instead of a generic miss. Every probe is scoped to the home (and the caller, for personal work).
 */
async function probe(kind: string, entityId: string, userId: string, propertyId: string, registry: readonly AskWorkProviderDefinition[]): Promise<Probe> {
  const connected = (id: AskWorkProviderId) => registry.find((entry) => entry.id === id)?.reader.state === 'CONNECTED';
  switch (kind) {
    case 'execution': {
      const execution = await prisma.askExecution.findFirst({
        where: { id: entityId, userId, OR: [{ propertyId }, { propertyId: null }] },
        select: { status: true, events: { where: { eventType: 'RETRY_STARTED' }, select: { metadataJson: true }, take: 1 } },
      });
      if (!execution) return { state: 'MISSING' };
      if (execution.status === 'FAILED_RETRYABLE') {
        if (execution.events.length === 0) return { state: 'READ', provider: 'RETRYABLE_EXECUTIONS' };
        const meta = execution.events[0].metadataJson as { retryExecutionId?: unknown } | null;
        const retryId = typeof meta?.retryExecutionId === 'string' ? meta.retryExecutionId : null;
        return outcome('SUPERSEDED', 'This request was tried again; the new attempt replaced it.', retryId ? `execution:${retryId}` : null);
      }
      if (EXECUTION_COMPLETED.includes(execution.status)) return outcome('COMPLETED', 'This request is finished.');
      if (execution.status === 'OUTCOME_UNKNOWN') return { state: 'READ', provider: 'UNKNOWN_OUTCOME_EXECUTIONS' };
      if (EXECUTION_OPEN.includes(execution.status)) return { state: 'READ', provider: 'PENDING_EXECUTIONS' };
      return outcome('STALE', 'This request is no longer waiting on you.');
    }
    case 'workItem': {
      const item = await prisma.operationalWorkItem.findFirst({
        where: { id: entityId, propertyId },
        select: {
          state: true, supersededByWorkItemId: true,
          executions: { where: { role: 'PRIMARY' }, select: { executionType: true, executionEntityId: true } },
          sources: { where: { active: true, sourceType: 'INCIDENT' }, select: { sourceEntityId: true } },
        },
      });
      if (!item) return { state: 'MISSING' };
      if (item.supersededByWorkItemId) return outcome('SUPERSEDED', 'This was merged into other work.', `workItem:${item.supersededByWorkItemId}`);
      const relationOwner = item.executions.find((execution) => (execution.executionType === 'PROJECT' && connected('PROJECTS')) || (execution.executionType === 'CLAIM' && connected('CLAIMS')));
      if (relationOwner) return outcome('SUPERSEDED', 'This work is now tracked in its own place.', `${relationOwner.executionType === 'PROJECT' ? 'project' : 'claim'}:${relationOwner.executionEntityId}`);
      // Incident and journey ownership counts only when the owner's row is visible, exactly as the list decides it.
      const guidance = connected('GUIDANCE_JOURNEYS') ? item.executions.find((execution) => execution.executionType === 'GUIDANCE') : undefined;
      if (guidance) {
        const journey = await prisma.guidanceJourney.findFirst({
          where: { id: guidance.executionEntityId, propertyId, OR: [{ status: { in: ['NOT_STARTED', 'ACTIVE', 'COMPLETED', 'DISMISSED'] } }, { projectRecord: { isNot: null } }] },
          select: { id: true, projectRecord: { select: { id: true } } },
        });
        if (journey) return outcome('SUPERSEDED', 'This work is now tracked as a guided plan.', journey.projectRecord ? `project:${journey.projectRecord.id}` : `journey:${journey.id}`);
      }
      if (item.sources.length && connected('INCIDENTS')) {
        const incident = await prisma.incident.findFirst({ where: { propertyId, isSuppressed: false, status: { not: 'SUPPRESSED' }, id: { in: item.sources.map((source) => source.sourceEntityId) } }, select: { id: true } });
        if (incident) return outcome('SUPERSEDED', 'This work is now tracked as an incident.', `incident:${incident.id}`);
      }
      const booking = connected('REPAIRS') ? item.executions.find((execution) => execution.executionType === 'BOOKING') : undefined;
      if (booking && await prisma.booking.findFirst({ where: { AND: [repairBookingWhere(userId, propertyId), { id: booking.executionEntityId }] }, select: { id: true } })) {
        return outcome('SUPERSEDED', 'This work is now tracked as a repair.', `repair:${booking.executionEntityId}`);
      }
      if (item.state === 'CANDIDATE') return outcome('STALE', 'This is a suggestion, not work you accepted.');
      return { state: 'READ' };
    }
    case 'journey': {
      const journey = await prisma.guidanceJourney.findFirst({
        where: { id: entityId, propertyId },
        select: { status: true, projectRecord: { select: { id: true } }, childJourneys: { select: { id: true }, take: 1 } },
      });
      if (!journey) return { state: 'MISSING' };
      if (journey.projectRecord) return outcome('SUPERSEDED', 'This plan became a project.', `project:${journey.projectRecord.id}`);
      if (journey.status === 'BRANCHED') return outcome('SUPERSEDED', 'This plan was replaced by a new one.', journey.childJourneys[0] ? `journey:${journey.childJourneys[0].id}` : null);
      if (journey.status === 'ABORTED' || journey.status === 'ARCHIVED') return outcome('STALE', 'This plan is no longer active.');
      return { state: 'READ' };
    }
    case 'renovation': {
      const renovation = await prisma.renovationCase.findFirst({ where: { id: entityId, propertyId }, select: { executionProject: { select: { id: true } } } });
      if (!renovation) return { state: 'MISSING' };
      return renovation.executionProject ? outcome('SUPERSEDED', 'This renovation moved into a project.', `project:${renovation.executionProject.id}`) : { state: 'READ' };
    }
    case 'incident': {
      const incident = await prisma.incident.findFirst({ where: { id: entityId, propertyId }, select: { isSuppressed: true } });
      if (!incident) return { state: 'MISSING' };
      return incident.isSuppressed ? outcome('STALE', 'This incident is no longer shown.') : { state: 'READ' };
    }
    case 'followUpClaim': {
      const claim = await prisma.claim.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
      return claim ? { state: 'READ' } : { state: 'MISSING' };
    }
    case 'followUpProject': {
      const project = await prisma.projectRecord.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
      return project ? { state: 'READ' } : { state: 'MISSING' };
    }
    case 'followUpSavings': {
      const action = await prisma.savingsBenefitAction.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
      return action ? { state: 'READ' } : { state: 'MISSING' };
    }
    case 'monitor': {
      const monitor = await prisma.refinanceRateMonitor.findFirst({ where: { id: entityId, userId, propertyId }, select: { status: true } });
      if (!monitor) return { state: 'MISSING' };
      return monitor.status === 'STOPPED' ? outcome('COMPLETED', 'This alert was stopped.') : { state: 'READ' };
    }
    case 'reportExport': {
      const report = await prisma.homeReportExport.findFirst({ where: { id: entityId, userId, propertyId }, select: { deletedAt: true, status: true } });
      if (!report || report.deletedAt || report.status === 'DELETED') return { state: 'MISSING' };
      return { state: 'READ' };
    }
    case 'scoreExport': {
      const job = await prisma.homeScoreExportJob.findFirst({ where: { id: entityId, requestedByUserId: userId, report: { propertyId } }, select: { id: true } });
      return job ? { state: 'READ' } : { state: 'MISSING' };
    }
    case 'decisionThread': {
      const thread = await prisma.decisionThread.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
      return thread ? { state: 'READ' } : { state: 'MISSING' };
    }
    case 'claim': {
      const claim = await prisma.claim.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
      return claim ? { state: 'READ' } : { state: 'MISSING' };
    }
    case 'project': {
      const project = await prisma.projectRecord.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
      return project ? { state: 'READ' } : { state: 'MISSING' };
    }
    case 'repair': {
      const booking = await prisma.booking.findFirst({ where: { AND: [repairBookingWhere(userId, propertyId), { id: entityId }] }, select: { id: true } });
      return booking ? { state: 'READ' } : { state: 'MISSING' };
    }
    case 'diyProject': {
      const diy = await prisma.diyProject.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
      return diy ? { state: 'READ' } : { state: 'MISSING' };
    }
    default:
      return { state: 'MISSING' };
  }
}

export interface AskWorkResolveInput {
  userId: string;
  propertyId: string;
  role: Parameters<typeof evaluateWorkProviderApplicability>[1]['householdRole'];
  operatingMode: Parameters<typeof evaluateWorkProviderApplicability>[1]['operatingMode'];
  workKey: string;
  /** The row version the client last saw; a different current version is reported as STALE with the current row. */
  expectedVersion?: string | null;
}

/**
 * Opens one piece of work (FR-WORK-004): rereads the canonical record, applies the provider's current read gate, and reports exactly one
 * recovery outcome. Side-effect free: it expires, reconciles and records nothing; the owning flow (continue, confirm, command) does that
 * when the homeowner acts, and reauthorizes again.
 */
export async function resolveAskWork(
  input: AskWorkResolveInput,
  readers: Partial<Record<AskWorkProviderId, AskWorkProviderReader>>,
  registry: readonly AskWorkProviderDefinition[] = ASK_WORK_PROVIDER_REGISTRY,
): Promise<AskWorkResolution> {
  const { userId, propertyId, role, operatingMode, workKey } = input;
  const base = { contractVersion: ASK_WORK_CONTRACT_VERSION, propertyId, workKey, row: null, currentVersion: null, supersededBy: null } as const;
  const parsed = parseAskWorkKey(workKey);
  if (!parsed) return { ...base, outcome: 'DELETED', message: 'This work could not be found.' };

  const probed = await probe(parsed.kind, parsed.entityId, userId, propertyId, registry);
  if (probed.state === 'MISSING') return { ...base, outcome: 'DELETED', message: 'This work was removed.' };
  if (probed.state === 'OUTCOME') return { ...base, outcome: probed.outcome, supersededBy: probed.supersededBy ?? null, message: probed.message };

  const providerId = probed.provider ?? parsed.provider;
  const definition = registry.find((entry) => entry.id === providerId);
  const reader = readers[providerId];
  if (!definition || definition.reader.state !== 'CONNECTED' || !reader) return { ...base, outcome: 'STALE', message: 'This kind of work cannot be opened right now.' };
  const applicability = evaluateWorkProviderApplicability(definition, { householdRole: role, operatingMode });
  if (applicability === 'RESTRICTED') return { ...base, outcome: 'ACCESS_LOST', message: 'Your household role can no longer open this work.' };
  if (applicability !== 'APPLICABLE') return { ...base, outcome: 'STALE', message: 'This work does not apply to this home right now.' };

  const page = await reader({ userId, propertyId, role, operatingMode }, { view: 'NEEDS_YOU', after: null, limit: 5, status: null, entityId: parsed.entityId });
  const row: AskWorkRow | undefined = page.rows.find((candidate) => candidate.workKey === workKey);
  if (!row) {
    // The record exists but the owner no longer lists it as work for this caller (a follow-up whose date passed hands over to its claim or project).
    const handover = parsed.kind === 'followUpClaim' ? `claim:${parsed.entityId}` : parsed.kind === 'followUpProject' ? `project:${parsed.entityId}` : null;
    return handover
      ? { ...base, outcome: 'SUPERSEDED', supersededBy: handover, message: 'This follow-up is now part of the item it belongs to.' }
      : { ...base, outcome: 'STALE', message: 'This work is no longer listed.' };
  }
  const version = row.freshness.version;
  const completed = row.lifecycleView === 'COMPLETED';
  const changed = Boolean(input.expectedVersion) && input.expectedVersion !== version;
  return {
    ...base,
    row,
    currentVersion: version,
    outcome: completed ? 'COMPLETED' : changed ? 'STALE' : 'AVAILABLE',
    message: completed ? 'This is finished.' : changed ? 'This changed since you last looked. Review the latest before acting.' : 'Ready to open.',
  };
}

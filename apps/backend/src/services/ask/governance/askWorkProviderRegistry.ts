import type { HouseholdRole } from '@prisma/client';
import type { AskOperatingMode } from '../../skills/context/propertyJourneyContext.contract';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from '../askAudiencePolicy';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId, type AskPropertyRoleFloor } from '../askOperationRegistry';

/**
 * Sole Homeowner Interface FRD FR-WORK-001: the server-owned list of homeowner Work providers. A provider declares which existing Ask
 * operations read and change its work. Its READ floor is derived from those read operations and its ACTION floors are derived one command
 * at a time; nothing here classifies sensitivity on its own. The provider gate supplements the canonical service's own authorization and
 * never replaces it.
 */
export type AskWorkType =
  | 'PENDING_EXECUTION' | 'HOME_WORK_ITEM' | 'DECISION_THREAD' | 'INCIDENT' | 'CLAIM' | 'PROJECT' | 'GUIDANCE_JOURNEY' | 'DIY_PROJECT'
  | 'RENOVATION_CASE' | 'REPAIR' | 'MONITOR' | 'QUEUED_JOB' | 'RETRYABLE_EXECUTION' | 'UNKNOWN_OUTCOME_EXECUTION' | 'SCHEDULED_FOLLOW_UP';

export type AskWorkProviderId =
  | 'PENDING_EXECUTIONS' | 'OPERATIONAL_WORK_ITEMS' | 'DECISION_THREADS' | 'INCIDENTS' | 'CLAIMS' | 'PROJECTS' | 'GUIDANCE_JOURNEYS'
  | 'DIY_PROJECTS' | 'RENOVATION_CASES' | 'REPAIRS' | 'MONITORS' | 'QUEUED_JOBS' | 'RETRYABLE_EXECUTIONS' | 'UNKNOWN_OUTCOME_EXECUTIONS'
  | 'SCHEDULED_FOLLOW_UPS';

/** FR-WORK-003. Lifecycle views are separate from resume outcomes (`AskWorkResumeOutcome`); they are never one enum. */
export type AskWorkLifecycleView = 'NEEDS_YOU' | 'ACTIVE' | 'WAITING' | 'SCHEDULED' | 'COMPLETED' | 'ARCHIVED';
export const ASK_WORK_LIFECYCLE_VIEWS: readonly AskWorkLifecycleView[] = Object.freeze(['NEEDS_YOU', 'ACTIVE', 'WAITING', 'SCHEDULED', 'COMPLETED', 'ARCHIVED']);

/**
 * Where a provider's rows come from. CONNECTED means a canonical reader is registered in `askWork.service`. UNAVAILABLE means no canonical
 * reader exists for the source: the provider is reported UNAVAILABLE with this reason and is never synthesized or omitted.
 */
export type AskWorkProviderReader = { state: 'CONNECTED' } | { state: 'UNAVAILABLE'; reason: string };

/**
 * OPERATION_FLOOR: the read floor is the strictest floor among `readOperationIds`.
 * OWN_EXECUTION: the rows are the caller's own Ask executions; property membership is the floor and there is no read operation.
 * NONE: the source has no canonical reader or read operation yet, so the provider is UNAVAILABLE and has no floor to derive.
 */
export type AskWorkReadAuthority = 'OPERATION_FLOOR' | 'OWN_EXECUTION' | 'NONE';

export interface AskWorkProviderDefinition {
  id: AskWorkProviderId;
  label: string;
  workType: AskWorkType;
  owner: string;
  /** Existing Ask reads for the provider's rows; the READ floor is the strictest of these. */
  readOperationIds: readonly AskOperationId[];
  /** Existing Ask commands that act on the provider's work. Each has its own action floor; they never lower the read floor. */
  commandOperationIds: readonly AskOperationId[];
  readAuthority: AskWorkReadAuthority;
  /** Its audience policy decides lifecycle applicability. Must be one of `readOperationIds`; null when the provider has no read operation. */
  lifecycleOperationId: AskOperationId | null;
  reader: AskWorkProviderReader;
  /** Dedup precedence: the lower number wins when two providers describe the same work. */
  precedence: number;
  /** A fallback projection whose rows are excluded wherever a canonical domain provider owns the same work. */
  fallbackProjection: boolean;
  /** Source identifiers other providers or older links may use for this provider's work; kept as aliases on the selected workKey. */
  sourceAliasKinds: readonly string[];
  views: readonly AskWorkLifecycleView[];
  /** Phase 3 cannot exit while a required provider is UNAVAILABLE. */
  requiredForExit: boolean;
  freshnessSource: string;
}

const provider = (value: AskWorkProviderDefinition): AskWorkProviderDefinition => Object.freeze({
  ...value,
  readOperationIds: Object.freeze([...value.readOperationIds]),
  commandOperationIds: Object.freeze([...value.commandOperationIds]),
  sourceAliasKinds: Object.freeze([...value.sourceAliasKinds]),
  views: Object.freeze([...value.views]),
  reader: Object.freeze({ ...value.reader }),
});

const CONNECTED = { state: 'CONNECTED' } as const;
const unavailable = (reason: string): AskWorkProviderReader => ({ state: 'UNAVAILABLE', reason });
const ALL_VIEWS = ASK_WORK_LIFECYCLE_VIEWS;

export const ASK_WORK_PROVIDER_REGISTRY: readonly AskWorkProviderDefinition[] = Object.freeze([
  provider({
    id: 'PENDING_EXECUTIONS', label: 'Pending requests', workType: 'PENDING_EXECUTION', owner: 'ask-executions',
    readOperationIds: [], commandOperationIds: [], readAuthority: 'OWN_EXECUTION', lifecycleOperationId: null,
    reader: CONNECTED, precedence: 10, fallbackProjection: false, sourceAliasKinds: ['execution'],
    views: ['NEEDS_YOU', 'WAITING'], requiredForExit: true, freshnessSource: 'Execution last update',
  }),
  provider({
    id: 'DECISION_THREADS', label: 'Decisions', workType: 'DECISION_THREAD', owner: 'decision-platform',
    readOperationIds: ['HVAC_DECISION_CONTINUE'], commandOperationIds: ['HVAC_DECISION_ABANDON'],
    readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'HVAC_DECISION_CONTINUE',
    reader: unavailable('The decision-thread work reader is not connected yet.'), precedence: 20, fallbackProjection: false, sourceAliasKinds: ['decisionThread'],
    views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Decision thread last update',
  }),
  provider({
    id: 'INCIDENTS', label: 'Incidents', workType: 'INCIDENT', owner: 'incidents',
    readOperationIds: ['INCIDENT_CLAIM_STATUS', 'INCIDENT_CONTINUATION'], commandOperationIds: [],
    readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'INCIDENT_CLAIM_STATUS',
    reader: unavailable('The incident work reader is not connected yet.'), precedence: 20, fallbackProjection: false, sourceAliasKinds: ['incident', 'workItem'],
    views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Incident last update',
  }),
  provider({
    id: 'CLAIMS', label: 'Claims', workType: 'CLAIM', owner: 'incidents-claims',
    readOperationIds: ['INCIDENT_CLAIM_STATUS', 'CLAIM_CHECKLIST_VIEW'], commandOperationIds: ['CLAIM_FILE', 'CLAIM_TRANSITION', 'CLAIM_ACTIVITY_COMMAND'],
    readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'INCIDENT_CLAIM_STATUS',
    reader: unavailable('The claim work reader is not connected yet.'), precedence: 20, fallbackProjection: false, sourceAliasKinds: ['claim', 'workItem'],
    views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Claim last update',
  }),
  provider({
    id: 'PROJECTS', label: 'Projects', workType: 'PROJECT', owner: 'projects',
    readOperationIds: ['PROJECT_TRACKER_PROJECTS'], commandOperationIds: ['PROJECT_TRACKER_CREATE', 'PROJECT_TRACKER_COMMAND'],
    readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'PROJECT_TRACKER_PROJECTS',
    reader: unavailable('The project work reader is not connected yet.'), precedence: 20, fallbackProjection: false, sourceAliasKinds: ['project', 'workItem'],
    views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Project last update',
  }),
  provider({
    id: 'GUIDANCE_JOURNEYS', label: 'Guided journeys', workType: 'GUIDANCE_JOURNEY', owner: 'guidance',
    readOperationIds: ['GUIDANCE_JOURNEYS_LIST', 'GUIDANCE_JOURNEY_CONTINUE'], commandOperationIds: ['GUIDANCE_JOURNEY_DISMISS', 'GUIDANCE_STEP_SKIP'],
    readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'GUIDANCE_JOURNEYS_LIST',
    reader: unavailable('The guided-journey work reader is not connected yet.'), precedence: 20, fallbackProjection: false, sourceAliasKinds: ['journey'],
    views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Journey last update',
  }),
  provider({
    id: 'DIY_PROJECTS', label: 'DIY guides', workType: 'DIY_PROJECT', owner: 'diy',
    readOperationIds: ['DIY_PROJECTS', 'DIY_PROJECT_GUIDE'], commandOperationIds: ['DIY_STEP_UPDATE', 'DIY_PROJECT_COMPLETE', 'DIY_PROJECT_ABANDON', 'DIY_COMPLETION_RECOVER'],
    readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'DIY_PROJECTS',
    reader: unavailable('The DIY work reader is not connected yet.'), precedence: 20, fallbackProjection: false, sourceAliasKinds: ['diyProject', 'workItem'],
    views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'DIY project last update',
  }),
  provider({
    id: 'RENOVATION_CASES', label: 'Renovation cases', workType: 'RENOVATION_CASE', owner: 'renovation',
    readOperationIds: ['PROJECT_TRACKER_PROJECTS'], commandOperationIds: ['RENOVATION_CASE_START', 'RENOVATION_READINESS_COMMAND'],
    readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'PROJECT_TRACKER_PROJECTS',
    reader: unavailable('The renovation-case work reader is not connected yet.'), precedence: 20, fallbackProjection: false, sourceAliasKinds: ['renovationCase', 'workItem'],
    views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Renovation case last update',
  }),
  provider({
    id: 'OPERATIONAL_WORK_ITEMS', label: 'Home work items', workType: 'HOME_WORK_ITEM', owner: 'home-operations',
    readOperationIds: ['HOME_WORK_ITEMS'], commandOperationIds: ['HOME_WORK_ITEM_COMMAND', 'OPERATIONAL_WORK_UPDATE'],
    readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'HOME_WORK_ITEMS',
    reader: CONNECTED, precedence: 90, fallbackProjection: true, sourceAliasKinds: ['workItem'],
    views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Work item last update',
  }),
  provider({
    id: 'REPAIRS', label: 'Repairs', workType: 'REPAIR', owner: 'bookings',
    readOperationIds: [], commandOperationIds: [], readAuthority: 'NONE', lifecycleOperationId: null,
    reader: unavailable('Repairs have no canonical homeowner reader: the only repair-shaped record is a service Booking, which has no homeowner list reader.'),
    precedence: 20, fallbackProjection: false, sourceAliasKinds: ['booking'], views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Booking last update',
  }),
  provider({
    id: 'MONITORS', label: 'Monitors', workType: 'MONITOR', owner: 'monitors',
    readOperationIds: ['REFINANCE_RATE_MONITOR', 'HOME_DEADLINE_MONITOR'], commandOperationIds: [],
    readAuthority: 'OPERATION_FLOOR', lifecycleOperationId: 'REFINANCE_RATE_MONITOR',
    reader: unavailable('The monitor work reader is not connected yet.'), precedence: 20, fallbackProjection: false, sourceAliasKinds: ['monitor'],
    views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Monitor last check',
  }),
  provider({
    id: 'QUEUED_JOBS', label: 'Queued jobs', workType: 'QUEUED_JOB', owner: 'workers',
    readOperationIds: [], commandOperationIds: [], readAuthority: 'NONE', lifecycleOperationId: null,
    reader: unavailable('Report and score export jobs have no status reader that a homeowner surface can call.'),
    precedence: 20, fallbackProjection: false, sourceAliasKinds: ['job'], views: ALL_VIEWS, requiredForExit: true, freshnessSource: 'Job last update',
  }),
  provider({
    id: 'RETRYABLE_EXECUTIONS', label: 'Retryable requests', workType: 'RETRYABLE_EXECUTION', owner: 'ask-executions',
    readOperationIds: [], commandOperationIds: [], readAuthority: 'OWN_EXECUTION', lifecycleOperationId: null,
    reader: unavailable('The retryable-execution reader is not connected yet.'), precedence: 10, fallbackProjection: false, sourceAliasKinds: ['execution'],
    views: ['NEEDS_YOU'], requiredForExit: true, freshnessSource: 'Execution last update',
  }),
  provider({
    id: 'UNKNOWN_OUTCOME_EXECUTIONS', label: 'Requests with an unknown outcome', workType: 'UNKNOWN_OUTCOME_EXECUTION', owner: 'ask-executions',
    readOperationIds: [], commandOperationIds: [], readAuthority: 'NONE', lifecycleOperationId: null,
    reader: unavailable('No canonical unknown-outcome state exists; an ordinary failure is not an unknown outcome, so nothing is derived.'),
    precedence: 10, fallbackProjection: false, sourceAliasKinds: ['execution'], views: ['NEEDS_YOU'], requiredForExit: true, freshnessSource: 'Execution last update',
  }),
  provider({
    id: 'SCHEDULED_FOLLOW_UPS', label: 'Scheduled follow-ups', workType: 'SCHEDULED_FOLLOW_UP', owner: 'follow-ups',
    readOperationIds: [], commandOperationIds: [], readAuthority: 'NONE', lifecycleOperationId: null,
    reader: unavailable('No canonical scheduled follow-up reader is connected yet.'),
    precedence: 20, fallbackProjection: false, sourceAliasKinds: ['followUp'], views: ['SCHEDULED', 'COMPLETED', 'ARCHIVED'], requiredForExit: true, freshnessSource: 'Follow-up schedule',
  }),
]);

const ROLE_RANK: Record<HouseholdRole, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
const FLOOR_RANK: Record<Exclude<AskPropertyRoleFloor, null>, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };

/** The strictest floor among the provider's read operations; null when it has none (property membership alone suffices). */
export function workProviderReadFloor(definition: AskWorkProviderDefinition): AskPropertyRoleFloor {
  let strictest: AskPropertyRoleFloor = null;
  for (const operationId of definition.readOperationIds) {
    const floor = ASK_OPERATION_DEFINITIONS[operationId]?.propertyRoleFloor ?? null;
    if (floor && (strictest === null || FLOOR_RANK[floor] > FLOOR_RANK[strictest])) strictest = floor;
  }
  return strictest;
}

/** Each command's own floor. Derived per operation: a provider may mix CONTRIBUTOR and OWNER commands. */
export function workProviderActionFloors(definition: AskWorkProviderDefinition): Partial<Record<AskOperationId, AskPropertyRoleFloor>> {
  const floors: Partial<Record<AskOperationId, AskPropertyRoleFloor>> = {};
  for (const operationId of definition.commandOperationIds) floors[operationId] = ASK_OPERATION_DEFINITIONS[operationId]?.propertyRoleFloor ?? null;
  return floors;
}

/** True when the household role meets the command's own floor. An unregistered command is never allowed. */
export function workActionAllowed(definition: AskWorkProviderDefinition, operationId: AskOperationId, role: HouseholdRole): boolean {
  if (!definition.commandOperationIds.includes(operationId) || !ASK_OPERATION_DEFINITIONS[operationId]) return false;
  const floor = ASK_OPERATION_DEFINITIONS[operationId].propertyRoleFloor;
  return !floor || ROLE_RANK[role] >= FLOOR_RANK[floor];
}

export type AskWorkProviderApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED' | 'RESTRICTED';

/** Read floor first (the provider stays listed but withholds rows), then the lifecycle decision of the provider's audience policy. */
export function evaluateWorkProviderApplicability(
  definition: AskWorkProviderDefinition,
  input: { householdRole: HouseholdRole; operatingMode: AskOperatingMode },
): AskWorkProviderApplicability {
  const floor = workProviderReadFloor(definition);
  if (floor && ROLE_RANK[input.householdRole] < FLOOR_RANK[floor]) return 'RESTRICTED';
  const policy = definition.lifecycleOperationId ? getAskAudiencePolicy(definition.lifecycleOperationId) : null;
  if (!policy) return 'APPLICABLE';
  const decision = evaluateAskAudienceApplicability({
    policy, accountRole: 'HOMEOWNER', householdRole: input.householdRole, operatingMode: input.operatingMode, purpose: 'EXECUTION',
  });
  if (decision.allowed) return 'APPLICABLE';
  if (decision.outcome === 'CONTEXT_REQUIRED') return 'CONTEXT_REQUIRED';
  return decision.reasonCode === 'ASK_PERMISSION_REQUIRED' ? 'RESTRICTED' : 'NOT_APPLICABLE';
}

/** Startup validation: unique ids, owners, registered operations, a lifecycle operation drawn from the reads, and honest reader states. */
export function validateAskWorkProviderRegistry(
  entries: readonly AskWorkProviderDefinition[] = ASK_WORK_PROVIDER_REGISTRY,
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) issues.push(`Duplicate work provider id: ${entry.id}`);
    ids.add(entry.id);
    if (!entry.label.trim()) issues.push(`${entry.id} has no label`);
    if (!entry.owner.trim()) issues.push(`${entry.id} has no owner`);
    if (!entry.freshnessSource.trim()) issues.push(`${entry.id} has no freshness source`);
    if (!entry.views.length) issues.push(`${entry.id} serves no lifecycle view`);
    if (entry.sourceAliasKinds.length === 0) issues.push(`${entry.id} declares no source alias kind`);
    for (const operationId of [...entry.readOperationIds, ...entry.commandOperationIds]) {
      if (!ASK_OPERATION_DEFINITIONS[operationId]) issues.push(`${entry.id} references unregistered operation ${operationId}`);
    }
    for (const operationId of entry.commandOperationIds) {
      if (ASK_OPERATION_DEFINITIONS[operationId] && ASK_OPERATION_DEFINITIONS[operationId].family !== 'COMMAND') issues.push(`${entry.id} lists non-command operation ${operationId} as a command`);
    }
    if (entry.readAuthority === 'OPERATION_FLOOR') {
      if (entry.readOperationIds.length === 0) issues.push(`${entry.id} derives its read floor from operations but declares none`);
      if (!entry.lifecycleOperationId || !entry.readOperationIds.includes(entry.lifecycleOperationId)) issues.push(`${entry.id} lifecycle operation is not one of its reads`);
    } else {
      if (entry.readOperationIds.length > 0) issues.push(`${entry.id} declares read operations but does not derive its floor from them`);
      if (entry.lifecycleOperationId) issues.push(`${entry.id} has a lifecycle operation without read operations`);
    }
    if (entry.readAuthority === 'NONE' && entry.reader.state === 'CONNECTED') issues.push(`${entry.id} claims a connected reader but has no read authority`);
    if (entry.reader.state === 'UNAVAILABLE' && !entry.reader.reason.trim()) issues.push(`${entry.id} is unavailable but gives no reason`);
    if (entry.fallbackProjection && entry.precedence <= Math.min(...entries.filter((other) => !other.fallbackProjection).map((other) => other.precedence))) {
      issues.push(`${entry.id} is a fallback projection but does not yield to the canonical providers`);
    }
  }
  return issues;
}

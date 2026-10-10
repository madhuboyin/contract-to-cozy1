// Capability lifecycle telemetry for Ask discovery (capability discovery plan, Phase 6; Inline Workspace FRD IW-SHELL-021, Capability Discovery FRD
// CAP-FR-039H). The client's `ask_discovery_*` events say what a homeowner SAW and CHOSE. This module records what the chosen capability then DID,
// in the canonical tool lifecycle (STARTED, OUTPUT_GENERATED, COMPLETED, ABANDONED), and joins the two with bounded identifiers: the capability id,
// the operation id, the discovery entry id, the source surface, and the execution id. Never prompt text, a search phrase, or a label.
//
// The rule that matters (owner decision): an answered Ask execution is NOT a completed capability.
//   - STARTED           a discovery-attributed execution was created.
//   - OUTPUT_GENERATED  the execution delivered an answer (ANSWERED / COMPLETED) or a confirmed write finished. An answer that needs context, a
//                       confirmation, a clarification or a capture, a proposal, a limited answer, and every failure emit nothing here.
//   - COMPLETED         ONLY when the operation's authoritative outcome is declared in ASK_COMPLETION_OUTCOMES AND the kind it satisfies equals the
//                       capability registry's declared completion kind AND any output entity type is verified for that capability (the same two
//                       checks recordCapabilityCompletionAndResolveNext applies). There is no default: a capability whose kind is "a decision was
//                       recorded" is not completed by reading about it.
//   - ABANDONED         the homeowner cancelled the pending proposal, or it expired. There is no timer, so an unanswered proposal is not abandoned
//                       until someone touches it again.
//
// Attribution is untrusted input. It is honoured only when the declared operation and the message match the reviewed entry exactly, and everything
// that becomes an event field is derived here from the registries.
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import {
  canonicalCapabilityRegistry,
  type CAPABILITY_COMPLETION_KINDS,
  type ToolCapabilityDefinition,
  type ToolCapabilityRegistry,
} from '../../productFramework/capabilities';
import { recordToolLifecycleEvents, type ToolLifecycleEventInput, type ToolLifecycleStage } from '../analytics/toolLifecycle';
import { canonicalizeToolLifecycleId } from '../analytics/toolLifecycle.contract';
import { ASK_OPERATION_CAPABILITY } from '../intelligence/capabilitySkillGuidanceBridge.registry';
import { ASK_DISCOVERY_TOPICS } from './askDiscoveryTopics';
import { explorerEntryById } from './askExplorerRegistry';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from './askOperationRegistry';
import { asInputJson } from './support/executionState';

export const ASK_DISCOVERY_ATTRIBUTION_SURFACES = ['TOPIC', 'EXPLORER', 'LANDING_PROMPT'] as const;
export type AskDiscoveryAttributionSurface = (typeof ASK_DISCOVERY_ATTRIBUTION_SURFACES)[number];
export type AskLifecycleSignal = 'LAUNCHED' | 'RESULT' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export type CapabilityCompletionKind = (typeof CAPABILITY_COMPLETION_KINDS)[number];

/** What the client claims. Untrusted until resolved. */
export interface AskDiscoveryClaim {
  entryId: string;
  surface: AskDiscoveryAttributionSurface;
  topicId?: string | null;
}

/** The attribution after validation: every field but the surface and topic comes from the registries. */
export interface ResolvedDiscoveryAttribution {
  entryId: string;
  capabilityId: string;
  operationId: AskOperationId;
  surface: AskDiscoveryAttributionSurface;
  topicId: string | null;
}

/**
 * Operations whose authoritative outcome satisfies a capability completion kind, and the outcome that does:
 *   OUTPUT_DELIVERED  the answer itself is the completion (an OUTPUT_GENERATED capability only);
 *   WRITE_CONFIRMED   the homeowner confirmed the write and it ran.
 * An OUTPUT_VIEWED capability can NEVER be completed here. Delivery is not viewing: the server cannot see a view, and true viewing needs client
 * visibility telemetry that does not exist, so it stays explicitly unmeasured. The metric this module records is OUTPUT_GENERATED (delivered).
 * Empty-by-default is deliberate and was verified on 2026-10-09: none of the ten capabilities reachable from Ask discovery declares an output
 * kind, so reading an answer from discovery never completes them. Only a confirmed task completion satisfies Maintenance's ACTION_COMPLETED, and
 * creating a task is not completing one. Adding an entry is a product decision; validateAskCompletionOutcomes rejects one that contradicts the
 * capability registry.
 */
export interface AskCompletionOutcome {
  kind: CapabilityCompletionKind;
  on: 'OUTPUT_DELIVERED' | 'WRITE_CONFIRMED';
  /** Required unless the capability declares no verified output entity types. */
  outputEntityType?: string;
}
export const ASK_COMPLETION_OUTCOMES: Readonly<Partial<Record<AskOperationId, AskCompletionOutcome>>> = Object.freeze({
  MAINTENANCE_TASK_COMPLETE: { kind: 'ACTION_COMPLETED', on: 'WRITE_CONFIRMED', outputEntityType: 'WORK_ITEM' },
});

export interface PlannedLifecycleEvent {
  stage: ToolLifecycleStage;
  /** Why this event was recorded, as a bounded constant. */
  outcome: string;
  completionKind?: CapabilityCompletionKind;
}

const DELIVERED_STATUSES: ReadonlySet<string> = new Set(['ANSWERED', 'COMPLETED']);

/** Pure: which lifecycle events a discovery-attributed execution has earned at this point. */
export function planAskCapabilityLifecycle(input: {
  capability: Pick<ToolCapabilityDefinition, 'lifecycle'>;
  operationId: AskOperationId;
  status: string;
  signal: AskLifecycleSignal;
  completions?: Readonly<Partial<Record<AskOperationId, AskCompletionOutcome>>>;
}): PlannedLifecycleEvent[] {
  if (input.signal === 'LAUNCHED') return [{ stage: 'STARTED', outcome: 'LAUNCHED' }];
  if (input.signal === 'CANCELLED') return [{ stage: 'ABANDONED', outcome: 'PROPOSAL_CANCELLED' }];
  if (input.signal === 'EXPIRED') return [{ stage: 'ABANDONED', outcome: 'PROPOSAL_EXPIRED' }];
  if (!DELIVERED_STATUSES.has(input.status)) return [];
  const outcome = input.signal === 'CONFIRMED' ? 'WRITE_CONFIRMED' : 'OUTPUT_DELIVERED';
  const events: PlannedLifecycleEvent[] = [{ stage: 'OUTPUT_GENERATED', outcome }];
  const declared = (input.completions ?? ASK_COMPLETION_OUTCOMES)[input.operationId];
  const { completionKind, outputEntityTypes } = input.capability.lifecycle;
  if (
    declared
    // Delivery is not viewing: an OUTPUT_VIEWED capability is never completed by an answer, whatever the table says.
    && completionKind !== 'OUTPUT_VIEWED'
    && declared.on === outcome
    && declared.kind === completionKind
    && (declared.outputEntityType === undefined ? outputEntityTypes.length === 0 : outputEntityTypes.includes(declared.outputEntityType as never))
  ) {
    events.push({ stage: 'COMPLETED', outcome, completionKind });
  }
  return events;
}

/** Validates an untrusted claim against the reviewed entry. Returns null (no telemetry) for anything that does not match exactly. */
export function resolveDiscoveryAttribution(input: {
  claim: unknown;
  /** The operation the launch context declared. */
  declaredOperationId: string | null | undefined;
  message: string;
  registry?: Pick<ToolCapabilityRegistry, 'getById'>;
}): ResolvedDiscoveryAttribution | null {
  const claim = input.claim as Partial<AskDiscoveryClaim> | null | undefined;
  if (!claim || typeof claim.entryId !== 'string' || !(ASK_DISCOVERY_ATTRIBUTION_SURFACES as readonly string[]).includes(claim.surface as string)) return null;
  const entry = explorerEntryById(claim.entryId);
  if (!entry) return null;
  if (input.declaredOperationId !== entry.operationId) return null;
  if (input.message.trim() !== entry.question.trim()) return null;
  if (!(entry.operationId in ASK_OPERATION_DEFINITIONS)) return null;
  const capability = (input.registry ?? canonicalCapabilityRegistry).getById(entry.capabilityId);
  if (!capability || canonicalizeToolLifecycleId(capability.id) !== capability.id) return null;
  // A topic id is kept only when that topic really lists this entry; otherwise it is dropped, not trusted.
  const topic = typeof claim.topicId === 'string'
    ? ASK_DISCOVERY_TOPICS.find((candidate) => candidate.id === claim.topicId && candidate.starters.some((starter) => starter.entryId === entry.id))
    : undefined;
  return {
    entryId: entry.id, capabilityId: capability.id, operationId: entry.operationId,
    surface: claim.surface as AskDiscoveryAttributionSurface, topicId: topic ? topic.id : null,
  };
}

/** The stored claim, read back from the execution's own launch context. */
export function readStoredDiscoveryClaim(launchContextJson: unknown): { claim: unknown; declaredOperationId: string | null } {
  if (!launchContextJson || typeof launchContextJson !== 'object' || Array.isArray(launchContextJson)) return { claim: null, declaredOperationId: null };
  const record = launchContextJson as { discovery?: unknown; operationId?: unknown };
  return { claim: record.discovery ?? null, declaredOperationId: typeof record.operationId === 'string' ? record.operationId : null };
}

function toLifecycleEvent(
  planned: PlannedLifecycleEvent,
  attribution: ResolvedDiscoveryAttribution,
  capability: ToolCapabilityDefinition,
  registryVersion: string,
  execution: { id: string; sessionId: string; status: string; reasonCode: string | null },
): ToolLifecycleEventInput {
  return {
    toolId: capability.id,
    stage: planned.stage,
    surface: 'ask_discovery',
    manifestVersion: capability.version,
    registryVersion,
    sourceKind: 'CATALOG',
    sourceId: attribution.entryId,
    sessionKey: execution.sessionId,
    reasonCode: planned.outcome,
    completionKind: planned.completionKind ?? null,
    metadata: {
      askExecutionId: execution.id,
      discoveryEntryId: attribution.entryId,
      operationId: attribution.operationId,
      discoverySurface: attribution.surface,
      discoveryTopicId: attribution.topicId,
      askStatus: execution.status,
      askReasonCode: execution.reasonCode ? execution.reasonCode.slice(0, 80) : null,
      outcome: planned.outcome,
    },
  };
}

export interface AskLifecycleDependencies {
  registry: ToolCapabilityRegistry;
  record: typeof recordToolLifecycleEvents;
  completions: Readonly<Partial<Record<AskOperationId, AskCompletionOutcome>>>;
}

/**
 * Records the lifecycle events a discovery-attributed execution has earned, once each (an `AskExecutionEvent` per stage is the idempotency marker).
 * Reads the execution as persisted, so the status is the authoritative one. Never throws and never delays the homeowner's request: callers use `void`.
 */
export async function recordAskCapabilityLifecycle(
  executionId: string,
  signal: AskLifecycleSignal,
  dependencies: Partial<AskLifecycleDependencies> = {},
): Promise<PlannedLifecycleEvent[]> {
  const deps: AskLifecycleDependencies = {
    registry: canonicalCapabilityRegistry, record: recordToolLifecycleEvents, completions: ASK_COMPLETION_OUTCOMES, ...dependencies,
  };
  try {
    const execution = await prisma.askExecution.findUnique({
      where: { id: executionId },
      select: { id: true, userId: true, propertyId: true, sessionId: true, operationId: true, status: true, reasonCode: true, message: true, launchContextJson: true },
    });
    if (!execution?.propertyId || !execution.operationId) return [];
    const stored = readStoredDiscoveryClaim(execution.launchContextJson);
    const attribution = resolveDiscoveryAttribution({ claim: stored.claim, declaredOperationId: stored.declaredOperationId, message: execution.message, registry: deps.registry });
    // The routed operation must be the entry's: a misrouted turn is not the chosen capability.
    if (!attribution || attribution.operationId !== execution.operationId) return [];
    const capability = deps.registry.getById(attribution.capabilityId);
    if (!capability) return [];
    const planned = planAskCapabilityLifecycle({ capability, operationId: attribution.operationId, status: execution.status, signal, completions: deps.completions });
    if (!planned.length) return [];
    const recorded = await prisma.askExecutionEvent.findMany({
      where: { executionId, eventType: { in: planned.map((event) => `CAPABILITY_LIFECYCLE_${event.stage}`) } },
      select: { eventType: true },
    });
    const done = new Set(recorded.map((row) => row.eventType));
    const fresh = planned.filter((event) => !done.has(`CAPABILITY_LIFECYCLE_${event.stage}`));
    if (!fresh.length) return [];
    await deps.record({
      userId: execution.userId,
      propertyId: execution.propertyId,
      events: fresh.map((event) => toLifecycleEvent(event, attribution, capability, deps.registry.version, execution)),
    });
    await prisma.askExecutionEvent.createMany({
      data: fresh.map((event) => ({
        executionId,
        eventType: `CAPABILITY_LIFECYCLE_${event.stage}`,
        metadataJson: asInputJson({ capabilityId: attribution.capabilityId, entryId: attribution.entryId, outcome: event.outcome, completionKind: event.completionKind ?? null }),
      })),
    });
    return fresh;
  } catch (error) {
    logger.warn({ err: error, executionId, signal }, 'Ask capability lifecycle telemetry failed; the request is unaffected');
    return [];
  }
}

/** Startup validator: a declared completion outcome must agree with the operation and the capability registry. */
export function validateAskCompletionOutcomes(
  completions: Readonly<Partial<Record<AskOperationId, AskCompletionOutcome>>> = ASK_COMPLETION_OUTCOMES,
  registry: Pick<ToolCapabilityRegistry, 'getById'> = canonicalCapabilityRegistry,
  ownerOf: (operationId: AskOperationId) => string | undefined = (operationId) => ASK_OPERATION_CAPABILITY[operationId],
): string[] {
  const issues: string[] = [];
  for (const [operationId, outcome] of Object.entries(completions) as Array<[AskOperationId, AskCompletionOutcome]>) {
    const where = `completion/${operationId}`;
    if (!(operationId in ASK_OPERATION_DEFINITIONS)) { issues.push(`${where}: unknown operation`); continue; }
    const capabilityId = ownerOf(operationId);
    const capability = capabilityId ? registry.getById(capabilityId) : undefined;
    if (!capability) { issues.push(`${where}: the guidance bridge assigns no capability`); continue; }
    if (capability.lifecycle.completionKind !== outcome.kind) issues.push(`${where}: declares ${outcome.kind} but ${capability.id} declares ${capability.lifecycle.completionKind}`);
    const entities = capability.lifecycle.outputEntityTypes as readonly string[];
    if (outcome.outputEntityType === undefined ? entities.length > 0 : !entities.includes(outcome.outputEntityType)) issues.push(`${where}: output entity type is not verified for ${capability.id}`);
    if (outcome.kind === 'OUTPUT_VIEWED') { issues.push(`${where}: OUTPUT_VIEWED cannot be satisfied by delivery; viewing is unmeasured until client visibility telemetry exists`); continue; }
    const outputKind = outcome.kind === 'OUTPUT_GENERATED';
    if (outputKind !== (outcome.on === 'OUTPUT_DELIVERED')) issues.push(`${where}: ${outcome.kind} is satisfied by ${outputKind ? 'OUTPUT_DELIVERED' : 'WRITE_CONFIRMED'}, not ${outcome.on}`);
  }
  return issues;
}

import type { HouseholdRole } from '@prisma/client';
import { readAskOperationalControls } from '../../config/askOperationalControls';
import { askRemoteGenerationTotal } from '../../lib/metrics';
import { resolvePropertyAccess, type PropertyAccess } from '../propertyAccess.service';
import { getSkillAdapter } from '../skills/adapters/skillAdapterRegistry';
import { SKILL_DEPENDENCY_ACTIVATIONS } from '../skills/skillDependencyRegistry';
import { getSkillForOperation, resolveEffectiveSkillOperationPolicy } from '../skills/skillRegistry';
import type { ComposedSkillContext } from '../skills/context/skillContext.contract';
import type { SkillExecutionTimingTrace } from '../skills/skillExecutionTelemetry';
import {
  ASK_OPERATION_DEFINITIONS,
  getAskOperationDefinition,
  type AskOperationId,
  type AskOperationResult,
} from './askOperationRegistry';
import { AskCapabilityHandlerMissingError, type CapabilityInvocationEnvelope } from './capabilityInvocation.contract';

// Ask Cozy Stage 3, Phase 1 (implementation plan §7; FRD §16-17). Replaces
// askOrchestrator.service.ts's former domain-branching dispatch switch
// (:6137-6234 as of the Phase 0 handler inventory) with a registry keyed by
// adapter id. Deliberately does NOT import handler functions from
// askOrchestrator.service.ts -- that file imports THIS module to register
// its own (already in-scope) handlers instead, one-directionally, avoiding a
// circular import that would be unsafe under this codebase's CommonJS build
// (a `require` cycle can observe the other module's exports before its
// later-declared functions have been assigned to `exports`).
//
// System-computed dependencies a handler needs but that aren't part of the
// homeowner-shaped envelope (composed skill context, execution timing trace,
// a property-access check already performed by the caller) travel here, not
// in CapabilityInvocationEnvelope -- see that file's header comment.
export interface CapabilityInvocationDependencies {
  composedContext?: ComposedSkillContext | null;
  trace?: SkillExecutionTimingTrace;
  // Review finding (post-Phase-1 sign-off pass): capabilityInvoke() must
  // itself re-verify property access, not merely assume an upstream caller
  // already did -- a mocked-DB repro showed calling a disabled operation
  // with an unverified user/property still executed and returned ANSWERED.
  // When the orchestrator has already resolved access for this exact
  // userId/propertyId this turn (askOrchestrator.service.ts's
  // executeOperationCore), it passes the real, already-verified result
  // through here purely to avoid a redundant DB round trip -- capabilityInvoke
  // still performs the full authorization-floor comparison against it, and
  // still queries fresh if this is absent, so a caller cannot bypass the
  // check by fabricating this field with anything other than a real,
  // already-resolved PropertyAccess for the same userId/propertyId.
  propertyAccess?: PropertyAccess | null;
}

export type CapabilityHandler = (
  envelope: CapabilityInvocationEnvelope,
  deps: CapabilityInvocationDependencies,
) => Promise<AskOperationResult>;

const registry = new Map<string, CapabilityHandler>();
const registrationIssues: string[] = [];

// [REQUIREMENT] Duplicate-handler registration must fail at initialization
// (FRD §16) -- recorded here, surfaced through validateCapabilityHandlerRegistry()
// below, aggregated into the same fail-fast startup check every other Ask
// registry already uses (index.ts's askRegistryIssues), rather than thrown
// synchronously on the first duplicate encountered.
export function registerCapabilityHandler(adapterKey: string, handler: CapabilityHandler): void {
  if (registry.has(adapterKey)) {
    registrationIssues.push(`${adapterKey}: duplicate capability handler registration`);
    return;
  }
  registry.set(adapterKey, handler);
}

// --- Invocation policy contract (FRD §16: "resolve adapter -> validate
// policy -> resolve registered handler -> build envelope -> execute") ---
//
// These were previously duplicated inline inside askOrchestrator.service.ts's
// executeOperationCore, which also calls them (see that file) for its own
// context/audience-composition needs -- but capabilityInvoke() below must
// enforce them unconditionally itself, since it is the layer any future
// direct caller (a specialist agent, a background job, Phase 2's confirm-time
// dispatch migration) would reasonably call without knowing to replicate
// askOrchestrator.service.ts's guard chain first. Exported so
// askOrchestrator.service.ts sources its copy from here instead of
// maintaining a second, driftable definition.

export function operationalUnavailableResult(reason:
  | 'ASK_DISABLED'
  | 'ASK_SKILL_DISABLED'
  | 'ASK_SKILL_POLICY_MISMATCH'
  | 'ASK_SKILL_DEPENDENCY_UNAVAILABLE'
  | 'OPERATION_DISABLED'
  | 'REMOTE_GENERATION_DISABLED'
): AskOperationResult {
  const remoteOnly = reason === 'REMOTE_GENERATION_DISABLED';
  return {
    status: 'UNAVAILABLE',
    reasonCode: reason,
    blocks: [{
      type: 'BOUNDARY', id: 'ask-operational-boundary', title: remoteOnly ? 'General guidance is temporarily limited' : 'This Ask capability is temporarily unavailable', severity: 'INFO',
      body: remoteOnly
        ? 'Record-based questions and registered home tools are still available, but open-ended generated guidance is currently turned off. Ask will not invent an answer while generation is unavailable.'
        : 'This capability has been paused by an operational control. Your home record was not changed.',
      suggestions: ['Ask about recorded maintenance, coverage, savings, inventory, home actions, or your property summary.'],
    }],
    suggestions: ['What maintenance is pending?', 'Summarize my home record', 'Which items are missing coverage?'],
  };
}

export function needsPropertyResult(): AskOperationResult {
  return {
    status: 'NEEDS_PROPERTY',
    reasonCode: 'ASK_PROPERTY_REQUIRED',
    blocks: [{
      type: 'SUMMARY',
      id: 'property-required',
      title: 'Select a home to continue',
      body: 'This question needs a specific Living Home Record. Select a home, then Ask will continue with the same question.',
      tone: 'CAUTION',
      actions: [{ id: 'select-property', label: 'Select a home', href: '/dashboard/properties', style: 'PRIMARY' }],
    }],
    suggestions: ['You can also ask a general home-care question without selecting a property.'],
  };
}

export function permissionRequiredResult(authorizationFloor: HouseholdRole): AskOperationResult {
  return {
    status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
    blocks: [{
      type: 'SUMMARY', id: 'ask-operation-permission', title: `${authorizationFloor.toLowerCase()} access is required`,
      body: 'This registered operation is unavailable for your current household role. No home record was changed.',
      tone: 'CAUTION', actions: [],
    }],
    suggestions: ['Ask a read-only question about this home'],
  };
}

type SkillRuntimeUnavailableReason = 'ASK_SKILL_DISABLED' | 'ASK_SKILL_POLICY_MISMATCH' | 'ASK_SKILL_DEPENDENCY_UNAVAILABLE';

export function skillRuntimeUnavailableReason(
  operationId: AskOperationId,
  controls: ReturnType<typeof readAskOperationalControls>,
): SkillRuntimeUnavailableReason | null {
  const skill = getSkillForOperation(operationId);
  if (!skill) return null;
  if (skill.operationalStatus !== 'ENABLED' || !controls.skillEnabled(skill.id)) return 'ASK_SKILL_DISABLED';
  const dependencyActivation = SKILL_DEPENDENCY_ACTIVATIONS[skill.id];
  if (!dependencyActivation || dependencyActivation.skillVersion !== skill.version || dependencyActivation.status === 'UNAVAILABLE') {
    return 'ASK_SKILL_DEPENDENCY_UNAVAILABLE';
  }
  if (!resolveEffectiveSkillOperationPolicy(skill.id, operationId, 'ASK')) return 'ASK_SKILL_POLICY_MISMATCH';
  const adapterReference = skill.allowedAdapters.find((candidate) => candidate.id === getAskOperationDefinition(operationId).adapterKey);
  const adapter = adapterReference ? getSkillAdapter(adapterReference.id, adapterReference.version) : undefined;
  if (!adapter || !adapter.allowedOperations.includes(operationId) || !controls.adapterEnabled(adapter.id)) return 'ASK_SKILL_DEPENDENCY_UNAVAILABLE';
  return null;
}

const HOUSEHOLD_ROLE_RANK: Record<HouseholdRole, number> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };

async function ensurePropertyAccess(userId: string, propertyId: string): Promise<PropertyAccess> {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) {
    const error = new Error('Property not found or access denied.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_NOT_FOUND';
    throw error;
  }
  return access;
}

export function capabilityInvoke(
  operationId: AskOperationId,
  envelope: CapabilityInvocationEnvelope,
  deps: CapabilityInvocationDependencies = {},
): Promise<AskOperationResult> {
  return invokeGuarded(operationId, envelope, deps);
}

async function invokeGuarded(
  operationId: AskOperationId,
  envelope: CapabilityInvocationEnvelope,
  deps: CapabilityInvocationDependencies,
): Promise<AskOperationResult> {
  const definition = ASK_OPERATION_DEFINITIONS[operationId];
  const adapterKey = definition.adapterKey;

  // Operational kill-switches: cheap, in-memory, and must hold for every
  // caller unconditionally -- this is what let a disabled operation still
  // execute when capabilityInvoke() was called directly, before this fix.
  const controls = readAskOperationalControls();
  if (!controls.askEnabled) return operationalUnavailableResult('ASK_DISABLED');
  if (!controls.operationEnabled(operationId)) return operationalUnavailableResult('OPERATION_DISABLED');
  const skillUnavailable = skillRuntimeUnavailableReason(operationId, controls);
  if (skillUnavailable) return operationalUnavailableResult(skillUnavailable);
  if (definition.executionMode === 'REMOTE_GENERATION' && !controls.remoteGenerationEnabled) {
    askRemoteGenerationTotal.inc({ outcome: 'disabled' });
    return operationalUnavailableResult('REMOTE_GENERATION_DISABLED');
  }

  // Property scope + authorization floor: the second half of the reported
  // gap -- an "unverified user/property" must never reach a handler.
  if (definition.requiresProperty && !envelope.propertyId) return needsPropertyResult();
  const skill = getSkillForOperation(operationId);
  const effectivePolicy = skill ? resolveEffectiveSkillOperationPolicy(skill.id, operationId, 'ASK') : null;
  const authorizationFloor = effectivePolicy?.authorizationFloor ?? definition.propertyRoleFloor;
  if (envelope.propertyId && authorizationFloor) {
    const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, envelope.propertyId);
    if (HOUSEHOLD_ROLE_RANK[access.role] < HOUSEHOLD_ROLE_RANK[authorizationFloor]) {
      return permissionRequiredResult(authorizationFloor);
    }
  }

  const handler = registry.get(adapterKey);
  if (!handler) throw new AskCapabilityHandlerMissingError(operationId, adapterKey);
  return handler(envelope, deps);
}

// Mirrors validateSkillAdapterDefinitions's adapter-to-operation integrity
// check (skillAdapterRegistry.ts) -- every registered operation's own
// declared adapterKey (ASK_OPERATION_DEFINITIONS, authoritative for all 67
// operations regardless of whether a richer SkillAdapterDefinition also
// exists for it) must resolve to a registered handler.
export function validateCapabilityHandlerRegistry(): string[] {
  const issues = [...registrationIssues];
  for (const operationId of Object.keys(ASK_OPERATION_DEFINITIONS) as AskOperationId[]) {
    const adapterKey = ASK_OPERATION_DEFINITIONS[operationId].adapterKey;
    if (!registry.has(adapterKey)) {
      issues.push(`${operationId}: no capability handler registered for adapter "${adapterKey}"`);
    }
  }
  return issues;
}

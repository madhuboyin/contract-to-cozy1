import type { ComposedSkillContext } from '../skills/context/skillContext.contract';
import type { SkillExecutionTimingTrace } from '../skills/skillExecutionTelemetry';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
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
// homeowner-shaped envelope (composed skill context, execution timing trace)
// travel here, not in CapabilityInvocationEnvelope -- see that file's header
// comment.
export interface CapabilityInvocationDependencies {
  composedContext?: ComposedSkillContext | null;
  trace?: SkillExecutionTimingTrace;
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

export function capabilityInvoke(
  operationId: AskOperationId,
  envelope: CapabilityInvocationEnvelope,
  deps: CapabilityInvocationDependencies = {},
): Promise<AskOperationResult> {
  const adapterKey = ASK_OPERATION_DEFINITIONS[operationId].adapterKey;
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

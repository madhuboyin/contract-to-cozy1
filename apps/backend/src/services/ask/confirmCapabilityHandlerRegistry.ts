import type { AskExecution } from '@prisma/client';
import type { PropertyAccess } from '../propertyAccess.service';
import type { AskDomainCommandDefinition } from './askDomainCommandRegistry';
import { ASK_DOMAIN_COMMAND_REGISTRY } from './askDomainCommandRegistry';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import { AskCapabilityHandlerMissingError } from './capabilityInvocation.contract';

// Ask Cozy Stage 3, Phase 2 (implementation plan §8, "New this revision
// (§4.9)"; FRD §17). Confirm-time counterpart to capabilityHandlerRegistry.ts
// -- that file's registry replaced the propose-time dispatch switch
// (Phase 1); this one replaces confirmAskExecution's former ~960-line
// if/else write-dispatch chain (askOrchestrator.service.ts, previously
// :8268-9228) the same way: a registry keyed by adapter id, one thin
// registration per confirmation-required operation, handler bodies moved
// verbatim (not rewritten) and still living in askOrchestrator.service.ts.
// Same one-directional import discipline as capabilityHandlerRegistry.ts, for
// the same reason (a `require` cycle under this codebase's CommonJS build can
// observe another module's exports before its later-declared functions have
// been assigned to `exports`) -- askOrchestrator.service.ts imports this
// module and registers its own, already in-scope handlers; this module never
// imports handler functions back.
//
// Deliberately keyed by ASK_DOMAIN_COMMAND_REGISTRY's 25 entries, not all 67
// ASK_OPERATION_DEFINITIONS -- only confirmation-required operations have a
// confirm-time write at all; the other 42 never reach confirmAskExecution's
// dispatch in the first place.
export interface ConfirmCapabilityContext {
  userId: string;
  // confirmAskExecution guards `!execution.propertyId` before any dispatch is
  // reachable -- every confirm handler body already assumed this narrowing
  // when it lived inline in that function; the intersection type carries
  // that same guarantee across the function boundary instead of losing it.
  execution: AskExecution & { propertyId: string };
  access: PropertyAccess;
  parameters: Record<string, unknown>;
  command: AskDomainCommandDefinition;
}

export interface ConfirmCapabilityResult {
  result: AskOperationResult;
  artifactType: string;
  artifactId: string;
}

export type ConfirmCapabilityHandler = (ctx: ConfirmCapabilityContext) => Promise<ConfirmCapabilityResult>;

const registry = new Map<string, ConfirmCapabilityHandler>();
const registrationIssues: string[] = [];

// [REQUIREMENT] Duplicate-handler registration must fail at initialization
// (FRD §16, same convention Phase 1 established for the propose-time
// registry) -- recorded here, surfaced through
// validateConfirmCapabilityHandlerRegistry() below, aggregated into the same
// fail-fast startup check every other Ask registry already uses.
export function registerConfirmCapabilityHandler(adapterKey: string, handler: ConfirmCapabilityHandler): void {
  if (registry.has(adapterKey)) {
    registrationIssues.push(`${adapterKey}: duplicate confirm capability handler registration`);
    return;
  }
  registry.set(adapterKey, handler);
}

export function confirmCapabilityInvoke(
  operationId: AskOperationId,
  ctx: ConfirmCapabilityContext,
): Promise<ConfirmCapabilityResult> {
  const adapterKey = ASK_OPERATION_DEFINITIONS[operationId].adapterKey;
  const handler = registry.get(adapterKey);
  if (!handler) throw new AskCapabilityHandlerMissingError(operationId, adapterKey);
  return handler(ctx);
}

// Mirrors capabilityHandlerRegistry.ts's validateCapabilityHandlerRegistry,
// scoped to the 25 confirmation-required operations only (each command's own
// adapterKey, ASK_DOMAIN_COMMAND_REGISTRY -- the authoritative source, same
// as the propose-time registry keys off each operation's own adapterKey).
export function validateConfirmCapabilityHandlerRegistry(): string[] {
  const issues = [...registrationIssues];
  for (const definition of Object.values(ASK_DOMAIN_COMMAND_REGISTRY)) {
    if (!registry.has(definition.adapterKey)) {
      issues.push(`${definition.id}: no confirm capability handler registered for adapter "${definition.adapterKey}"`);
    }
  }
  return issues;
}

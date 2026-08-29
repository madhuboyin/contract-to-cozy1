// apps/backend/src/services/agents/agentTriggerRegistry.ts
//
// §7.3: binds a definition's declared trigger handler IDs to the concrete
// runtime entry point. PR 8 registered `agent.hvac.home-action-engagement`
// as PENDING (DEV-only); PR 10 provides the handler, so it is now AVAILABLE.

import { invokeAgentRuntime, type AgentRuntimeDependencies } from './agentRuntime.service';
import type { AgentRuntimeInvocation, AgentRuntimeResult } from './agentRuntime.contract';

export type AgentTriggerHandler = (
  invocation: AgentRuntimeInvocation,
  deps?: AgentRuntimeDependencies,
) => Promise<AgentRuntimeResult>;

export const AGENT_TRIGGER_HANDLERS: Readonly<Record<string, AgentTriggerHandler>> = Object.freeze({
  'agent.hvac.home-action-engagement@1.0.0': invokeAgentRuntime,
});

export function getAgentTriggerHandler(handlerId: string, handlerVersion: string): AgentTriggerHandler | undefined {
  return AGENT_TRIGGER_HANDLERS[`${handlerId}@${handlerVersion}`];
}

/**
 * Startup parity: every trigger-handler ref a definition declares AVAILABLE
 * must have a concrete handler here, and every concrete handler must be
 * declared in the readiness registry. Keeps the "AVAILABLE" claim honest.
 */
export function validateAgentTriggerHandlers(
  readiness: Readonly<Record<string, 'AVAILABLE' | 'PENDING'>>,
): string[] {
  const issues: string[] = [];
  for (const [ref, state] of Object.entries(readiness)) {
    if (state === 'AVAILABLE' && !AGENT_TRIGGER_HANDLERS[ref]) {
      issues.push(`trigger handler ${ref} is declared AVAILABLE but has no concrete handler`);
    }
  }
  for (const ref of Object.keys(AGENT_TRIGGER_HANDLERS)) {
    if (!(ref in readiness)) issues.push(`trigger handler ${ref} has no readiness declaration`);
  }
  return issues;
}

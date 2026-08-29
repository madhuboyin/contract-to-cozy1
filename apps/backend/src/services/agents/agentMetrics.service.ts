// apps/backend/src/services/agents/agentMetrics.service.ts
//
// Thin wrappers over the prom-client counters in lib/metrics so the runtime
// records the same three signals everywhere: operation calls, terminal run
// outcomes, and per-tool invocations.

import {
  agentRuntimeOperationsTotal,
  agentRuntimeRunOutcomesTotal,
  agentRuntimeToolInvocationsTotal,
} from '../../lib/metrics';
import type { AgentRuntimeOperation, AgentRunPhase, HvacSpecialistTool } from './agentRuntime.contract';

export function recordAgentOperation(agent: string, operation: AgentRuntimeOperation, outcome: 'OK' | 'DENIED' | 'CAS_CONFLICT' | 'ERROR'): void {
  agentRuntimeOperationsTotal.inc({ agent, operation, outcome });
}

export function recordAgentRunOutcome(agent: string, outcome: AgentRunPhase | 'PAUSED'): void {
  agentRuntimeRunOutcomesTotal.inc({ agent, outcome });
}

export function recordSpecialistToolInvocation(agent: string, tool: HvacSpecialistTool, outcome: 'OK' | 'EMPTY' | 'FAILED' | 'ABSTAINED'): void {
  agentRuntimeToolInvocationsTotal.inc({ agent, tool, outcome });
}

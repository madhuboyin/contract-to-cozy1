import type { AskExecutionMode, AskOperationId } from '../ask/askOperationRegistry';
import type { ComposedSkillContext } from './context/skillContext.contract';
import type { SkillRiskPolicy } from './skill.contract';
import type { SkillExecutionBinding } from './skillExecutionBinding';
import type { HierarchicalSkillRoutingDecision } from './skillRouter';

export type SkillLatencyBand =
  | 'NOT_MEASURED'
  | 'LT_25_MS'
  | 'LT_100_MS'
  | 'LT_500_MS'
  | 'LT_1_S'
  | 'LT_5_S'
  | 'GTE_5_S';

export type SkillConfidenceBand = 'NOT_AVAILABLE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type SkillModelUsage = 'NONE' | 'ROUTING' | 'NARRATIVE_SYNTHESIS' | 'OPERATION_GENERATION';
export type SkillModelCostBand = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export interface SkillExecutionTimingTrace {
  routingLatencyMs: number | null;
  contextCompositionLatencyMs: number | null;
  adapterResolutionLatencyMs: number | null;
  canonicalOperationLatencyMs: number | null;
  presentationLatencyMs: number | null;
  modelLatencyMs: number | null;
  modelUsage: SkillModelUsage;
  modelCharacters: number | null;
  context: ComposedSkillContext | null;
}

export function createSkillExecutionTimingTrace(routingLatencyMs: number | null = null): SkillExecutionTimingTrace {
  return {
    routingLatencyMs,
    contextCompositionLatencyMs: null,
    adapterResolutionLatencyMs: null,
    canonicalOperationLatencyMs: null,
    presentationLatencyMs: null,
    modelLatencyMs: null,
    modelUsage: 'NONE',
    modelCharacters: null,
    context: null,
  };
}

export function skillLatencyBand(valueMs: number | null): SkillLatencyBand {
  if (valueMs == null || !Number.isFinite(valueMs) || valueMs < 0) return 'NOT_MEASURED';
  if (valueMs < 25) return 'LT_25_MS';
  if (valueMs < 100) return 'LT_100_MS';
  if (valueMs < 500) return 'LT_500_MS';
  if (valueMs < 1_000) return 'LT_1_S';
  if (valueMs < 5_000) return 'LT_5_S';
  return 'GTE_5_S';
}

export function skillConfidenceBand(value: number | null): SkillConfidenceBand {
  if (value == null || !Number.isFinite(value)) return 'NOT_AVAILABLE';
  if (value < 0.5) return 'LOW';
  if (value < 0.8) return 'MEDIUM';
  return 'HIGH';
}

function modelCostBand(usage: SkillModelUsage, characters: number | null): SkillModelCostBand {
  if (usage === 'NONE') return 'NONE';
  if (characters == null) return 'UNKNOWN';
  if (characters < 4_000) return 'LOW';
  if (characters < 16_000) return 'MEDIUM';
  return 'HIGH';
}

export function buildSkillExecutionTelemetry(input: {
  routing: HierarchicalSkillRoutingDecision;
  binding: SkillExecutionBinding | null;
  operationId: AskOperationId | null;
  operationVersion: string | null;
  executionMode: AskExecutionMode | 'CLARIFICATION';
  effectiveRiskPolicy: SkillRiskPolicy | null;
  resultStatus: string;
  errorCode: string | null;
  totalLatencyMs: number;
  trace: SkillExecutionTimingTrace;
}): Record<string, unknown> {
  const providerStatuses = input.trace.context?.entries.map((entry) => ({
    id: entry.provenance?.providerId ?? entry.key.split('@')[0],
    version: entry.provenance?.providerVersion ?? entry.key.split('@')[1] ?? 'unknown',
    status: entry.status,
    latencyBand: skillLatencyBand(entry.latencyMs),
  })) ?? [];
  return {
    schemaVersion: '1.0.0',
    skillId: input.binding?.skill.id ?? input.routing.selectedSkill?.id ?? null,
    skillVersion: input.binding?.skill.version ?? input.routing.selectedSkill?.version ?? null,
    operationId: input.operationId,
    operationVersion: input.operationVersion,
    consumer: input.binding?.consumer ?? 'ASK',
    routingPath: input.routing.path,
    skillConfidenceBand: skillConfidenceBand(input.routing.skillConfidence),
    operationConfidenceBand: skillConfidenceBand(input.routing.operationConfidence),
    routingReasonCodes: input.routing.routingReasonCodes,
    clarificationReason: input.routing.clarificationReason,
    contextProviders: providerStatuses,
    dependencyStatus: input.binding?.dependencyActivation.status ?? 'NOT_APPLICABLE',
    effectiveRiskPolicy: input.effectiveRiskPolicy,
    executionMode: input.executionMode,
    routingLatencyBand: skillLatencyBand(input.trace.routingLatencyMs),
    contextCompositionLatencyBand: skillLatencyBand(input.trace.contextCompositionLatencyMs),
    providerLatencyBands: providerStatuses.map(({ id, version, latencyBand }) => ({ id, version, latencyBand })),
    adapterLatencyBand: skillLatencyBand(input.trace.adapterResolutionLatencyMs),
    canonicalOperationLatencyBand: skillLatencyBand(input.trace.canonicalOperationLatencyMs),
    presentationLatencyBand: skillLatencyBand(input.trace.presentationLatencyMs),
    totalLatencyBand: skillLatencyBand(input.totalLatencyMs),
    modelUsage: input.trace.modelUsage,
    modelLatencyBand: skillLatencyBand(input.trace.modelLatencyMs),
    modelCostBand: modelCostBand(input.trace.modelUsage, input.trace.modelCharacters),
    resultStatus: input.resultStatus,
    errorCode: input.errorCode,
  };
}

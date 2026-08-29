// apps/backend/src/services/agents/agentLlmPurpose.contract.ts
//
// §7.3.9 / §7.3.11: the CLOSED set of purposes an agent may invoke a governed
// LLM for, and the structured-output contract for each. The v1 HVAC Specialist
// runs fully deterministic — the single purpose here is dormant behind
// AGENT_HVAC_NARRATION_LLM_ENABLED (default off). When enabled, the LLM may
// only REORDER / OMIT registered typed claims and may never introduce text or
// a quantitative fact; narrateTypedClaims validates that and falls back to the
// deterministic set on any violation. No second provider is added.

import type { AgentTypedClaim, PendingLlmInvocation } from './agentRuntime.contract';
import { executeGovernedAIRequest } from '../ai/aiRequestGovernance.service';
import { sourceRegistryEntry } from '../intelligence/sourceRegistry';

export const AGENT_LLM_PURPOSES = ['HVAC_TYPED_CLAIM_NARRATION'] as const;
export type AgentLlmPurpose = (typeof AGENT_LLM_PURPOSES)[number];

export interface AgentLlmPurposeContract {
  purpose: AgentLlmPurpose;
  /** Governed AI route id — registered only when a real model is wired. */
  routeId: string;
  modelTier: 'FAST' | 'ADVANCED';
  maxOutputClaims: number;
  featureFlag: string;
  killSwitch: string;
}

export const AGENT_LLM_PURPOSE_CONTRACTS: Readonly<Record<AgentLlmPurpose, AgentLlmPurposeContract>> = Object.freeze({
  HVAC_TYPED_CLAIM_NARRATION: {
    purpose: 'HVAC_TYPED_CLAIM_NARRATION',
    routeId: 'ai:agent-hvac-typed-claim-narration',
    modelTier: 'FAST',
    maxOutputClaims: 6,
    featureFlag: 'AGENT_HVAC_NARRATION_LLM_ENABLED',
    killSwitch: 'AGENT_HVAC_NARRATION_LLM_KILL_SWITCH',
  },
});

export function validateAgentLlmPurposeContracts(): string[] {
  return Object.values(AGENT_LLM_PURPOSE_CONTRACTS).flatMap((contract) => {
    const issues: string[] = [];
    const source = sourceRegistryEntry(contract.routeId);
    if (!source || source.kind !== 'AI') issues.push(`${contract.purpose}: governed AI route ${contract.routeId} is not registered`);
    if (!contract.featureFlag.endsWith('_ENABLED')) issues.push(`${contract.purpose}: invalid feature flag`);
    if (!contract.killSwitch.endsWith('_KILL_SWITCH')) issues.push(`${contract.purpose}: invalid kill switch`);
    if (!Number.isInteger(contract.maxOutputClaims) || contract.maxOutputClaims < 1) issues.push(`${contract.purpose}: invalid output cap`);
    return issues;
  });
}

function narrationEnabled(env: NodeJS.ProcessEnv): boolean {
  const c = AGENT_LLM_PURPOSE_CONTRACTS.HVAC_TYPED_CLAIM_NARRATION;
  const on = (env[c.featureFlag] ?? '').trim().toLowerCase();
  const off = (env[c.killSwitch] ?? '').trim().toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(on) && !['1', 'true', 'on', 'yes'].includes(off);
}

export interface NarrationProvider {
  modelId: string;
  policyId?: string;
  /** Upper bound used to reject a call before it can exceed the definition budget. */
  maxCostUsd: number;
  /** Test seam; production providers use the shared governance executor. */
  executeGovernedRequest?: typeof executeGovernedAIRequest;
  /** Returns a permitted re-selection of the given claims (subset, any order). */
  narrate(claims: readonly AgentTypedClaim[]): Promise<{
    claims: AgentTypedClaim[];
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
}

/**
 * The single EXPLAIN entry point. Deterministic claims are authoritative; the
 * provider (when enabled) may only return a subset/reorder. Any claim not in
 * the deterministic set, or any count over the cap, discards the LLM result.
 */
export async function narrateTypedClaims(
  deterministic: readonly AgentTypedClaim[],
  options: { provider?: NarrationProvider; env?: NodeJS.ProcessEnv; sequence?: number } = {},
): Promise<{ claims: AgentTypedClaim[]; usedLlm: boolean; invocation: PendingLlmInvocation | null; costUsd: number }> {
  const env = options.env ?? process.env;
  if (!options.provider || !narrationEnabled(env) || deterministic.length === 0) {
    return { claims: [...deterministic], usedLlm: false, invocation: null, costUsd: 0 };
  }
  const allowed = new Map(deterministic.map((claim) => [claim.claimId, claim]));
  const cap = AGENT_LLM_PURPOSE_CONTRACTS.HVAC_TYPED_CLAIM_NARRATION.maxOutputClaims;
  const startedAt = new Date();
  try {
    const contract = AGENT_LLM_PURPOSE_CONTRACTS.HVAC_TYPED_CLAIM_NARRATION;
    const execute = options.provider.executeGovernedRequest ?? executeGovernedAIRequest;
    const result = await execute({
      routeId: contract.routeId,
      model: options.provider.modelId,
      structuredOutputRequired: true,
      structuredOutputConfigured: true,
      maxAttempts: 1,
      env,
      work: () => options.provider!.narrate(deterministic),
    });
    const valid = result.claims.filter((claim) => allowed.has(claim.claimId)).map((claim) => allowed.get(claim.claimId)!);
    const accepted = valid.length > 0 && valid.length <= cap && valid.length <= deterministic.length;
    const finishedAt = new Date();
    const invocation: PendingLlmInvocation = {
      sequence: options.sequence ?? 0,
      purpose: 'HVAC_TYPED_CLAIM_NARRATION',
      modelId: options.provider.modelId,
      policyId: options.provider.policyId ?? null,
      prompt: { claimIds: deterministic.map((claim) => claim.claimId) },
      response: { claimIds: result.claims.map((claim) => claim.claimId) },
      typedClaimIds: (accepted ? valid : deterministic).map((claim) => claim.claimId),
      inputTokens: Math.max(0, result.inputTokens),
      outputTokens: Math.max(0, result.outputTokens),
      costUsd: Math.max(0, result.costUsd),
      outcome: accepted ? 'OK' : 'REJECTED',
      errorCode: accepted ? null : 'INVALID_TYPED_CLAIMS',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
    if (!accepted) {
      return { claims: [...deterministic], usedLlm: true, invocation, costUsd: invocation.costUsd };
    }
    return { claims: valid, usedLlm: true, invocation, costUsd: invocation.costUsd };
  } catch (error) {
    const finishedAt = new Date();
    return {
      claims: [...deterministic],
      usedLlm: true,
      costUsd: 0,
      invocation: {
        sequence: options.sequence ?? 0,
        purpose: 'HVAC_TYPED_CLAIM_NARRATION',
        modelId: options.provider.modelId,
        policyId: options.provider.policyId ?? null,
        prompt: { claimIds: deterministic.map((claim) => claim.claimId) },
        typedClaimIds: deterministic.map((claim) => claim.claimId),
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        outcome: 'FAILED',
        errorCode: error instanceof Error ? error.name.slice(0, 100) : 'NARRATION_FAILED',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      },
    };
  }
}

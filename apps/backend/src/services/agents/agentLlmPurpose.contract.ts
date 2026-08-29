// apps/backend/src/services/agents/agentLlmPurpose.contract.ts
//
// §7.3.9 / §7.3.11: the CLOSED set of purposes an agent may invoke a governed
// LLM for, and the structured-output contract for each. The v1 HVAC Specialist
// runs fully deterministic — the single purpose here is dormant behind
// AGENT_HVAC_NARRATION_LLM_ENABLED (default off). When enabled, the LLM may
// only REORDER / OMIT registered typed claims and may never introduce text or
// a quantitative fact; narrateTypedClaims validates that and falls back to the
// deterministic set on any violation. No second provider is added.

import type { AgentTypedClaim } from './agentRuntime.contract';

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
    routeId: 'agent.hvac.typed-claim-narration',
    modelTier: 'FAST',
    maxOutputClaims: 6,
    featureFlag: 'AGENT_HVAC_NARRATION_LLM_ENABLED',
    killSwitch: 'AGENT_HVAC_NARRATION_LLM_KILL_SWITCH',
  },
});

function narrationEnabled(env: NodeJS.ProcessEnv): boolean {
  const c = AGENT_LLM_PURPOSE_CONTRACTS.HVAC_TYPED_CLAIM_NARRATION;
  const on = (env[c.featureFlag] ?? '').trim().toLowerCase();
  const off = (env[c.killSwitch] ?? '').trim().toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(on) && !['1', 'true', 'on', 'yes'].includes(off);
}

export interface NarrationProvider {
  /** Returns a permitted re-selection of the given claims (subset, any order). */
  narrate(claims: readonly AgentTypedClaim[]): Promise<AgentTypedClaim[]>;
}

/**
 * The single EXPLAIN entry point. Deterministic claims are authoritative; the
 * provider (when enabled) may only return a subset/reorder. Any claim not in
 * the deterministic set, or any count over the cap, discards the LLM result.
 */
export async function narrateTypedClaims(
  deterministic: readonly AgentTypedClaim[],
  options: { provider?: NarrationProvider; env?: NodeJS.ProcessEnv } = {},
): Promise<{ claims: AgentTypedClaim[]; usedLlm: boolean }> {
  const env = options.env ?? process.env;
  if (!options.provider || !narrationEnabled(env) || deterministic.length === 0) {
    return { claims: [...deterministic], usedLlm: false };
  }
  const allowed = new Map(deterministic.map((claim) => [claim.claimId, claim]));
  const cap = AGENT_LLM_PURPOSE_CONTRACTS.HVAC_TYPED_CLAIM_NARRATION.maxOutputClaims;
  try {
    const proposed = await options.provider.narrate(deterministic);
    const valid = proposed.filter((claim) => allowed.has(claim.claimId)).map((claim) => allowed.get(claim.claimId)!);
    if (!valid.length || valid.length > cap || valid.length > deterministic.length) {
      return { claims: [...deterministic], usedLlm: false };
    }
    return { claims: valid, usedLlm: true };
  } catch {
    return { claims: [...deterministic], usedLlm: false };
  }
}

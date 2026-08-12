// DecisionContextContract registry — Ask Intelligence FRD §12.
// The composer assembles declared inputs; it does not calculate the
// decision, choose providers, or expand access (§12.1). Only the HVAC
// repair/replace contract exists in the first release (§12.3).

import type { DecisionContextContract } from '../../productFramework/decisionPlatform/decisionPlatform.contract';
import { DECISION_PREFERENCE_DEFINITIONS } from './decisionPreferenceRegistry';

export type DecisionContextContractId = 'HVAC_REPAIR_REPLACE';

const contract = (overrides: DecisionContextContract): DecisionContextContract => overrides;

export const DECISION_CONTEXT_CONTRACTS: Readonly<Record<DecisionContextContractId, DecisionContextContract>> = Object.freeze({
  // FRD §12.3: canonical HVAC identity/age/condition/repair history,
  // registered current/scenario quote, warranty applicability, confirmed
  // ownership horizon, registered replacement cost range and freshness, and
  // explicit technician-assessment absence as a limitation. Insurance,
  // rebates, financing, energy savings, and resale effects are explicitly
  // excluded until their own enhancer contracts and professional boundaries
  // are approved.
  HVAC_REPAIR_REPLACE: contract({
    decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
    version: '1.0',
    primaryDomain: 'HVAC',
    requiredFactDefinitions: [
      'HVAC_IDENTITY',
      'HVAC_AGE_OR_RANGE',
      'HVAC_CONDITION',
      'HVAC_REPAIR_HISTORY',
      'HVAC_WARRANTY_APPLICABILITY',
    ],
    optionalEnhancerDefinitions: [
      'HVAC_CURRENT_QUOTE',
      'HVAC_SCENARIO_QUOTE',
      'HVAC_REPLACEMENT_COST_RANGE',
    ],
    allowedPreferenceDefinitions: [
      DECISION_PREFERENCE_DEFINITIONS.OWNERSHIP_HORIZON.key,
      DECISION_PREFERENCE_DEFINITIONS.REPAIR_REPLACE_APPROACH.key,
      DECISION_PREFERENCE_DEFINITIONS.DECISION_DETAIL_LEVEL.key,
    ],
    allowedScenarioInputDefinitions: ['HVAC_REPLACEMENT_QUOTE_ASSUMPTION'],
    professionalBoundaryCode: 'NOT_A_TECHNICIAN_ASSESSMENT',
    maximumFacts: 10,
    maximumSerializedBytes: 32_768,
    // FRD §24.1: "context composition before canonical engine execution:
    // p95 <500 ms for the first slice." requiredFactLatencyMs +
    // maximumEnhancerLatencyMs leaves headroom under overallLatencyMs for
    // the canonical engine call itself. Both are enforced by
    // decisionContextEnhancer.ts's withEnhancerTimeout (Phase 8C) — not
    // just declared metadata.
    requiredFactLatencyMs: 300,
    maximumEnhancerLatencyMs: 200,
    overallLatencyMs: 500,
    staleInputPolicy: 'MARK_STALE_AND_DISCLOSE',
    missingInputPolicy: 'DEGRADE_WITH_LIMITATION_CODE',
    conflictPolicy: 'FAIL_CLOSED_REQUIRE_CLARIFICATION',
    redactionPolicy: 'ROLE_AND_VISIBILITY_AWARE',
    outputSchemaVersion: '1.0',
  }),
});

export function getDecisionContextContract(id: DecisionContextContractId): DecisionContextContract {
  return DECISION_CONTEXT_CONTRACTS[id];
}

export function validateDecisionContextContracts(): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const knownPreferenceKeys = new Set(Object.keys(DECISION_PREFERENCE_DEFINITIONS));
  for (const [mapKey, entry] of Object.entries(DECISION_CONTEXT_CONTRACTS)) {
    if (mapKey !== entry.decisionDefinitionId) issues.push(`${mapKey}: decisionDefinitionId mismatch`);
    if (ids.has(entry.decisionDefinitionId)) issues.push(`${mapKey}: duplicate decisionDefinitionId`);
    ids.add(entry.decisionDefinitionId);
    if (!entry.requiredFactDefinitions.length) issues.push(`${mapKey}: no required fact definitions`);
    if (entry.maximumFacts < entry.requiredFactDefinitions.length) {
      issues.push(`${mapKey}: maximumFacts is lower than the declared required fact count`);
    }
    for (const preferenceKey of entry.allowedPreferenceDefinitions) {
      if (!knownPreferenceKeys.has(preferenceKey)) {
        issues.push(`${mapKey}: allowedPreferenceDefinitions references unknown preference key "${preferenceKey}"`);
      }
    }
    if (entry.overallLatencyMs <= 0 || entry.maximumEnhancerLatencyMs <= 0 || entry.requiredFactLatencyMs <= 0) {
      issues.push(`${mapKey}: latency budgets must be positive`);
    }
    if (entry.maximumEnhancerLatencyMs > entry.overallLatencyMs) {
      issues.push(`${mapKey}: an optional enhancer's latency budget exceeds the overall operation deadline`);
    }
    if (entry.requiredFactLatencyMs + entry.maximumEnhancerLatencyMs > entry.overallLatencyMs) {
      issues.push(`${mapKey}: required-fact and enhancer latency budgets together exceed the overall operation deadline`);
    }
  }
  return issues;
}

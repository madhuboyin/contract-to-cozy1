// Decision-family catalog — the decisionDefinitionId values referenced by
// DecisionThread.decisionDefinitionId (FRD §10.1) and Scenario.definitionId
// (FRD §13.1). Code-based, no kill switch: per
// docs/product/decision-platform/adr-0001-ownership-and-scope.md there are
// no real users yet, so a runtime pause mechanism is not required for this
// phase. Only the certified first slice (FRD §10.5) is registered.

import type { DecisionDefinition } from '../../productFramework/decisionPlatform/decisionPlatform.contract';
import { DECISION_CONTEXT_CONTRACTS } from './decisionContextContracts';
import { DECISION_PREFERENCE_DEFINITIONS } from './decisionPreferenceRegistry';

export type DecisionDefinitionId = 'HVAC_REPAIR_REPLACE';

const decisionDefinition = (overrides: DecisionDefinition): DecisionDefinition => overrides;

export const DECISION_DEFINITIONS: Readonly<Record<DecisionDefinitionId, DecisionDefinition>> = Object.freeze({
  HVAC_REPAIR_REPLACE: decisionDefinition({
    decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
    version: '1.0',
    primaryDomain: 'HVAC',
    title: 'Repair or replace this HVAC system',
    contextContractId: DECISION_CONTEXT_CONTRACTS.HVAC_REPAIR_REPLACE.decisionDefinitionId,
    allowedPreferenceDefinitionIds: [
      DECISION_PREFERENCE_DEFINITIONS.OWNERSHIP_HORIZON.key,
      DECISION_PREFERENCE_DEFINITIONS.REPAIR_REPLACE_APPROACH.key,
      DECISION_PREFERENCE_DEFINITIONS.DECISION_DETAIL_LEVEL.key,
    ],
    professionalBoundaryCode: 'NOT_A_TECHNICIAN_ASSESSMENT',
    evalSuite: 'decision-platform-hvac-repair-replace-golden',
  }),
});

export function getDecisionDefinition(id: DecisionDefinitionId): DecisionDefinition {
  return DECISION_DEFINITIONS[id];
}

export function validateDecisionDefinitionRegistry(): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const knownContextContractIds = new Set(Object.keys(DECISION_CONTEXT_CONTRACTS));
  const knownPreferenceKeys = new Set(Object.keys(DECISION_PREFERENCE_DEFINITIONS));
  for (const [mapKey, entry] of Object.entries(DECISION_DEFINITIONS)) {
    if (mapKey !== entry.decisionDefinitionId) issues.push(`${mapKey}: decisionDefinitionId mismatch`);
    if (ids.has(entry.decisionDefinitionId)) issues.push(`${mapKey}: duplicate decisionDefinitionId`);
    ids.add(entry.decisionDefinitionId);
    if (!entry.evalSuite) issues.push(`${mapKey}: missing evalSuite declaration`);
    if (!knownContextContractIds.has(entry.contextContractId)) {
      issues.push(`${mapKey}: contextContractId "${entry.contextContractId}" is not a registered DecisionContextContract`);
    }
    for (const preferenceKey of entry.allowedPreferenceDefinitionIds) {
      if (!knownPreferenceKeys.has(preferenceKey)) {
        issues.push(`${mapKey}: allowedPreferenceDefinitionIds references unknown preference key "${preferenceKey}"`);
      }
    }
  }
  return issues;
}

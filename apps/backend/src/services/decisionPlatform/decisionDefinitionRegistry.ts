// Decision-family catalog — the decisionDefinitionId values referenced by
// DecisionThread.decisionDefinitionId (FRD §10.1) and Scenario.definitionId
// (FRD §13.1). Code-based, no kill switch: per
// docs/product/decision-platform/adr-0001-ownership-and-scope.md there are
// no real users yet, so a runtime pause mechanism is not required for this
// phase. Only the certified first slice (FRD §10.5) is registered.

import type { DecisionDefinition } from '../../productFramework/decisionPlatform/decisionPlatform.contract';
import { DECISION_CONTEXT_CONTRACTS } from './decisionContextContracts';
import { DECISION_PREFERENCE_DEFINITIONS } from './decisionPreferenceRegistry';

export type DecisionDefinitionId =
  | 'HVAC_REPAIR_REPLACE'
  | 'REFINANCE_OPPORTUNITY'
  | 'HOME_CAPITAL_TIMELINE_WINDOW'
  | 'OWNERSHIP_COST_CHANGE'
  | 'SAVINGS_BENEFIT_MATCH'
  | 'COVERAGE_QUESTION'
  | 'SELL_HOLD_RENT'
  // C2C Intelligence & Agentic Evolution Phase 4A (architecture §12.7):
  // non-HVAC repair-or-replace. HVAC keeps HVAC_REPAIR_REPLACE unchanged —
  // its own engine, context contract, and professional boundary. This
  // family snapshots the already-authoritative non-HVAC
  // ReplaceRepairAnalysis (applianceDecisionFamilyAdapter.ts).
  | 'APPLIANCE_REPAIR_REPLACE';

const decisionDefinition = (overrides: DecisionDefinition): DecisionDefinition => overrides;

// Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
// delivery step 6: these five wrap an already-authoritative, already-
// persisted domain evaluation (snapshotDecisionFamilyAdapter.ts) rather
// than composing a fresh recommendation from Property Context facts, so
// they carry no allowedPreferenceDefinitionIds — none of these domains has
// a registered DecisionPreferenceDefinition yet.
const snapshotDefinition = (
  id: Exclude<DecisionDefinitionId, 'HVAC_REPAIR_REPLACE'>,
  title: string,
): DecisionDefinition => decisionDefinition({
  decisionDefinitionId: id,
  version: '1.0',
  primaryDomain: id,
  title,
  contextContractId: id,
  allowedPreferenceDefinitionIds: [],
  professionalBoundaryCode: null,
  evalSuite: `decision-platform-${id.toLowerCase().replace(/_/g, '-')}-golden`,
});

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
  REFINANCE_OPPORTUNITY: snapshotDefinition('REFINANCE_OPPORTUNITY', 'Explore this refinance opportunity'),
  HOME_CAPITAL_TIMELINE_WINDOW: snapshotDefinition('HOME_CAPITAL_TIMELINE_WINDOW', 'Plan for this capital timeline window'),
  OWNERSHIP_COST_CHANGE: snapshotDefinition('OWNERSHIP_COST_CHANGE', 'Review this ownership cost change'),
  SAVINGS_BENEFIT_MATCH: snapshotDefinition('SAVINGS_BENEFIT_MATCH', 'Pursue this savings or benefits match'),
  COVERAGE_QUESTION: snapshotDefinition('COVERAGE_QUESTION', 'Resolve this coverage question'),
  SELL_HOLD_RENT: snapshotDefinition('SELL_HOLD_RENT', 'Sell, hold, or rent this property'),
  APPLIANCE_REPAIR_REPLACE: snapshotDefinition('APPLIANCE_REPAIR_REPLACE', 'Repair or replace this appliance'),
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

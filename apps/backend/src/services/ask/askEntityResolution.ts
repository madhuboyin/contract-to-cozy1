import type { AskOperationId } from './askOperationRegistry';
import type { AskConfidenceBand } from './askTrust.contract';
import { ASK_ENTITY_CALIBRATION_VERSION, calibrateAskEntityConfidence, type AskEntityEvidenceSignal } from './askEntityCalibrationEvidence';

export type AskEntityType = 'PROPERTY' | 'MAINTENANCE_TASK' | 'INVENTORY_ITEM' | 'QUOTE' | 'DECISION_THREAD';
export type AskEntityResolutionOutcome = 'NOT_REQUIRED' | 'RESOLVED' | 'MENTION_ONLY' | 'MISSING' | 'AMBIGUOUS';

export interface AskResolvedEntityMention {
  type: AskEntityType;
  originalText: string;
  canonicalCandidateId?: string;
  confidenceBand: AskConfidenceBand;
}

export interface AskEntityResolutionResult {
  schemaVersion: '1.0';
  outcome: AskEntityResolutionOutcome;
  confidenceBand: AskConfidenceBand | null;
  entities: AskResolvedEntityMention[];
  missingSlots: string[];
  reasonCodes: string[];
  resolverVersion: string;
}

export const ASK_ENTITY_RESOLVER_VERSION = `bounded-entity-resolution-2.0:${ASK_ENTITY_CALIBRATION_VERSION}`;

function entityBand(signal: AskEntityEvidenceSignal): AskConfidenceBand {
  return calibrateAskEntityConfidence(signal).band;
}

const TARGET_ENTITY: Partial<Record<AskOperationId, AskEntityType>> = {
  MAINTENANCE_TASK_COMPLETE: 'MAINTENANCE_TASK',
  MAINTENANCE_TASK_UPDATE: 'MAINTENANCE_TASK',
  INVENTORY_LOOKUP: 'INVENTORY_ITEM',
  REPLACEMENT_GUIDANCE: 'INVENTORY_ITEM',
  QUOTE_COMPARISON_REVIEW: 'QUOTE',
  HVAC_DECISION_CONTINUE: 'DECISION_THREAD',
  HVAC_DECISION_SCENARIO: 'DECISION_THREAD',
  HVAC_DECISION_ABANDON: 'DECISION_THREAD',
  HVAC_PREFERENCE_SAVE: 'DECISION_THREAD',
  HVAC_PREFERENCE_FORGET: 'DECISION_THREAD',
  HVAC_DECISION_OUTCOME_REPORT: 'DECISION_THREAD',
  HVAC_DECISION_OUTCOME_VIEW: 'DECISION_THREAD',
  HVAC_DECISION_OUTCOME_UNLINK: 'DECISION_THREAD',
};

const ENTITY_PATTERNS: Readonly<Record<Exclude<AskEntityType, 'PROPERTY'>, RegExp>> = Object.freeze({
  MAINTENANCE_TASK: /\b(?:the\s+)?((?:gutter|filter|roof|furnace|boiler|hvac|water heater|inspection|service|cleaning|repair)[\w -]{0,45}(?:task|job|work|service|inspection|cleaning|repair)?)\b/i,
  INVENTORY_ITEM: /\b((?:my |the |this )?(?:refrigerator|fridge|washer|dryer|dishwasher|water heater|roof|boiler|furnace|heat pump|air conditioner|hvac system|appliance|equipment))\b/i,
  QUOTE: /\b((?:this |the |my |new |contractor )?(?:quote|bid|proposal|estimate)(?:\s+[\w-]+){0,3})\b/i,
  DECISION_THREAD: /\b((?:my |the |this |active )?(?:hvac|furnace|heater|heating-system|air-conditioner|heat-pump)?\s*(?:repair-or-replace )?decision)\b/i,
});

export function requiredAskTargetEntity(operationId: AskOperationId): AskEntityType | null {
  return TARGET_ENTITY[operationId] ?? null;
}

export function resolveAskEntityState(input: {
  message: string;
  operationId: AskOperationId;
  propertyId?: string | null;
  launchEntityId?: string | null;
  requiresProperty?: boolean;
}): AskEntityResolutionResult {
  const target = requiredAskTargetEntity(input.operationId);
  const entities: AskResolvedEntityMention[] = [];
  const missingSlots: string[] = [];
  if (input.propertyId) entities.push({ type: 'PROPERTY', originalText: 'selected property', canonicalCandidateId: input.propertyId, confidenceBand: entityBand('AUTHORIZED_PROPERTY') });
  if (!target) {
    const propertyMissing = input.requiresProperty !== false && !input.propertyId;
    if (propertyMissing) missingSlots.push('propertyId');
    return {
      schemaVersion: '1.0', outcome: propertyMissing ? 'MISSING' : 'NOT_REQUIRED',
      confidenceBand: propertyMissing ? entityBand('MISSING_ENTITY') : input.propertyId ? entityBand('AUTHORIZED_PROPERTY') : null, entities, missingSlots,
      reasonCodes: [propertyMissing ? 'PROPERTY_CONTEXT_REQUIRED' : input.propertyId ? 'AUTHORIZED_PROPERTY_CONTEXT' : 'OPERATION_HAS_NO_ENTITY_REQUIREMENT'],
      resolverVersion: ASK_ENTITY_RESOLVER_VERSION,
    };
  }
  if (input.launchEntityId) {
    const confidenceBand = entityBand('TRUSTED_LAUNCH_ENTITY');
    entities.push({ type: target, originalText: 'trusted launch entity', canonicalCandidateId: input.launchEntityId, confidenceBand });
    return { schemaVersion: '1.0', outcome: 'RESOLVED', confidenceBand, entities, missingSlots, reasonCodes: ['TRUSTED_LAUNCH_ENTITY'], resolverVersion: ASK_ENTITY_RESOLVER_VERSION };
  }
  const match = input.message.match(ENTITY_PATTERNS[target as Exclude<AskEntityType, 'PROPERTY'>]);
  if (match?.[1]) {
    const confidenceBand = entityBand('UNRESOLVED_MENTION');
    entities.push({ type: target, originalText: match[1].trim(), confidenceBand });
    return {
      schemaVersion: '1.0', outcome: 'MENTION_ONLY', confidenceBand, entities, missingSlots: [`${target.toLowerCase()}Id`],
      reasonCodes: ['ENTITY_MENTION_REQUIRES_AUTHORIZED_LOOKUP'], resolverVersion: ASK_ENTITY_RESOLVER_VERSION,
    };
  }
  const ambiguous = /\b(?:it|that|this one|the one|them|those)\b/i.test(input.message);
  const confidenceBand = entityBand(ambiguous ? 'AMBIGUOUS_REFERENCE' : 'MISSING_ENTITY');
  return {
    schemaVersion: '1.0', outcome: ambiguous ? 'AMBIGUOUS' : 'MISSING', confidenceBand, entities,
    missingSlots: [`${target.toLowerCase()}Id`],
    reasonCodes: [ambiguous ? 'ENTITY_REFERENCE_AMBIGUOUS' : 'ENTITY_REQUIRED'], resolverVersion: ASK_ENTITY_RESOLVER_VERSION,
  };
}

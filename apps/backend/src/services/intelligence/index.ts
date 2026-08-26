import { canonicalCapabilityRegistry } from '../../productFramework/capabilities/canonicalCapabilityRegistry';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../ask/askOperationRegistry';
import { getSkillForOperation, type SkillId } from '../skills/skillRegistry';
import { listGuidanceTemplates } from '../guidanceEngine/guidanceTemplateRegistry';
import { validateIntelligenceConsumerRegistry } from './intelligenceConsumerRegistry.contract';
import { INTELLIGENCE_CONSUMER_REGISTRY } from './intelligenceConsumerRegistry';
import { validateHomeActionAdapterOwnership } from './homeActionAdapterOwnership.contract';
import { HOME_ACTION_ADAPTER_OWNERSHIP } from './homeActionAdapterOwnership';
import {
  validateHomeActionProducerOwnership,
  validateHomeActionProducerKindConsistency,
  validateDecisionLineagePolicyReferences,
} from './homeActionProducerOwnership.contract';
import { HOME_ACTION_PRODUCER_OWNERSHIP } from './homeActionProducerOwnership';
import { validateCapabilitySkillGuidanceBridge } from './capabilitySkillGuidanceBridge.contract';
import { CAPABILITY_SKILL_GUIDANCE_BRIDGE } from './capabilitySkillGuidanceBridge.registry';
import { validateCompletionEvidencePolicy, COMPLETION_EVIDENCE_POLICY } from './completionEvidencePolicy.registry';
import { validateCompoundRuleRegistry } from './compoundRuleRegistry.contract';
import { COMPOUND_RULE_REGISTRY } from './compoundRuleRegistry';
import { ATTENTION_PRIORITY_OWNERS, validateAttentionPriorityOwners } from './attentionPriorityOwnership.registry';
import { validateDocumentPromotionAdapterRegistry } from './documentPromotionAdapterRegistry.contract';
import { DOCUMENT_PROMOTION_ADAPTER_REGISTRY } from './documentPromotionAdapterRegistry';
import { validateSkillOperationGovernanceCoverage } from './skillOperationGovernance.contract';
import { INTELLIGENCE_SOURCE_REGISTRY, validateIntelligenceSourceRegistry } from './sourceRegistry';
export * from './extractionEnvelope.contract';

export * from './intelligenceConsumerRegistry.contract';
export * from './intelligenceConsumerRegistry';
export * from './homeActionAdapterOwnership.contract';
export * from './homeActionAdapterOwnership';
export * from './homeActionProducerOwnership.contract';
export * from './homeActionProducerOwnership';
export * from './capabilitySkillGuidanceBridge.contract';
export * from './capabilitySkillGuidanceBridge.registry';
export * from './completionEvidencePolicy.registry';
export * from './compoundRuleRegistry.contract';
export * from './compoundRuleRegistry';
export * from './attentionPriorityOwnership.registry';
export * from './documentPromotionAdapterRegistry.contract';
export * from './documentPromotionAdapterRegistry';
export * from './skillOperationGovernance.contract';
export * from './sourceRegistry';

/**
 * Home Intelligence Functional Completeness FRD Phase 0 work item 6 —
 * startup validation for the registries above, following the exact
 * fail-fast pattern already used for the Ask and Decision Platform
 * registries in apps/backend/src/index.ts.
 */
export function validateIntelligenceRegistries(): string[] {
  const guidanceJourneyTypeKeys = new Set(listGuidanceTemplates().map((template) => template.journeyTypeKey));
  const consumerByKey = new Map(INTELLIGENCE_CONSUMER_REGISTRY.map((entry) => [entry.consumerKey, entry]));
  const sourceConsumerIssues = INTELLIGENCE_SOURCE_REGISTRY.flatMap((source) =>
    (source.recomputeConsumerKeys ?? []).flatMap((consumerKey) => {
      const consumer = consumerByKey.get(consumerKey);
      if (!consumer) return [`${source.sourceId}: unknown recompute consumer ${consumerKey}`];
      if (source.healthEntityType && !(consumer.relevantSourceHealthEntityTypes ?? []).includes(source.healthEntityType)) {
        return [`${source.sourceId}: consumer ${consumerKey} does not subscribe to ${source.healthEntityType}`];
      }
      return [];
    }),
  );

  return [
    ...validateIntelligenceConsumerRegistry(INTELLIGENCE_CONSUMER_REGISTRY),
    ...validateHomeActionAdapterOwnership(HOME_ACTION_ADAPTER_OWNERSHIP),
    ...validateHomeActionProducerOwnership(HOME_ACTION_PRODUCER_OWNERSHIP),
    ...validateHomeActionProducerKindConsistency(HOME_ACTION_PRODUCER_OWNERSHIP, HOME_ACTION_ADAPTER_OWNERSHIP),
    ...validateDecisionLineagePolicyReferences(HOME_ACTION_PRODUCER_OWNERSHIP),
    ...validateCapabilitySkillGuidanceBridge(CAPABILITY_SKILL_GUIDANCE_BRIDGE, {
      capabilityExists: (capabilityId: string) => Boolean(canonicalCapabilityRegistry.getById(capabilityId)),
      operationExists: (operationId: AskOperationId) => operationId in ASK_OPERATION_DEFINITIONS,
      skillCoversOperation: (skillId: SkillId, operationId: AskOperationId) =>
        getSkillForOperation(operationId)?.id === skillId,
      guidanceJourneyTypeKeyExists: (journeyTypeKey: string) => guidanceJourneyTypeKeys.has(journeyTypeKey),
      capabilityIdsRequiringBridge: () => canonicalCapabilityRegistry.capabilities
        .filter((capability) => capability.recommendation.sourceKinds.length > 0)
        .map((capability) => capability.id),
    }),
    ...validateCompletionEvidencePolicy(COMPLETION_EVIDENCE_POLICY),
    ...validateCompoundRuleRegistry(
      COMPOUND_RULE_REGISTRY,
      new Set(HOME_ACTION_PRODUCER_OWNERSHIP.map((entry) => entry.producerId)),
    ),
    ...validateAttentionPriorityOwners(ATTENTION_PRIORITY_OWNERS),
    ...validateDocumentPromotionAdapterRegistry(DOCUMENT_PROMOTION_ADAPTER_REGISTRY),
    ...validateSkillOperationGovernanceCoverage({
      skillCoversOperation: (operationId: AskOperationId) => Boolean(getSkillForOperation(operationId)),
    }),
    ...validateIntelligenceSourceRegistry(INTELLIGENCE_SOURCE_REGISTRY),
    ...sourceConsumerIssues,
  ];
}

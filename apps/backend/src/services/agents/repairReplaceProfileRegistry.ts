import type { InventoryItemCategory } from '../../productFramework/intelligence/entityRef.contract';
import { DECISION_DEFINITIONS } from '../decisionPlatform/decisionDefinitionRegistry';
import { getDecisionFamilyAdapter } from '../decisionPlatform/decisionFamilyAdapterRegistry';
import { getSkillDefinition } from '../skills/skillRegistry';
import { AGENT_EVALUATION_SUITE_REGISTRY } from './agentRegistryValidation';
import {
  REPAIR_REPLACE_PROFILES,
  type RepairReplaceProfile,
} from './repairReplaceProfileCatalog';
export {
  isRepairReplaceProfileEligible,
  REPAIR_REPLACE_PROFILES,
  resolveRepairReplaceProfile,
  type RepairReplaceProfile,
} from './repairReplaceProfileCatalog';

export function validateRepairReplaceProfiles(
  profiles: readonly RepairReplaceProfile[] = REPAIR_REPLACE_PROFILES,
  registeredEvaluationSuites: ReadonlySet<string> = new Set(Object.keys(AGENT_EVALUATION_SUITE_REGISTRY)),
): string[] {
  const issues: string[] = [];
  const profileIds = new Set<string>();
  const categoryOwners = new Map<InventoryItemCategory, string>();
  const lineageOwners = new Map<string, string>();
  for (const profile of profiles) {
    if (profileIds.has(profile.profileId)) issues.push(`RepairReplaceProfileRegistry: duplicate profileId "${profile.profileId}"`);
    profileIds.add(profile.profileId);
    if (!profile.eligibleCategories.length) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" has no eligible categories`);
    if (!profile.lineagePrefixes.length) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" has no lineage prefixes`);
    if (!profile.displayLabel.trim()) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" has no display label`);
    for (const prefix of profile.lineagePrefixes) {
      if (!prefix.trim() || !prefix.endsWith(':')) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" has invalid lineage prefix "${prefix}"`);
      const owner = lineageOwners.get(prefix);
      if (owner) issues.push(`RepairReplaceProfileRegistry: lineage prefix "${prefix}" claimed by both "${owner}" and "${profile.profileId}"`);
      else lineageOwners.set(prefix, profile.profileId);
    }
    for (const category of profile.eligibleCategories) {
      const owner = categoryOwners.get(category);
      if (owner) issues.push(`RepairReplaceProfileRegistry: category "${category}" claimed by both "${owner}" and "${profile.profileId}"`);
      else categoryOwners.set(category, profile.profileId);
    }
    if (!DECISION_DEFINITIONS[profile.decisionDefinitionId] || !getDecisionFamilyAdapter(profile.decisionDefinitionId)) {
      issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" references unregistered decision definition "${profile.decisionDefinitionId}"`);
    }
    if (!getSkillDefinition(profile.scoringSkillId)) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" references unregistered scoring Skill "${profile.scoringSkillId}"`);
    if (!registeredEvaluationSuites.has(profile.evaluationSuiteId)) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" references missing evaluation suite "${profile.evaluationSuiteId}"`);
    if (!profile.requiredFacts.length || !profile.professionalBoundary.trim()) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" is missing context or professional-boundary metadata`);
    const disputeKeys = new Set<string>();
    for (const input of profile.disputableInputs) {
      if (!input.key.trim() || !input.label.trim()) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" has an invalid disputable input`);
      if (disputeKeys.has(input.key)) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" has duplicate disputable input "${input.key}"`);
      disputeKeys.add(input.key);
    }
  }
  return issues;
}

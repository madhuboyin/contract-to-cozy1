import type { InventoryItemCategory } from '../../productFramework/intelligence/entityRef.contract';
import type { PropertyContextScope } from '../../modules/propertyContext/domain/contracts';
import { DECISION_DEFINITIONS, type DecisionDefinitionId } from '../decisionPlatform/decisionDefinitionRegistry';
import { getDecisionFamilyAdapter } from '../decisionPlatform/decisionFamilyAdapterRegistry';
import { getSkillDefinition } from '../skills/skillRegistry';
import { AGENT_EVALUATION_SUITE_REGISTRY } from './agentRegistryValidation';

export interface RepairReplaceProfile {
  profileId: string;
  eligibleCategories: readonly InventoryItemCategory[];
  decisionDefinitionId: DecisionDefinitionId;
  scoringSkillId: string;
  requiredFacts: readonly PropertyContextScope[];
  supportedDocuments: readonly string[];
  professionalBoundary: string;
  evaluationSuiteId: string;
}

export const REPAIR_REPLACE_PROFILES: readonly RepairReplaceProfile[] = Object.freeze([
  Object.freeze({
    profileId: 'HVAC',
    eligibleCategories: Object.freeze(['HVAC'] as const),
    decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
    scoringSkillId: 'repair-replace',
    requiredFacts: Object.freeze(['SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'SAFETY'] as const),
    supportedDocuments: Object.freeze(['hvac-nameplate-photo', 'hvac-technician-assessment', 'hvac-written-estimate']),
    professionalBoundary: 'licensed HVAC technician',
    evaluationSuiteId: 'agent-hvac-repair-replace-eval@1.1.0',
  }),
  Object.freeze({
    profileId: 'GENERIC_APPLIANCE',
    eligibleCategories: Object.freeze(['APPLIANCE'] as const),
    decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE',
    // The existing repair-replace Skill is the registered scoring capability;
    // this profile selects the APPLIANCE Decision Platform adapter, whose
    // authoritative source is ReplaceRepairService output.
    scoringSkillId: 'repair-replace',
    requiredFacts: Object.freeze(['INVENTORY'] as const),
    supportedDocuments: Object.freeze([]),
    professionalBoundary: 'general appliance repair professional',
    evaluationSuiteId: 'agent-generic-appliance-repair-replace-eval@1.0.0',
  }),
]);

export function resolveRepairReplaceProfile(
  category: InventoryItemCategory,
  profiles: readonly RepairReplaceProfile[] = REPAIR_REPLACE_PROFILES,
): RepairReplaceProfile | 'NO_MATCH' | 'AMBIGUOUS' {
  const matches = profiles.filter((profile) => profile.eligibleCategories.includes(category));
  if (matches.length === 0) return 'NO_MATCH';
  if (matches.length > 1) return 'AMBIGUOUS';
  return matches[0];
}

export function validateRepairReplaceProfiles(
  profiles: readonly RepairReplaceProfile[] = REPAIR_REPLACE_PROFILES,
  registeredEvaluationSuites: ReadonlySet<string> = new Set(Object.keys(AGENT_EVALUATION_SUITE_REGISTRY)),
): string[] {
  const issues: string[] = [];
  const profileIds = new Set<string>();
  const categoryOwners = new Map<InventoryItemCategory, string>();
  for (const profile of profiles) {
    if (profileIds.has(profile.profileId)) issues.push(`RepairReplaceProfileRegistry: duplicate profileId "${profile.profileId}"`);
    profileIds.add(profile.profileId);
    if (!profile.eligibleCategories.length) issues.push(`RepairReplaceProfileRegistry: profile "${profile.profileId}" has no eligible categories`);
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
  }
  return issues;
}

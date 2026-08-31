import type { InventoryItemCategory } from '../../productFramework/intelligence/entityRef.contract';
import type { PropertyContextScope } from '../../modules/propertyContext/domain/contracts';
import type { DecisionDefinitionId } from '../decisionPlatform/decisionDefinitionRegistry';
import { isGenericApplianceRepairReplaceEligible } from '../repairReplaceEligibility';

export interface RepairReplaceProfile {
  profileId: string;
  lineagePrefixes: readonly string[];
  displayLabel: string;
  eligibilityPolicy: 'CATEGORY_ONLY' | 'CANONICAL_GENERIC_APPLIANCE';
  eligibleCategories: readonly InventoryItemCategory[];
  decisionDefinitionId: DecisionDefinitionId;
  scoringSkillId: string;
  requiredFacts: readonly PropertyContextScope[];
  supportedDocuments: readonly string[];
  professionalBoundary: string;
  evaluationSuiteId: string;
  disputableInputs: readonly { key: string; label: string }[];
  inventoryCorrectionLabel: string | null;
  enforceLowConfidenceEscalation: boolean;
}

export const REPAIR_REPLACE_PROFILES: readonly RepairReplaceProfile[] = Object.freeze([
  Object.freeze({
    profileId: 'HVAC',
    lineagePrefixes: Object.freeze(['repair-replace:'] as const),
    displayLabel: 'HVAC Repair-or-Replace Specialist',
    eligibilityPolicy: 'CATEGORY_ONLY',
    eligibleCategories: Object.freeze(['HVAC'] as const),
    decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
    scoringSkillId: 'repair-replace',
    requiredFacts: Object.freeze(['SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'SAFETY'] as const),
    supportedDocuments: Object.freeze(['hvac-nameplate-photo', 'hvac-technician-assessment', 'hvac-written-estimate']),
    professionalBoundary: 'licensed HVAC technician',
    evaluationSuiteId: 'agent-hvac-repair-replace-eval@1.1.0',
    disputableInputs: Object.freeze([
      Object.freeze({ key: 'hvac.condition', label: 'System condition' }),
      Object.freeze({ key: 'hvac.installDate', label: 'Install date' }),
      Object.freeze({ key: 'hvac.replacementCost', label: 'Replacement estimate' }),
      Object.freeze({ key: 'hvac.technicianAssessment', label: 'Technician assessment' }),
    ]),
    inventoryCorrectionLabel: null,
    enforceLowConfidenceEscalation: true,
  }),
  Object.freeze({
    profileId: 'GENERIC_APPLIANCE',
    lineagePrefixes: Object.freeze(['appliance-repair-replace:'] as const),
    displayLabel: 'Appliance Repair-or-Replace Specialist',
    eligibilityPolicy: 'CANONICAL_GENERIC_APPLIANCE',
    eligibleCategories: Object.freeze(['APPLIANCE'] as const),
    decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE',
    scoringSkillId: 'repair-replace',
    requiredFacts: Object.freeze(['INVENTORY'] as const),
    supportedDocuments: Object.freeze([]),
    professionalBoundary: 'general appliance repair professional',
    evaluationSuiteId: 'agent-generic-appliance-repair-replace-eval@1.0.0',
    disputableInputs: Object.freeze([
      Object.freeze({ key: 'appliance.condition', label: 'Appliance condition' }),
      Object.freeze({ key: 'appliance.installDate', label: 'Install date' }),
      Object.freeze({ key: 'appliance.replacementCost', label: 'Replacement estimate' }),
      Object.freeze({ key: 'appliance.analysis', label: 'Repair-or-replace analysis' }),
    ]),
    inventoryCorrectionLabel: 'Correct this appliance’s inventory record',
    enforceLowConfidenceEscalation: false,
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

export function isRepairReplaceProfileEligible(
  profile: RepairReplaceProfile,
  item: { category?: InventoryItemCategory | null; name?: string | null } | null | undefined,
): boolean {
  if (!item?.category || !profile.eligibleCategories.includes(item.category)) return false;
  return profile.eligibilityPolicy === 'CANONICAL_GENERIC_APPLIANCE'
    ? isGenericApplianceRepairReplaceEligible({ category: item.category, name: item.name ?? null })
    : true;
}

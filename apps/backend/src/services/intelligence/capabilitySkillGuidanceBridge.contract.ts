import { HOME_ACTION_SOURCE_KINDS, type HomeAction } from '../../productFramework/homeAction.contract';
import type { AskOperationId } from '../ask/askOperationRegistry';
import type { SkillId } from '../skills/skillRegistry';

/**
 * Home Intelligence Functional Completeness FRD §8.8 (HI-SKL-001) — the
 * code-owned bridge from a canonical capability id to the Skill
 * operation(s), Guidance journey template(s), Home Action source kind, and
 * ownership metadata that make it executable from Cozy and eligible for
 * Home Action promotion. HI-SKL-002 requires startup validation to fail
 * when an active capability claims Cozy execution or Home Action
 * integration without these mappings — see validateCapabilitySkillGuidanceBridge,
 * whose completeness check (capabilityIdsRequiringBridge) covers every
 * capability with a non-empty recommendation.sourceKinds. A capability
 * reachable only via an Ask operation (empty sourceKinds, e.g. `maintenance`,
 * `home-records`) has no independent canonical signal marking it "Ask
 * reachable" today — completeness there still depends on this file's own
 * entries being kept current by hand, a documented gap rather than a solved
 * one (see the Phase 0 registry report).
 *
 * guidanceJourneyTypeKeys is deliberately sparse: no formal capability <->
 * guidance-journey linkage exists in the codebase today (guidance journeys
 * are keyed by signalIntentFamilies, not capability id), so entries here
 * only carry a journeyTypeKey where one is independently verifiable. An
 * empty array documents a real, current gap rather than inventing a
 * mapping — see the Phase 0 registry report.
 */
export interface CapabilitySkillGuidanceBridgeEntry {
  capabilityId: string;
  skillIds: readonly SkillId[];
  operationIds: readonly AskOperationId[];
  guidanceJourneyTypeKeys: readonly string[];
  homeActionSourceKind: HomeAction['source']['kind'] | null;
  launchDestination: string;
  requiredContext: readonly string[];
  executionOwner: string;
  completionOwner: string;
  outcomeAdapter: string | null;
}

export interface CapabilitySkillGuidanceBridgeValidationContext {
  capabilityExists: (capabilityId: string) => boolean;
  operationExists: (operationId: AskOperationId) => boolean;
  skillCoversOperation: (skillId: SkillId, operationId: AskOperationId) => boolean;
  guidanceJourneyTypeKeyExists: (journeyTypeKey: string) => boolean;
  /**
   * Capability ids that mechanically claim Home Action integration today —
   * i.e. every capability in canonicalCapabilityRegistry with a non-empty
   * recommendation.sourceKinds, the same field buildEntry already reads to
   * resolve homeActionSourceKind. This is the one signal on
   * ToolCapabilityDefinition that's independently checkable without
   * inventing a new schema field; a capability reachable only via an Ask
   * operation (no sourceKinds) has no such independent signal today and is
   * not covered by this completeness check — see this file's header
   * comment.
   */
  capabilityIdsRequiringBridge: () => readonly string[];
}

export function validateCapabilitySkillGuidanceBridge(
  entries: readonly CapabilitySkillGuidanceBridgeEntry[],
  context: CapabilitySkillGuidanceBridgeValidationContext,
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.capabilityId)) {
      issues.push(`Duplicate capabilitySkillGuidanceBridge entry for capability "${entry.capabilityId}".`);
    }
    seen.add(entry.capabilityId);

    if (!context.capabilityExists(entry.capabilityId)) {
      issues.push(`capabilitySkillGuidanceBridge entry references unknown capability id "${entry.capabilityId}".`);
    }
    if (entry.homeActionSourceKind && !HOME_ACTION_SOURCE_KINDS.includes(entry.homeActionSourceKind)) {
      issues.push(`capabilitySkillGuidanceBridge entry "${entry.capabilityId}" references unknown Home Action source kind "${entry.homeActionSourceKind}".`);
    }
    for (const operationId of entry.operationIds) {
      if (!context.operationExists(operationId)) {
        issues.push(`capabilitySkillGuidanceBridge entry "${entry.capabilityId}" references unknown Ask operation id "${operationId}".`);
      }
    }
    for (const journeyTypeKey of entry.guidanceJourneyTypeKeys) {
      if (!context.guidanceJourneyTypeKeyExists(journeyTypeKey)) {
        issues.push(`capabilitySkillGuidanceBridge entry "${entry.capabilityId}" references unknown guidance journeyTypeKey "${journeyTypeKey}".`);
      }
    }
    for (const skillId of entry.skillIds) {
      const coversAny = entry.operationIds.length === 0 ||
        entry.operationIds.some((operationId) => context.skillCoversOperation(skillId, operationId));
      if (!coversAny) {
        issues.push(`capabilitySkillGuidanceBridge entry "${entry.capabilityId}" declares skill "${skillId}" but it covers none of the entry's operation ids.`);
      }
    }
    if ((entry.operationIds.length > 0 || entry.homeActionSourceKind) && !entry.executionOwner.trim()) {
      issues.push(`capabilitySkillGuidanceBridge entry "${entry.capabilityId}" claims Cozy execution or Home Action integration but declares no executionOwner.`);
    }
  }

  for (const capabilityId of context.capabilityIdsRequiringBridge()) {
    if (!seen.has(capabilityId)) {
      issues.push(`Capability "${capabilityId}" claims Home Action integration (non-empty recommendation.sourceKinds) but has no capabilitySkillGuidanceBridge entry.`);
    }
  }

  return issues;
}

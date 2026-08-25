import { canonicalCapabilityRegistry } from '../../productFramework/capabilities/canonicalCapabilityRegistry';
import type { AskOperationId } from '../ask/askOperationRegistry';
import { getSkillForOperation, type SkillId } from '../skills/skillRegistry';
import { HOME_ACTION_ADAPTER_OWNERSHIP } from './homeActionAdapterOwnership';
import type { CapabilitySkillGuidanceBridgeEntry } from './capabilitySkillGuidanceBridge.contract';

/**
 * Replaces the untyped, unvalidated `ASK_OPERATION_CAPABILITY` map that
 * previously lived inline in askOrchestrator.service.ts (Partial<Record<
 * AskOperationId, string>>, no startup check). Same real operation ->
 * capability pairs — this file is the accurate inventory, not an invented
 * one — now grouped by capability, cross-validated at boot, and with skill
 * coverage, launch destination, required context, and completion ownership
 * derived from existing canonical sources instead of duplicated by hand.
 *
 * guidanceJourneyTypeKeys stays empty for every entry: no real
 * capability <-> guidance-journey linkage exists anywhere in the codebase
 * today (see the Phase 0 registry report). Populating it is HI-SKL
 * work for a later phase.
 */
const OPERATIONS_BY_CAPABILITY: Record<string, readonly AskOperationId[]> = {
  maintenance: ['MAINTENANCE_STATUS', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_COMPLETE', 'MAINTENANCE_TASK_UPDATE', 'HOME_DEADLINE_MONITOR'],
  'coverage-intelligence': ['COVERAGE_GAPS'],
  'savings-benefits': ['SAVINGS_OPPORTUNITIES'],
  'ownership-costs': ['OWNERSHIP_COSTS'],
  'home-records': ['INVENTORY_LOOKUP'],
  'property-brief': ['PROPERTY_SUMMARY', 'MAJOR_EVENT_ENTRY'],
  'home-operations': ['HOME_ACTIONS'],
  'replace-repair': ['REPLACEMENT_GUIDANCE'],
  'mortgage-refinance-radar': ['REFINANCE_ANALYSIS', 'REFINANCE_RATE_MONITOR'],
  'sell-hold-rent': ['SELL_HOLD_RENT_ANALYSIS'],
  'guidance-overview': ['GUIDANCE_JOURNEY_CREATE'],
  'quote-comparison': ['QUOTE_COMPARISON_CREATE', 'QUOTE_COMPARISON_REVIEW'],
  'capital-timeline': ['CAPITAL_RESERVE_PLAN'],
  'property-tax': ['PROPERTY_TAX_APPEAL_READINESS'],
  'home-renovation-risk-advisor': ['RENOVATION_PERMIT_READINESS'],
  'buyer-closing': [
    'BUYER_PLAN_STATUS', 'BUYER_DEADLINES', 'BUYER_DOCUMENT_READINESS', 'BUYER_INSPECTION_REVIEW',
    'BUYER_TASK_COMPLETE', 'BUYER_TASK_CREATE', 'BUYER_TASK_UPDATE', 'BUYER_MOVE_STATUS',
    'BUYER_FINANCING_READINESS', 'BUYER_TITLE_ESCROW_READINESS', 'BUYER_WALKTHROUGH_READINESS',
    'BUYER_DISCLOSURE_FUNDS_READINESS', 'BUYER_CLOSING_DAY_READINESS', 'BUYER_CONTRACT_TIMELINE',
    'BUYER_NEGOTIATION_READINESS', 'BUYER_COST_READINESS', 'BUYER_FINDING_DISPOSITION', 'BUYER_LIFECYCLE_UPDATE',
  ],
  claims: ['INCIDENT_CLAIM_STATUS'],
};

/**
 * Capabilities that claim Home Action integration (non-empty
 * recommendation.sourceKinds in canonicalCapabilityRegistry) but have no
 * known Ask operation mapping — added so the completeness check in
 * capabilitySkillGuidanceBridge.contract.ts (capabilityIdsRequiringBridge)
 * has an entry to find for every one of them, not just the 15 originally
 * hand-picked ones. Built the same way as OPERATIONS_BY_CAPABILITY's
 * entries via buildEntry, just with an empty operationIds list — a
 * capability can legitimately integrate with Home Action without being
 * Ask-reachable.
 */
const HOME_ACTION_ONLY_CAPABILITY_IDS: readonly string[] = [
  'break-even', 'diy', 'hoa-compliance', 'home-digital-twin', 'home-digital-will',
  'home-event-radar', 'home-habit-coach', 'home-risk-replay', 'home-briefing',
  'inspection-hub', 'material-specs', 'neighborhood-change-radar', 'permits',
  'plant-advisor', 'project-tracker', 'seller-prep', 'service-price-radar', 'status-board',
];

function resolveSkillIdsForOperations(operationIds: readonly AskOperationId[]): SkillId[] {
  const skillIds = new Set<SkillId>();
  for (const operationId of operationIds) {
    const skill = getSkillForOperation(operationId);
    if (skill) skillIds.add(skill.id as SkillId);
  }
  return [...skillIds];
}

function buildEntry(capabilityId: string, operationIds: readonly AskOperationId[]): CapabilitySkillGuidanceBridgeEntry {
  const capability = canonicalCapabilityRegistry.getById(capabilityId);
  const ownership = HOME_ACTION_ADAPTER_OWNERSHIP;
  const singleSourceKind = capability && capability.recommendation.sourceKinds.length === 1
    ? capability.recommendation.sourceKinds[0]
    : null;
  const ownershipEntry = singleSourceKind
    ? ownership.find((entry) => entry.sourceKind === singleSourceKind) ?? null
    : null;

  return {
    capabilityId,
    skillIds: resolveSkillIdsForOperations(operationIds),
    operationIds,
    guidanceJourneyTypeKeys: [],
    homeActionSourceKind: singleSourceKind,
    launchDestination: capability?.destination.routeTemplate ?? 'UNKNOWN — capability not found in canonicalCapabilityRegistry',
    requiredContext: capability?.destination.acceptedContext ?? [],
    executionOwner: operationIds.length > 0
      ? 'Ask operation execution (askOrchestrator.service.ts executeOperation)'
      : 'Home Action promotion only (homeActionSourcePromotion.service.ts) — not Ask-reachable',
    completionOwner: ownershipEntry?.completionAdapterOwner ?? 'Not declared — no single Home Action source kind resolves for this capability today',
    // Derived from the same ownershipEntry lookup as completionOwner rather
    // than hardcoded, so this stops being null the moment any Home Action
    // source kind actually gets an outcome adapter (HI-OUT-005) — see
    // homeActionAdapterOwnership.ts's hasOutcomeAdapter field doc for why
    // every kind is null today.
    outcomeAdapter: ownershipEntry?.outcomeAdapterOwner ?? null,
  };
}

export const CAPABILITY_SKILL_GUIDANCE_BRIDGE: readonly CapabilitySkillGuidanceBridgeEntry[] = [
  ...Object.entries(OPERATIONS_BY_CAPABILITY).map(([capabilityId, operationIds]) => buildEntry(capabilityId, operationIds)),
  ...HOME_ACTION_ONLY_CAPABILITY_IDS.map((capabilityId) => buildEntry(capabilityId, [])),
];

/**
 * Derived from CAPABILITY_SKILL_GUIDANCE_BRIDGE — same computed values the
 * old inline ASK_OPERATION_CAPABILITY/ASK_CAPABILITY_UNIQUE_OPERATION maps
 * in askOrchestrator.service.ts produced, now single-sourced from this
 * validated registry.
 */
export const ASK_OPERATION_CAPABILITY: Partial<Record<AskOperationId, string>> = Object.fromEntries(
  CAPABILITY_SKILL_GUIDANCE_BRIDGE.flatMap((entry) => entry.operationIds.map((operationId) => [operationId, entry.capabilityId])),
);

export const ASK_CAPABILITY_UNIQUE_OPERATION: Partial<Record<string, AskOperationId>> = (() => {
  const counts = new Map<string, number>();
  for (const capabilityId of Object.values(ASK_OPERATION_CAPABILITY)) {
    if (capabilityId) counts.set(capabilityId, (counts.get(capabilityId) ?? 0) + 1);
  }
  const unique: Partial<Record<string, AskOperationId>> = {};
  for (const [operationId, capabilityId] of Object.entries(ASK_OPERATION_CAPABILITY)) {
    if (capabilityId && counts.get(capabilityId) === 1) unique[capabilityId] = operationId as AskOperationId;
  }
  return unique;
})();

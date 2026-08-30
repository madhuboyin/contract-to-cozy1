// C2C Intelligence & Agentic Evolution — Phase 4B (§9.2 of the
// implementation plan; architecture §12.6 / §26).
//
// Phase 4B is deliberately an admission *process*, not a promise to ship a
// list of specialists — "no build order beyond that is committed for
// further profiles, rules, or specialists." This file makes that process
// executable and enforced instead of leaving it as prose: nothing may be
// registered as a `RepairReplaceProfile` or a non-DEV `AgentDefinition`
// without a recorded, passing admission decision here, and startup/CI
// validation fails closed if one is missing.
//
// The admission decision has two independent parts (§9.2):
//   1. Classification — is the candidate another profile under an existing
//      decision shape, a new Decision Platform definition on the same
//      Specialist loop, or a genuinely new specialist?
//   2. A per-classification review checklist — safety-tier review, autonomy
//      ceiling re-justification, authoritative engine/source, typed context
//      contract, professional boundary, evaluation suite, and a complete
//      promotion/lineage path.
//
// Higher-risk home systems (electrical, plumbing, roofing, structural) are
// NOT admitted by analogy to HVAC (architecture §12.6): they carry safety
// and liability profiles the Repair-or-Replace family adapter's Level 0-2,
// narration-only ceiling was never evaluated against. They appear below as
// explicit `NOT_ADMITTED` records so the exclusion is visible and a future
// pursuit has a scaffold, not a blank page.

import type { InventoryItemCategory } from '../../productFramework/intelligence/entityRef.contract';
import { AGENT_DEFINITION_REGISTRY } from './agentDefinitionRegistry';
import { digestAgentDefinition } from './agentRegistryValidation';
import type { VersionedAgentRegistryEntry } from './agent.contract';
import { DECISION_DEFINITIONS, type DecisionDefinitionId } from '../decisionPlatform/decisionDefinitionRegistry';
import type { DecisionDefinition } from '../../productFramework/decisionPlatform/decisionPlatform.contract';
import { REPAIR_REPLACE_PROFILES, type RepairReplaceProfile } from './repairReplaceProfileRegistry';

export const SPECIALIST_ADMISSION_CONTRACT_VERSION = '1.1.0';

// §9.2's three-way classification. These are independent tests, not a
// severity ladder — a candidate is exactly one of them.
export type SpecialistAdmissionClassification =
  | 'NEW_PROFILE_EXISTING_SHAPE'
  | 'NEW_DECISION_DEFINITION_SAME_LOOP'
  | 'NEW_SPECIALIST';

// §9.2's required review checklist. Every gate is either PASS (a real
// review happened and cleared it), FAIL (a review happened and rejected
// it), or NOT_REVIEWED (no review yet — the default, and the reason a
// candidate stays PENDING_REVIEW).
export type SpecialistAdmissionGate =
  | 'SAFETY_TIER_REVIEW'
  | 'AUTONOMY_CEILING_REJUSTIFICATION'
  | 'AUTHORITATIVE_ENGINE_OR_SOURCE'
  | 'TYPED_CONTEXT_CONTRACT'
  | 'PROFESSIONAL_BOUNDARY'
  | 'EVALUATION_SUITE'
  | 'PROMOTION_AND_LINEAGE_PATH';

export type GateReviewStatus = 'NOT_REVIEWED' | 'PASS' | 'FAIL';

export type SpecialistAdmissionStatus = 'ADMITTED' | 'PENDING_REVIEW' | 'NOT_ADMITTED';

export const SPECIALIST_ADMISSION_GATES: readonly SpecialistAdmissionGate[] = Object.freeze([
  'SAFETY_TIER_REVIEW',
  'AUTONOMY_CEILING_REJUSTIFICATION',
  'AUTHORITATIVE_ENGINE_OR_SOURCE',
  'TYPED_CONTEXT_CONTRACT',
  'PROFESSIONAL_BOUNDARY',
  'EVALUATION_SUITE',
  'PROMOTION_AND_LINEAGE_PATH',
]);

// Which gates a classification must clear before it can be ADMITTED.
// - A new specialist re-opens everything, including the autonomy ceiling
//   and the tool set the shared loop assumes.
// - A new decision definition on the same loop keeps the loop's autonomy
//   ceiling but still needs its own verdict shape, context contract,
//   engine, boundary, eval suite, and lineage path proven.
// - A new profile under an existing shape reuses the decision definition,
//   context contract, and loop — but a new inventory category can still
//   carry a different safety tier (this is the electrical/plumbing guard),
//   and §12.6 requires a profile to clear the same evaluation bar as an
//   AgentDefinition.
export const REQUIRED_GATES_BY_CLASSIFICATION: Readonly<Record<
  SpecialistAdmissionClassification,
  readonly SpecialistAdmissionGate[]
>> = Object.freeze({
  NEW_PROFILE_EXISTING_SHAPE: Object.freeze([
    'SAFETY_TIER_REVIEW',
    'AUTHORITATIVE_ENGINE_OR_SOURCE',
    'PROFESSIONAL_BOUNDARY',
    'EVALUATION_SUITE',
  ] as const),
  NEW_DECISION_DEFINITION_SAME_LOOP: Object.freeze([
    'SAFETY_TIER_REVIEW',
    'AUTHORITATIVE_ENGINE_OR_SOURCE',
    'TYPED_CONTEXT_CONTRACT',
    'PROFESSIONAL_BOUNDARY',
    'EVALUATION_SUITE',
    'PROMOTION_AND_LINEAGE_PATH',
  ] as const),
  NEW_SPECIALIST: SPECIALIST_ADMISSION_GATES,
});

// Home systems whose safety/liability profile the Repair-or-Replace family
// adapter was never evaluated against (architecture §12.6). A candidate
// covering any of these MUST clear SAFETY_TIER_REVIEW and
// AUTONOMY_CEILING_REJUSTIFICATION regardless of its classification's
// default gate list — "do not admit higher-risk home systems by analogy to
// HVAC."
export const HIGHER_RISK_INVENTORY_CATEGORIES: readonly InventoryItemCategory[] = Object.freeze([
  'PLUMBING',
  'ELECTRICAL',
  'ROOF_EXTERIOR',
  'STRUCTURAL',
]);

export interface GateReview {
  status: GateReviewStatus;
  /** Where the review lives, or why the gate is not applicable / not yet started. Never empty. */
  evidence: string;
  /** ISO date of the review, or null when NOT_REVIEWED. */
  reviewedOn: string | null;
}

export interface SpecialistAdmissionRecord {
  /** Stable candidate identity, e.g. 'HVAC', 'GENERIC_APPLIANCE', 'ELECTRICAL_PANEL'. */
  candidateId: string;
  title: string;
  classification: SpecialistAdmissionClassification;
  /** Author's intent — PURSUE means "we want this"; DECLINED means "we have decided not to", which forces NOT_ADMITTED. */
  decision: 'PURSUE' | 'DECLINED';
  /** What this candidate would register on admission — used to tie the registry back to real code. */
  wouldRegister: {
    profileId?: string;
    agentId?: string;
    decisionDefinitionId?: string;
    eligibleCategories?: readonly InventoryItemCategory[];
    /** Exact reviewed profile contract. Runtime metadata must remain identical. */
    profileContract?: RepairReplaceProfile;
    /** Exact reviewed decision-definition version. */
    decisionDefinitionVersion?: string;
    /** Immutable AgentDefinition versions and canonical digests cleared by this review. */
    agentDefinitions?: readonly { version: string; digest: string }[];
    /** Required for a new profile that reuses a decision shape admitted by another candidate. */
    reusesDecisionDefinitionFrom?: string;
  };
  /** The owner-input ticket that unblocks the outstanding gate(s), when there is one. */
  ownerInputId?: string;
  gateReviews: Readonly<Record<SpecialistAdmissionGate, GateReview>>;
  /** Declared status — validated against the gate reviews below, never trusted blindly. */
  status: SpecialistAdmissionStatus;
  notes: string;
}

const notReviewed = (evidence: string): GateReview => ({ status: 'NOT_REVIEWED', evidence, reviewedOn: null });
const passed = (evidence: string, reviewedOn: string): GateReview => ({ status: 'PASS', evidence, reviewedOn });

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function allGates(build: (gate: SpecialistAdmissionGate) => GateReview): Readonly<Record<SpecialistAdmissionGate, GateReview>> {
  return Object.freeze(Object.fromEntries(
    SPECIALIST_ADMISSION_GATES.map((gate) => [gate, build(gate)]),
  ) as Record<SpecialistAdmissionGate, GateReview>);
}

export const SPECIALIST_ADMISSION_RECORDS: readonly SpecialistAdmissionRecord[] = Object.freeze([
  // The reference implementation. HVAC cleared every gate for HVAC
  // specifically (architecture §12.6) — it is the bar every later
  // candidate is measured against, not an assumption that clearing it once
  // clears it for anything else.
  Object.freeze({
    candidateId: 'HVAC',
    title: 'HVAC Repair-or-Replace Specialist (reference implementation)',
    classification: 'NEW_SPECIALIST',
    decision: 'PURSUE',
    wouldRegister: {
      profileId: 'HVAC',
      agentId: 'hvac-repair-replace-specialist',
      decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
      eligibleCategories: Object.freeze(['HVAC'] as const),
      profileContract: Object.freeze({
        profileId: 'HVAC',
        eligibleCategories: Object.freeze(['HVAC'] as const),
        decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
        scoringSkillId: 'repair-replace',
        requiredFacts: Object.freeze(['SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'SAFETY'] as const),
        supportedDocuments: Object.freeze(['hvac-nameplate-photo', 'hvac-technician-assessment', 'hvac-written-estimate']),
        professionalBoundary: 'licensed HVAC technician',
        evaluationSuiteId: 'agent-hvac-repair-replace-eval@1.1.0',
      }),
      decisionDefinitionVersion: '1.0',
      agentDefinitions: Object.freeze([
        Object.freeze({ version: '1.0.0', digest: 'be4e9d0cdfe501aa55b3d473a558a9d40b9a881c29cf40b03da66f13bd1fb2aa' }),
        Object.freeze({ version: '1.1.0', digest: '0ea576a2635b5b1446079173b4c5f434568ffc2e9daa5c22ff325bc2246ce3eb' }),
        Object.freeze({ version: '1.2.0', digest: 'f4b71fd75489107102e16daf3dd3778e1ae540241ed8e6c63d055fc9cec78228' }),
      ]),
    },
    gateReviews: allGates((gate) => {
      switch (gate) {
        case 'SAFETY_TIER_REVIEW':
          return passed('Agentic Readiness Audit §7.1/§9.2; RECOMMEND / Level 0-2 narration-only ceiling.', '2026-08-27');
        case 'AUTONOMY_CEILING_REJUSTIFICATION':
          return passed('hvacRepairReplaceAgent.definition.ts outputContract.maxAutonomyLevel 2 (DRAFT), validated by validateAgentDefinitionRegistry.', '2026-08-27');
        case 'AUTHORITATIVE_ENGINE_OR_SOURCE':
          return passed('hvacRepairReplaceEngine.service.ts — the only published HVAC verdict authority (ARD-003).', '2026-08-27');
        case 'TYPED_CONTEXT_CONTRACT':
          return passed('DECISION_CONTEXT_CONTRACTS.HVAC_REPAIR_REPLACE (composesFromPropertyContext, versioned).', '2026-08-27');
        case 'PROFESSIONAL_BOUNDARY':
          return passed('"licensed HVAC technician"; NOT_A_TECHNICIAN_ASSESSMENT boundary code.', '2026-08-27');
        case 'EVALUATION_SUITE':
          return passed('agent-hvac-repair-replace-eval@1.1.0 (IPD-005), checked in as hvacSpecialistEvaluation.ts + explicit resume and low-confidence assertions.', '2026-08-30');
        case 'PROMOTION_AND_LINEAGE_PATH':
          return passed('repair-replace: lineage prefix -> HVAC_REPAIR_REPLACE family; hvacDecisionFamilyAdapter; HomeAction + work-item lineage.', '2026-08-29');
        default:
          return notReviewed('unreachable');
      }
    }),
    status: 'ADMITTED',
    notes: 'Phase 2. The pattern every Phase 4B candidate is compared against.',
  }),

  // IPD-006 approved the APPLIANCE-only profile, verdict mapping, and
  // deterministic evaluation contract on 2026-08-29.
  Object.freeze({
    candidateId: 'GENERIC_APPLIANCE',
    title: 'Generic non-HVAC appliance Repair-or-Replace profile',
    classification: 'NEW_DECISION_DEFINITION_SAME_LOOP',
    decision: 'PURSUE',
    ownerInputId: 'IPD-006',
    wouldRegister: {
      profileId: 'GENERIC_APPLIANCE',
      decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE',
      // The agent profile is deliberately narrower than the decision
      // family's non-HVAC boundary — APPLIANCE only, per architecture
      // §12.6's illustrative profile.
      eligibleCategories: Object.freeze(['APPLIANCE'] as const),
      profileContract: Object.freeze({
        profileId: 'GENERIC_APPLIANCE',
        eligibleCategories: Object.freeze(['APPLIANCE'] as const),
        decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE',
        scoringSkillId: 'repair-replace',
        requiredFacts: Object.freeze(['INVENTORY'] as const),
        supportedDocuments: Object.freeze([]),
        professionalBoundary: 'general appliance repair professional',
        evaluationSuiteId: 'agent-generic-appliance-repair-replace-eval@1.0.0',
      }),
      decisionDefinitionVersion: '1.0',
    },
    gateReviews: allGates((gate) => {
      switch (gate) {
        case 'SAFETY_TIER_REVIEW':
          return passed('APPLIANCE is not a higher-risk category; same Level 0-2 narration-only ceiling as HVAC, no new safety tier.', '2026-08-29');
        case 'AUTHORITATIVE_ENGINE_OR_SOURCE':
          return passed('replaceRepairAnalysis.service.ts ReplaceRepairService — existing authoritative non-HVAC verdict; projected, never recomputed (applianceDecisionFamilyAdapter.ts).', '2026-08-29');
        case 'PROFESSIONAL_BOUNDARY':
          return passed('"general appliance repair" — rendered in narration, never asserted beyond the string.', '2026-08-29');
        case 'TYPED_CONTEXT_CONTRACT':
          return passed('DECISION_CONTEXT_CONTRACTS.APPLIANCE_REPAIR_REPLACE (Phase 4A) — thin, snapshot-style.', '2026-08-29');
        case 'PROMOTION_AND_LINEAGE_PATH':
          return passed('appliance-repair-replace: lineage prefix -> APPLIANCE_REPAIR_REPLACE family (Phase 4A); HomeAction + work-item lineage category-aware.', '2026-08-29');
        case 'AUTONOMY_CEILING_REJUSTIFICATION':
          return passed('Reuses the HVAC specialist loop and its Level 0-2 ceiling unchanged — the new decision definition does not change autonomy, recorded for completeness.', '2026-08-29');
        case 'EVALUATION_SUITE':
          return passed('agent-generic-appliance-repair-replace-eval@1.0.0: >=10 checked-in fixtures, 100% deterministic non-abstention completion, zero LLM calls, and 20-50% abstention band.', '2026-08-29');
        default:
          return notReviewed('unreachable');
      }
    }),
    status: 'ADMITTED',
    notes: 'IPD-006 approved on 2026-08-29. Eligibility is APPLIANCE only; water heaters remain PLUMBING and are excluded. Verdict mapping: REPLACE_NOW/REPLACE_SOON -> REPLACE; REPAIR_AND_MONITOR/REPAIR_ONLY -> REPAIR.',
  }),

  // Higher-risk families — explicit exclusions, not silent omissions
  // (architecture §12.6). Each is a scaffold for a future pursuit, not an
  // endorsement of one.
  ...(([
    ['ELECTRICAL_REPAIR_REPLACE', 'Electrical (panel / service) Repair-or-Replace', ['ELECTRICAL'] as const],
    ['PLUMBING_REPAIR_REPLACE', 'Plumbing (supply / drain / water heater as a system) Repair-or-Replace', ['PLUMBING'] as const],
    ['ROOFING_REPAIR_REPLACE', 'Roofing Repair-or-Replace', ['ROOF_EXTERIOR'] as const],
    ['STRUCTURAL_REPAIR_REPLACE', 'Structural / foundation Repair-or-Replace', ['STRUCTURAL'] as const],
  ] as const).map(([candidateId, title, eligibleCategories]) => Object.freeze({
    candidateId,
    title,
    classification: 'NEW_SPECIALIST' as const,
    decision: 'DECLINED' as const,
    wouldRegister: { eligibleCategories },
    gateReviews: allGates(() => notReviewed(
      'Out of scope per architecture §12.6. Admission requires a documented safety-tier review, an explicit autonomy-ceiling re-justification, an authoritative engine/source, a typed context contract, a professional boundary, its own evaluation suite, and a complete promotion/lineage path — the same bar HVAC cleared for HVAC specifically.',
    )),
    status: 'NOT_ADMITTED' as const,
    notes: 'No build order is committed. This record exists so the exclusion is visible and a future pursuit starts from a scaffold, not a blank page.',
  }))),
]);

/**
 * The minimum status the gate reviews justify for a record, independent of
 * its declared `status`. Validation compares the two.
 */
export function deriveSpecialistAdmissionStatus(record: SpecialistAdmissionRecord): SpecialistAdmissionStatus {
  if (record.decision === 'DECLINED') return 'NOT_ADMITTED';
  const requiredGates = requiredGatesFor(record);
  const reviews = requiredGates.map((gate) => record.gateReviews[gate]?.status ?? 'NOT_REVIEWED');
  if (reviews.includes('FAIL')) return 'NOT_ADMITTED';
  if (reviews.every((status) => status === 'PASS')) return 'ADMITTED';
  return 'PENDING_REVIEW';
}

/**
 * The gates a record must clear — its classification's defaults, plus the
 * safety/autonomy gates forced by a higher-risk category.
 */
export function requiredGatesFor(record: SpecialistAdmissionRecord): readonly SpecialistAdmissionGate[] {
  const base = new Set(REQUIRED_GATES_BY_CLASSIFICATION[record.classification]);
  const categories = record.wouldRegister.eligibleCategories ?? [];
  if (categories.some((category) => HIGHER_RISK_INVENTORY_CATEGORIES.includes(category))) {
    base.add('SAFETY_TIER_REVIEW');
    base.add('AUTONOMY_CEILING_REJUSTIFICATION');
  }
  return SPECIALIST_ADMISSION_GATES.filter((gate) => base.has(gate));
}

export function getSpecialistAdmissionRecord(
  candidateId: string,
  records: readonly SpecialistAdmissionRecord[] = SPECIALIST_ADMISSION_RECORDS,
): SpecialistAdmissionRecord | undefined {
  return records.find((record) => record.candidateId === candidateId);
}

export function isProfileAdmitted(
  profileId: string,
  records: readonly SpecialistAdmissionRecord[] = SPECIALIST_ADMISSION_RECORDS,
): boolean {
  const profile = REPAIR_REPLACE_PROFILES.find((candidate) => candidate.profileId === profileId);
  const admission = records.find((record) => record.wouldRegister.profileId === profileId && record.status === 'ADMITTED');
  return Boolean(profile && admission && profileContractIssues(profile, admission.wouldRegister.profileContract).length === 0);
}

export interface SpecialistAdmissionValidationDependencies {
  profiles?: readonly RepairReplaceProfile[];
  agentRegistry?: Readonly<Record<string, VersionedAgentRegistryEntry>>;
  decisionDefinitions?: Readonly<Partial<Record<DecisionDefinitionId, DecisionDefinition>>>;
}

function profileContractIssues(
  actual: RepairReplaceProfile,
  reviewed: RepairReplaceProfile | undefined,
): string[] {
  if (!reviewed) return ['has no reviewed profileContract'];
  const issues: string[] = [];
  const scalarFields = ['profileId', 'decisionDefinitionId', 'scoringSkillId', 'professionalBoundary', 'evaluationSuiteId'] as const;
  for (const field of scalarFields) {
    if (actual[field] !== reviewed[field]) issues.push(`${field} changed after admission`);
  }
  const arrayFields = ['eligibleCategories', 'requiredFacts', 'supportedDocuments'] as const;
  for (const field of arrayFields) {
    if (JSON.stringify(actual[field]) !== JSON.stringify(reviewed[field])) issues.push(`${field} changed after admission`);
  }
  return issues;
}

/**
 * Fail-closed gate wired into startup / CI (index.ts). Proves:
 *  - the registry is internally consistent (unique ids, non-empty evidence,
 *    declared status matches the gates + classification);
 *  - every registered RepairReplaceProfile has an ADMITTED record;
 *  - every non-DEV registered AgentDefinition has an ADMITTED record;
 *  - a higher-risk category never rides in on a profile without its
 *    safety-tier and autonomy gates cleared.
 */
export function validateSpecialistAdmissionRegistry(
  records: readonly SpecialistAdmissionRecord[] = SPECIALIST_ADMISSION_RECORDS,
  dependencies: SpecialistAdmissionValidationDependencies = {},
): string[] {
  const issues: string[] = [];
  const profiles = dependencies.profiles ?? REPAIR_REPLACE_PROFILES;
  const agentRegistry = dependencies.agentRegistry ?? AGENT_DEFINITION_REGISTRY;
  const decisionDefinitions = dependencies.decisionDefinitions ?? DECISION_DEFINITIONS;

  const seenCandidateIds = new Set<string>();
  const seenProfileTargets = new Map<string, string>();
  const seenAgentTargets = new Map<string, string>();

  for (const record of records) {
    const label = `SpecialistAdmissionRegistry:${record.candidateId}`;
    if (seenCandidateIds.has(record.candidateId)) issues.push(`${label}: duplicate candidateId`);
    seenCandidateIds.add(record.candidateId);
    if (!record.title.trim() || !record.notes.trim()) issues.push(`${label}: missing title or notes`);

    for (const gate of SPECIALIST_ADMISSION_GATES) {
      const review = record.gateReviews[gate];
      if (!review) {
        issues.push(`${label}: gate ${gate} has no review entry`);
        continue;
      }
      if (!review.evidence.trim()) issues.push(`${label}: gate ${gate} review has no evidence`);
      if (review.status === 'NOT_REVIEWED' && review.reviewedOn) issues.push(`${label}: gate ${gate} is NOT_REVIEWED but has a reviewedOn date`);
      if (review.status !== 'NOT_REVIEWED' && !review.reviewedOn) issues.push(`${label}: gate ${gate} is ${review.status} but has no reviewedOn date`);
      if (review.reviewedOn && !isIsoCalendarDate(review.reviewedOn)) issues.push(`${label}: gate ${gate} reviewedOn is not a valid ISO calendar date`);
    }

    const derived = deriveSpecialistAdmissionStatus(record);
    if (record.status !== derived) {
      issues.push(`${label}: declared status ${record.status} but gate reviews justify ${derived}`);
    }
    if (record.decision === 'DECLINED' && record.status !== 'NOT_ADMITTED') {
      issues.push(`${label}: decision DECLINED requires status NOT_ADMITTED`);
    }

    const target = record.wouldRegister;
    const hasAgentDefinitions = Boolean(target.agentDefinitions?.length);
    if (record.decision === 'PURSUE') {
      if (record.classification === 'NEW_PROFILE_EXISTING_SHAPE') {
        if (!target.profileId || target.agentId || hasAgentDefinitions) {
          issues.push(`${label}: NEW_PROFILE_EXISTING_SHAPE requires a profile target and forbids an AgentDefinition target`);
        }
        const reused = records.find((candidate) => candidate.candidateId === target.reusesDecisionDefinitionFrom);
        if (!target.reusesDecisionDefinitionFrom || !reused || reused.status !== 'ADMITTED'
          || reused.wouldRegister.decisionDefinitionId !== target.decisionDefinitionId
          || reused.candidateId === record.candidateId) {
          issues.push(`${label}: NEW_PROFILE_EXISTING_SHAPE must reuse a decision definition admitted by another candidate`);
        }
      } else if (record.classification === 'NEW_DECISION_DEFINITION_SAME_LOOP') {
        if (!target.profileId || !target.decisionDefinitionId || target.agentId || hasAgentDefinitions) {
          issues.push(`${label}: NEW_DECISION_DEFINITION_SAME_LOOP requires profile and decision-definition targets and forbids an AgentDefinition target`);
        }
      } else if (!target.agentId || !hasAgentDefinitions) {
        issues.push(`${label}: NEW_SPECIALIST requires an agent target with reviewed AgentDefinition versions`);
      }
    }

    if (target.profileId && target.profileContract?.profileId !== target.profileId) {
      issues.push(`${label}: profileContract does not match profile target "${target.profileId}"`);
    }
    if (target.profileContract
      && (target.profileContract.decisionDefinitionId !== target.decisionDefinitionId
        || JSON.stringify(target.profileContract.eligibleCategories) !== JSON.stringify(target.eligibleCategories ?? []))) {
      issues.push(`${label}: profile target metadata does not match its reviewed profileContract`);
    }
    if (target.decisionDefinitionId) {
      const definition = decisionDefinitions[target.decisionDefinitionId as DecisionDefinitionId];
      if (!definition) issues.push(`${label}: decision definition "${target.decisionDefinitionId}" is not registered`);
      else if (definition.version !== target.decisionDefinitionVersion) {
        issues.push(`${label}: decision definition "${target.decisionDefinitionId}" version ${definition.version} was not admitted`);
      }
    }
    if (target.profileId) {
      const owner = seenProfileTargets.get(target.profileId);
      if (owner) issues.push(`${label}: profile target "${target.profileId}" already claimed by ${owner}`);
      seenProfileTargets.set(target.profileId, record.candidateId);
    }
    if (target.agentId) {
      const owner = seenAgentTargets.get(target.agentId);
      if (owner) issues.push(`${label}: agent target "${target.agentId}" already claimed by ${owner}`);
      seenAgentTargets.set(target.agentId, record.candidateId);
    }

    // A higher-risk category on an ADMITTED record must have both forced
    // gates explicitly PASS — deriveSpecialistAdmissionStatus already
    // requires this via requiredGatesFor, but assert it directly so the
    // rule is legible and a refactor of the derive logic cannot silently
    // weaken it.
    if (record.status === 'ADMITTED') {
      const categories = target.eligibleCategories ?? [];
      if (categories.some((category) => HIGHER_RISK_INVENTORY_CATEGORIES.includes(category))) {
        for (const gate of ['SAFETY_TIER_REVIEW', 'AUTONOMY_CEILING_REJUSTIFICATION'] as const) {
          if (record.gateReviews[gate]?.status !== 'PASS') {
            issues.push(`${label}: ADMITTED with a higher-risk category but gate ${gate} is not PASS`);
          }
        }
      }
    }
  }

  for (const profile of profiles) {
    const admission = records.find((record) => record.wouldRegister.profileId === profile.profileId && record.status === 'ADMITTED');
    if (!admission) {
      issues.push(`SpecialistAdmissionRegistry: RepairReplaceProfile "${profile.profileId}" is registered without an ADMITTED admission record`);
      continue;
    }
    for (const issue of profileContractIssues(profile, admission.wouldRegister.profileContract)) {
      issues.push(`SpecialistAdmissionRegistry: RepairReplaceProfile "${profile.profileId}" ${issue}`);
    }
  }

  for (const [agentId, entry] of Object.entries(agentRegistry)) {
    for (const [version, definition] of Object.entries(entry.versions)) {
      if (definition.releaseState === 'DEV') continue;
      const reviewed = records.flatMap((record) => record.status === 'ADMITTED' && record.wouldRegister.agentId === agentId
        ? record.wouldRegister.agentDefinitions ?? [] : []).find((candidate) => candidate.version === version);
      if (!reviewed) {
        issues.push(`SpecialistAdmissionRegistry: AgentDefinition "${agentId}@${version}" has a non-DEV release state but no ADMITTED version review`);
      } else if (reviewed.digest !== digestAgentDefinition(definition)) {
        issues.push(`SpecialistAdmissionRegistry: AgentDefinition "${agentId}@${version}" digest changed after admission`);
      }
    }
  }

  return issues;
}

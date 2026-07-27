import { APP_CONFIG } from '../config/appConfig';
import { checkRolloutStatus } from '../middleware/rollout.middleware';
import { canonicalCapabilityRegistry } from '../productFramework/capabilities';
import { loadCapabilityGovernanceReadiness } from './capabilityGovernanceReview.service';
import { checkGate } from './releaseGate.service';

export const COVERAGE_LAUNCH_GATE_VERSION = 'coverage-launch-gate-v1';
export const COVERAGE_LAUNCH_EVIDENCE_VERSION = 'coverage-slice-10-v1';

export const COVERAGE_COMPLETION_FUNNEL = [
  'ELIGIBLE',
  'SHOWN',
  'OPENED',
  'POLICY_FACTS_READY',
  'REVIEW_PRODUCED',
  'QUESTION_RESOLVED',
  'CHOICE_COMPARED',
  'DECISION_RECORDED',
  'ACTION_COMPLETED',
  'OUTCOME_OBSERVED',
] as const;

export const COVERAGE_LAUNCH_BLOCKER_CODES = [
  'CAPABILITY_DEFINITION_MISSING',
  'RELEASE_STAGE_NOT_ACTIVE',
  'ROLLOUT_DISABLED',
  'REAL_USER_KILL_SWITCH_ACTIVE',
  'INCIDENT_GATE_FAILED',
  'TECHNICAL_EVIDENCE_MISSING',
  'TECHNICAL_EVIDENCE_VERSION_MISMATCH',
  'ROLLBACK_DRILL_MISSING',
  'ROLLBACK_DRILL_VERSION_MISMATCH',
  'HUMAN_APPROVAL_ENFORCEMENT_DISABLED',
  'GOVERNANCE_REVIEW_SOURCE_UNAVAILABLE',
  'GOVERNANCE_APPROVAL_MISSING',
  'GOVERNANCE_APPROVAL_REJECTED',
  'UNCONTAINED_HIGH_RISK_GAP',
] as const;

export type CoverageLaunchBlockerCode =
  typeof COVERAGE_LAUNCH_BLOCKER_CODES[number];

export type CoverageLaunchGateInput = {
  capabilityPresent: boolean;
  releaseStage: string | null;
  rolloutEnabled: boolean;
  realUserKillSwitchEnabled: boolean;
  incidentGatePassed: boolean;
  technicalEvidenceVersion: string | null;
  rollbackDrillVersion: string | null;
  humanApprovalEnforcementEnabled: boolean;
  governanceReviewSourceAvailable: boolean;
  missingGovernanceRoles: string[];
  rejectedGovernanceRoles: string[];
  uncontainedHighRiskGapIds: string[];
};

export function evaluateCoverageLaunchGate(input: CoverageLaunchGateInput) {
  const blockers: CoverageLaunchBlockerCode[] = [];
  if (!input.capabilityPresent) blockers.push('CAPABILITY_DEFINITION_MISSING');
  if (input.releaseStage !== 'ACTIVE') blockers.push('RELEASE_STAGE_NOT_ACTIVE');
  if (!input.rolloutEnabled) blockers.push('ROLLOUT_DISABLED');
  if (!input.realUserKillSwitchEnabled) blockers.push('REAL_USER_KILL_SWITCH_ACTIVE');
  if (!input.incidentGatePassed) blockers.push('INCIDENT_GATE_FAILED');
  if (!input.technicalEvidenceVersion) {
    blockers.push('TECHNICAL_EVIDENCE_MISSING');
  } else if (input.technicalEvidenceVersion !== COVERAGE_LAUNCH_EVIDENCE_VERSION) {
    blockers.push('TECHNICAL_EVIDENCE_VERSION_MISMATCH');
  }
  if (!input.rollbackDrillVersion) {
    blockers.push('ROLLBACK_DRILL_MISSING');
  } else if (input.rollbackDrillVersion !== COVERAGE_LAUNCH_GATE_VERSION) {
    blockers.push('ROLLBACK_DRILL_VERSION_MISMATCH');
  }
  if (!input.humanApprovalEnforcementEnabled) {
    blockers.push('HUMAN_APPROVAL_ENFORCEMENT_DISABLED');
  } else if (!input.governanceReviewSourceAvailable) {
    blockers.push('GOVERNANCE_REVIEW_SOURCE_UNAVAILABLE');
  } else {
    if (input.rejectedGovernanceRoles.length > 0) {
      blockers.push('GOVERNANCE_APPROVAL_REJECTED');
    }
    if (input.missingGovernanceRoles.length > 0) {
      blockers.push('GOVERNANCE_APPROVAL_MISSING');
    }
  }
  if (input.uncontainedHighRiskGapIds.length > 0) {
    blockers.push('UNCONTAINED_HIGH_RISK_GAP');
  }

  return {
    contractVersion: COVERAGE_LAUNCH_GATE_VERSION,
    capabilityId: 'coverage-intelligence' as const,
    state: blockers.length === 0 ? 'READY' as const : 'BLOCKED' as const,
    blockers: Array.from(new Set(blockers)),
    completionFunnel: COVERAGE_COMPLETION_FUNNEL,
    evidence: {
      expectedTechnicalEvidenceVersion: COVERAGE_LAUNCH_EVIDENCE_VERSION,
      recordedTechnicalEvidenceVersion: input.technicalEvidenceVersion,
      expectedRollbackDrillVersion: COVERAGE_LAUNCH_GATE_VERSION,
      recordedRollbackDrillVersion: input.rollbackDrillVersion,
    },
    governance: {
      enforcementEnabled: input.humanApprovalEnforcementEnabled,
      sourceAvailable: input.governanceReviewSourceAvailable,
      missingRoles: input.missingGovernanceRoles,
      rejectedRoles: input.rejectedGovernanceRoles,
    },
    openHighRiskGapIds: input.uncontainedHighRiskGapIds,
  };
}

export async function getCoverageLaunchGate(
  env: NodeJS.ProcessEnv = process.env,
) {
  const capability =
    canonicalCapabilityRegistry.getById('coverage-intelligence') ?? null;
  const rollout = checkRolloutStatus('COVERAGE_INTELLIGENCE');
  const incidentGate = await checkGate('COVERAGE_INTELLIGENCE');
  let governanceReviewSourceAvailable = true;
  let missingGovernanceRoles: string[] = [];
  let rejectedGovernanceRoles: string[] = [];
  try {
    const readiness = (
      await loadCapabilityGovernanceReadiness(canonicalCapabilityRegistry)
    ).get('coverage-intelligence');
    missingGovernanceRoles = readiness?.missingRoles ?? [];
    rejectedGovernanceRoles = readiness?.rejectedRoles ?? [];
  } catch {
    governanceReviewSourceAvailable = false;
  }
  const uncontainedHighRiskGapIds = (env.COVERAGE_UNCONTAINED_HIGH_RISK_GAP_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return evaluateCoverageLaunchGate({
    capabilityPresent: capability !== null,
    releaseStage: capability?.governance.releaseStage ?? null,
    rolloutEnabled: rollout.enabled,
    realUserKillSwitchEnabled:
      env.COVERAGE_REAL_USER_LAUNCH_ENABLED?.trim().toLowerCase() === 'true',
    incidentGatePassed: incidentGate.pass,
    technicalEvidenceVersion:
      env.COVERAGE_LAUNCH_EVIDENCE_VERSION?.trim() || null,
    rollbackDrillVersion:
      env.COVERAGE_ROLLBACK_DRILL_VERSION?.trim() || null,
    humanApprovalEnforcementEnabled: APP_CONFIG.enforceHumanPolicyApprovals,
    governanceReviewSourceAvailable,
    missingGovernanceRoles,
    rejectedGovernanceRoles,
    uncontainedHighRiskGapIds,
  });
}

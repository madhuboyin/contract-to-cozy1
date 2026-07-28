import { APP_CONFIG } from '../../config/appConfig';
import { checkRolloutStatus } from '../../middleware/rollout.middleware';
import { canonicalCapabilityRegistry } from '../../productFramework/capabilities';
import { loadCapabilityGovernanceReadiness } from '../capabilityGovernanceReview.service';
import { checkGate } from '../releaseGate.service';

export const OWNERSHIP_COST_LAUNCH_GATE_VERSION =
  'ownership-cost-launch-gate-v1';
export const OWNERSHIP_COST_LAUNCH_EVIDENCE_VERSION =
  'ownership-cost-slice-9-v1';
export const OWNERSHIP_COST_OPERATIONAL_DRILL_VERSION =
  'ownership-cost-operational-drill-v1';

export const OWNERSHIP_COST_VALUE_FUNNEL = [
  'SNAPSHOT_READY',
  'VIEWED',
  'ACTION_OPENED',
  'DECISION_RECORDED',
  'HANDOFF_COMPLETED',
  'RESOLUTION_RECORDED',
  'OUTCOME_VERIFIED',
] as const;

export type OwnershipCostLaunchGateInput = {
  capabilityPresent: boolean;
  releaseStage: string | null;
  rolloutEnabled: boolean;
  incidentGatePassed: boolean;
  realUserLaunchEnabled: boolean;
  technicalEvidenceVersion: string | null;
  operationalDrillVersion: string | null;
  accessibilityApproved: boolean;
  responsiveApproved: boolean;
  contentSafetyApproved: boolean;
  commercialIntegrityApproved: boolean;
  humanApprovalEnforcementEnabled: boolean;
  governanceReviewSourceAvailable: boolean;
  missingGovernanceRoles: string[];
  rejectedGovernanceRoles: string[];
  uncontainedHighRiskGapIds: string[];
};

export function evaluateOwnershipCostLaunchGate(
  input: OwnershipCostLaunchGateInput,
) {
  const blockers: string[] = [];
  if (!input.capabilityPresent) blockers.push('CAPABILITY_DEFINITION_MISSING');
  if (input.releaseStage !== 'ACTIVE') blockers.push('RELEASE_STAGE_NOT_ACTIVE');
  if (!input.rolloutEnabled) blockers.push('ROLLOUT_DISABLED');
  if (!input.incidentGatePassed) blockers.push('INCIDENT_GATE_FAILED');
  if (!input.realUserLaunchEnabled) blockers.push('REAL_USER_LAUNCH_DISABLED');
  if (!input.technicalEvidenceVersion) {
    blockers.push('TECHNICAL_EVIDENCE_MISSING');
  } else if (
    input.technicalEvidenceVersion !== OWNERSHIP_COST_LAUNCH_EVIDENCE_VERSION
  ) {
    blockers.push('TECHNICAL_EVIDENCE_VERSION_MISMATCH');
  }
  if (!input.operationalDrillVersion) {
    blockers.push('OPERATIONAL_DRILL_MISSING');
  } else if (
    input.operationalDrillVersion !== OWNERSHIP_COST_OPERATIONAL_DRILL_VERSION
  ) {
    blockers.push('OPERATIONAL_DRILL_VERSION_MISMATCH');
  }
  if (!input.accessibilityApproved) blockers.push('ACCESSIBILITY_GATE_FAILED');
  if (!input.responsiveApproved) blockers.push('RESPONSIVE_GATE_FAILED');
  if (!input.contentSafetyApproved) blockers.push('CONTENT_SAFETY_APPROVAL_MISSING');
  if (!input.commercialIntegrityApproved) {
    blockers.push('COMMERCIAL_INTEGRITY_APPROVAL_MISSING');
  }
  if (!input.humanApprovalEnforcementEnabled) {
    blockers.push('HUMAN_APPROVAL_ENFORCEMENT_DISABLED');
  } else if (!input.governanceReviewSourceAvailable) {
    blockers.push('GOVERNANCE_REVIEW_SOURCE_UNAVAILABLE');
  } else {
    if (input.rejectedGovernanceRoles.length) {
      blockers.push('GOVERNANCE_APPROVAL_REJECTED');
    }
    if (input.missingGovernanceRoles.length) {
      blockers.push('GOVERNANCE_APPROVAL_MISSING');
    }
  }
  if (input.uncontainedHighRiskGapIds.length) {
    blockers.push('UNCONTAINED_HIGH_RISK_GAP');
  }
  return {
    contractVersion: OWNERSHIP_COST_LAUNCH_GATE_VERSION,
    capabilityId: 'ownership-costs' as const,
    state: blockers.length ? 'BLOCKED' as const : 'READY' as const,
    blockers: [...new Set(blockers)],
    valueFunnel: OWNERSHIP_COST_VALUE_FUNNEL,
    evidence: {
      expectedTechnicalEvidenceVersion:
        OWNERSHIP_COST_LAUNCH_EVIDENCE_VERSION,
      recordedTechnicalEvidenceVersion: input.technicalEvidenceVersion,
      expectedOperationalDrillVersion:
        OWNERSHIP_COST_OPERATIONAL_DRILL_VERSION,
      recordedOperationalDrillVersion: input.operationalDrillVersion,
    },
    approvals: {
      accessibility: input.accessibilityApproved,
      responsive: input.responsiveApproved,
      contentSafety: input.contentSafetyApproved,
      commercialIntegrity: input.commercialIntegrityApproved,
      governanceEnforced: input.humanApprovalEnforcementEnabled,
      missingGovernanceRoles: input.missingGovernanceRoles,
      rejectedGovernanceRoles: input.rejectedGovernanceRoles,
    },
    openHighRiskGapIds: input.uncontainedHighRiskGapIds,
  };
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

export async function getOwnershipCostLaunchGate(
  env: NodeJS.ProcessEnv = process.env,
) {
  const capability =
    canonicalCapabilityRegistry.getById('ownership-costs') ?? null;
  const rollout = checkRolloutStatus('OWNERSHIP_COSTS');
  const incidentGate = await checkGate('OWNERSHIP_COSTS');
  let governanceReviewSourceAvailable = true;
  let missingGovernanceRoles: string[] = [];
  let rejectedGovernanceRoles: string[] = [];
  try {
    const readiness = (
      await loadCapabilityGovernanceReadiness(canonicalCapabilityRegistry)
    ).get('ownership-costs');
    missingGovernanceRoles = readiness?.missingRoles ?? [];
    rejectedGovernanceRoles = readiness?.rejectedRoles ?? [];
  } catch {
    governanceReviewSourceAvailable = false;
  }
  return evaluateOwnershipCostLaunchGate({
    capabilityPresent: capability !== null,
    releaseStage: capability?.governance.releaseStage ?? null,
    rolloutEnabled: rollout.enabled,
    incidentGatePassed: incidentGate.pass,
    realUserLaunchEnabled:
      enabled(env.OWNERSHIP_COST_REAL_USER_LAUNCH_ENABLED),
    technicalEvidenceVersion:
      env.OWNERSHIP_COST_LAUNCH_EVIDENCE_VERSION?.trim() || null,
    operationalDrillVersion:
      env.OWNERSHIP_COST_OPERATIONAL_DRILL_VERSION?.trim() || null,
    accessibilityApproved:
      enabled(env.OWNERSHIP_COST_ACCESSIBILITY_APPROVED),
    responsiveApproved:
      enabled(env.OWNERSHIP_COST_RESPONSIVE_APPROVED),
    contentSafetyApproved:
      enabled(env.OWNERSHIP_COST_CONTENT_SAFETY_APPROVED),
    commercialIntegrityApproved:
      enabled(env.OWNERSHIP_COST_COMMERCIAL_INTEGRITY_APPROVED),
    humanApprovalEnforcementEnabled: APP_CONFIG.enforceHumanPolicyApprovals,
    governanceReviewSourceAvailable,
    missingGovernanceRoles,
    rejectedGovernanceRoles,
    uncontainedHighRiskGapIds:
      (env.OWNERSHIP_COST_UNCONTAINED_HIGH_RISK_GAP_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
  });
}

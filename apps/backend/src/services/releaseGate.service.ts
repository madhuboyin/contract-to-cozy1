// apps/backend/src/services/releaseGate.service.ts
//
// KPI gate checker for rollout advancement.
// Evaluates safety/incident health for each tool flag before advancing cohorts.

import { prisma } from '../lib/prisma';
import { TOOL_FLAGS, cohortFromPct, RolloutCohort } from '../config/featureFlags';
import { logger } from '../lib/logger';
import {
  canonicalCapabilityRegistry,
  validateCapabilityGovernanceDefinition,
  type CapabilityGovernanceDefinitionIssue,
  type ToolCapabilityDefinition,
} from '../productFramework/capabilities';
import {
  getToolDiscoveryAvailability,
  type ToolDiscoveryAvailability,
} from './toolDiscoveryAvailability.service';
import { APP_CONFIG } from '../config/appConfig';
import {
  loadCapabilityGovernanceReadiness,
  type CapabilityGovernanceReadiness,
} from './capabilityGovernanceReview.service';

// ============================================================================
// INTERFACES
// ============================================================================

export interface GateCheckResult {
  toolKey: string;
  label: string;
  cohort: RolloutCohort;
  rolloutPct: number;
  pass: boolean;
  issues: string[];
  activeIncidentCount: number;
  checkedAt: string;
}

export const CAPABILITY_LAUNCH_REVIEW_STATES = [
  'READY',
  'HELD',
  'BLOCKED',
] as const;

export type CapabilityLaunchReviewState =
  typeof CAPABILITY_LAUNCH_REVIEW_STATES[number];

export const CAPABILITY_LAUNCH_BLOCKER_CODES = [
  'DISCOVERY_DISABLED',
  'RELEASE_GATES_NOT_ENFORCED',
  'CONFIGURATION_INVALID',
  'REGISTRY_VERSION_MISMATCH',
  'ROLLOUT_KEYS_MISSING',
  'ROLLOUT_KEYS_UNKNOWN',
  'CAPABILITY_DISABLED',
  'ROUTE_UNAVAILABLE',
  'MANIFEST_VERSION_MISMATCH',
  'RELEASE_GATE_BLOCKED',
  'ROLLOUT_MISSING',
  'ROLLOUT_DISABLED',
  'INCIDENT_GATE_FAILED',
  'HUMAN_POLICY_APPROVALS_NOT_ENFORCED',
  'GOVERNANCE_REVIEW_SOURCE_UNAVAILABLE',
  'GOVERNANCE_APPROVAL_MISSING',
  'GOVERNANCE_APPROVAL_REJECTED',
  'DEFINITION_GOVERNANCE_INVALID',
] as const;

export type CapabilityLaunchBlockerCode =
  typeof CAPABILITY_LAUNCH_BLOCKER_CODES[number];

export interface CapabilityLaunchReview {
  capabilityId: string;
  label: string;
  owner: string;
  rolloutKey: string;
  releaseStage: ToolCapabilityDefinition['governance']['releaseStage'];
  safetyTier: ToolCapabilityDefinition['governance']['safetyTier'];
  recommendationMode: ToolCapabilityDefinition['recommendation']['mode'];
  state: CapabilityLaunchReviewState;
  blockers: CapabilityLaunchBlockerCode[];
  rollout: {
    cohort: RolloutCohort;
    rolloutPct: number;
  } | null;
  incidentGate: {
    pass: boolean;
    activeIncidentCount: number;
    issues: string[];
    checkedAt: string;
  } | null;
  governanceReview: {
    enforced: boolean;
    ready: boolean;
    requiredRoles: string[];
    approvedRoles: string[];
    rejectedRoles: string[];
    missingRoles: string[];
  };
  governanceDefinition: {
    valid: boolean;
    issues: CapabilityGovernanceDefinitionIssue[];
    policyVersion: string;
    dataSensitivity:
      ToolCapabilityDefinition['governance']['privacy']['dataSensitivity'];
  };
}

const GLOBAL_CAPABILITY_BLOCKERS = new Set<CapabilityLaunchBlockerCode>([
  'DISCOVERY_DISABLED',
  'RELEASE_GATES_NOT_ENFORCED',
  'CONFIGURATION_INVALID',
  'REGISTRY_VERSION_MISMATCH',
  'ROLLOUT_KEYS_MISSING',
  'ROLLOUT_KEYS_UNKNOWN',
]);

export function buildCapabilityLaunchReviews(
  capabilities: readonly ToolCapabilityDefinition[],
  availability: ToolDiscoveryAvailability,
  gates: readonly GateCheckResult[],
  options: {
    governanceReadiness?: ReadonlyMap<string, CapabilityGovernanceReadiness>;
    enforceHumanPolicyApprovals?: boolean;
    governanceReviewSourceAvailable?: boolean;
  } = {},
): CapabilityLaunchReview[] {
  const gatesByRolloutKey = new Map(
    gates.map((gate) => [gate.toolKey, gate]),
  );
  const globalBlockers = availability.releaseBlockers.filter(
    (blocker): blocker is CapabilityLaunchBlockerCode =>
      GLOBAL_CAPABILITY_BLOCKERS.has(blocker as CapabilityLaunchBlockerCode),
  );
  const enforceHumanPolicyApprovals =
    options.enforceHumanPolicyApprovals ?? false;
  const governanceReviewSourceAvailable =
    options.governanceReviewSourceAvailable ?? true;

  return capabilities.map((capability) => {
    const blockers = [...globalBlockers];
    const gate = gatesByRolloutKey.get(capability.governance.rolloutKey) ?? null;
    const rollout =
      availability.rollouts[capability.governance.rolloutKey] ?? null;
    const governanceReview =
      options.governanceReadiness?.get(capability.id) ?? null;
    const governanceDefinition =
      validateCapabilityGovernanceDefinition(capability);

    if (!governanceDefinition.valid) {
      blockers.push('DEFINITION_GOVERNANCE_INVALID');
    }
    if (!enforceHumanPolicyApprovals) {
      blockers.push('HUMAN_POLICY_APPROVALS_NOT_ENFORCED');
    } else if (!governanceReviewSourceAvailable) {
      blockers.push('GOVERNANCE_REVIEW_SOURCE_UNAVAILABLE');
    } else if (!governanceReview?.ready) {
      blockers.push(
        governanceReview && governanceReview.rejectedRoles.length > 0
          ? 'GOVERNANCE_APPROVAL_REJECTED'
          : 'GOVERNANCE_APPROVAL_MISSING',
      );
    }

    if (availability.disabledToolIds.includes(capability.id)) {
      blockers.push('CAPABILITY_DISABLED');
    }
    if (availability.brokenRouteToolIds.includes(capability.id)) {
      blockers.push('ROUTE_UNAVAILABLE');
    }
    if (availability.manifestVersionMismatchedToolIds.includes(capability.id)) {
      blockers.push('MANIFEST_VERSION_MISMATCH');
    }
    if (availability.releaseGateBlockedToolIds.includes(capability.id)) {
      blockers.push('RELEASE_GATE_BLOCKED');
    }
    if (!rollout) {
      blockers.push('ROLLOUT_MISSING');
    } else if (rollout.rolloutPct <= 0) {
      blockers.push('ROLLOUT_DISABLED');
    }
    if (!gate || !gate.pass) {
      blockers.push('INCIDENT_GATE_FAILED');
    }

    const uniqueBlockers = Array.from(new Set(blockers));
    const heldOnly = uniqueBlockers.every((blocker) =>
      blocker === 'CAPABILITY_DISABLED' || blocker === 'ROLLOUT_DISABLED');
    const state: CapabilityLaunchReviewState = uniqueBlockers.length === 0
      ? 'READY'
      : heldOnly
        ? 'HELD'
        : 'BLOCKED';

    return {
      capabilityId: capability.id,
      label: capability.presentation.label,
      owner: capability.owner,
      rolloutKey: capability.governance.rolloutKey,
      releaseStage: capability.governance.releaseStage,
      safetyTier: capability.governance.safetyTier,
      recommendationMode: capability.recommendation.mode,
      state,
      blockers: uniqueBlockers,
      rollout: rollout
        ? {
            cohort: rollout.cohort,
            rolloutPct: rollout.rolloutPct,
          }
        : null,
      incidentGate: gate
        ? {
            pass: gate.pass,
            activeIncidentCount: gate.activeIncidentCount,
            issues: gate.issues,
            checkedAt: gate.checkedAt,
          }
        : null,
      governanceReview: {
        enforced: enforceHumanPolicyApprovals,
        ready: governanceReview?.ready ?? false,
        requiredRoles: governanceReview?.requiredRoles ?? [],
        approvedRoles: governanceReview?.approvedRoles ?? [],
        rejectedRoles: governanceReview?.rejectedRoles ?? [],
        missingRoles: governanceReview?.missingRoles ?? [],
      },
      governanceDefinition: {
        ...governanceDefinition,
        policyVersion: capability.governance.policyVersion,
        dataSensitivity: capability.governance.privacy.dataSensitivity,
      },
    };
  });
}

// ============================================================================
// checkGate — evaluate a single tool
// ============================================================================

/**
 * Checks the release gate for a given tool key.
 *
 * Gate rules:
 *  1. Flag must exist in the registry.
 *  2. No ACTIVE incidents in the last 24h.
 *  3. No CRITICAL severity incidents in the last 24h.
 */
export async function checkGate(toolKey: string): Promise<GateCheckResult> {
  const checkedAt = new Date().toISOString();
  const issues: string[] = [];

  const flag = TOOL_FLAGS[toolKey];
  if (!flag) {
    return {
      toolKey,
      label: toolKey,
      cohort: 'DISABLED',
      rolloutPct: 0,
      pass: false,
      issues: ['Unknown tool flag'],
      activeIncidentCount: 0,
      checkedAt,
    };
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Count active incidents for this tool in the last 24h
  let activeIncidentCount = 0;
  try {
    activeIncidentCount = await prisma.incident.count({
      where: {
        typeKey: {
          contains: toolKey,
          mode: 'insensitive',
        },
        status: {
          in: ['ACTIVE'],
        },
        createdAt: {
          gte: since24h,
        },
      },
    });

    if (activeIncidentCount > 0) {
      issues.push(`${activeIncidentCount} active incidents in last 24h`);
    }

    // Count CRITICAL severity incidents in last 24h (any status)
    const criticalCount = await prisma.incident.count({
      where: {
        typeKey: {
          contains: toolKey,
          mode: 'insensitive',
        },
        severity: 'CRITICAL',
        createdAt: {
          gte: since24h,
        },
      },
    });

    if (criticalCount > 0) {
      issues.push(`${criticalCount} CRITICAL incidents in last 24h — rollout blocked`);
    }
  } catch (err) {
    issues.push('Failed to query incident data');
    logger.error({ err }, `[ReleaseGate] Error checking gate for ${toolKey}`);
  }

  return {
    toolKey: flag.key,
    label: flag.label,
    cohort: cohortFromPct(flag.rolloutPct),
    rolloutPct: flag.rolloutPct,
    pass: issues.length === 0,
    issues,
    activeIncidentCount,
    checkedAt,
  };
}

// ============================================================================
// checkAllGates — evaluate all registered tools
// ============================================================================

/**
 * Runs checkGate for all keys registered in TOOL_FLAGS.
 */
export async function checkAllGates(): Promise<GateCheckResult[]> {
  const toolKeys = Object.keys(TOOL_FLAGS);
  return Promise.all(toolKeys.map((key) => checkGate(key)));
}

// ============================================================================
// getReleaseSummary — aggregated rollout health
// ============================================================================

/**
 * Returns an aggregated summary of all release gate results.
 */
export async function getReleaseSummary(): Promise<{
  totalTools: number;
  passing: number;
  failing: number;
  byRolloutCohort: Record<RolloutCohort, number>;
  capabilityReviewCounts: Record<CapabilityLaunchReviewState, number>;
  operationalControls: {
    releaseMode: ToolDiscoveryAvailability['releaseMode'];
    failureMode: ToolDiscoveryAvailability['failureMode'];
    releaseReady: boolean;
    releaseBlockers: string[];
    humanPolicyApprovalEnforced: boolean;
    governanceReviewSourceAvailable: boolean;
    globalEnabled: boolean;
    releaseGateEnforced: boolean;
    registryVersion: string;
    expectedRegistryVersion: string | null;
    registryVersionMatches: boolean;
    configurationValid: boolean;
    invalidConfigurationEntries: string[];
    invalidManifestVersionEntries: string[];
    rolloutKeyParity: {
      valid: boolean;
      missingKeys: string[];
      unknownKeys: string[];
    };
    disabledCapabilityIds: string[];
    unknownDisabledCapabilityIds: string[];
    brokenRouteCapabilityIds: string[];
    unknownBrokenRouteCapabilityIds: string[];
    releaseGateBlockedCapabilityIds: string[];
    unknownReleaseGateBlockedCapabilityIds: string[];
    manifestVersionMismatches: Array<{
      capabilityId: string;
      currentVersion: number;
      expectedVersion: number;
    }>;
  };
  capabilityReviews: CapabilityLaunchReview[];
  gates: GateCheckResult[];
}> {
  const gates = await checkAllGates();
  const availability = getToolDiscoveryAvailability();
  let governanceReviewSourceAvailable = true;
  let governanceReadiness = new Map<string, CapabilityGovernanceReadiness>();
  try {
    governanceReadiness = await loadCapabilityGovernanceReadiness(
      canonicalCapabilityRegistry,
    );
  } catch (error) {
    governanceReviewSourceAvailable = false;
    logger.error(
      { err: error },
      '[ReleaseGate] Capability governance reviews failed closed',
    );
  }
  const humanPolicyApprovalEnforced =
    APP_CONFIG.enforceHumanPolicyApprovals;
  const capabilityReviews = buildCapabilityLaunchReviews(
    canonicalCapabilityRegistry.capabilities,
    availability,
    gates,
    {
      governanceReadiness,
      enforceHumanPolicyApprovals: humanPolicyApprovalEnforced,
      governanceReviewSourceAvailable,
    },
  );

  const passing = gates.filter((g) => g.pass).length;
  const failing = gates.length - passing;

  const byRolloutCohort: Record<RolloutCohort, number> = {
    DISABLED: 0,
    INTERNAL: 0,
    BETA: 0,
    FULL: 0,
  };

  for (const gate of gates) {
    byRolloutCohort[gate.cohort] = (byRolloutCohort[gate.cohort] ?? 0) + 1;
  }
  const capabilityReviewCounts: Record<CapabilityLaunchReviewState, number> = {
    READY: 0,
    HELD: 0,
    BLOCKED: 0,
  };
  for (const review of capabilityReviews) {
    capabilityReviewCounts[review.state] += 1;
  }
  const releaseBlockers = [
    ...availability.releaseBlockers,
    ...(!humanPolicyApprovalEnforced
      ? ['HUMAN_POLICY_APPROVALS_NOT_ENFORCED']
      : []),
    ...(!governanceReviewSourceAvailable
      ? ['GOVERNANCE_REVIEW_SOURCE_UNAVAILABLE']
      : []),
    ...(capabilityReviews.some((review) =>
      review.blockers.includes('GOVERNANCE_APPROVAL_MISSING')
      || review.blockers.includes('GOVERNANCE_APPROVAL_REJECTED'))
      ? ['CAPABILITY_GOVERNANCE_BLOCKED']
      : []),
    ...(capabilityReviews.some((review) =>
      review.blockers.includes('DEFINITION_GOVERNANCE_INVALID'))
      ? ['CAPABILITY_DEFINITION_GOVERNANCE_INVALID']
      : []),
    ...(capabilityReviews.some((review) =>
      review.blockers.includes('INCIDENT_GATE_FAILED'))
      ? ['INCIDENT_GATE_FAILED']
      : []),
  ];

  return {
    totalTools: gates.length,
    passing,
    failing,
    byRolloutCohort,
    capabilityReviewCounts,
    operationalControls: {
      releaseMode: availability.releaseMode,
      failureMode: availability.failureMode,
      releaseReady:
        availability.releaseReady
        && capabilityReviews.every((review) => review.state !== 'BLOCKED'),
      releaseBlockers: Array.from(new Set(releaseBlockers)),
      humanPolicyApprovalEnforced,
      governanceReviewSourceAvailable,
      globalEnabled: availability.enabled,
      releaseGateEnforced: availability.enforceReleaseGates,
      registryVersion: availability.registryVersion,
      expectedRegistryVersion: availability.expectedRegistryVersion,
      registryVersionMatches: availability.registryVersionMatches,
      configurationValid: availability.configurationValid,
      invalidConfigurationEntries:
        availability.invalidConfigurationEntries,
      invalidManifestVersionEntries:
        availability.invalidManifestVersionEntries,
      rolloutKeyParity: availability.rolloutKeyParity,
      disabledCapabilityIds: availability.disabledToolIds,
      unknownDisabledCapabilityIds:
        availability.unknownDisabledToolIds,
      brokenRouteCapabilityIds: availability.brokenRouteToolIds,
      unknownBrokenRouteCapabilityIds:
        availability.unknownBrokenRouteToolIds,
      releaseGateBlockedCapabilityIds:
        availability.releaseGateBlockedToolIds,
      unknownReleaseGateBlockedCapabilityIds:
        availability.unknownReleaseGateBlockedToolIds,
      manifestVersionMismatches: Object.entries(
        availability.manifestVersions,
      ).filter(([capabilityId]) =>
        availability.manifestVersionMismatchedToolIds.includes(capabilityId))
      .flatMap(([capabilityId, expectedVersion]) => {
        const capability = canonicalCapabilityRegistry.getById(capabilityId);
        return capability && capability.version !== expectedVersion
          ? [{
              capabilityId,
              currentVersion: capability.version,
              expectedVersion,
            }]
          : [];
      }),
    },
    capabilityReviews,
    gates,
  };
}

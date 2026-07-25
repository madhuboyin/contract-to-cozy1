import type { ToolCapabilityDefinition } from './capability.contract';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

export const CAPABILITY_AVAILABILITY_FAILURE_MODES = [
  'BETA_FAIL_OPEN',
  'LAUNCH_FAIL_CLOSED',
] as const;

export type CapabilityAvailabilityFailureMode =
  typeof CAPABILITY_AVAILABILITY_FAILURE_MODES[number];

export type CapabilityRolloutStatus = {
  enabled: boolean;
  cohort: 'DISABLED' | 'INTERNAL' | 'BETA' | 'FULL';
  rolloutPct: number;
};

export type CapabilityAvailabilityPolicy = {
  enabled: boolean;
  enforceReleaseGates: boolean;
  disabledToolIds: readonly string[];
  brokenRouteToolIds?: readonly string[];
  releaseGateBlockedToolIds?: readonly string[];
  configurationValid?: boolean;
  registryVersionMatches?: boolean;
  manifestVersions?: Readonly<Record<string, number>>;
  rollouts: Readonly<Record<string, CapabilityRolloutStatus>>;
};

export const CAPABILITY_UNAVAILABLE_REASONS = [
  'UNKNOWN_CAPABILITY',
  'POLICY_UNAVAILABLE',
  'DISCOVERY_DISABLED',
  'CONFIGURATION_INVALID',
  'REGISTRY_VERSION_MISMATCH',
  'CAPABILITY_DISABLED',
  'ROUTE_UNAVAILABLE',
  'MANIFEST_VERSION_MISMATCH',
  'RELEASE_GATE_BLOCKED',
  'ROLLOUT_MISSING',
  'ROLLOUT_DISABLED',
] as const;

export type CapabilityUnavailableReason =
  typeof CAPABILITY_UNAVAILABLE_REASONS[number];

export type CapabilityAvailabilityDecision = {
  capabilityId: string;
  available: boolean;
  reason: CapabilityUnavailableReason | null;
  rollout: CapabilityRolloutStatus | null;
  policyApplied: boolean;
};

export type CapabilityAvailabilityAdapter = {
  resolve: (capabilityId: string, userId?: string) => CapabilityAvailabilityDecision;
  listAvailable: (options?: {
    userId?: string;
    includeWorkflowOnly?: boolean;
  }) => readonly ToolCapabilityDefinition[];
};

type CapabilityAvailabilityAdapterOptions = {
  registry: ToolCapabilityRegistry;
  loadPolicy: (userId?: string) => CapabilityAvailabilityPolicy | null | undefined;
  failureMode?: CapabilityAvailabilityFailureMode;
};

function unavailable(
  capabilityId: string,
  reason: CapabilityUnavailableReason,
  policyApplied: boolean,
  rollout: CapabilityRolloutStatus | null = null,
): CapabilityAvailabilityDecision {
  return {
    capabilityId,
    available: false,
    reason,
    rollout,
    policyApplied,
  };
}

export function evaluateCapabilityAvailability(
  capability: ToolCapabilityDefinition,
  policy: CapabilityAvailabilityPolicy | null | undefined,
  failureMode: CapabilityAvailabilityFailureMode = 'BETA_FAIL_OPEN',
): CapabilityAvailabilityDecision {
  if (!policy) {
    if (failureMode === 'BETA_FAIL_OPEN') {
      return {
        capabilityId: capability.id,
        available: true,
        reason: null,
        rollout: null,
        policyApplied: false,
      };
    }
    return unavailable(capability.id, 'POLICY_UNAVAILABLE', false);
  }

  if (!policy.enabled) {
    return unavailable(capability.id, 'DISCOVERY_DISABLED', true);
  }

  if (policy.configurationValid === false) {
    return unavailable(capability.id, 'CONFIGURATION_INVALID', true);
  }

  if (policy.registryVersionMatches === false) {
    return unavailable(capability.id, 'REGISTRY_VERSION_MISMATCH', true);
  }

  if (policy.disabledToolIds.includes(capability.id)) {
    return unavailable(capability.id, 'CAPABILITY_DISABLED', true);
  }

  if (policy.brokenRouteToolIds?.includes(capability.id)) {
    return unavailable(capability.id, 'ROUTE_UNAVAILABLE', true);
  }

  const pinnedManifestVersion = policy.manifestVersions?.[capability.id];
  if (
    pinnedManifestVersion !== undefined
    && pinnedManifestVersion !== capability.version
  ) {
    return unavailable(capability.id, 'MANIFEST_VERSION_MISMATCH', true);
  }

  if (!policy.enforceReleaseGates) {
    return {
      capabilityId: capability.id,
      available: true,
      reason: null,
      rollout: policy.rollouts[capability.governance.rolloutKey] ?? null,
      policyApplied: true,
    };
  }

  if (policy.releaseGateBlockedToolIds?.includes(capability.id)) {
    return unavailable(capability.id, 'RELEASE_GATE_BLOCKED', true);
  }

  const rollout = policy.rollouts[capability.governance.rolloutKey];
  if (!rollout) {
    return unavailable(capability.id, 'ROLLOUT_MISSING', true);
  }
  if (!rollout.enabled) {
    return unavailable(capability.id, 'ROLLOUT_DISABLED', true, rollout);
  }

  return {
    capabilityId: capability.id,
    available: true,
    reason: null,
    rollout,
    policyApplied: true,
  };
}

export function createCapabilityAvailabilityAdapter(
  options: CapabilityAvailabilityAdapterOptions,
): CapabilityAvailabilityAdapter {
  const failureMode = options.failureMode ?? 'BETA_FAIL_OPEN';
  const loadPolicy = (userId?: string): CapabilityAvailabilityPolicy | undefined => {
    try {
      return options.loadPolicy(userId) ?? undefined;
    } catch {
      return undefined;
    }
  };

  return {
    resolve(capabilityId, userId) {
      const capability = options.registry.getById(capabilityId);
      if (!capability) {
        return unavailable(capabilityId, 'UNKNOWN_CAPABILITY', true);
      }
      return evaluateCapabilityAvailability(
        capability,
        loadPolicy(userId),
        failureMode,
      );
    },
    listAvailable({ userId, includeWorkflowOnly = false } = {}) {
      const policy = loadPolicy(userId);
      return options.registry.capabilities.filter((capability) => {
        if (!includeWorkflowOnly && capability.destination.workflowOnly) return false;
        return evaluateCapabilityAvailability(capability, policy, failureMode).available;
      });
    },
  };
}

import { checkRolloutStatus } from '../middleware/rollout.middleware';
import { TOOL_FLAGS, type RolloutCohort } from '../config/featureFlags';
import {
  canonicalCapabilityRegistry,
  createCapabilityAvailabilityAdapter,
  type CapabilityAvailabilityAdapter,
  type CapabilityAvailabilityFailureMode,
  type ToolCapabilityRegistry,
} from '../productFramework/capabilities';

export type ToolDiscoveryAvailability = {
  enabled: boolean;
  enforceReleaseGates: boolean;
  disabledToolIds: string[];
  brokenRouteToolIds: string[];
  releaseGateBlockedToolIds: string[];
  registryVersion: string;
  expectedRegistryVersion: string | null;
  registryVersionMatches: boolean;
  manifestVersions: Record<string, number>;
  manifestVersionMismatchedToolIds: string[];
  configurationValid: boolean;
  manifestVersionConfigValid: boolean;
  invalidManifestVersionEntries: string[];
  rolloutKeyParity: {
    valid: boolean;
    missingKeys: string[];
    unknownKeys: string[];
  };
  rollouts: Record<string, {
    enabled: boolean;
    cohort: RolloutCohort;
    rolloutPct: number;
  }>;
  generatedAt: string;
};

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  if (value.trim().toLowerCase() === 'true') return true;
  if (value.trim().toLowerCase() === 'false') return false;
  return fallback;
}

function readDisabledToolIds(value: string | undefined): string[] {
  return [...new Set((value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean))]
    .sort();
}

function readManifestVersions(value: string | undefined): {
  versions: Record<string, number>;
  invalidEntries: string[];
} {
  const versions: Record<string, number> = {};
  const invalidEntries: string[] = [];
  for (const entry of (value ?? '').split(',')) {
    if (!entry.trim()) continue;
    const [rawId, rawVersion, ...rest] = entry.split(':');
    const id = rawId?.trim().toLowerCase();
    const version = Number(rawVersion?.trim());
    if (
      rest.length === 0
      && id
      && Number.isInteger(version)
      && version > 0
    ) {
      versions[id] = version;
    } else {
      invalidEntries.push(entry.trim());
    }
  }
  return {
    versions: Object.fromEntries(
      Object.entries(versions).sort(([left], [right]) =>
        left.localeCompare(right)),
    ),
    invalidEntries: invalidEntries.sort(),
  };
}

export function getToolDiscoveryAvailability(
  userId?: string,
  env: NodeJS.ProcessEnv = process.env,
  registry: ToolCapabilityRegistry = canonicalCapabilityRegistry,
): ToolDiscoveryAvailability {
  const enabled = readBoolean(env.TOOL_DISCOVERY_ENABLED, true);
  const enforceReleaseGates = readBoolean(env.ENFORCE_TOOL_DISCOVERY_RELEASE_GATES, false);
  const disabledToolIds = readDisabledToolIds(env.TOOL_DISCOVERY_DISABLED_IDS);
  const brokenRouteToolIds = readDisabledToolIds(
    env.TOOL_DISCOVERY_BROKEN_ROUTE_IDS,
  );
  const releaseGateBlockedToolIds = readDisabledToolIds(
    env.TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS,
  );
  const manifestVersionConfig = readManifestVersions(
    env.TOOL_DISCOVERY_MANIFEST_VERSIONS,
  );
  const manifestVersions = manifestVersionConfig.versions;
  const unknownManifestCapabilityIds = Object.keys(manifestVersions)
    .filter((capabilityId) => !registry.getById(capabilityId));
  const invalidManifestVersionEntries = [
    ...manifestVersionConfig.invalidEntries,
    ...unknownManifestCapabilityIds.map((capabilityId) =>
      `${capabilityId}:${manifestVersions[capabilityId]}`),
  ].sort();
  const manifestVersionMismatchedToolIds = Object.entries(manifestVersions)
    .flatMap(([capabilityId, expectedVersion]) => {
      const capability = registry.getById(capabilityId);
      return capability && capability.version !== expectedVersion
        ? [capabilityId]
        : [];
    })
    .sort();
  const expectedRegistryVersion =
    env.TOOL_DISCOVERY_EXPECTED_REGISTRY_VERSION?.trim() || null;
  const registryVersionMatches =
    expectedRegistryVersion === null
    || expectedRegistryVersion === registry.version;
  const registryRolloutKeys = new Set(
    registry.capabilities.map((capability) =>
      capability.governance.rolloutKey),
  );
  const configuredRolloutKeys = new Set(Object.keys(TOOL_FLAGS));
  const missingKeys = [...registryRolloutKeys]
    .filter((key) => !configuredRolloutKeys.has(key))
    .sort();
  const unknownKeys = [...configuredRolloutKeys]
    .filter((key) => !registryRolloutKeys.has(key))
    .sort();

  const rollouts = Object.fromEntries(
    Object.keys(TOOL_FLAGS).map((flagKey) => [flagKey, checkRolloutStatus(flagKey, userId)]),
  );

  return {
    enabled,
    enforceReleaseGates,
    disabledToolIds,
    brokenRouteToolIds,
    releaseGateBlockedToolIds,
    registryVersion: registry.version,
    expectedRegistryVersion,
    registryVersionMatches,
    manifestVersions,
    manifestVersionMismatchedToolIds,
    configurationValid: invalidManifestVersionEntries.length === 0,
    manifestVersionConfigValid:
      invalidManifestVersionEntries.length === 0,
    invalidManifestVersionEntries,
    rolloutKeyParity: {
      valid: missingKeys.length === 0 && unknownKeys.length === 0,
      missingKeys,
      unknownKeys,
    },
    rollouts,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Keeps the current environment and cohort configuration authoritative while
 * exposing capability-level decisions through the Product Framework boundary.
 */
export function createToolDiscoveryCapabilityAvailabilityAdapter(
  registry: ToolCapabilityRegistry,
  options: {
    env?: NodeJS.ProcessEnv;
    failureMode?: CapabilityAvailabilityFailureMode;
  } = {},
): CapabilityAvailabilityAdapter {
  const env = options.env ?? process.env;
  return createCapabilityAvailabilityAdapter({
    registry,
    failureMode: options.failureMode,
    loadPolicy: (userId) =>
      getToolDiscoveryAvailability(userId, env, registry),
  });
}

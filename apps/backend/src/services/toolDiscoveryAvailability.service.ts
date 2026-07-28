import { checkRolloutStatus } from '../middleware/rollout.middleware';
import { TOOL_FLAGS, type RolloutCohort } from '../config/featureFlags';
import {
  canonicalCapabilityRegistry,
  createCapabilityAvailabilityAdapter,
  type CapabilityAvailabilityAdapter,
  type CapabilityAvailabilityFailureMode,
  type ToolCapabilityRegistry,
} from '../productFramework/capabilities';

export const TOOL_DISCOVERY_RELEASE_MODES = [
  'INTERNAL_BETA',
  'REAL_USER_LAUNCH',
] as const;

export type ToolDiscoveryReleaseMode =
  typeof TOOL_DISCOVERY_RELEASE_MODES[number];

export type ToolDiscoveryAvailability = {
  releaseMode: ToolDiscoveryReleaseMode;
  failureMode: CapabilityAvailabilityFailureMode;
  releaseReady: boolean;
  releaseBlockers: string[];
  enabled: boolean;
  enforceReleaseGates: boolean;
  disabledToolIds: string[];
  unknownDisabledToolIds: string[];
  brokenRouteToolIds: string[];
  unknownBrokenRouteToolIds: string[];
  releaseGateBlockedToolIds: string[];
  unknownReleaseGateBlockedToolIds: string[];
  registryVersion: string;
  expectedRegistryVersion: string | null;
  registryVersionMatches: boolean;
  manifestVersions: Record<string, number>;
  manifestVersionMismatchedToolIds: string[];
  configurationValid: boolean;
  invalidConfigurationEntries: string[];
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

const LEGACY_TOOL_ROLLOUT_KEYS = new Set<string>();

function readReleaseMode(value: string | undefined): {
  mode: ToolDiscoveryReleaseMode;
  valid: boolean;
} {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || normalized === 'REAL_USER_LAUNCH') {
    return { mode: 'REAL_USER_LAUNCH', valid: true };
  }
  if (normalized === 'INTERNAL_BETA') {
    return { mode: 'INTERNAL_BETA', valid: true };
  }
  return { mode: 'REAL_USER_LAUNCH', valid: false };
}

function failureModeForReleaseMode(
  releaseMode: ToolDiscoveryReleaseMode,
): CapabilityAvailabilityFailureMode {
  return releaseMode === 'INTERNAL_BETA'
    ? 'BETA_FAIL_OPEN'
    : 'LAUNCH_FAIL_CLOSED';
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  if (value.trim().toLowerCase() === 'true') return true;
  if (value.trim().toLowerCase() === 'false') return false;
  return fallback;
}

function booleanSettingIsValid(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return true;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'false';
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
  const releaseModeSetting = readReleaseMode(
    env.TOOL_DISCOVERY_RELEASE_MODE,
  );
  const releaseMode = releaseModeSetting.mode;
  const failureMode = failureModeForReleaseMode(releaseMode);
  const enabled = readBoolean(env.TOOL_DISCOVERY_ENABLED, true);
  const enforceReleaseGates = readBoolean(env.ENFORCE_TOOL_DISCOVERY_RELEASE_GATES, false);
  const disabledToolIds = readDisabledToolIds(env.TOOL_DISCOVERY_DISABLED_IDS);
  const brokenRouteToolIds = readDisabledToolIds(
    env.TOOL_DISCOVERY_BROKEN_ROUTE_IDS,
  );
  const releaseGateBlockedToolIds = readDisabledToolIds(
    env.TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS,
  );
  const unknownDisabledToolIds = disabledToolIds
    .filter((capabilityId) => !registry.getById(capabilityId));
  const unknownBrokenRouteToolIds = brokenRouteToolIds
    .filter((capabilityId) => !registry.getById(capabilityId));
  const unknownReleaseGateBlockedToolIds = releaseGateBlockedToolIds
    .filter((capabilityId) => !registry.getById(capabilityId));
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
    .filter((key) =>
      !registryRolloutKeys.has(key) && !LEGACY_TOOL_ROLLOUT_KEYS.has(key))
    .sort();

  const rollouts = Object.fromEntries(
    Object.keys(TOOL_FLAGS).map((flagKey) => [flagKey, checkRolloutStatus(flagKey, userId)]),
  );
  const invalidConfigurationEntries = [
    ...(!releaseModeSetting.valid ? ['TOOL_DISCOVERY_RELEASE_MODE'] : []),
    ...(!booleanSettingIsValid(env.TOOL_DISCOVERY_ENABLED)
      ? ['TOOL_DISCOVERY_ENABLED']
      : []),
    ...(!booleanSettingIsValid(env.ENFORCE_TOOL_DISCOVERY_RELEASE_GATES)
      ? ['ENFORCE_TOOL_DISCOVERY_RELEASE_GATES']
      : []),
    ...(invalidManifestVersionEntries.length > 0
      ? ['TOOL_DISCOVERY_MANIFEST_VERSIONS']
      : []),
    ...(unknownDisabledToolIds.length > 0
      ? ['TOOL_DISCOVERY_DISABLED_IDS']
      : []),
    ...(unknownBrokenRouteToolIds.length > 0
      ? ['TOOL_DISCOVERY_BROKEN_ROUTE_IDS']
      : []),
    ...(unknownReleaseGateBlockedToolIds.length > 0
      ? ['TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS']
      : []),
  ];
  const configurationValid = invalidConfigurationEntries.length === 0;
  const releaseBlockers = [
    ...(!enabled ? ['DISCOVERY_DISABLED'] : []),
    ...(!enforceReleaseGates ? ['RELEASE_GATES_NOT_ENFORCED'] : []),
    ...(!configurationValid ? ['CONFIGURATION_INVALID'] : []),
    ...(!registryVersionMatches ? ['REGISTRY_VERSION_MISMATCH'] : []),
    ...(missingKeys.length > 0 ? ['ROLLOUT_KEYS_MISSING'] : []),
    ...(unknownKeys.length > 0 ? ['ROLLOUT_KEYS_UNKNOWN'] : []),
    ...(manifestVersionMismatchedToolIds.length > 0
      ? ['MANIFEST_VERSION_MISMATCH']
      : []),
  ];

  return {
    releaseMode,
    failureMode,
    releaseReady: releaseBlockers.length === 0,
    releaseBlockers,
    enabled,
    enforceReleaseGates,
    disabledToolIds,
    unknownDisabledToolIds,
    brokenRouteToolIds,
    unknownBrokenRouteToolIds,
    releaseGateBlockedToolIds,
    unknownReleaseGateBlockedToolIds,
    registryVersion: registry.version,
    expectedRegistryVersion,
    registryVersionMatches,
    manifestVersions,
    manifestVersionMismatchedToolIds,
    configurationValid,
    invalidConfigurationEntries,
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
  const releaseMode = readReleaseMode(env.TOOL_DISCOVERY_RELEASE_MODE).mode;
  return createCapabilityAvailabilityAdapter({
    registry,
    failureMode:
      options.failureMode ?? failureModeForReleaseMode(releaseMode),
    loadPolicy: (userId) =>
      getToolDiscoveryAvailability(userId, env, registry),
  });
}

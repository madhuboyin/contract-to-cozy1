import { checkRolloutStatus } from '../middleware/rollout.middleware';
import { TOOL_FLAGS, type RolloutCohort } from '../config/featureFlags';
import {
  createCapabilityAvailabilityAdapter,
  type CapabilityAvailabilityAdapter,
  type CapabilityAvailabilityFailureMode,
  type ToolCapabilityRegistry,
} from '../productFramework/capabilities';

export type ToolDiscoveryAvailability = {
  enabled: boolean;
  enforceReleaseGates: boolean;
  disabledToolIds: string[];
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

export function getToolDiscoveryAvailability(
  userId?: string,
  env: NodeJS.ProcessEnv = process.env,
): ToolDiscoveryAvailability {
  const enabled = readBoolean(env.TOOL_DISCOVERY_ENABLED, true);
  const enforceReleaseGates = readBoolean(env.ENFORCE_TOOL_DISCOVERY_RELEASE_GATES, false);
  const disabledToolIds = readDisabledToolIds(env.TOOL_DISCOVERY_DISABLED_IDS);

  const rollouts = Object.fromEntries(
    Object.keys(TOOL_FLAGS).map((flagKey) => [flagKey, checkRolloutStatus(flagKey, userId)]),
  );

  return {
    enabled,
    enforceReleaseGates,
    disabledToolIds,
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
    loadPolicy: (userId) => getToolDiscoveryAvailability(userId, env),
  });
}

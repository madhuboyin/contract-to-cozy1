import {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  type CapabilityAvailabilityDecision,
  type ToolCapabilityRegistry,
} from '../productFramework/capabilities';
import {
  createToolDiscoveryCapabilityAvailabilityAdapter,
  getToolDiscoveryAvailability,
} from './toolDiscoveryAvailability.service';

export const CAPABILITY_KILL_SWITCH_DRILL_CONTRACT_VERSION =
  'capability-kill-switch-drill-v1' as const;

type DecisionSnapshot = Pick<
  CapabilityAvailabilityDecision,
  'available' | 'reason' | 'policyApplied' | 'rollout'
>;

export type CapabilityKillSwitchDrillReport = {
  contractVersion: typeof CAPABILITY_KILL_SWITCH_DRILL_CONTRACT_VERSION;
  checkedAt: string;
  registryVersion: string;
  capabilityCount: number;
  passed: boolean;
  baseline: {
    releaseReady: boolean;
    releaseBlockers: string[];
    availableCapabilityCount: number;
    catalogCapabilityCount: number;
  };
  perCapability: Array<{
    capabilityId: string;
    passed: boolean;
    decisionReason: string | null;
    removedFromCatalog: boolean;
    otherDecisionsPreserved: boolean;
  }>;
  global: {
    passed: boolean;
    suppressedCapabilityCount: number;
    catalogCapabilityCount: number;
    decisionReasons: string[];
  };
  restoration: {
    passed: boolean;
    decisionsRestored: boolean;
    catalogRestored: boolean;
  };
};

function manifestPins(registry: ToolCapabilityRegistry): string {
  return registry.capabilities
    .map((capability) => `${capability.id}:${capability.version}`)
    .join(',');
}

function drillBaselineEnvironment(
  env: NodeJS.ProcessEnv,
  registry: ToolCapabilityRegistry,
): NodeJS.ProcessEnv {
  return {
    ...env,
    TOOL_DISCOVERY_RELEASE_MODE: 'REAL_USER_LAUNCH',
    TOOL_DISCOVERY_ENABLED: 'true',
    ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: 'true',
    TOOL_DISCOVERY_DISABLED_IDS: '',
    TOOL_DISCOVERY_BROKEN_ROUTE_IDS: '',
    TOOL_DISCOVERY_RELEASE_GATE_BLOCKED_IDS: '',
    TOOL_DISCOVERY_EXPECTED_REGISTRY_VERSION: registry.version,
    TOOL_DISCOVERY_MANIFEST_VERSIONS: manifestPins(registry),
  };
}

function decisionSnapshot(
  decision: CapabilityAvailabilityDecision,
): DecisionSnapshot {
  return {
    available: decision.available,
    reason: decision.reason,
    policyApplied: decision.policyApplied,
    rollout: decision.rollout,
  };
}

function snapshots(
  registry: ToolCapabilityRegistry,
  env: NodeJS.ProcessEnv,
  userId: string,
): Map<string, DecisionSnapshot> {
  const adapter = createToolDiscoveryCapabilityAvailabilityAdapter(registry, {
    env,
  });
  return new Map(registry.capabilities.map((capability) => [
    capability.id,
    decisionSnapshot(adapter.resolve(capability.id, userId)),
  ]));
}

function catalogIds(
  registry: ToolCapabilityRegistry,
  env: NodeJS.ProcessEnv,
  userId: string,
): string[] {
  const availability = createToolDiscoveryCapabilityAvailabilityAdapter(
    registry,
    { env },
  );
  return buildCapabilityCatalog({
    registry,
    availability,
    userId,
    propertyId: 'kill-switch-drill-property',
    includeWorkflowContext: true,
  }).capabilities.map((capability) => capability.id);
}

function equalSnapshotMaps(
  left: Map<string, DecisionSnapshot>,
  right: Map<string, DecisionSnapshot>,
): boolean {
  return left.size === right.size
    && [...left].every(([capabilityId, decision]) =>
      JSON.stringify(decision) === JSON.stringify(right.get(capabilityId)));
}

export function runCapabilityKillSwitchDrill(options: {
  env?: NodeJS.ProcessEnv;
  registry?: ToolCapabilityRegistry;
  userId?: string;
  now?: Date;
} = {}): CapabilityKillSwitchDrillReport {
  const registry = options.registry ?? canonicalCapabilityRegistry;
  const userId = options.userId ?? 'capability-kill-switch-drill-user';
  const baselineEnv = drillBaselineEnvironment(
    options.env ?? process.env,
    registry,
  );
  const baselineAvailability = getToolDiscoveryAvailability(
    userId,
    baselineEnv,
    registry,
  );
  const baselineDecisions = snapshots(registry, baselineEnv, userId);
  const baselineCatalog = catalogIds(registry, baselineEnv, userId);

  const perCapability = registry.capabilities.map((capability) => {
    const disabledEnv = {
      ...baselineEnv,
      TOOL_DISCOVERY_DISABLED_IDS: capability.id,
    };
    const disabledDecisions = snapshots(registry, disabledEnv, userId);
    const disabledCatalog = catalogIds(registry, disabledEnv, userId);
    const targetDecision = disabledDecisions.get(capability.id);
    const otherDecisionsPreserved = registry.capabilities
      .filter((candidate) => candidate.id !== capability.id)
      .every((candidate) =>
        JSON.stringify(disabledDecisions.get(candidate.id))
        === JSON.stringify(baselineDecisions.get(candidate.id)));
    const removedFromCatalog = !disabledCatalog.includes(capability.id);
    const passed =
      targetDecision?.available === false
      && targetDecision.reason === 'CAPABILITY_DISABLED'
      && removedFromCatalog
      && otherDecisionsPreserved;

    return {
      capabilityId: capability.id,
      passed,
      decisionReason: targetDecision?.reason ?? null,
      removedFromCatalog,
      otherDecisionsPreserved,
    };
  });

  const globalEnv = {
    ...baselineEnv,
    TOOL_DISCOVERY_ENABLED: 'false',
  };
  const globalDecisions = snapshots(registry, globalEnv, userId);
  const globalCatalog = catalogIds(registry, globalEnv, userId);
  const globalReasons = [...new Set(
    [...globalDecisions.values()].map((decision) => decision.reason ?? 'NONE'),
  )].sort();
  const suppressedCapabilityCount = [...globalDecisions.values()]
    .filter((decision) =>
      !decision.available && decision.reason === 'DISCOVERY_DISABLED')
    .length;
  const globalPassed =
    suppressedCapabilityCount === registry.capabilities.length
    && globalCatalog.length === 0
    && globalReasons.length === 1
    && globalReasons[0] === 'DISCOVERY_DISABLED';

  const restoredDecisions = snapshots(registry, baselineEnv, userId);
  const restoredCatalog = catalogIds(registry, baselineEnv, userId);
  const decisionsRestored = equalSnapshotMaps(
    baselineDecisions,
    restoredDecisions,
  );
  const catalogRestored =
    JSON.stringify(baselineCatalog) === JSON.stringify(restoredCatalog);
  const restorationPassed = decisionsRestored && catalogRestored;
  const passed =
    baselineAvailability.releaseReady
    && perCapability.every((result) => result.passed)
    && globalPassed
    && restorationPassed;

  return {
    contractVersion: CAPABILITY_KILL_SWITCH_DRILL_CONTRACT_VERSION,
    checkedAt: (options.now ?? new Date()).toISOString(),
    registryVersion: registry.version,
    capabilityCount: registry.capabilities.length,
    passed,
    baseline: {
      releaseReady: baselineAvailability.releaseReady,
      releaseBlockers: baselineAvailability.releaseBlockers,
      availableCapabilityCount: [...baselineDecisions.values()]
        .filter((decision) => decision.available).length,
      catalogCapabilityCount: baselineCatalog.length,
    },
    perCapability,
    global: {
      passed: globalPassed,
      suppressedCapabilityCount,
      catalogCapabilityCount: globalCatalog.length,
      decisionReasons: globalReasons,
    },
    restoration: {
      passed: restorationPassed,
      decisionsRestored,
      catalogRestored,
    },
  };
}

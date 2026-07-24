import { createHash } from 'node:crypto';
import {
  ToolCapabilityDefinitionSchema,
  type ToolCapabilityDefinition,
} from './capability.contract';

export type ToolCapabilityRegistry = {
  version: string;
  capabilities: readonly ToolCapabilityDefinition[];
  getById: (id: string) => ToolCapabilityDefinition | undefined;
  getByRoute: (route: string) => ToolCapabilityDefinition | undefined;
};

function stableRegistryInput(capabilities: ToolCapabilityDefinition[]): string {
  return JSON.stringify(
    capabilities
      .map((capability) => ({
        id: capability.id,
        version: capability.version,
        routeTemplate: capability.destination.routeTemplate,
        routeAliases: [...capability.destination.routeAliases].sort(),
        rolloutKey: capability.governance.rolloutKey,
        acceptedContext: [...capability.destination.acceptedContext].sort(),
        workflowOnly: capability.destination.workflowOnly,
        primaryJob: capability.productFramework.primaryJob,
        primaryDestination: capability.productFramework.primaryDestination,
        outcomeCategory: capability.presentation.outcomeCategory,
        triggerFamilies: [...capability.recommendation.triggerFamilies].sort(),
        explicitRelatedCapabilityIds: [
          ...capability.recommendation.explicitRelatedCapabilityIds,
        ],
        safetyTier: capability.governance.safetyTier,
        outputEntityTypes: [...capability.lifecycle.outputEntityTypes].sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
}

export function createToolCapabilityRegistry(
  inputs: readonly ToolCapabilityDefinition[],
): ToolCapabilityRegistry {
  const capabilities = inputs.map((input) => ToolCapabilityDefinitionSchema.parse(input));
  const byId = new Map<string, ToolCapabilityDefinition>();
  const byRoute = new Map<string, ToolCapabilityDefinition>();
  const byRolloutKey = new Map<string, ToolCapabilityDefinition>();

  for (const capability of capabilities) {
    if (byId.has(capability.id)) {
      throw new Error(`Duplicate capability ID: ${capability.id}`);
    }
    byId.set(capability.id, capability);

    if (byRolloutKey.has(capability.governance.rolloutKey)) {
      throw new Error(`Duplicate capability rollout key: ${capability.governance.rolloutKey}`);
    }
    byRolloutKey.set(capability.governance.rolloutKey, capability);

    for (const route of [
      capability.destination.routeTemplate,
      ...capability.destination.routeAliases,
    ]) {
      const existing = byRoute.get(route);
      if (existing) {
        throw new Error(
          `Capability route collision: ${route} is declared by ${existing.id} and ${capability.id}`,
        );
      }
      byRoute.set(route, capability);
    }
  }

  for (const capability of capabilities) {
    for (const relatedId of capability.recommendation.explicitRelatedCapabilityIds) {
      if (relatedId === capability.id) {
        throw new Error(`Capability ${capability.id} cannot relate to itself`);
      }
      if (!byId.has(relatedId)) {
        throw new Error(
          `Capability ${capability.id} references unknown related capability ${relatedId}`,
        );
      }
    }
  }

  const sortedCapabilities = [...capabilities].sort((left, right) => left.id.localeCompare(right.id));
  const version = createHash('sha256')
    .update(stableRegistryInput(sortedCapabilities))
    .digest('hex')
    .slice(0, 16);

  return {
    version,
    capabilities: Object.freeze(sortedCapabilities),
    getById: (id) => byId.get(id),
    getByRoute: (route) => byRoute.get(route),
  };
}

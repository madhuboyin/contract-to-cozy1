import {
  HVAC_REPAIR_REPLACE_AGENT_DEFINITION,
  REPAIR_REPLACE_AGENT_DEFINITION_V1_1,
  REPAIR_REPLACE_AGENT_DEFINITION_V1_2,
} from './definitions/hvacRepairReplaceAgent.definition';
import type { AgentDefinition, VersionedAgentRegistryEntry } from './agent.contract';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    if (!Object.isFrozen(value)) Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const AGENT_DEFINITION_REGISTRY = deepFreeze({
  [HVAC_REPAIR_REPLACE_AGENT_DEFINITION.agentId]: {
    activeVersion: REPAIR_REPLACE_AGENT_DEFINITION_V1_2.version,
    versions: {
      [HVAC_REPAIR_REPLACE_AGENT_DEFINITION.version]: HVAC_REPAIR_REPLACE_AGENT_DEFINITION,
      [REPAIR_REPLACE_AGENT_DEFINITION_V1_1.version]: REPAIR_REPLACE_AGENT_DEFINITION_V1_1,
      [REPAIR_REPLACE_AGENT_DEFINITION_V1_2.version]: REPAIR_REPLACE_AGENT_DEFINITION_V1_2,
    },
  },
} satisfies Readonly<Record<string, VersionedAgentRegistryEntry>>);

export type AgentId = keyof typeof AGENT_DEFINITION_REGISTRY;

export function getAgentDefinition(agentId: string, version?: string): AgentDefinition | undefined {
  const entry = AGENT_DEFINITION_REGISTRY[agentId as AgentId];
  if (!entry) return undefined;
  return entry.versions[version ?? entry.activeVersion];
}

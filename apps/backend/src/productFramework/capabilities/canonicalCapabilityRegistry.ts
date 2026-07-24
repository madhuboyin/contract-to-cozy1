import { createToolCapabilityRegistry } from './capabilityRegistry';
import { ALL_TOOL_CAPABILITY_DEFINITIONS } from './definitions';

/**
 * Importing this singleton is the startup assertion for all canonical
 * homeowner capability definitions and their cross-references.
 */
export const canonicalCapabilityRegistry = createToolCapabilityRegistry(
  ALL_TOOL_CAPABILITY_DEFINITIONS,
);

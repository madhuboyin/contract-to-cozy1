import { z } from 'zod';
import type { CapabilityAvailabilityAdapter } from './capabilityAvailability';
import {
  CAPABILITY_CONTEXT_TYPES,
  CAPABILITY_DESTINATIONS,
  CAPABILITY_ICON_NAMES,
  CAPABILITY_OUTCOME_CATEGORIES,
  CAPABILITY_READINESS_REQUIREMENT_KINDS,
  CAPABILITY_RELEASE_STAGES,
} from './capability.contract';
import type { ToolCapabilityRegistry } from './capabilityRegistry';
import { HOMEOWNER_JOBS } from '../homeAction.contract';

export const CapabilityCatalogReadinessRequirementSchema = z.object({
  kind: z.enum(CAPABILITY_READINESS_REQUIREMENT_KINDS),
  minimum: z.number().int().min(0).optional(),
  contextType: z.enum(CAPABILITY_CONTEXT_TYPES).optional(),
  reason: z.string().trim().min(1),
});

export const CapabilityCatalogItemSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  label: z.string(),
  shortDescription: z.string(),
  longDescription: z.string(),
  iconName: z.enum(CAPABILITY_ICON_NAMES),
  outcomeCategory: z.enum(CAPABILITY_OUTCOME_CATEGORIES),
  primaryJob: z.enum(HOMEOWNER_JOBS),
  primaryDestination: z.enum(CAPABILITY_DESTINATIONS),
  intentAliases: z.array(z.string()),
  supportedContext: z.array(z.enum(CAPABILITY_CONTEXT_TYPES)),
  readinessRequirements: z.array(CapabilityCatalogReadinessRequirementSchema),
  expectedOutput: z.string(),
  routeTemplate: z.string(),
  href: z.string(),
  workflowOnly: z.boolean(),
  releaseStage: z.enum(CAPABILITY_RELEASE_STAGES),
  badges: z.array(z.enum(['NEW', 'BETA'])),
});

export const CapabilityCatalogSchema = z.object({
  registryVersion: z.string().min(1),
  propertyId: z.string().nullable(),
  workflowContextIncluded: z.boolean(),
  capabilities: z.array(CapabilityCatalogItemSchema),
});

export type CapabilityCatalog = z.infer<typeof CapabilityCatalogSchema>;
export type CapabilityCatalogItem = z.infer<typeof CapabilityCatalogItemSchema>;

function resolveCapabilityHref(input: {
  routeTemplate: string;
  navTarget: string;
  propertyId?: string;
}): string {
  if (!input.routeTemplate.includes('[id]')) return input.routeTemplate;
  if (input.propertyId) {
    return input.routeTemplate.split('[id]').join(encodeURIComponent(input.propertyId));
  }
  return `/dashboard/properties?navTarget=${encodeURIComponent(input.navTarget)}`;
}

export function buildCapabilityCatalog(input: {
  registry: ToolCapabilityRegistry;
  availability: CapabilityAvailabilityAdapter;
  userId?: string;
  propertyId?: string;
  includeWorkflowContext?: boolean;
}): CapabilityCatalog {
  const includeWorkflowContext = input.includeWorkflowContext ?? false;
  const capabilities = input.availability
    .listAvailable({
      userId: input.userId,
      includeWorkflowOnly: includeWorkflowContext,
    })
    .map((capability): CapabilityCatalogItem => ({
      id: capability.id,
      version: capability.version,
      label: capability.presentation.label,
      shortDescription: capability.presentation.shortDescription,
      longDescription: capability.presentation.longDescription,
      iconName: capability.presentation.iconName,
      outcomeCategory: capability.presentation.outcomeCategory,
      primaryJob: capability.productFramework.primaryJob,
      primaryDestination: capability.productFramework.primaryDestination,
      intentAliases: capability.presentation.intentAliases,
      supportedContext: capability.destination.acceptedContext,
      readinessRequirements: capability.recommendation.readinessRequirements,
      expectedOutput: capability.lifecycle.expectedOutput,
      routeTemplate: capability.destination.routeTemplate,
      href: resolveCapabilityHref({
        routeTemplate: capability.destination.routeTemplate,
        navTarget: capability.destination.navTarget,
        propertyId: input.propertyId,
      }),
      workflowOnly: capability.destination.workflowOnly,
      releaseStage: capability.governance.releaseStage,
      badges: capability.presentation.badges,
    }));

  return CapabilityCatalogSchema.parse({
    registryVersion: input.registry.version,
    propertyId: input.propertyId ?? null,
    workflowContextIncluded: includeWorkflowContext,
    capabilities,
  });
}

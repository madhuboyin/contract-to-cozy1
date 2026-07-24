import { z } from 'zod';
import {
  CAPABILITY_COMPLETION_KINDS,
  CAPABILITY_CONTEXT_TYPES,
  CapabilitySuggestionSchema,
  canonicalCapabilityRegistry,
  type ToolCapabilityRegistry,
} from '../productFramework/capabilities';
import {
  getCapabilitySuggestions,
  type CapabilitySuggestionsInput,
} from './capabilityRecommendation.service';
import {
  recordToolLifecycleEvents,
  type ToolLifecycleEventInput,
} from './analytics/toolLifecycle';

const BoundedIdentifier = z.string().trim().min(1).max(160);

export const CapabilityCompletionNextInputSchema = z.object({
  propertyId: BoundedIdentifier,
  userId: BoundedIdentifier,
  capabilityId: BoundedIdentifier,
  completionKind: z.enum(CAPABILITY_COMPLETION_KINDS),
  outputEntityType: z.enum(CAPABILITY_CONTEXT_TYPES),
  outputEntityId: BoundedIdentifier,
  sourceActionId: BoundedIdentifier.nullable().default(null),
  journeyId: BoundedIdentifier.nullable().default(null),
  surface: z.string().trim().min(1).max(80).default('workflow'),
  durationSeconds: z.number().min(0).max(86_400).nullable().default(null),
});

export const CapabilityCompletionNextResponseSchema = z.object({
  contractVersion: z.literal('capability-completion-next-v1'),
  propertyId: BoundedIdentifier,
  recordedAt: z.string().datetime(),
  completion: z.object({
    capabilityId: BoundedIdentifier,
    capabilityVersion: z.number().int().positive(),
    completionKind: z.enum(CAPABILITY_COMPLETION_KINDS),
    outputEntityType: z.enum(CAPABILITY_CONTEXT_TYPES),
    outputEntityId: BoundedIdentifier,
  }),
  registryVersion: BoundedIdentifier,
  recommendationVersion: z.literal('capability-recommendation-v1'),
  contextVersion: BoundedIdentifier,
  suggestion: CapabilitySuggestionSchema.nullable(),
  exploreToolsHref: z.string().startsWith('/dashboard/home-tools?'),
});

export type CapabilityCompletionNextInput =
  z.input<typeof CapabilityCompletionNextInputSchema>;
export type CapabilityCompletionNextResponse =
  z.infer<typeof CapabilityCompletionNextResponseSchema>;

type CompletionDependencies = {
  registry: ToolCapabilityRegistry;
  record: (args: {
    userId: string;
    propertyId: string;
    events: ToolLifecycleEventInput[];
  }) => Promise<unknown>;
  resolve: (input: CapabilitySuggestionsInput) => ReturnType<
    typeof getCapabilitySuggestions
  >;
  now: () => Date;
};

function defaultDependencies(): CompletionDependencies {
  return {
    registry: canonicalCapabilityRegistry,
    record: recordToolLifecycleEvents,
    resolve: getCapabilitySuggestions,
    now: () => new Date(),
  };
}

/**
 * Persists the verified completion before resolving any next capability.
 * Direct callers receive the same canonical compatibility checks as the route.
 */
export async function recordCapabilityCompletionAndResolveNext(
  rawInput: CapabilityCompletionNextInput,
  dependencies: CompletionDependencies = defaultDependencies(),
): Promise<CapabilityCompletionNextResponse> {
  const input = CapabilityCompletionNextInputSchema.parse(rawInput);
  const capability = dependencies.registry.getById(input.capabilityId);
  if (!capability) {
    throw new Error(`Unknown capability completion: ${input.capabilityId}.`);
  }
  if (capability.lifecycle.completionKind !== input.completionKind) {
    throw new Error(
      `Completion kind does not match ${input.capabilityId}.`,
    );
  }
  if (!capability.lifecycle.outputEntityTypes.includes(input.outputEntityType)) {
    throw new Error(
      `Output entity type is not verified for ${input.capabilityId}.`,
    );
  }

  const recordedAt = dependencies.now().toISOString();
  await dependencies.record({
    userId: input.userId,
    propertyId: input.propertyId,
    events: [{
      toolId: capability.id,
      stage: 'COMPLETED',
      surface: input.surface,
      sourceActionId: input.sourceActionId,
      sourceEntityType: input.outputEntityType,
      sourceEntityId: input.outputEntityId,
      journeyId: input.journeyId,
      completionKind: input.completionKind,
      outputKey: input.outputEntityId,
      durationSeconds: input.durationSeconds,
      metadata: {
        outputEntityType: input.outputEntityType,
        outputEntityId: input.outputEntityId,
        recordedAt,
      },
    }],
  });

  const resolved = await dependencies.resolve({
    propertyId: input.propertyId,
    userId: input.userId,
    surface: 'COMPLETION',
    limit: 1,
    sourceContext: {
      kind: 'COMPLETION',
      id: input.outputEntityId,
      actionId: input.sourceActionId,
      entityType: input.outputEntityType,
      entityId: input.outputEntityId,
      eventType: input.completionKind,
    },
  });

  return CapabilityCompletionNextResponseSchema.parse({
    contractVersion: 'capability-completion-next-v1',
    propertyId: input.propertyId,
    recordedAt,
    completion: {
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      completionKind: input.completionKind,
      outputEntityType: input.outputEntityType,
      outputEntityId: input.outputEntityId,
    },
    registryVersion: resolved.registryVersion,
    recommendationVersion: resolved.recommendationVersion,
    contextVersion: resolved.contextVersion,
    suggestion: resolved.suggestions[0] ?? null,
    exploreToolsHref:
      `/dashboard/home-tools?propertyId=${encodeURIComponent(input.propertyId)}`,
  });
}

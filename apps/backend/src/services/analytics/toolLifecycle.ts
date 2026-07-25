import { ProductAnalyticsEventType } from '@prisma/client';
import { ProductAnalyticsService } from './service';
import type { TrackEventInput } from './schemas';
import { canonicalCapabilityRegistry } from '../../productFramework/capabilities';
import {
  canonicalizeToolLifecycleId,
  TOOL_LIFECYCLE_MODULE,
  toolLifecycleEventName,
  type ToolLifecycleStage,
} from './toolLifecycle.contract';

export const CAPABILITY_LIFECYCLE_CONTRACT_VERSION =
  'capability-lifecycle-v2' as const;
export const TOOL_LIFECYCLE_SOURCE_KINDS = [
  'HOME_ACTION',
  'JOURNEY',
  'PROJECT',
  'PROPERTY_CONTEXT',
  'PERSONALIZATION',
  'COMPLETION',
  'CATALOG',
  'DIRECT',
] as const;
export const TOOL_LIFECYCLE_READINESS_STATES = [
  'READY',
  'NEEDS_CONTEXT',
  'UNKNOWN',
] as const;
export const TOOL_LIFECYCLE_ROLLOUT_COHORTS = [
  'DISABLED',
  'INTERNAL',
  'BETA',
  'FULL',
  'UNKNOWN',
] as const;

export type ToolLifecycleSourceKind =
  typeof TOOL_LIFECYCLE_SOURCE_KINDS[number];
export type ToolLifecycleReadiness =
  typeof TOOL_LIFECYCLE_READINESS_STATES[number];
export type ToolLifecycleRolloutCohort =
  typeof TOOL_LIFECYCLE_ROLLOUT_COHORTS[number];

export {
  canonicalizeToolLifecycleId,
  TOOL_LIFECYCLE_MODULE,
  TOOL_LIFECYCLE_STAGES,
  toolLifecycleEventName,
  type ToolLifecycleStage,
} from './toolLifecycle.contract';

export type ToolLifecycleEventInput = {
  toolId: string;
  stage: ToolLifecycleStage;
  surface: string;
  manifestVersion?: number | null;
  registryVersion?: string | null;
  recommendationReason?: string | null;
  reasonCode?: string | null;
  recommendationVersion?: string | null;
  contextVersion?: string | null;
  sourceKind?: ToolLifecycleSourceKind | null;
  sourceId?: string | null;
  sourceActionId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  journeyId?: string | null;
  readiness?: ToolLifecycleReadiness | null;
  rolloutCohort?: ToolLifecycleRolloutCohort | null;
  completionKind?: string | null;
  outputKey?: string | null;
  durationSeconds?: number | null;
  sessionKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

function sourceKind(event: ToolLifecycleEventInput): ToolLifecycleSourceKind {
  if (event.sourceKind) return event.sourceKind;
  if (event.sourceActionId) return 'HOME_ACTION';
  if (event.journeyId) return 'JOURNEY';
  if (event.stage === 'COMPLETED' && event.outputKey) return 'COMPLETION';
  if (event.sourceEntityType === 'PROJECT') return 'PROJECT';
  if (event.sourceEntityType === 'PROPERTY') return 'PROPERTY_CONTEXT';
  if (['explore_tools', 'command_palette'].includes(event.surface)) {
    return 'CATALOG';
  }
  return 'DIRECT';
}

function boundedSourceId(
  event: ToolLifecycleEventInput,
  canonicalToolId: string,
  kind: ToolLifecycleSourceKind,
): string {
  const value = event.sourceId
    ?? event.sourceActionId
    ?? event.journeyId
    ?? event.sourceEntityId
    ?? event.outputKey
    ?? `${kind.toLowerCase()}:${canonicalToolId}`;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) {
    throw new Error('Tool lifecycle source ID is missing or exceeds 160 characters.');
  }
  return normalized;
}

export function buildToolLifecycleAnalyticsEvents(args: {
  userId: string;
  propertyId: string;
  events: ToolLifecycleEventInput[];
}): TrackEventInput[] {
  return args.events.map((event) => {
    const canonicalToolId = canonicalizeToolLifecycleId(event.toolId);
    if (!canonicalToolId) {
      throw new Error(`Unknown discoverable tool: ${event.toolId}`);
    }
    const capability = canonicalCapabilityRegistry.getById(canonicalToolId);
    if (!capability) {
      throw new Error(`Unknown canonical capability: ${canonicalToolId}`);
    }
    if (
      event.manifestVersion != null
      && event.manifestVersion !== capability.version
    ) {
      throw new Error(`Stale capability manifest: ${canonicalToolId}`);
    }
    const canonicalSourceKind = sourceKind(event);
    const canonicalSourceId = boundedSourceId(
      event,
      canonicalToolId,
      canonicalSourceKind,
    );
    return ({
    eventType: ProductAnalyticsEventType.TOOL_USED,
    eventName: toolLifecycleEventName(event.stage),
    userId: args.userId,
    propertyId: args.propertyId,
    moduleKey: TOOL_LIFECYCLE_MODULE,
    featureKey: canonicalToolId,
    screenKey: event.surface,
    sessionKey: event.sessionKey ?? null,
    source: event.surface,
    valueNumeric: event.durationSeconds ?? null,
    metadataJson: {
      ...(event.metadata ?? {}),
      lifecycleContractVersion: CAPABILITY_LIFECYCLE_CONTRACT_VERSION,
      lifecycleStage: event.stage,
      toolId: canonicalToolId,
      canonicalToolId,
      manifestVersion: capability.version,
      registryVersion: canonicalCapabilityRegistry.version,
      emittedRegistryVersion: event.registryVersion ?? null,
      recommendationReason: event.recommendationReason ?? null,
      reasonCode:
        event.reasonCode ?? event.recommendationReason ?? null,
      recommendationVersion:
        event.recommendationVersion ?? 'unattributed',
      contextVersion: event.contextVersion ?? null,
      sourceKind: canonicalSourceKind,
      sourceId: canonicalSourceId,
      sourceActionId: event.sourceActionId ?? null,
      sourceEntityType: event.sourceEntityType ?? null,
      sourceEntityId: event.sourceEntityId ?? null,
      journeyId: event.journeyId ?? null,
      readiness: event.readiness ?? 'UNKNOWN',
      rolloutCohort: event.rolloutCohort ?? 'UNKNOWN',
      surface: event.surface,
      completionKind: event.completionKind ?? null,
      outputKey: event.outputKey ?? null,
    },
    });
  });
}

export async function recordToolLifecycleEvents(args: {
  userId: string;
  propertyId: string;
  events: ToolLifecycleEventInput[];
}) {
  return ProductAnalyticsService.trackEvents(buildToolLifecycleAnalyticsEvents(args));
}

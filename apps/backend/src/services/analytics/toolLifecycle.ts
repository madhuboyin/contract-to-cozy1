import { ProductAnalyticsEventType } from '@prisma/client';
import { ProductAnalyticsService } from './service';
import type { TrackEventInput } from './schemas';
import {
  canonicalizeToolLifecycleId,
  TOOL_LIFECYCLE_MODULE,
  toolLifecycleEventName,
  type ToolLifecycleStage,
} from './toolLifecycle.contract';

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
  recommendationReason?: string | null;
  contextVersion?: string | null;
  sourceActionId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  journeyId?: string | null;
  completionKind?: string | null;
  outputKey?: string | null;
  durationSeconds?: number | null;
  sessionKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

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
      lifecycleStage: event.stage,
      toolId: canonicalToolId,
      canonicalToolId,
      recommendationReason: event.recommendationReason ?? null,
      contextVersion: event.contextVersion ?? null,
      sourceActionId: event.sourceActionId ?? null,
      sourceEntityType: event.sourceEntityType ?? null,
      sourceEntityId: event.sourceEntityId ?? null,
      journeyId: event.journeyId ?? null,
      completionKind: event.completionKind ?? null,
      outputKey: event.outputKey ?? null,
      ...(event.metadata ?? {}),
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

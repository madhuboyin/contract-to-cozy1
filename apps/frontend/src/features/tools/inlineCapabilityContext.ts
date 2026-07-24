import type {
  CapabilityCompletionEventType,
  CapabilityContextSourceKind,
  CapabilityContextType,
} from './capabilityTypes';
import type { CapabilitySuggestionsRequest } from './capabilityApi';

export type InlineCapabilityPlacementSurface = 'workflow' | 'completion';

/**
 * The complete context feature modules may provide to inline discovery.
 * Capability identity is deliberately absent: selection belongs to the
 * canonical evaluator, not to each integration.
 */
type InlineCapabilitySourceContext = {
  propertyId: string;
  sourceEntityType: CapabilityContextType;
  sourceEntityId: string;
  sourceActionId?: string | null;
  journeyId?: string | null;
};

export type InlineCapabilityContext = InlineCapabilitySourceContext & (
  | {
      placementSurface: 'workflow';
      completionEventType?: null;
    }
  | {
      placementSurface: 'completion';
      completionEventType: CapabilityCompletionEventType;
    }
);

function sourceKind(context: InlineCapabilityContext): CapabilityContextSourceKind {
  if (context.completionEventType) return 'COMPLETION';
  if (context.journeyId) return 'JOURNEY';
  if (context.sourceActionId) return 'HOME_ACTION';
  if (context.sourceEntityType === 'PROJECT') return 'PROJECT';
  return 'PROPERTY_CONTEXT';
}

function sourceId(
  context: InlineCapabilityContext,
  kind: CapabilityContextSourceKind,
): string {
  if (kind === 'JOURNEY') return context.journeyId!;
  if (kind === 'HOME_ACTION') return context.sourceActionId!;
  return context.sourceEntityId;
}

export function buildInlineCapabilityRequest(
  context: InlineCapabilityContext,
): CapabilitySuggestionsRequest {
  const kind = sourceKind(context);
  return {
    propertyId: context.propertyId,
    surface: context.placementSurface === 'completion'
      ? 'COMPLETION'
      : 'WORKFLOW',
    limit: 1,
    sourceKind: kind,
    sourceId: sourceId(context, kind),
    sourceActionId: context.sourceActionId ?? undefined,
    sourceEntityType: context.sourceEntityType,
    sourceEntityId: context.sourceEntityId,
    sourceEventType: context.completionEventType ?? undefined,
  };
}

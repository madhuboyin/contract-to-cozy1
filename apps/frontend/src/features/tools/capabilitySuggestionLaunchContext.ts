import type { CapabilitySuggestionDTO } from '@/types';
import type {
  ToolDiscoverySurface,
  ToolLaunchContext,
} from './toolDiscoveryRegistry';

const KNOWN_SURFACES = new Set<ToolDiscoverySurface>([
  'unified_home',
  'property_detail',
  'home_event_radar',
  'explore_tools',
  'command_palette',
  'workflow',
  'guidance',
  'home_tools',
  'dashboard',
]);

type LaunchSearchParams = Pick<URLSearchParams, 'get'>;

/**
 * Maps the complete server suggestion lineage into one launch contract shared
 * by every frontend suggestion surface.
 */
export function capabilitySuggestionLaunchContext(
  suggestion: CapabilitySuggestionDTO,
  launchSurface: ToolDiscoverySurface,
): ToolLaunchContext {
  return {
    launchSurface,
    sourceActionId: suggestion.source.actionId,
    sourceEntityType: suggestion.source.entityType,
    sourceEntityId: suggestion.source.entityId,
    contextVersion: suggestion.contextVersion,
    recommendationReason: suggestion.reasonCode,
    recommendationVersion: suggestion.recommendationVersion,
    journeyId: suggestion.source.journeyId,
    itemId: suggestion.source.entityType === 'INVENTORY_ITEM'
      ? suggestion.source.entityId
      : null,
  };
}

export function normalizeToolLaunchSurface(value: string | null): ToolDiscoverySurface {
  if (value && KNOWN_SURFACES.has(value as ToolDiscoverySurface)) {
    return value as ToolDiscoverySurface;
  }
  return value ? 'unknown' : 'direct';
}

/**
 * Reads the same launch contract at the destination boundary. Keeping this
 * parser beside the server-suggestion mapper makes its round trip testable.
 */
export function parseToolLaunchContext(searchParams: LaunchSearchParams): ToolLaunchContext {
  return {
    launchSurface: normalizeToolLaunchSurface(searchParams.get('launchSurface')),
    sourceActionId: searchParams.get('sourceActionId'),
    sourceEntityType: searchParams.get('sourceEntityType'),
    sourceEntityId: searchParams.get('sourceEntityId'),
    contextVersion: searchParams.get('contextVersion'),
    recommendationReason: searchParams.get('recommendationReason'),
    recommendationVersion: searchParams.get('recommendationVersion'),
    journeyId: searchParams.get('journeyId') ?? searchParams.get('guidanceJourneyId'),
    guidanceStepKey: searchParams.get('guidanceStepKey'),
    guidanceSignalIntentFamily: searchParams.get('guidanceSignalIntentFamily'),
    itemId: searchParams.get('itemId'),
    radarMatchId: searchParams.get('radarMatchId'),
    radarEventId: searchParams.get('radarEventId'),
    incidentId: searchParams.get('incidentId'),
    returnTo: searchParams.get('returnTo'),
  };
}

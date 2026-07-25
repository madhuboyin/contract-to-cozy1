import { api } from '@/lib/api/client';
import type {
  CapabilityFeedbackResponseDTO,
  CapabilityFeedbackTypeDTO,
  CapabilityCompletionNextResponseDTO,
  CapabilitySuggestionDTO,
  CapabilitySuggestionResponseDTO,
  CapabilitySuggestionSurfaceDTO,
} from '@/types';
import type {
  CapabilityCatalog,
  CapabilityCompletionEventType,
  CapabilityContextSourceKind,
  CapabilityContextType,
  RelatedCapabilitiesResponse,
} from './capabilityTypes';

const FEEDBACK_SURFACE = {
  unified_home: 'HOME',
  property_detail: 'PROPERTY',
  workflow: 'WORKFLOW',
  completion: 'COMPLETION',
} as const;

export async function recordCapabilitySuggestionFeedback(input: {
  propertyId: string;
  registryVersion: string;
  surface: keyof typeof FEEDBACK_SURFACE;
  suggestion: CapabilitySuggestionDTO;
  type: CapabilityFeedbackTypeDTO;
  eventId?: string;
  reasonCode?: 'ALREADY_DONE' | 'TOO_EXPENSIVE' | 'NOT_APPLICABLE' | 'BAD_TIMING' | 'WRONG_PROFILE' | 'OTHER' | null;
  snoozedUntil?: string | null;
}): Promise<CapabilityFeedbackResponseDTO> {
  return api.recordCapabilitySuggestionFeedback(input.propertyId, {
    eventId: input.eventId ?? crypto.randomUUID(),
    suggestionId: input.suggestion.suggestionId,
    capabilityId: input.suggestion.capabilityId,
    manifestVersion: input.suggestion.manifestVersion,
    registryVersion: input.registryVersion,
    recommendationVersion: input.suggestion.recommendationVersion,
    contextVersion: input.suggestion.contextVersion,
    surface: FEEDBACK_SURFACE[input.surface],
    type: input.type,
    reasonCode: input.reasonCode,
    snoozedUntil: input.snoozedUntil,
    readiness: input.suggestion.readiness.state,
    source: input.suggestion.source,
  });
}

export type CapabilityCompletionNextRequest = {
  propertyId: string;
  capabilityId: string;
  completionKind: CapabilityCompletionEventType;
  outputEntityType: CapabilityContextType;
  outputEntityId: string;
  sourceActionId?: string | null;
  journeyId?: string | null;
  surface?: string;
  durationSeconds?: number | null;
};

export async function recordCapabilityCompletionAndGetNext(
  request: CapabilityCompletionNextRequest,
): Promise<CapabilityCompletionNextResponseDTO> {
  return api.recordCapabilityCompletionAndGetNext(request.propertyId, {
    capabilityId: request.capabilityId,
    completionKind: request.completionKind,
    outputEntityType: request.outputEntityType,
    outputEntityId: request.outputEntityId,
    sourceActionId: request.sourceActionId,
    journeyId: request.journeyId,
    surface: request.surface,
    durationSeconds: request.durationSeconds,
  });
}

export type CapabilitySuggestionsRequest = {
  propertyId: string;
  surface: CapabilitySuggestionSurfaceDTO;
  limit?: number;
  sourceKind?: CapabilityContextSourceKind;
  sourceId?: string;
  sourceActionId?: string;
  sourceEntityType?: CapabilityContextType;
  sourceEntityId?: string;
  sourceEventType?: CapabilityCompletionEventType;
};

export async function fetchCapabilitySuggestions(
  request: CapabilitySuggestionsRequest,
): Promise<CapabilitySuggestionResponseDTO> {
  return api.getCapabilitySuggestions(request.propertyId, {
    surface: request.surface,
    limit: request.limit,
    sourceKind: request.sourceKind,
    sourceId: request.sourceId,
    sourceActionId: request.sourceActionId,
    sourceEntityType: request.sourceEntityType,
    sourceEntityId: request.sourceEntityId,
    sourceEventType: request.sourceEventType,
  });
}

export type CapabilityCatalogRequest = {
  propertyId?: string;
  includeWorkflowContext?: boolean;
};

export async function fetchCapabilityCatalog(
  request: CapabilityCatalogRequest = {},
): Promise<CapabilityCatalog> {
  return api.getCapabilityCatalog(request);
}

export type RelatedCapabilitiesRequest = {
  propertyId: string;
  currentCapabilityId: string;
  limit?: number;
  sourceEntityType?: CapabilityContextType;
  workflowContextTypes?: CapabilityContextType[];
};

export async function fetchRelatedCapabilities(
  request: RelatedCapabilitiesRequest,
): Promise<RelatedCapabilitiesResponse> {
  return api.getRelatedCapabilities(request.propertyId, {
    currentCapabilityId: request.currentCapabilityId,
    limit: request.limit,
    sourceEntityType: request.sourceEntityType,
    workflowContextTypes: request.workflowContextTypes,
  });
}

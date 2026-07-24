import { api } from '@/lib/api/client';
import type {
  CapabilityCompletionNextResponseDTO,
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

import { api } from '@/lib/api/client';
import type {
  CapabilityCatalog,
  CapabilityContextType,
  RelatedCapabilitiesResponse,
} from './capabilityTypes';

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

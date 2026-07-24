import { api } from '@/lib/api/client';
import type { CapabilityCatalog } from './capabilityTypes';

export type CapabilityCatalogRequest = {
  propertyId?: string;
  includeWorkflowContext?: boolean;
};

export async function fetchCapabilityCatalog(
  request: CapabilityCatalogRequest = {},
): Promise<CapabilityCatalog> {
  return api.getCapabilityCatalog(request);
}

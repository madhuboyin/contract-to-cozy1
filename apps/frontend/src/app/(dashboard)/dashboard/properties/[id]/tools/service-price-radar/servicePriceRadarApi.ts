import { api } from '@/lib/api/client';

export type ServicePriceRadarLaunchSurface =
  | 'home_tools'
  | 'property_hub'
  | 'system_detail'
  | 'incident_card'
  | 'maintenance_card'
  | 'unknown';

export type ServiceRadarCategory =
  | 'INSPECTION'
  | 'HANDYMAN'
  | 'GENERAL_HANDYMAN'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'HVAC'
  | 'ROOFING'
  | 'WATER_HEATER'
  | 'FOUNDATION'
  | 'WINDOWS_DOORS'
  | 'INSULATION'
  | 'LANDSCAPING'
  | 'LANDSCAPING_DRAINAGE'
  | 'GUTTERS'
  | 'SOLAR'
  | 'FLOORING'
  | 'PAINTING'
  | 'SIDING'
  | 'MOLD_REMEDIATION'
  | 'CLEANING'
  | 'MOVING'
  | 'PEST_CONTROL'
  | 'LOCKSMITH'
  | 'APPLIANCE_REPAIR'
  | 'APPLIANCE_REPLACEMENT'
  | 'SECURITY_SAFETY'
  | 'INSURANCE'
  | 'ATTORNEY'
  | 'FINANCE'
  | 'WARRANTY'
  | 'ADMIN'
  | 'OTHER';

export type ServiceRadarQuoteSource =
  | 'MANUAL'
  | 'PASTED_TEXT'
  | 'UPLOADED_QUOTE'
  | 'SYSTEM_LINKED';

export type ServiceRadarStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
export type ServiceRadarVerdict =
  | 'UNDERPRICED'
  | 'FAIR'
  | 'HIGH'
  | 'VERY_HIGH'
  | 'INSUFFICIENT_DATA';

export type ServiceRadarLinkedEntityType =
  | 'SYSTEM'
  | 'APPLIANCE'
  | 'DOCUMENT'
  | 'INCIDENT'
  | 'ROOM'
  | 'OTHER';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ServicePriceRadarLinkedEntityPayload = {
  linkedEntityType: ServiceRadarLinkedEntityType;
  linkedEntityId: string;
  relevanceScore?: number;
};

export type ServicePriceRadarCheckSummary = {
  id: string;
  propertyId: string;
  createdAt: string;
  status: ServiceRadarStatus;
  serviceCategory: ServiceRadarCategory;
  serviceSubcategory: string | null;
  serviceLabelRaw: string | null;
  quoteAmount: number;
  quoteCurrency: string;
  quoteVendorName: string | null;
  quoteSource: ServiceRadarQuoteSource;
  expectedLow: number | null;
  expectedHigh: number | null;
  expectedMedian: number | null;
  verdict: ServiceRadarVerdict | null;
  confidenceScore: number | null;
  explanationShort: string | null;
};

export type ServicePriceRadarLinkedEntitySummary = {
  linkedEntityType: ServiceRadarLinkedEntityType;
  linkedEntityId: string;
  relevanceScore: number | null;
  label: string;
  summary: string | null;
};

export type ServicePriceRadarCheckDetail = ServicePriceRadarCheckSummary & {
  explanationJson: JsonValue;
  propertySnapshotJson: JsonValue;
  pricingFactorsJson: JsonValue;
  engineVersion: string | null;
  linkedEntities: ServicePriceRadarLinkedEntitySummary[];
};

export type CreateServicePriceRadarCheckPayload = {
  serviceCategory: ServiceRadarCategory;
  serviceSubcategory?: string;
  serviceLabelRaw?: string;
  quoteAmount: number;
  quoteCurrency?: string;
  quoteVendorName?: string;
  quoteSource?: ServiceRadarQuoteSource;
  linkedEntities?: ServicePriceRadarLinkedEntityPayload[];
  guidanceJourneyId?: string;
  guidanceStepKey?: string;
  guidanceSignalIntentFamily?: string;
};

export const SERVICE_PRICE_RADAR_CATEGORY_OPTIONS: Array<{
  value: ServiceRadarCategory;
  label: string;
  shortLabel: string;
  helper: string;
}> = [
  { value: 'HVAC', label: 'HVAC', shortLabel: 'HVAC', helper: 'Heating, cooling, tune-ups, and replacements' },
  { value: 'PLUMBING', label: 'Plumbing', shortLabel: 'Plumbing', helper: 'Leaks, fixtures, drains, and line work' },
  { value: 'ELECTRICAL', label: 'Electrical', shortLabel: 'Electrical', helper: 'Panels, outlets, wiring, and lighting' },
  { value: 'ROOFING', label: 'Roofing', shortLabel: 'Roofing', helper: 'Roof repairs, inspections, and replacement work' },
  { value: 'WATER_HEATER', label: 'Water Heater', shortLabel: 'Water heater', helper: 'Repair or replace standard and tankless units' },
  { value: 'APPLIANCE_REPAIR', label: 'Appliance Repair', shortLabel: 'Appliance repair', helper: 'Diagnostics and part-based repairs' },
  { value: 'APPLIANCE_REPLACEMENT', label: 'Appliance Replacement', shortLabel: 'Appliance replacement', helper: 'New appliance install and haul-away scope' },
  { value: 'GENERAL_HANDYMAN', label: 'General Handyman', shortLabel: 'Handyman', helper: 'Small repairs, patching, and misc. labor' },
  { value: 'FOUNDATION', label: 'Foundation', shortLabel: 'Foundation', helper: 'Structural stabilization and crack work' },
  { value: 'WINDOWS_DOORS', label: 'Windows & Doors', shortLabel: 'Windows/doors', helper: 'Unit replacement, repairs, and weather sealing' },
  { value: 'INSULATION', label: 'Insulation', shortLabel: 'Insulation', helper: 'Attic, crawlspace, and wall insulation work' },
  { value: 'LANDSCAPING_DRAINAGE', label: 'Landscaping & Drainage', shortLabel: 'Drainage', helper: 'Grading, runoff, and drainage improvements' },
  { value: 'LANDSCAPING', label: 'Landscaping', shortLabel: 'Landscaping', helper: 'General yard, trimming, and cleanup work' },
  { value: 'GUTTERS', label: 'Gutters', shortLabel: 'Gutters', helper: 'Cleaning, repair, and gutter replacement' },
  { value: 'SOLAR', label: 'Solar', shortLabel: 'Solar', helper: 'Solar panel repair, service, or upgrade work' },
  { value: 'FLOORING', label: 'Flooring', shortLabel: 'Flooring', helper: 'Replace, refinish, or patch flooring surfaces' },
  { value: 'PAINTING', label: 'Painting', shortLabel: 'Painting', helper: 'Interior or exterior paint jobs' },
  { value: 'SIDING', label: 'Siding', shortLabel: 'Siding', helper: 'Exterior cladding repairs and replacement' },
  { value: 'MOLD_REMEDIATION', label: 'Mold Remediation', shortLabel: 'Mold', helper: 'Containment, cleanup, and remediation scope' },
  { value: 'PEST_CONTROL', label: 'Pest Control', shortLabel: 'Pest control', helper: 'Treatment visits and prevention work' },
  { value: 'SECURITY_SAFETY', label: 'Security & Safety', shortLabel: 'Safety', helper: 'Detectors, alarms, and home safety upgrades' },
  { value: 'INSPECTION', label: 'Inspection', shortLabel: 'Inspection', helper: 'General inspection or diagnostic visits' },
  { value: 'HANDYMAN', label: 'Handyman', shortLabel: 'Handyman', helper: 'General repair labor and punch-list work' },
  { value: 'CLEANING', label: 'Cleaning', shortLabel: 'Cleaning', helper: 'Deep cleaning or recurring service quotes' },
  { value: 'MOVING', label: 'Moving', shortLabel: 'Moving', helper: 'Move labor and transport estimates' },
  { value: 'LOCKSMITH', label: 'Locksmith', shortLabel: 'Locksmith', helper: 'Lock changes, rekeying, and access work' },
  { value: 'INSURANCE', label: 'Insurance Service', shortLabel: 'Insurance', helper: 'Broad professional service estimate' },
  { value: 'ATTORNEY', label: 'Attorney', shortLabel: 'Attorney', helper: 'Broad professional service estimate' },
  { value: 'FINANCE', label: 'Finance Service', shortLabel: 'Finance', helper: 'Broad professional service estimate' },
  { value: 'WARRANTY', label: 'Warranty Service', shortLabel: 'Warranty', helper: 'Broad professional service estimate' },
  { value: 'ADMIN', label: 'Administrative Service', shortLabel: 'Admin', helper: 'Broad administrative help estimate' },
  { value: 'OTHER', label: 'Other', shortLabel: 'Other', helper: 'Use when no category fits well' },
];

export async function createServicePriceRadarCheck(
  propertyId: string,
  payload: CreateServicePriceRadarCheckPayload
): Promise<ServicePriceRadarCheckDetail> {
  const res = await api.post<{ check: ServicePriceRadarCheckDetail }>(
    `/api/properties/${propertyId}/service-price-radar/checks`,
    payload
  );
  return res.data.check;
}

export async function listServicePriceRadarChecks(
  propertyId: string,
  limit = 12
): Promise<ServicePriceRadarCheckSummary[]> {
  const res = await api.get<{ items: ServicePriceRadarCheckSummary[] }>(
    `/api/properties/${propertyId}/service-price-radar/checks`,
    { params: { limit } }
  );
  return res.data.items;
}

export async function getServicePriceRadarCheck(
  propertyId: string,
  checkId: string
): Promise<ServicePriceRadarCheckDetail> {
  const res = await api.get<{ check: ServicePriceRadarCheckDetail }>(
    `/api/properties/${propertyId}/service-price-radar/checks/${checkId}`
  );
  return res.data.check;
}

export async function trackServicePriceRadarEvent(
  propertyId: string,
  payload: {
    event: string;
    section?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await api.trackServicePriceRadarEvent(propertyId, payload);
}

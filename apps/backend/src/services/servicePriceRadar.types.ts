import { Prisma } from '@prisma/client';

export const SERVICE_RADAR_CATEGORY_VALUES = [
  'INSPECTION',
  'HANDYMAN',
  'GENERAL_HANDYMAN',
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'ROOFING',
  'WATER_HEATER',
  'FOUNDATION',
  'WINDOWS_DOORS',
  'INSULATION',
  'LANDSCAPING',
  'LANDSCAPING_DRAINAGE',
  'GUTTERS',
  'SOLAR',
  'FLOORING',
  'PAINTING',
  'SIDING',
  'MOLD_REMEDIATION',
  'CLEANING',
  'MOVING',
  'PEST_CONTROL',
  'LOCKSMITH',
  'APPLIANCE_REPAIR',
  'APPLIANCE_REPLACEMENT',
  'SECURITY_SAFETY',
  'INSURANCE',
  'ATTORNEY',
  'FINANCE',
  'WARRANTY',
  'ADMIN',
  'OTHER',
] as const;

export const SERVICE_RADAR_QUOTE_SOURCE_VALUES = [
  'MANUAL',
  'PASTED_TEXT',
  'UPLOADED_QUOTE',
  'SYSTEM_LINKED',
] as const;

export const SERVICE_RADAR_STATUS_VALUES = ['PENDING', 'COMPLETED', 'FAILED'] as const;

export const SERVICE_RADAR_VERDICT_VALUES = [
  'UNDERPRICED',
  'FAIR',
  'HIGH',
  'VERY_HIGH',
  'INSUFFICIENT_DATA',
] as const;

export const SERVICE_RADAR_LINKED_ENTITY_TYPE_VALUES = [
  'SYSTEM',
  'APPLIANCE',
  'DOCUMENT',
  'INCIDENT',
  'ROOM',
  'OTHER',
] as const;

export const SERVICE_BENCHMARK_REGION_TYPE_VALUES = [
  'COUNTRY',
  'STATE',
  'METRO',
  'ZIP_PREFIX',
  'COUNTY',
] as const;

export type ServiceCategoryValue = (typeof SERVICE_RADAR_CATEGORY_VALUES)[number];
export type ServiceRadarQuoteSourceValue = (typeof SERVICE_RADAR_QUOTE_SOURCE_VALUES)[number];
export type ServiceRadarStatusValue = (typeof SERVICE_RADAR_STATUS_VALUES)[number];
export type ServiceRadarVerdictValue = (typeof SERVICE_RADAR_VERDICT_VALUES)[number];
export type ServiceRadarLinkedEntityTypeValue = (typeof SERVICE_RADAR_LINKED_ENTITY_TYPE_VALUES)[number];
export type ServiceBenchmarkRegionTypeValue = (typeof SERVICE_BENCHMARK_REGION_TYPE_VALUES)[number];

export type ServiceRadarCreateLinkedEntityInput = {
  linkedEntityType: ServiceRadarLinkedEntityTypeValue;
  linkedEntityId: string;
  relevanceScore?: number;
};

export type ServiceRadarCreateInput = {
  serviceCategory: ServiceCategoryValue;
  serviceSubcategory?: string;
  serviceLabelRaw?: string;
  quoteAmount: number;
  quoteCurrency?: string;
  quoteVendorName?: string;
  quoteSource?: ServiceRadarQuoteSourceValue;
  linkedEntities?: ServiceRadarCreateLinkedEntityInput[];
};

export type ServiceRadarListQuery = {
  limit: number;
};

export type ServiceRadarLinkedEntitySummaryDTO = {
  linkedEntityType: ServiceRadarLinkedEntityTypeValue;
  linkedEntityId: string;
  relevanceScore: number | null;
  label: string;
  summary: string | null;
};

export type ServiceRadarSummaryDTO = {
  id: string;
  propertyId: string;
  createdAt: string;
  status: ServiceRadarStatusValue;
  serviceCategory: ServiceCategoryValue;
  serviceSubcategory: string | null;
  serviceLabelRaw: string | null;
  quoteAmount: number;
  quoteCurrency: string;
  quoteVendorName: string | null;
  quoteSource: ServiceRadarQuoteSourceValue;
  expectedLow: number | null;
  expectedHigh: number | null;
  expectedMedian: number | null;
  verdict: ServiceRadarVerdictValue | null;
  confidenceScore: number | null;
  explanationShort: string | null;
};

export type ServiceRadarDetailDTO = ServiceRadarSummaryDTO & {
  explanationJson: Prisma.JsonValue | null;
  propertySnapshotJson: Prisma.JsonValue | null;
  pricingFactorsJson: Prisma.JsonValue | null;
  engineVersion: string | null;
  linkedEntities: ServiceRadarLinkedEntitySummaryDTO[];
};

export type ServiceRadarCreateResponseDTO = {
  check: ServiceRadarDetailDTO;
};

export type ServiceRadarListResponseDTO = {
  items: ServiceRadarSummaryDTO[];
};

export type ServiceRadarDetailResponseDTO = {
  check: ServiceRadarDetailDTO;
};

export type PropertyContext = {
  propertyId: string;
  homeownerProfileId: string;
  propertyType: string | null;
  propertySize: number | null;
  sizeBand: string | null;
  yearBuilt: number | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  homeType: string | null;
  systems: {
    heatingType: string | null;
    coolingType: string | null;
    waterHeaterType: string | null;
    roofType: string | null;
    foundationType: string | null;
    sidingType: string | null;
    hasDrainageIssues: boolean | null;
  };
};

export type LinkedEntityContext = {
  linkedEntityType: ServiceRadarLinkedEntityTypeValue;
  linkedEntityId: string;
  relevanceScore: number | null;
  label: string;
  summary: string | null;
  facts: Record<string, unknown>;
};

export type ServicePriceBenchmarkRecord = {
  id: string;
  serviceCategory: ServiceCategoryValue;
  serviceSubcategory: string | null;
  regionType: ServiceBenchmarkRegionTypeValue;
  regionKey: string;
  homeType: string | null;
  sizeBand: string | null;
  baseLow: number;
  baseHigh: number;
  baseMedian: number | null;
  laborFactor: number | null;
  materialFactor: number | null;
  complexityFactorJson: Prisma.JsonValue | null;
  sourceLabel: string | null;
};

export type BenchmarkMatch = {
  matched: boolean;
  benchmark: ServicePriceBenchmarkRecord | null;
};

export type PriceAdjustment = {
  code: string;
  effect: 'up' | 'down' | 'neutral';
  multiplier: number;
  note: string;
};

export type ServicePriceRadarEvaluation = {
  status: ServiceRadarStatusValue;
  normalizedSubcategory: string | null;
  expectedLow: number | null;
  expectedHigh: number | null;
  expectedMedian: number | null;
  confidenceScore: number | null;
  verdict: ServiceRadarVerdictValue;
  explanationShort: string;
  explanationJson: Prisma.JsonValue;
  propertySnapshotJson: Prisma.JsonValue;
  pricingFactorsJson: Prisma.JsonValue;
  engineVersion: string;
};

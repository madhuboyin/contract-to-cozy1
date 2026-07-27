// Shared types for the tax-assessor ingestion pipeline. Mirrors the shape of
// permitAdapters/permitNormalizer.ts's type section, kept separate so permit
// and tax-assessor jurisdiction data stay independently configurable.

export interface TaxAssessorDataSourceConfig {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'RATE_LIMITED';
  fieldMappingJson: unknown;
  queryFilterJson: unknown;
  apiKeyEnvVar: string | null;
  adapterType: 'SOCRATA' | 'ACCELA' | 'CUSTOM';
  slug: string;
  baseUrl: string;
  datasetId: string | null;
  coverageType: 'CITY' | 'COUNTY' | 'STATE';
  normalizedCoverageKey: string;
}

export interface PropertyAddress {
  street: string;
  city: string;
  state: string;
  postalCode?: string;
  countyFips?: string;
}

export type TaxAssessmentMatchConfidence = 'medium' | 'high';

export interface RawTaxAssessmentRecord {
  externalId: string;
  parcelId?: string;
  assessedValueRaw?: string;
  previousAssessedValueRaw?: string;
  assessmentDate?: string;
  taxYear?: string;
  situsAddress?: string;
  situsPostalCode?: string;
  matchConfidence: TaxAssessmentMatchConfidence;
  matchMethod: 'address' | 'address_with_parcel_evidence';
  rawData: Record<string, unknown>;
}

export type TaxAssessmentDatePolicy =
  | 'provider_date'
  | 'nyc_fiscal_year_start';

export interface TaxAssessmentQueryControls {
  addressColumn?: string;
  addressNumberColumn?: string;
  addressStreetColumn?: string;
  postalCodeColumn?: string;
  parcelIdFromExternalId?: boolean;
  latestTaxYearOnly?: boolean;
  eventTtlDays?: number;
  assessmentDatePolicy?: TaxAssessmentDatePolicy;
  assessmentStage?: string;
  appealInfoUrl?: string;
  appealDisclaimer?: string;
}

export type TaxAssessmentSourceValidation = {
  valid: boolean;
  errors: string[];
};

export type TaxAssessmentCoverageRegistration =
  | { coverageType: 'state'; countryCode: 'US'; stateCode: string }
  | { coverageType: 'county'; countryCode: 'US'; countyFips: string }
  | {
      coverageType: 'city';
      countryCode: 'US';
      stateCode: string;
      cityName: string;
    };

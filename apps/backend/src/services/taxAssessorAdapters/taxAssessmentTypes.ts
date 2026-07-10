// Shared types for the tax-assessor ingestion pipeline. Mirrors the shape of
// permitAdapters/permitNormalizer.ts's type section, kept separate so permit
// and tax-assessor jurisdiction data stay independently configurable.

export interface TaxAssessorDataSourceConfig {
  id: string;
  fieldMappingJson: unknown;
  queryFilterJson: unknown;
  apiKeyEnvVar: string | null;
  adapterType: string;
  slug: string;
  baseUrl: string;
  datasetId: string | null;
}

export interface PropertyAddress {
  street: string;
  city: string;
  state: string;
  postalCode?: string;
}

export interface RawTaxAssessmentRecord {
  externalId: string;
  parcelId?: string;
  assessedValueRaw?: string;
  previousAssessedValueRaw?: string;
  assessmentDate?: string;
  taxYear?: string;
  situsAddress?: string;
  rawData: Record<string, unknown>;
}
